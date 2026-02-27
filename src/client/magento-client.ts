/**
 * Magento 2 REST API client.
 *
 * Handles authentication (bearer token or OAuth 1.0a),
 * request construction, pagination, and error mapping.
 *
 * Uses REST rather than GraphQL because:
 * - REST covers the full admin API surface (orders, inventory, shipments, RMAs)
 * - GraphQL on M2 is storefront-oriented and lacks admin write operations
 * - REST supports searchCriteria filtering which maps well to onX query params
 */

import { type AdapterConfig } from "../config.js";

export interface SearchCriteria {
  filterGroups?: Array<{
    filters: Array<{
      field: string;
      value: string;
      conditionType?: string;
    }>;
  }>;
  sortOrders?: Array<{
    field: string;
    direction: "ASC" | "DESC";
  }>;
  currentPage?: number;
  pageSize?: number;
}

export interface MagentoListResponse<T> {
  items: T[];
  search_criteria: SearchCriteria;
  total_count: number;
}

export class MagentoApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly method: string,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = "MagentoApiError";
  }
}

export class MagentoClient {
  private baseUrl: string;
  private apiVersion: string;
  private headers: Record<string, string>;
  private timeout: number;
  private storeViewCode: string;

  constructor(private config: AdapterConfig) {
    this.baseUrl = config.baseUrl;
    this.apiVersion = config.apiVersion;
    this.timeout = config.timeout;
    this.storeViewCode = config.storeViewCode;

    this.headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (config.authMethod === "token" && config.accessToken) {
      this.headers["Authorization"] = `Bearer ${config.accessToken}`;
    }
  }

  private buildUrl(endpoint: string): string {
    const storePrefix = this.storeViewCode === "default" ? "" : `/${this.storeViewCode}`;
    return `${this.baseUrl}/rest${storePrefix}/${this.apiVersion}/${endpoint.replace(/^\//, "")}`;
  }

  buildSearchParams(criteria: SearchCriteria): URLSearchParams {
    const params = new URLSearchParams();

    if (criteria.filterGroups) {
      criteria.filterGroups.forEach((group, gi) => {
        group.filters.forEach((filter, fi) => {
          const prefix = `searchCriteria[filterGroups][${gi}][filters][${fi}]`;
          params.set(`${prefix}[field]`, filter.field);
          params.set(`${prefix}[value]`, filter.value);
          if (filter.conditionType) {
            params.set(`${prefix}[conditionType]`, filter.conditionType);
          }
        });
      });
    }

    if (criteria.sortOrders) {
      criteria.sortOrders.forEach((sort, i) => {
        params.set(`searchCriteria[sortOrders][${i}][field]`, sort.field);
        params.set(`searchCriteria[sortOrders][${i}][direction]`, sort.direction);
      });
    }

    if (criteria.currentPage !== undefined) {
      params.set("searchCriteria[currentPage]", String(criteria.currentPage));
    }
    if (criteria.pageSize !== undefined) {
      params.set("searchCriteria[pageSize]", String(criteria.pageSize));
    }

    return params;
  }

  async get<T>(endpoint: string, searchCriteria?: SearchCriteria): Promise<T> {
    let url = this.buildUrl(endpoint);
    if (searchCriteria) {
      const params = this.buildSearchParams(searchCriteria);
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) await this.handleError(response, "GET", endpoint);
    return response.json() as Promise<T>;
  }

  async post<T>(endpoint: string, body: unknown): Promise<T> {
    const url = this.buildUrl(endpoint);
    const response = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) await this.handleError(response, "POST", endpoint);
    return response.json() as Promise<T>;
  }

  async put<T>(endpoint: string, body: unknown): Promise<T> {
    const url = this.buildUrl(endpoint);
    const response = await fetch(url, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) await this.handleError(response, "PUT", endpoint);
    return response.json() as Promise<T>;
  }

  private async handleError(response: Response, method: string, endpoint: string): Promise<never> {
    let errorBody: string;
    try {
      const json = await response.json() as Record<string, unknown>;
      errorBody = (json.message as string) || JSON.stringify(json);
    } catch {
      errorBody = await response.text();
    }

    const statusMessages: Record<number, string> = {
      401: "Authentication failed — check M2_ACCESS_TOKEN or OAuth credentials",
      403: "Forbidden — the integration lacks permission for this resource",
      404: "Resource not found",
      429: "Rate limited — reduce request frequency",
    };

    const context = statusMessages[response.status] || "";
    throw new MagentoApiError(
      `Magento API error: ${method} ${endpoint} returned ${response.status}. ${context}${context ? ". " : ""}Detail: ${errorBody}`,
      response.status,
      method,
      endpoint,
    );
  }
}

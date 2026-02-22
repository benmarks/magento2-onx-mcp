/**
 * Shared helpers matching onX reference server conventions:
 * - TemporalPagination (updatedAtMin/Max, createdAtMin/Max, pageSize, skip)
 * - Array-based filters (ids[], statuses[], skus[])
 * - FulfillmentToolResult response shape
 */

import { z } from "zod";
import type { SearchCriteria } from "../client/magento-client.js";

export const temporalPaginationSchema = {
  updatedAtMin: z.string().optional().describe("Minimum updated at date (inclusive)"),
  updatedAtMax: z.string().optional().describe("Maximum updated at date (inclusive)"),
  createdAtMin: z.string().optional().describe("Minimum created at date (inclusive)"),
  createdAtMax: z.string().optional().describe("Maximum created at date (inclusive)"),
  pageSize: z.number().optional().describe("Number of results per page (default: 10)"),
  skip: z.number().optional().describe("Number of results to skip for pagination"),
};

export function buildSearchCriteria(params: {
  updatedAtMin?: string;
  updatedAtMax?: string;
  createdAtMin?: string;
  createdAtMax?: string;
  pageSize?: number;
  skip?: number;
  extraFilters?: Array<{ field: string; value: string; conditionType: string }>;
}): SearchCriteria {
  const filterGroups: SearchCriteria["filterGroups"] = [];

  if (params.createdAtMin) {
    filterGroups.push({ filters: [{ field: "created_at", value: params.createdAtMin, conditionType: "gteq" }] });
  }
  if (params.createdAtMax) {
    filterGroups.push({ filters: [{ field: "created_at", value: params.createdAtMax, conditionType: "lteq" }] });
  }
  if (params.updatedAtMin) {
    filterGroups.push({ filters: [{ field: "updated_at", value: params.updatedAtMin, conditionType: "gteq" }] });
  }
  if (params.updatedAtMax) {
    filterGroups.push({ filters: [{ field: "updated_at", value: params.updatedAtMax, conditionType: "lteq" }] });
  }
  if (params.extraFilters) {
    for (const f of params.extraFilters) {
      filterGroups.push({ filters: [f] });
    }
  }

  const pageSize = params.pageSize || 10;
  const skip = params.skip || 0;
  const currentPage = Math.floor(skip / pageSize) + 1;

  return {
    filterGroups: filterGroups.length > 0 ? filterGroups : undefined,
    currentPage,
    pageSize,
    sortOrders: [{ field: "created_at", direction: "DESC" }],
  };
}

export function idsFilter(field: string, ids: string[]) {
  return { field, value: ids.join(","), conditionType: "in" };
}

export function successResult(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ success: true, ...data }, null, 2) }],
  };
}

export function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: message }) }],
    isError: true,
  };
}

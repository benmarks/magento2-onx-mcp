/**
 * onX tool: get-inventory
 *
 * Matches: GetInventoryInputSchema from reference server
 * Input: { skus: string[] (required), locationIds?: string[] }
 *
 * Uses M2 MSI (Multi-Source Inventory) with fallback to legacy catalogInventory.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MagentoClient, MagentoListResponse } from "../client/magento-client.js";
import type { SearchCriteria } from "../client/magento-client.js";
import type { M2SourceItem, M2StockItem } from "../types/magento.js";
import { successResult, errorResult } from "./_helpers.js";

interface OnxInventoryRecord {
  sku: string;
  locationId: string;
  available: number;
  onHand: number;
  unavailable: number;
  tenantId: string;
}

export function registerGetInventory(server: McpServer, client: MagentoClient, vendorNs: string) {
  server.tool(
    "get-inventory",
    "Check stock levels across locations. Requires at least one SKU. Supports Magento MSI (Multi-Source Inventory).",
    {
      skus: z.array(z.string()).describe("Product SKUs to get inventory for (required)"),
      locationIds: z.array(z.string()).optional().describe("Specific warehouse/location IDs (optional)"),
    },
    async (params) => {
      try {
        if (params.skus.length === 0) {
          return errorResult("At least one SKU is required");
        }

        // Try MSI first (M2 2.3+)
        try {
          const inventory = await getMsiInventory(client, params.skus, params.locationIds, vendorNs);
          return successResult({ inventory });
        } catch {
          // Fall back to legacy catalog inventory
          const inventory = await getLegacyInventory(client, params.skus, vendorNs);
          return successResult({ inventory });
        }
      } catch (error: unknown) {
        return errorResult(`get-inventory failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
}

async function getMsiInventory(
  client: MagentoClient,
  skus: string[],
  locationIds: string[] | undefined,
  vendorNs: string
): Promise<OnxInventoryRecord[]> {
  const filters: SearchCriteria = {
    filterGroups: [
      { filters: [{ field: "sku", value: skus.join(","), conditionType: "in" }] },
    ],
    pageSize: skus.length * 10,
  };

  if (locationIds?.length) {
    filters.filterGroups!.push({
      filters: [{ field: "source_code", value: locationIds.join(","), conditionType: "in" }],
    });
  }

  const response = await client.get<MagentoListResponse<M2SourceItem>>("inventory/source-items", filters);

  return (response.items || []).map((item) => ({
    sku: item.sku,
    locationId: item.source_code,
    available: item.quantity,
    onHand: item.quantity,
    unavailable: 0,
    tenantId: vendorNs,
  }));
}

async function getLegacyInventory(
  client: MagentoClient,
  skus: string[],
  vendorNs: string
): Promise<OnxInventoryRecord[]> {
  const results: OnxInventoryRecord[] = [];

  for (const sku of skus) {
    try {
      const stockItem = await client.get<M2StockItem>(`stockItems/${encodeURIComponent(sku)}`);
      results.push({
        sku,
        locationId: "default",
        available: stockItem.qty,
        onHand: stockItem.qty,
        unavailable: 0,
        tenantId: vendorNs,
      });
    } catch {
      // SKU not found in legacy stock — skip
    }
  }

  return results;
}

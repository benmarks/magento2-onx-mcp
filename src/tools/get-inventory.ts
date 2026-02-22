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
import type { MagentoClient } from "../client/magento-client.js";
import { successResult, errorResult } from "./_helpers.js";

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
      } catch (error: any) {
        return errorResult(`get-inventory failed: ${error.message}`);
      }
    }
  );
}

async function getMsiInventory(
  client: MagentoClient,
  skus: string[],
  locationIds: string[] | undefined,
  vendorNs: string
) {
  const results: any[] = [];

  for (const sku of skus) {
    const filters: any = {
      filterGroups: [{ filters: [{ field: "sku", value: sku, conditionType: "eq" }] }],
    };

    if (locationIds?.length) {
      filters.filterGroups.push({
        filters: [{ field: "source_code", value: locationIds.join(","), conditionType: "in" }],
      });
    }

    const response = await client.get<any>("inventory/source-items", filters);

    for (const item of response.items || []) {
      results.push({
        sku: item.sku,
        locationId: item.source_code,
        available: item.quantity,
        onHand: item.quantity,
        unavailable: 0,
        tenantId: vendorNs,
      });
    }
  }

  return results;
}

async function getLegacyInventory(client: MagentoClient, skus: string[], vendorNs: string) {
  const results: any[] = [];

  for (const sku of skus) {
    try {
      const stockItem = await client.get<any>(`stockItems/${encodeURIComponent(sku)}`);
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

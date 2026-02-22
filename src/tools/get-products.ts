/**
 * onX tool: get-products
 *
 * Matches: GetProductsInputSchema from reference server
 * Input: { ids?[], skus?[], TemporalPagination }
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MagentoClient } from "../client/magento-client.js";
import { mapM2ProductToOnx } from "../mappers/product-mapper.js";
import { temporalPaginationSchema, buildSearchCriteria, idsFilter, successResult, errorResult } from "./_helpers.js";

export function registerGetProducts(server: McpServer, client: MagentoClient, vendorNs: string, currency: string) {
  server.tool(
    "get-products",
    "Get product catalog entries. Retrieve products by ID, SKU, or with temporal filtering.",
    {
      ids: z.array(z.string()).optional().describe("Product IDs"),
      skus: z.array(z.string()).optional().describe("Product SKUs"),
      ...temporalPaginationSchema,
    },
    async (params) => {
      try {
        // Single SKU lookup uses the direct endpoint
        if (params.skus?.length === 1) {
          const product = await client.get<any>(`products/${encodeURIComponent(params.skus[0])}`);
          return successResult({ products: [mapM2ProductToOnx(product, vendorNs, currency)] });
        }

        const extraFilters: Array<{ field: string; value: string; conditionType: string }> = [];
        if (params.ids?.length) extraFilters.push(idsFilter("entity_id", params.ids));
        if (params.skus?.length) extraFilters.push(idsFilter("sku", params.skus));

        const criteria = buildSearchCriteria({ ...params, extraFilters });
        const result = await client.get<any>("products", criteria);
        const products = (result.items || []).map((p: any) => mapM2ProductToOnx(p, vendorNs, currency));

        return successResult({ products });
      } catch (error: any) {
        return errorResult(`get-products failed: ${error.message}`);
      }
    }
  );
}

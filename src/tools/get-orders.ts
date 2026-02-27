/**
 * onX tool: get-orders
 *
 * Matches: GetOrdersInputSchema from reference server
 * Inputs: ids[], externalIds[], statuses[], names[], includeLineItems, TemporalPagination
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MagentoClient, MagentoListResponse } from "../client/magento-client.js";
import type { M2Order } from "../types/magento.js";
import { mapM2OrderToOnx } from "../mappers/order-mapper.js";
import { temporalPaginationSchema, buildSearchCriteria, idsFilter, successResult, errorResult } from "./_helpers.js";

export function registerGetOrders(server: McpServer, client: MagentoClient, vendorNs: string) {
  server.tool(
    "get-orders",
    "Retrieves order details when you need to check order status, view line items, track fulfillment progress, or investigate customer inquiries. Accepts order ID, external ID, or order number.",
    {
      ids: z.array(z.string()).optional().describe("Internal order IDs"),
      externalIds: z.array(z.string()).optional().describe("External order IDs from source system"),
      statuses: z.array(z.string()).optional().describe("Order statuses to filter by"),
      names: z.array(z.string()).optional().describe("Friendly order identifiers (increment_id in M2)"),
      includeLineItems: z.boolean().default(true).optional().describe("Whether to include detailed line item information in the returned orders"),
      ...temporalPaginationSchema,
    },
    async (params) => {
      try {
        const extraFilters: Array<{ field: string; value: string; conditionType: string }> = [];

        if (params.ids?.length) extraFilters.push(idsFilter("entity_id", params.ids));
        if (params.externalIds?.length) extraFilters.push(idsFilter("ext_order_id", params.externalIds));
        if (params.statuses?.length) extraFilters.push(idsFilter("state", params.statuses));
        if (params.names?.length) extraFilters.push(idsFilter("increment_id", params.names));

        const criteria = buildSearchCriteria({ ...params, extraFilters });
        const result = await client.get<MagentoListResponse<M2Order>>("orders", criteria);
        const includeLineItems = params.includeLineItems !== false;

        const orders = (result.items || []).map((o) => {
          const mapped = mapM2OrderToOnx(o, vendorNs);
          if (!includeLineItems) {
            delete mapped.lineItems;
          }
          return mapped;
        });

        return successResult({ orders });
      } catch (error: unknown) {
        return errorResult(`get-orders failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
}

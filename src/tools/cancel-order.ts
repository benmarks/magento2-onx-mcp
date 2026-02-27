/**
 * onX tool: cancel-order
 *
 * Matches: CancelOrderInputSchema from reference server
 * Input: { orderId, reason?, notifyCustomer?, notes?, lineItems? }
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MagentoClient } from "../client/magento-client.js";
import type { M2Order } from "../types/magento.js";
import { mapM2OrderToOnx } from "../mappers/order-mapper.js";
import { successResult, errorResult } from "./_helpers.js";

export function registerCancelOrder(server: McpServer, client: MagentoClient, vendorNs: string) {
  server.tool(
    "cancel-order",
    "Cancel existing orders with optional reason tracking. Only orders in pending/processing state can be cancelled.",
    {
      orderId: z.string().describe("ID of the order to cancel"),
      reason: z.string().optional().describe("Reason for cancellation"),
      notifyCustomer: z.boolean().optional().describe("Whether to send cancellation notification"),
      notes: z.string().optional().describe("Additional cancellation notes"),
      lineItems: z.array(z.object({
        sku: z.string(),
        quantity: z.number(),
      })).optional().describe("Specific line items to cancel (omit to cancel entire order)"),
    },
    async (params) => {
      try {
        const success = await client.post<boolean>(`orders/${params.orderId}/cancel`, {});

        if (!success) {
          return errorResult(
            `Order ${params.orderId} could not be cancelled. It may be shipped, completed, or in a non-cancellable state.`
          );
        }

        // Add cancellation reason as a comment
        if (params.reason || params.notes) {
          const comment = [params.reason, params.notes].filter(Boolean).join(" — ");
          await client.post(`orders/${params.orderId}/comments`, {
            statusHistory: {
              comment: `Cancelled via onX: ${comment}`,
              is_customer_notified: params.notifyCustomer ? 1 : 0,
              is_visible_on_front: 0,
            },
          });
        }

        const order = await client.get<M2Order>(`orders/${params.orderId}`);
        return successResult({ order: mapM2OrderToOnx(order, vendorNs) });
      } catch (error: unknown) {
        return errorResult(`cancel-order failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
}

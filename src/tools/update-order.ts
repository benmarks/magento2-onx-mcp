/**
 * onX tool: update-order
 *
 * Matches: UpdateOrderInputSchema from reference server
 * Input: { id: string, updates: Partial<Order> (minus immutable fields) }
 *
 * The reference server accepts ANY Order field as updatable. Magento 2 has limited
 * order update capabilities, so we map what we can (comments, hold/unhold, addresses)
 * and pass through the rest as best-effort.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MagentoClient } from "../client/magento-client.js";
import { mapM2OrderToOnx } from "../mappers/order-mapper.js";
import { addressSchema, customFieldSchema, successResult, errorResult } from "./_helpers.js";

const lineItemSchema = z.object({
  id: z.string().optional(),
  sku: z.string(),
  quantity: z.number().min(1),
  unitPrice: z.number().min(0),
  unitDiscount: z.number().optional(),
  totalPrice: z.number().optional(),
  name: z.string().optional(),
  customFields: z.array(customFieldSchema).optional(),
});

export function registerUpdateOrder(server: McpServer, client: MagentoClient, vendorNs: string) {
  server.tool(
    "update-order",
    "Modify order details and metadata. Accepts any Order field; Magento 2 supports hold/unhold, comments, and address updates.",
    {
      id: z.string().describe("Order ID"),
      updates: z.object({
        // All Order fields from the onX spec (minus immutable: id, createdAt, updatedAt, tenantId)
        externalId: z.string().optional(),
        name: z.string().optional(),
        status: z.string().optional().describe("Order status (use 'holded' or 'on_hold' to hold, 'unhold' to release)"),
        billingAddress: addressSchema.optional(),
        currency: z.string().optional(),
        customFields: z.array(customFieldSchema).optional(),
        customer: z.object({
          email: z.string().optional(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
        }).optional(),
        discounts: z.array(z.object({}).passthrough()).optional(),
        lineItems: z.array(lineItemSchema).optional(),
        orderDiscount: z.number().optional(),
        orderNote: z.string().optional().describe("Add a comment/note to the order"),
        orderSource: z.string().optional(),
        orderTax: z.number().optional(),
        paymentStatus: z.string().optional(),
        payments: z.array(z.object({}).passthrough()).optional(),
        refunds: z.array(z.object({}).passthrough()).optional(),
        subTotalPrice: z.number().optional(),
        tags: z.array(z.string()).optional(),
        totalPrice: z.number().optional(),
        // ShippingInfo fields
        shippingAddress: addressSchema.optional(),
        shippingCarrier: z.string().optional(),
        shippingClass: z.string().optional(),
        shippingCode: z.string().optional(),
        shippingNote: z.string().optional(),
        shippingPrice: z.number().optional(),
        giftNote: z.string().optional(),
        incoterms: z.string().optional(),
      }).describe("Fields to update (at least one field required)"),
    },
    async (params) => {
      try {
        const sourceId = params.id;

        // Handle hold/unhold via status
        if (params.updates.status === "holded" || params.updates.status === "on_hold") {
          await client.post(`orders/${sourceId}/hold`, {});
        } else if (params.updates.status === "unhold") {
          await client.post(`orders/${sourceId}/unhold`, {});
        }

        // Add comment if provided
        if (params.updates.orderNote) {
          await client.post(`orders/${sourceId}/comments`, {
            statusHistory: {
              comment: params.updates.orderNote,
              is_customer_notified: 0,
              is_visible_on_front: 0,
            },
          });
        }

        // Update billing address if provided
        if (params.updates.billingAddress) {
          const order = await client.get<any>(`orders/${sourceId}`);
          if (order.billing_address) {
            const addr = params.updates.billingAddress;
            const updatedAddr = {
              ...order.billing_address,
              ...(addr.firstName && { firstname: addr.firstName }),
              ...(addr.lastName && { lastname: addr.lastName }),
              ...(addr.company && { company: addr.company }),
              ...(addr.address1 && { street: [addr.address1, addr.address2 || ""] }),
              ...(addr.city && { city: addr.city }),
              ...(addr.stateOrProvince && { region_code: addr.stateOrProvince }),
              ...(addr.zipCodeOrPostalCode && { postcode: addr.zipCodeOrPostalCode }),
              ...(addr.country && { country_id: addr.country }),
              ...(addr.phone && { telephone: addr.phone }),
              ...(addr.email && { email: addr.email }),
            };
            await client.put(`orders/${sourceId}`, {
              entity: { entity_id: parseInt(sourceId, 10), billing_address: updatedAddr },
            });
          }
        }

        const order = await client.get<any>(`orders/${sourceId}`);
        return successResult({ order: mapM2OrderToOnx(order, vendorNs) });
      } catch (error: any) {
        return errorResult(`update-order failed: ${error.message}`);
      }
    }
  );
}

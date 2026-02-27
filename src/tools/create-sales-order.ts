/**
 * onX tool: create-sales-order
 *
 * Matches: CreateSalesOrderInputSchema from reference server
 * Input: { order: OrderSchema (minus immutable fields: id, createdAt, updatedAt, tenantId) }
 *
 * Accepts the full onX Order shape. Creates a new order via M2's cart/quote API flow.
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
  unitPrice: z.number().optional(),
  unitDiscount: z.number().optional(),
  totalPrice: z.number().optional(),
  name: z.string().optional(),
  customFields: z.array(customFieldSchema).optional(),
});

export function registerCreateSalesOrder(server: McpServer, client: MagentoClient, vendorNs: string) {
  server.tool(
    "create-sales-order",
    "Creates a new order when a customer completes checkout or when importing orders from external systems. Required: line items with SKUs and quantities.",
    {
      order: z.object({
        // All Order fields from the onX spec (minus immutable: id, createdAt, updatedAt, tenantId)
        externalId: z.string().optional().describe("External order ID from source system"),
        name: z.string().optional().describe("Order name/number"),
        status: z.string().optional(),
        lineItems: z.array(lineItemSchema).describe("Order line items"),
        customer: z.object({
          email: z.string().optional(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
        }).optional(),
        billingAddress: addressSchema.optional(),
        currency: z.string().optional(),
        customFields: z.array(customFieldSchema).optional(),
        discounts: z.array(z.object({}).passthrough()).optional(),
        orderDiscount: z.number().optional(),
        orderNote: z.string().optional(),
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
      }),
    },
    async (params) => {
      try {
        const order = params.order;
        const email = order.customer?.email || order.billingAddress?.email || "guest@example.com";

        // Step 1: Create guest cart
        const cartId = await client.post<string>("guest-carts", {});

        // Step 2: Add items
        for (const item of order.lineItems) {
          await client.post(`guest-carts/${cartId}/items`, {
            cartItem: { sku: item.sku, qty: item.quantity, quote_id: cartId },
          });
        }

        // Step 3: Set billing address
        const billingAddr = order.billingAddress || {};
        await client.post(`guest-carts/${cartId}/billing-address`, {
          address: mapOnxAddressToM2(billingAddr, email),
        });

        // Step 4: Set shipping info
        const shippingAddr = order.shippingAddress || billingAddr;
        const carrier = order.shippingCarrier || order.shippingCode || "flatrate";
        const method = order.shippingClass || "flatrate";

        await client.post(`guest-carts/${cartId}/shipping-information`, {
          addressInformation: {
            shipping_address: mapOnxAddressToM2(shippingAddr, email),
            billing_address: mapOnxAddressToM2(billingAddr, email),
            shipping_carrier_code: carrier,
            shipping_method_code: method,
          },
        });

        // Step 5: Place order
        const orderId = await client.put<number>(`guest-carts/${cartId}/order`, {
          paymentMethod: { method: "checkmo" },
        });

        // Step 6: Add order note as comment if provided
        if (order.orderNote) {
          await client.post(`orders/${orderId}/comments`, {
            statusHistory: {
              comment: order.orderNote,
              is_customer_notified: 0,
              is_visible_on_front: 0,
            },
          });
        }

        // Step 7: Fetch and return
        const m2Order = await client.get<any>(`orders/${orderId}`);
        return successResult({ order: mapM2OrderToOnx(m2Order, vendorNs) });
      } catch (error: any) {
        return errorResult(`create-sales-order failed: ${error.message}`);
      }
    }
  );
}

function mapOnxAddressToM2(addr: any, email: string) {
  return {
    firstname: addr.firstName || "Guest",
    lastname: addr.lastName || "Customer",
    company: addr.company,
    street: [addr.address1 || "", addr.address2 || ""].filter(Boolean),
    city: addr.city || "",
    region_code: addr.stateOrProvince,
    postcode: addr.zipCodeOrPostalCode || "00000",
    country_id: addr.country || "US",
    telephone: addr.phone || "0000000000",
    email: addr.email || email,
  };
}

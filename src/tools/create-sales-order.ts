/**
 * onX tool: create-sales-order
 *
 * Matches: CreateSalesOrderInputSchema from reference server
 * Input: { order: OrderSchema (minus immutable fields: id, createdAt, updatedAt, tenantId) }
 *
 * Creates a new order via M2's admin POST /orders endpoint.
 * Note: The admin API requires explicit item prices — the cart pricing pipeline is bypassed.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MagentoClient } from "../client/magento-client.js";
import type { M2Order } from "../types/magento.js";
import { mapM2OrderToOnx } from "../mappers/order-mapper.js";
import { addressSchema, customFieldSchema, successResult, errorResult } from "./_helpers.js";

const lineItemSchema = z.object({
  id: z.string().optional(),
  sku: z.string(),
  quantity: z.number().min(1),
  unitPrice: z.number().describe("Unit price (required — admin API bypasses cart pricing)"),
  unitDiscount: z.number().optional(),
  totalPrice: z.number().optional(),
  name: z.string().optional(),
  customFields: z.array(customFieldSchema).optional(),
});

type OnxAddress = z.infer<typeof addressSchema>;

export function registerCreateSalesOrder(server: McpServer, client: MagentoClient, vendorNs: string) {
  server.tool(
    "create-sales-order",
    "Creates a new order via the admin API. Required: line items with SKUs, quantities, and unitPrice (admin API bypasses the cart pricing pipeline, so explicit prices are required).",
    {
      order: z.object({
        // All Order fields from the onX spec (minus immutable: id, createdAt, updatedAt, tenantId)
        externalId: z.string().optional().describe("External order ID from source system"),
        name: z.string().optional().describe("Order name/number"),
        status: z.string().optional(),
        lineItems: z.array(lineItemSchema).describe("Order line items (unitPrice required — admin API bypasses cart pricing)"),
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

        // Build M2 order items
        const m2Items = order.lineItems.map((item) => ({
          sku: item.sku,
          name: item.name || item.sku,
          qty_ordered: item.quantity,
          price: item.unitPrice || 0,
          base_price: item.unitPrice || 0,
          row_total: item.totalPrice ?? (item.unitPrice || 0) * item.quantity,
          base_row_total: item.totalPrice ?? (item.unitPrice || 0) * item.quantity,
          product_type: "simple",
        }));

        const subtotal = order.subTotalPrice ?? m2Items.reduce((sum, i) => sum + i.row_total, 0);
        const shippingAmount = order.shippingPrice || 0;
        const discount = order.orderDiscount || 0;
        const tax = order.orderTax || 0;
        const grandTotal = order.totalPrice ?? (subtotal + shippingAmount + tax - discount);

        const billingAddr = mapOnxAddressToM2(order.billingAddress || {}, email);
        const shippingAddr = mapOnxAddressToM2(order.shippingAddress || order.billingAddress || {}, email);

        const carrierCode = order.shippingCode || order.shippingCarrier || "flatrate";
        const methodCode = order.shippingClass || "flatrate";
        const shippingMethod = `${carrierCode}_${methodCode}`;

        const entity: Record<string, unknown> = {
          customer_email: email,
          customer_firstname: order.customer?.firstName || billingAddr.firstname,
          customer_lastname: order.customer?.lastName || billingAddr.lastname,
          base_currency_code: order.currency || "USD",
          global_currency_code: order.currency || "USD",
          order_currency_code: order.currency || "USD",
          store_currency_code: order.currency || "USD",
          store_id: 1,
          state: order.status || "new",
          status: order.status || "pending",
          is_virtual: 0,
          subtotal,
          base_subtotal: subtotal,
          grand_total: grandTotal,
          base_grand_total: grandTotal,
          shipping_amount: shippingAmount,
          base_shipping_amount: shippingAmount,
          tax_amount: tax,
          base_tax_amount: tax,
          discount_amount: discount > 0 ? -discount : 0,
          base_discount_amount: discount > 0 ? -discount : 0,
          shipping_description: order.shippingCarrier || "Flat Rate - Fixed",
          shipping_method: shippingMethod,
          items: m2Items,
          billing_address: billingAddr,
          payment: { method: "checkmo" },
          extension_attributes: {
            shipping_assignments: [
              {
                shipping: {
                  address: shippingAddr,
                  method: shippingMethod,
                },
                items: m2Items,
              },
            ],
          },
        };

        if (order.externalId) {
          entity.ext_order_id = order.externalId;
        }

        // Single POST creates the order and returns the full entity
        const m2Order = await client.post<M2Order>("orders", { entity });

        // Add order note as comment if provided
        if (order.orderNote) {
          await client.post(`orders/${m2Order.entity_id}/comments`, {
            statusHistory: {
              comment: order.orderNote,
              is_customer_notified: 0,
              is_visible_on_front: 0,
            },
          });
        }

        return successResult({ order: mapM2OrderToOnx(m2Order, vendorNs) });
      } catch (error: unknown) {
        return errorResult(`create-sales-order failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
}

function mapOnxAddressToM2(addr: OnxAddress, email: string) {
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

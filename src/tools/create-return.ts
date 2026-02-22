/**
 * onX tool: create-return
 *
 * Matches: CreateReturnInputSchema from reference server
 * Input: { return: ReturnSchema (minus immutable fields: id, createdAt, updatedAt, tenantId) }
 *
 * On Adobe Commerce, creates an RMA. On Magento Open Source, creates a credit memo.
 * Accepts the full onX Return shape; fields that M2 doesn't natively support are
 * acknowledged but may not persist.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MagentoClient } from "../client/magento-client.js";
import { successResult, errorResult } from "./_helpers.js";

const addressSchema = z.object({
  address1: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  company: z.string().optional(),
  country: z.string().optional(),
  email: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  stateOrProvince: z.string().optional(),
  zipCodeOrPostalCode: z.string().optional(),
});

const inspectionSchema = z.object({
  conditionCategory: z.string().optional(),
  dispositionOutcome: z.string().optional(),
  warehouseLocationId: z.string().optional(),
  note: z.string().optional(),
  inspectedBy: z.string().optional(),
  inspectedAt: z.string().optional(),
  images: z.array(z.string()).optional(),
}).optional();

const returnLineItemSchema = z.object({
  id: z.string().optional(),
  orderLineItemId: z.string().describe("Reference to the original order line item"),
  sku: z.string(),
  quantityReturned: z.number().min(1),
  returnReason: z.string().describe("Return reason code"),
  inspection: inspectionSchema,
  unitPrice: z.number().optional(),
  refundAmount: z.number().optional(),
  restockFee: z.number().optional(),
  name: z.string().optional(),
});

const exchangeLineItemSchema = z.object({
  id: z.string().optional(),
  exchangeOrderId: z.string().optional(),
  exchangeOrderName: z.string().optional(),
  sku: z.string(),
  name: z.string().optional(),
  quantity: z.number().min(1),
  unitPrice: z.number().optional(),
});

const returnLabelSchema = z.object({
  status: z.string().optional(),
  carrier: z.string(),
  trackingNumber: z.string(),
  url: z.string().optional(),
  rate: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const returnMethodSchema = z.object({
  provider: z.string().optional(),
  methodType: z.string().optional(),
  address: addressSchema.optional(),
  qrCodeUrl: z.string().optional(),
  updatedAt: z.string().optional(),
}).optional();

export function registerCreateReturn(server: McpServer, client: MagentoClient, vendorNs: string) {
  server.tool(
    "create-return",
    "Create returns for order items with refund/exchange tracking. On Adobe Commerce creates an RMA; on Open Source creates a credit memo.",
    {
      return: z.object({
        // Identifiers (id, createdAt, updatedAt, tenantId are immutable/system-set)
        externalId: z.string().optional(),
        returnNumber: z.string().optional(),
        orderId: z.string().describe("ID of the original order"),

        // Status and outcome
        status: z.string().optional(),
        outcome: z.string().describe("What the customer receives (refund, exchange, store_credit)"),

        // Items
        returnLineItems: z.array(returnLineItemSchema).describe("Items being returned"),
        exchangeLineItems: z.array(exchangeLineItemSchema).optional(),
        totalQuantity: z.number().optional(),

        // Return method and shipping
        returnMethod: returnMethodSchema,
        returnShippingAddress: addressSchema.optional(),
        labels: z.array(returnLabelSchema).optional(),
        locationId: z.string().optional(),

        // Financial
        returnTotal: z.number().optional(),
        exchangeTotal: z.number().optional(),
        refundAmount: z.number().optional(),
        refundMethod: z.string().optional(),
        refundStatus: z.string().optional(),
        refundTransactionId: z.string().optional(),
        shippingRefundAmount: z.number().optional(),
        returnShippingFees: z.number().optional(),
        restockingFee: z.number().optional(),

        // Dates
        requestedAt: z.string().optional(),
        receivedAt: z.string().optional(),
        completedAt: z.string().optional(),

        // Metadata
        customerNote: z.string().optional(),
        internalNote: z.string().optional(),
        returnInstructions: z.string().optional(),
        declineReason: z.string().optional(),
        statusPageUrl: z.string().optional(),

        tags: z.array(z.string()).optional(),
        customFields: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
      }),
    },
    async (params) => {
      try {
        const ret = params.return;

        // Try RMA endpoint first (Adobe Commerce)
        try {
          const rma = await client.post<any>("returns", {
            rmaDataInterface: {
              order_id: parseInt(ret.orderId, 10),
              items: ret.returnLineItems.map((item) => ({
                order_item_id: parseInt(item.orderLineItemId, 10),
                qty_requested: item.quantityReturned,
                reason: item.returnReason,
                condition: item.inspection?.conditionCategory || "",
              })),
              comments: ret.customerNote
                ? [{ comment: ret.customerNote, is_customer_notified: true, is_visible_on_front: true }]
                : [],
            },
          });

          return successResult({
            return: mapRmaToOnxReturn(rma, ret, vendorNs),
          });
        } catch (rmaError: any) {
          // RMA not available — fall back to credit memo (Open Source)
          if (rmaError.message?.includes("404") || rmaError.message?.includes("403")) {
            const creditmemo = await client.post<any>(`order/${ret.orderId}/refund`, {
              items: ret.returnLineItems.map((item) => ({
                order_item_id: parseInt(item.orderLineItemId, 10),
                qty: item.quantityReturned,
              })),
              notify: true,
              comment: {
                comment: ret.customerNote || `Return via onX: ${ret.outcome}`,
                is_visible_on_front: 0,
              },
              arguments: {
                shipping_amount: ret.shippingRefundAmount || 0,
                adjustment_positive: 0,
                adjustment_negative: ret.restockingFee || 0,
              },
            });

            const cmId = typeof creditmemo === "object" ? creditmemo.entity_id : creditmemo;

            return successResult({
              return: {
                id: String(cmId),
                orderId: ret.orderId,
                status: "refunded",
                outcome: ret.outcome,
                returnLineItems: ret.returnLineItems,
                exchangeLineItems: ret.exchangeLineItems || [],
                totalQuantity: ret.totalQuantity || ret.returnLineItems.reduce(
                  (sum: number, li: any) => sum + li.quantityReturned, 0
                ),
                refundAmount: ret.refundAmount,
                refundMethod: "original_payment",
                refundStatus: "refunded",
                shippingRefundAmount: ret.shippingRefundAmount || 0,
                returnShippingFees: ret.returnShippingFees || 0,
                restockingFee: ret.restockingFee || 0,
                customerNote: ret.customerNote,
                internalNote: ret.internalNote || "RMA not available — processed as credit memo (Magento Open Source)",
                tags: ret.tags || [],
                customFields: [
                  ...(ret.customFields || []),
                  { name: `${vendorNs}:return_type`, value: "credit_memo" },
                ],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            });
          }
          throw rmaError;
        }
      } catch (error: any) {
        return errorResult(`create-return failed: ${error.message}`);
      }
    }
  );
}

function mapRmaToOnxReturn(rma: any, input: any, vendorNs: string): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: String(rma.entity_id),
    returnNumber: rma.increment_id || input.returnNumber,
    orderId: input.orderId,
    status: rma.status || "requested",
    outcome: input.outcome,

    // Items
    returnLineItems: input.returnLineItems,
    exchangeLineItems: input.exchangeLineItems || [],
    totalQuantity: input.totalQuantity || input.returnLineItems.reduce(
      (sum: number, li: any) => sum + li.quantityReturned, 0
    ),

    // Shipping
    returnMethod: input.returnMethod,
    returnShippingAddress: input.returnShippingAddress,
    labels: input.labels || [],
    locationId: input.locationId,

    // Financial
    returnTotal: input.returnTotal,
    exchangeTotal: input.exchangeTotal,
    refundAmount: input.refundAmount,
    refundMethod: input.refundMethod,
    refundStatus: input.refundStatus || "pending",
    refundTransactionId: input.refundTransactionId,
    shippingRefundAmount: input.shippingRefundAmount || 0,
    returnShippingFees: input.returnShippingFees || 0,
    restockingFee: input.restockingFee || 0,

    // Dates
    requestedAt: rma.date_requested || input.requestedAt || now,
    receivedAt: input.receivedAt,
    completedAt: input.completedAt,

    // Metadata
    customerNote: input.customerNote,
    internalNote: input.internalNote,
    returnInstructions: input.returnInstructions,
    declineReason: input.declineReason,
    statusPageUrl: input.statusPageUrl,

    tags: input.tags || [],
    customFields: [
      ...(input.customFields || []),
      { name: `${vendorNs}:return_type`, value: "rma" },
      { name: `${vendorNs}:rma_entity_id`, value: String(rma.entity_id) },
    ],

    createdAt: rma.date_requested || now,
    updatedAt: rma.date_requested || now,
  };
}

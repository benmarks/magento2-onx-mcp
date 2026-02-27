/**
 * onX tool: get-returns
 *
 * Matches: GetReturnsInputSchema from reference server
 * Input: { ids?[], orderIds?[], returnNumbers?[], statuses?[], outcomes?[], TemporalPagination }
 *
 * On Adobe Commerce, queries RMAs. On Open Source, queries credit memos.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MagentoApiError } from "../client/magento-client.js";
import type { MagentoClient, MagentoListResponse } from "../client/magento-client.js";
import type { M2Rma, M2RmaItem, M2RmaComment, M2RmaTrack, M2CreditMemo, M2CreditMemoItem, M2CreditMemoComment } from "../types/magento.js";
import { temporalPaginationSchema, buildSearchCriteria, idsFilter, successResult, errorResult } from "./_helpers.js";

interface GetReturnsParams {
  ids?: string[];
  orderIds?: string[];
  returnNumbers?: string[];
  statuses?: string[];
  outcomes?: string[];
  updatedAtMin?: string;
  updatedAtMax?: string;
  createdAtMin?: string;
  createdAtMax?: string;
  pageSize?: number;
  skip?: number;
}

export function registerGetReturns(server: McpServer, client: MagentoClient, vendorNs: string) {
  server.tool(
    "get-returns",
    "Query return records and status. On Adobe Commerce returns RMAs; on Open Source returns credit memos.",
    {
      ids: z.array(z.string()).optional().describe("Internal return IDs"),
      orderIds: z.array(z.string()).optional().describe("Order IDs to find returns for"),
      returnNumbers: z.array(z.string()).optional().describe("Return numbers (customer-facing identifiers)"),
      statuses: z.array(z.string()).optional().describe("Return statuses"),
      outcomes: z.array(z.string()).optional().describe("Return outcomes (refund/exchange)"),
      ...temporalPaginationSchema,
    },
    async (params) => {
      try {
        // Try RMA endpoint first (Adobe Commerce)
        try {
          return await getRmaReturns(client, params, vendorNs);
        } catch (rmaError: unknown) {
          // RMA not available — fall back to credit memos (Open Source)
          if (
            rmaError instanceof MagentoApiError &&
            (rmaError.statusCode === 404 || rmaError.statusCode === 403)
          ) {
            return await getCreditMemoReturns(client, params, vendorNs);
          }
          throw rmaError;
        }
      } catch (error: unknown) {
        return errorResult(`get-returns failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
}

async function getRmaReturns(client: MagentoClient, params: GetReturnsParams, vendorNs: string) {
  const extraFilters: Array<{ field: string; value: string; conditionType: string }> = [];
  if (params.ids?.length) extraFilters.push(idsFilter("entity_id", params.ids));
  if (params.orderIds?.length) extraFilters.push(idsFilter("order_id", params.orderIds));
  if (params.statuses?.length) extraFilters.push(idsFilter("status", params.statuses));
  if (params.returnNumbers?.length) extraFilters.push(idsFilter("increment_id", params.returnNumbers));

  const criteria = buildSearchCriteria({ ...params, extraFilters });
  const result = await client.get<MagentoListResponse<M2Rma>>("returns", criteria);

  const returns = (result.items || []).map((rma) => mapRmaToOnx(rma, vendorNs));
  return successResult({ returns });
}

function mapRmaToOnx(rma: M2Rma, vendorNs: string): Record<string, unknown> {
  const returnLineItems = (rma.items || []).map((item: M2RmaItem) => ({
    id: String(item.entity_id || ""),
    orderLineItemId: String(item.order_item_id),
    sku: item.product_sku || "",
    quantityReturned: item.qty_requested,
    returnReason: item.reason || "",
    inspection: {
      conditionCategory: item.condition || undefined,
      dispositionOutcome: item.resolution || undefined,
      note: "",
    },
    unitPrice: item.product_price || undefined,
    refundAmount: undefined,
    restockFee: undefined,
    name: item.product_name || "",
  }));

  const totalQuantity = returnLineItems.reduce(
    (sum, li) => sum + (li.quantityReturned || 0), 0
  );

  // Extract comments
  const comments = rma.comments || [];
  const customerComments = comments
    .filter((c: M2RmaComment) => c.is_visible_on_front)
    .map((c: M2RmaComment) => c.comment)
    .join("; ");
  const internalComments = comments
    .filter((c: M2RmaComment) => !c.is_visible_on_front)
    .map((c: M2RmaComment) => c.comment)
    .join("; ");

  return {
    id: String(rma.entity_id),
    returnNumber: rma.increment_id,
    orderId: String(rma.order_id),
    status: rma.status || "requested",
    outcome: "refund",

    // Items
    returnLineItems,
    exchangeLineItems: [],
    totalQuantity,

    // Shipping (RMA tracks may not be present)
    returnMethod: undefined,
    returnShippingAddress: undefined,
    labels: (rma.tracks || []).map((track: M2RmaTrack) => ({
      carrier: track.carrier_title || "",
      trackingNumber: track.track_number || "",
    })),
    locationId: undefined,

    // Financial (RMA doesn't store these directly)
    returnTotal: undefined,
    exchangeTotal: undefined,
    refundAmount: undefined,
    refundMethod: undefined,
    refundStatus: undefined,
    refundTransactionId: undefined,
    shippingRefundAmount: undefined,
    returnShippingFees: undefined,
    restockingFee: undefined,

    // Dates
    requestedAt: rma.date_requested,
    receivedAt: undefined,
    completedAt: undefined,

    // Metadata
    customerNote: customerComments || undefined,
    internalNote: internalComments || undefined,
    returnInstructions: undefined,
    declineReason: undefined,
    statusPageUrl: undefined,

    tags: [],
    customFields: [
      { name: `${vendorNs}:return_type`, value: "rma" },
      { name: `${vendorNs}:rma_entity_id`, value: String(rma.entity_id) },
    ],

    createdAt: rma.date_requested,
    updatedAt: rma.date_requested,
  };
}

async function getCreditMemoReturns(client: MagentoClient, params: GetReturnsParams, vendorNs: string) {
  const extraFilters: Array<{ field: string; value: string; conditionType: string }> = [];
  if (params.ids?.length) extraFilters.push(idsFilter("entity_id", params.ids));
  if (params.orderIds?.length) extraFilters.push(idsFilter("order_id", params.orderIds));

  const criteria = buildSearchCriteria({ ...params, extraFilters });
  const result = await client.get<MagentoListResponse<M2CreditMemo>>("creditmemos", criteria);

  const returns = (result.items || []).map((cm) => mapCreditMemoToOnx(cm, vendorNs));
  return successResult({ returns });
}

function mapCreditMemoToOnx(cm: M2CreditMemo, vendorNs: string): Record<string, unknown> {
  const returnLineItems = (cm.items || []).map((item: M2CreditMemoItem) => ({
    id: String(item.entity_id || ""),
    orderLineItemId: String(item.order_item_id),
    sku: item.sku || "",
    quantityReturned: item.qty,
    returnReason: "",
    unitPrice: item.price || undefined,
    refundAmount: item.row_total || undefined,
    restockFee: undefined,
    name: item.name || "",
  }));

  const totalQuantity = returnLineItems.reduce(
    (sum, li) => sum + (li.quantityReturned || 0), 0
  );

  // Extract comments
  const comments = cm.comments || [];
  const commentText = comments.map((c: M2CreditMemoComment) => c.comment).join("; ");

  return {
    id: String(cm.entity_id),
    returnNumber: cm.increment_id,
    orderId: String(cm.order_id),
    status: "refunded",
    outcome: "refund",

    // Items
    returnLineItems,
    exchangeLineItems: [],
    totalQuantity,

    // Shipping
    returnMethod: undefined,
    returnShippingAddress: undefined,
    labels: [],
    locationId: undefined,

    // Financial
    returnTotal: cm.subtotal,
    exchangeTotal: undefined,
    refundAmount: cm.grand_total,
    refundMethod: "original_payment",
    refundStatus: "refunded",
    refundTransactionId: undefined,
    shippingRefundAmount: cm.shipping_amount || 0,
    returnShippingFees: undefined,
    restockingFee: Math.abs(cm.adjustment_negative || 0),

    // Dates
    requestedAt: cm.created_at,
    receivedAt: undefined,
    completedAt: cm.created_at,

    // Metadata
    customerNote: commentText || undefined,
    internalNote: undefined,
    returnInstructions: undefined,
    declineReason: undefined,
    statusPageUrl: undefined,

    tags: [],
    customFields: [
      { name: `${vendorNs}:return_type`, value: "credit_memo" },
      { name: `${vendorNs}:creditmemo_id`, value: String(cm.entity_id) },
      { name: `${vendorNs}:invoice_id`, value: String(cm.invoice_id || "") },
    ],

    createdAt: cm.created_at,
    updatedAt: cm.updated_at,
  };
}

/**
 * onX tool: get-fulfillments
 *
 * Matches: GetFulfillmentsInputSchema from reference server
 * Input: { ids?[], orderIds?[], TemporalPagination }
 *
 * Maps Magento 2 shipments to onX Fulfillment shape including
 * all FulfillmentCoreSchema and ShippingInfo fields.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MagentoClient } from "../client/magento-client.js";
import { temporalPaginationSchema, buildSearchCriteria, idsFilter, successResult, errorResult } from "./_helpers.js";

export function registerGetFulfillments(server: McpServer, client: MagentoClient, vendorNs: string) {
  server.tool(
    "get-fulfillments",
    "List fulfillment records and statuses. Query by fulfillment ID or order ID.",
    {
      ids: z.array(z.string()).optional().describe("Fulfillment/shipment IDs"),
      orderIds: z.array(z.string()).optional().describe("Order IDs to find fulfillments for"),
      ...temporalPaginationSchema,
    },
    async (params) => {
      try {
        const extraFilters: Array<{ field: string; value: string; conditionType: string }> = [];
        if (params.ids?.length) extraFilters.push(idsFilter("entity_id", params.ids));
        if (params.orderIds?.length) extraFilters.push(idsFilter("order_id", params.orderIds));

        const criteria = buildSearchCriteria({ ...params, extraFilters });
        const result = await client.get<any>("shipments", criteria);

        const fulfillments = (result.items || []).map((s: any) => mapShipmentToOnxFulfillment(s, vendorNs));

        return successResult({ fulfillments });
      } catch (error: any) {
        return errorResult(`get-fulfillments failed: ${error.message}`);
      }
    }
  );
}

function mapShipmentToOnxFulfillment(s: any, vendorNs: string): Record<string, unknown> {
  const lineItems = (s.items || []).map((item: any) => ({
    id: String(item.entity_id || ""),
    sku: item.sku,
    quantity: item.qty,
    name: item.name || "",
  }));

  const tracks = s.tracks || [];
  const primaryTrack = tracks[0];

  // Extract shipping address from the shipment if available
  const shippingAddress = s.shipping_address ? {
    firstName: s.shipping_address.firstname,
    lastName: s.shipping_address.lastname,
    company: s.shipping_address.company,
    address1: s.shipping_address.street?.[0] || "",
    address2: s.shipping_address.street?.[1] || "",
    city: s.shipping_address.city,
    stateOrProvince: s.shipping_address.region_code || s.shipping_address.region,
    zipCodeOrPostalCode: s.shipping_address.postcode,
    country: s.shipping_address.country_id,
    phone: s.shipping_address.telephone,
    email: s.shipping_address.email,
  } : undefined;

  return {
    id: String(s.entity_id),
    orderId: String(s.order_id),
    status: "shipped",

    // Line items
    lineItems,
    trackingNumbers: tracks.map((t: any) => t.track_number),

    // ShippingInfo fields
    shippingAddress,
    shippingCarrier: primaryTrack?.title || undefined,
    shippingClass: undefined,
    shippingCode: primaryTrack?.carrier_code || undefined,
    shippingNote: undefined,
    shippingPrice: undefined,
    giftNote: undefined,
    incoterms: undefined,

    // FulfillmentCoreSchema additional fields
    locationId: s.extension_attributes?.source_code || undefined,
    expectedDeliveryDate: undefined,
    expectedShipDate: undefined,
    shipByDate: undefined,

    tags: [],
    customFields: [
      { name: `${vendorNs}:shipment_id`, value: String(s.entity_id) },
      { name: `${vendorNs}:increment_id`, value: s.increment_id || "" },
    ],

    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

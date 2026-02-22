/**
 * onX tool: fulfill-order
 *
 * Matches: FulfillOrderInputSchema from reference server
 * Input: FulfillmentCoreSchema (orderId, lineItems, trackingNumbers required)
 * plus all ShippingInfo fields.
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

const lineItemSchema = z.object({
  id: z.string().optional(),
  sku: z.string(),
  quantity: z.number().min(1),
  unitPrice: z.number().optional(),
  unitDiscount: z.number().optional(),
  totalPrice: z.number().optional(),
  name: z.string().optional(),
  customFields: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
});

export function registerFulfillOrder(server: McpServer, client: MagentoClient, vendorNs: string) {
  server.tool(
    "fulfill-order",
    "Mark orders as fulfilled and return fulfillment data including tracking information. Creates a shipment in the commerce platform.",
    {
      // FulfillmentCoreSchema required fields
      orderId: z.string().describe("Order ID to fulfill"),
      lineItems: z.array(lineItemSchema).describe("Items to fulfill"),
      trackingNumbers: z.array(z.string()).describe("Tracking numbers from carrier"),

      // FulfillmentCoreSchema optional fields
      status: z.string().optional(),
      locationId: z.string().optional().describe("MSI source code to ship from"),
      expectedShipDate: z.string().optional(),
      expectedDeliveryDate: z.string().optional(),
      shipByDate: z.string().optional(),
      tags: z.array(z.string()).optional(),
      customFields: z.array(z.object({ name: z.string(), value: z.string() })).optional(),

      // ShippingInfo fields
      shippingAddress: addressSchema.optional(),
      shippingCarrier: z.string().optional().describe("Carrier name (e.g., UPS, FedEx, USPS)"),
      shippingClass: z.string().optional().describe("Service level"),
      shippingCode: z.string().optional().describe("Carrier code"),
      shippingNote: z.string().optional(),
      shippingPrice: z.number().optional(),
      giftNote: z.string().optional(),
      incoterms: z.string().optional(),
    },
    async (params) => {
      try {
        const shipmentPayload: any = {
          notify: true,
        };

        // Build tracking info from onX fields
        if (params.trackingNumbers.length > 0) {
          shipmentPayload.tracks = params.trackingNumbers.map((num) => ({
            carrier_code: params.shippingCode || params.shippingCarrier || "custom",
            title: params.shippingCarrier || "Carrier",
            track_number: num,
          }));
        }

        // Add comment from shipping note
        if (params.shippingNote) {
          shipmentPayload.comment = {
            comment: params.shippingNote,
            is_visible_on_front: 0,
          };
        }

        // MSI source
        if (params.locationId) {
          shipmentPayload.arguments = {
            extension_attributes: { source_code: params.locationId },
          };
        }

        const shipmentId = await client.post<number>(
          `order/${params.orderId}/ship`,
          shipmentPayload
        );

        const shipment = await client.get<any>(`shipments/${shipmentId}`);

        // Build full onX Fulfillment response
        const tracks = shipment.tracks || [];
        return successResult({
          fulfillment: {
            id: String(shipment.entity_id),
            orderId: params.orderId,
            status: "shipped",
            lineItems: (shipment.items || []).map((item: any) => ({
              id: String(item.entity_id || ""),
              sku: item.sku,
              quantity: item.qty,
              name: item.name || "",
            })),
            trackingNumbers: tracks.map((t: any) => t.track_number),

            // ShippingInfo
            shippingAddress: shipment.shipping_address ? {
              firstName: shipment.shipping_address.firstname,
              lastName: shipment.shipping_address.lastname,
              company: shipment.shipping_address.company,
              address1: shipment.shipping_address.street?.[0] || "",
              address2: shipment.shipping_address.street?.[1] || "",
              city: shipment.shipping_address.city,
              stateOrProvince: shipment.shipping_address.region_code || shipment.shipping_address.region,
              zipCodeOrPostalCode: shipment.shipping_address.postcode,
              country: shipment.shipping_address.country_id,
              phone: shipment.shipping_address.telephone,
              email: shipment.shipping_address.email,
            } : undefined,
            shippingCarrier: tracks[0]?.title || params.shippingCarrier,
            shippingClass: params.shippingClass,
            shippingCode: tracks[0]?.carrier_code || params.shippingCode,
            shippingNote: params.shippingNote,
            shippingPrice: params.shippingPrice,
            giftNote: params.giftNote,
            incoterms: params.incoterms,

            // Additional fields
            locationId: params.locationId || shipment.extension_attributes?.source_code,
            expectedShipDate: params.expectedShipDate,
            expectedDeliveryDate: params.expectedDeliveryDate,
            shipByDate: params.shipByDate,

            tags: params.tags || [],
            customFields: [
              ...(params.customFields || []),
              { name: `${vendorNs}:shipment_id`, value: String(shipment.entity_id) },
              { name: `${vendorNs}:increment_id`, value: shipment.increment_id || "" },
            ],

            createdAt: shipment.created_at,
            updatedAt: shipment.updated_at,
          },
        });
      } catch (error: any) {
        return errorResult(`fulfill-order failed: ${error.message}`);
      }
    }
  );
}

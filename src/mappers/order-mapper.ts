/**
 * Order mapper: Magento 2 order -> onX Order shape.
 *
 * Maps to the onX OrderSchema which includes:
 * name, status, lineItems, customer, billingAddress, shippingAddress,
 * currency, payments, refunds, discounts, tags, customFields,
 * and all ShippingInfo fields (shippingCarrier, shippingClass, etc.).
 */

export function mapM2OrderToOnx(m2Order: any, vendorNs: string): Record<string, unknown> {
  const lineItems = (m2Order.items || [])
    .filter((item: any) => item.product_type !== "configurable")
    .map((item: any) => ({
      id: String(item.item_id),
      sku: item.sku,
      quantity: item.qty_ordered,
      unitPrice: item.price,
      unitDiscount: item.discount_amount || 0,
      totalPrice: item.row_total,
      name: item.name,
      customFields: [
        { name: `${vendorNs}:product_type`, value: item.product_type || "simple" },
      ],
    }));

  return {
    id: String(m2Order.entity_id),
    externalId: m2Order.ext_order_id || undefined,
    name: m2Order.increment_id,
    status: m2Order.state,
    lineItems,
    customer: {
      email: m2Order.customer_email,
      firstName: m2Order.customer_firstname,
      lastName: m2Order.customer_lastname,
    },
    billingAddress: m2Order.billing_address ? mapM2Address(m2Order.billing_address) : undefined,
    currency: m2Order.order_currency_code,
    subTotalPrice: m2Order.subtotal,
    totalPrice: m2Order.grand_total,
    orderTax: m2Order.tax_amount,
    orderDiscount: Math.abs(m2Order.discount_amount || 0),
    orderNote: "",
    orderSource: "magento2",
    paymentStatus: m2Order.state === "complete" ? "paid" : m2Order.state,
    payments: m2Order.payment ? [{ method: m2Order.payment.method }] : [],
    refunds: [],
    discounts: [],
    tags: [],

    // ShippingInfo fields
    shippingAddress: extractShippingAddress(m2Order),
    shippingCarrier: m2Order.shipping_description,
    shippingClass: "",
    shippingCode: m2Order.shipping_method || "",
    shippingNote: "",
    shippingPrice: m2Order.shipping_amount,
    giftNote: "",
    incoterms: "",

    createdAt: m2Order.created_at,
    updatedAt: m2Order.updated_at,
    customFields: [
      { name: `${vendorNs}:state`, value: m2Order.state },
      { name: `${vendorNs}:status`, value: m2Order.status },
      { name: `${vendorNs}:store_id`, value: String(m2Order.store_id) },
    ],
  };
}

function mapM2Address(addr: any) {
  return {
    firstName: addr.firstname,
    lastName: addr.lastname,
    company: addr.company,
    address1: addr.street?.[0] || "",
    address2: addr.street?.[1] || "",
    city: addr.city,
    stateOrProvince: addr.region_code || addr.region,
    zipCodeOrPostalCode: addr.postcode,
    country: addr.country_id,
    phone: addr.telephone,
    email: addr.email,
  };
}

function extractShippingAddress(order: any) {
  const assignments = order.extension_attributes?.shipping_assignments?.[0]?.shipping?.address;
  if (assignments) return mapM2Address(assignments);
  return undefined;
}

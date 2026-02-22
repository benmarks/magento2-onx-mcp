/**
 * Customer mapper: Magento 2 customer -> onX Customer shape.
 *
 * Maps to the onX CustomerSchema which includes:
 * email, firstName, lastName, addresses, phone, status, type, etc.
 */

const GENDER_MAP: Record<number, string> = { 1: "male", 2: "female", 3: "not_specified" };

export function mapM2CustomerToOnx(customer: any, vendorNs: string): Record<string, unknown> {
  return {
    id: String(customer.id),
    email: customer.email,
    firstName: customer.firstname,
    lastName: customer.lastname,
    phone: "",
    status: "active",
    type: "individual",
    addresses: (customer.addresses || []).map((addr: any) => ({
      name: addr.default_shipping ? "shipping" : addr.default_billing ? "billing" : "other",
      address: {
        firstName: addr.firstname,
        lastName: addr.lastname,
        company: addr.company,
        address1: addr.street?.[0] || "",
        address2: addr.street?.[1] || "",
        city: addr.city,
        stateOrProvince: addr.region?.region_code || addr.region?.region,
        zipCodeOrPostalCode: addr.postcode,
        country: addr.country_id,
        phone: addr.telephone,
      },
    })),
    notes: "",
    createdAt: customer.created_at,
    updatedAt: customer.updated_at,
    tags: [],
    customFields: [
      { name: `${vendorNs}:group_id`, value: String(customer.group_id) },
      { name: `${vendorNs}:gender`, value: customer.gender ? GENDER_MAP[customer.gender] || "" : "" },
    ],
  };
}

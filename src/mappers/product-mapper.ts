/**
 * Product mapper: Magento 2 catalog product -> onX Product shape.
 *
 * Maps to the onX ProductSchema which includes:
 * name, options, description, handle, status, vendor, categories, imageURLs, etc.
 */

export function mapM2ProductToOnx(product: any, vendorNs: string, currency: string): Record<string, unknown> {
  const customAttrs = product.custom_attributes || [];
  const getAttr = (code: string) => customAttrs.find((a: any) => a.attribute_code === code)?.value;

  // Build options from M2 configurable options
  const options = (product.extension_attributes?.configurable_product_options || []).map((opt: any) => ({
    name: opt.label,
    values: (opt.values || []).map((v: any) => String(v.value_index)),
  }));

  return {
    id: String(product.id),
    externalId: product.sku,
    externalProductId: product.sku,
    name: product.name,
    description: getAttr("description"),
    handle: getAttr("url_key"),
    status: product.status === 1 ? "active" : "inactive",
    vendor: getAttr("manufacturer") || "",
    categories: (product.extension_attributes?.category_links || []).map((c: any) => c.category_id),
    options: options.length > 0 ? options : [{ name: "Default", values: [] }],
    imageURLs: (product.media_gallery_entries || []).map((img: any) => img.file),
    tags: [],
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    customFields: [
      { name: `${vendorNs}:type_id`, value: product.type_id },
      { name: `${vendorNs}:attribute_set_id`, value: String(product.attribute_set_id) },
    ],
  };
}

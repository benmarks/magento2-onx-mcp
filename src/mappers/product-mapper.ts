/**
 * Product mapper: Magento 2 catalog product -> onX Product shape.
 *
 * Maps to the onX ProductSchema which includes:
 * name, options, description, handle, status, vendor, categories, imageURLs, etc.
 */

import type { M2Product, M2CustomAttribute, M2ConfigurableOption, M2CategoryLink, M2MediaGalleryEntry } from "../types/magento.js";

export function mapM2ProductToOnx(product: M2Product, vendorNs: string, currency: string): Record<string, unknown> {
  const customAttrs = product.custom_attributes || [];
  const getAttr = (code: string) => customAttrs.find((a: M2CustomAttribute) => a.attribute_code === code)?.value;

  // Build options from M2 configurable options
  const options = (product.extension_attributes?.configurable_product_options || []).map((opt: M2ConfigurableOption) => ({
    name: opt.label,
    values: (opt.values || []).map((v) => String(v.value_index)),
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
    categories: (product.extension_attributes?.category_links || []).map((c: M2CategoryLink) => c.category_id),
    options: options.length > 0 ? options : [{ name: "Default", values: [] }],
    imageURLs: (product.media_gallery_entries || []).map((img: M2MediaGalleryEntry) => img.file),
    tags: [],
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    customFields: [
      { name: `${vendorNs}:type_id`, value: product.type_id },
      { name: `${vendorNs}:attribute_set_id`, value: String(product.attribute_set_id) },
    ],
  };
}

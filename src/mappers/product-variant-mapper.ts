/**
 * ProductVariant mapper: Magento 2 simple product -> onX ProductVariant shape.
 *
 * In M2, "variants" are simple products linked to configurable parents.
 * Maps to the onX ProductVariantSchema which includes:
 * productId, sku, price, currency, weight, dimensions, selectedOptions,
 * barcode, upc, externalProductId, costCurrency, etc.
 */

export function mapM2ProductVariantToOnx(
  product: any,
  parentId: string | undefined,
  vendorNs: string,
  currency: string,
  selectedOptions?: Array<{ name: string; value: string }>
): Record<string, unknown> {
  const customAttrs = product.custom_attributes || [];
  const getAttr = (code: string) => customAttrs.find((a: any) => a.attribute_code === code)?.value;

  const specialPrice = getAttr("special_price");
  const cost = getAttr("cost");

  return {
    id: String(product.id),
    externalId: product.sku,
    productId: parentId || "",
    externalProductId: parentId ? undefined : product.sku,
    sku: product.sku,
    barcode: getAttr("barcode") || getAttr("gtin") || undefined,
    upc: getAttr("upc") || undefined,
    title: product.name,
    selectedOptions: selectedOptions || [],
    price: product.price,
    currency,
    compareAtPrice: specialPrice ? Number(specialPrice) : undefined,
    cost: cost ? Number(cost) : undefined,
    costCurrency: cost ? currency : undefined,
    inventoryNotTracked: false,
    weight: product.weight
      ? { value: product.weight, unit: "lb" as const }
      : undefined,
    dimensions: buildDimensions(getAttr),
    imageURLs: (product.media_gallery_entries || []).map((img: any) => img.file),
    taxable: true,
    tags: [],
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    customFields: [
      { name: `${vendorNs}:type_id`, value: product.type_id },
    ],
  };
}

function buildDimensions(getAttr: (code: string) => any) {
  const length = getAttr("ts_dimensions_length");
  const width = getAttr("ts_dimensions_width");
  const height = getAttr("ts_dimensions_height");

  if (length || width || height) {
    return {
      length: Number(length) || 0,
      width: Number(width) || 0,
      height: Number(height) || 0,
      unit: "in" as const,
    };
  }
  return undefined;
}

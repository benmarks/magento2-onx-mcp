/**
 * onX tool: get-product-variants
 *
 * Matches: GetProductVariantsInputSchema from reference server
 * Input: { ids?[], skus?[], productIds?[], TemporalPagination }
 *
 * In Magento 2, variants are simple products linked to a configurable parent.
 * This tool retrieves simple products that are children of configurable products
 * and populates selectedOptions from the parent's configurable_product_options.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MagentoClient, MagentoListResponse } from "../client/magento-client.js";
import type { M2Product, M2ConfigurableOption, M2CustomAttribute } from "../types/magento.js";
import { mapM2ProductVariantToOnx } from "../mappers/product-variant-mapper.js";
import { temporalPaginationSchema, buildSearchCriteria, idsFilter, successResult, errorResult } from "./_helpers.js";

export function registerGetProductVariants(server: McpServer, client: MagentoClient, vendorNs: string, currency: string) {
  server.tool(
    "get-product-variants",
    "Retrieve variant-level data including SKU, pricing, dimensions, and inventory tracking status. In Magento 2, variants are simple products linked to configurable parents.",
    {
      ids: z.array(z.string()).optional().describe("Variant IDs"),
      skus: z.array(z.string()).optional().describe("Variant SKUs"),
      productIds: z.array(z.string()).optional().describe("Parent product IDs — returns all variants under each product"),
      ...temporalPaginationSchema,
    },
    async (params) => {
      try {
        // If productIds provided, fetch children of each configurable product
        if (params.productIds?.length) {
          const allVariants: Record<string, unknown>[] = [];

          for (const parentId of params.productIds) {
            try {
              // Get the parent product (including configurable_product_options)
              const parentResult = await client.get<MagentoListResponse<M2Product>>("products", {
                filterGroups: [{ filters: [{ field: "entity_id", value: parentId, conditionType: "eq" }] }],
                pageSize: 1,
              });

              if (parentResult.items?.length) {
                const parent = parentResult.items[0];
                const parentSku = parent.sku;

                // Build option label lookup from configurable_product_options
                const configOptions = parent.extension_attributes?.configurable_product_options || [];
                const optionLabelMap = buildOptionLabelMap(configOptions);

                // Fetch configurable product children
                const children = await client.get<M2Product[]>(
                  `configurable-products/${encodeURIComponent(parentSku)}/children`
                );

                for (const child of children) {
                  const selectedOptions = resolveSelectedOptions(child, configOptions, optionLabelMap);
                  allVariants.push(
                    mapM2ProductVariantToOnx(child, parentId, vendorNs, currency, selectedOptions)
                  );
                }
              }
            } catch {
              // Parent may not be configurable — skip
            }
          }

          return successResult({ productVariants: allVariants });
        }

        // Direct SKU or ID lookup
        const extraFilters: Array<{ field: string; value: string; conditionType: string }> = [];
        if (params.ids?.length) extraFilters.push(idsFilter("entity_id", params.ids));
        if (params.skus?.length) extraFilters.push(idsFilter("sku", params.skus));

        // Filter to simple products (which are what M2 uses as variants)
        extraFilters.push({ field: "type_id", value: "simple", conditionType: "eq" });

        const criteria = buildSearchCriteria({ ...params, extraFilters });
        const result = await client.get<MagentoListResponse<M2Product>>("products", criteria);
        const variants = (result.items || []).map((p) =>
          mapM2ProductVariantToOnx(p, undefined, vendorNs, currency)
        );

        return successResult({ productVariants: variants });
      } catch (error: unknown) {
        return errorResult(`get-product-variants failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
}

/**
 * Build a map of attribute_id -> { label, valueMap: { value_index -> label } }
 * from configurable_product_options.
 */
function buildOptionLabelMap(configOptions: M2ConfigurableOption[]): Map<number, { label: string; valueMap: Map<number, string> }> {
  const map = new Map<number, { label: string; valueMap: Map<number, string> }>();

  for (const opt of configOptions) {
    const valueMap = new Map<number, string>();
    for (const val of opt.values || []) {
      // M2 configurable options store value_index; the actual label
      // comes from the attribute option. We use value_index as a fallback.
      valueMap.set(val.value_index, String(val.value_index));
    }
    map.set(opt.attribute_id, { label: opt.label, valueMap });
  }

  return map;
}

/**
 * Resolve selectedOptions for a child product based on the parent's
 * configurable options. Matches child's custom_attributes to parent option attribute_ids.
 */
function resolveSelectedOptions(
  child: M2Product,
  configOptions: M2ConfigurableOption[],
  optionLabelMap: Map<number, { label: string; valueMap: Map<number, string> }>
): Array<{ name: string; value: string }> {
  const customAttrs = child.custom_attributes || [];
  const selectedOptions: Array<{ name: string; value: string }> = [];

  for (const opt of configOptions) {
    const attrId = opt.attribute_id;
    const optInfo = optionLabelMap.get(attrId);
    if (!optInfo) continue;

    // Find the matching custom attribute on the child
    // The attribute_code is needed but not stored in configurable_product_options.
    // We try to find it by checking all custom attributes against known value_indexes.
    const attrCode = opt.attribute_code || opt.label?.toLowerCase().replace(/\s+/g, "_");
    const childAttr = customAttrs.find((a: M2CustomAttribute) => a.attribute_code === attrCode);

    if (childAttr) {
      selectedOptions.push({
        name: optInfo.label,
        value: String(childAttr.value),
      });
    }
  }

  return selectedOptions;
}

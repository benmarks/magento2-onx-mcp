/**
 * onX tool: get-customers
 *
 * Matches: GetCustomersInputSchema from reference server
 * Input: { ids?[], emails?[], TemporalPagination }
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MagentoClient } from "../client/magento-client.js";
import { mapM2CustomerToOnx } from "../mappers/customer-mapper.js";
import { temporalPaginationSchema, buildSearchCriteria, idsFilter, successResult, errorResult } from "./_helpers.js";

export function registerGetCustomers(server: McpServer, client: MagentoClient, vendorNs: string) {
  server.tool(
    "get-customers",
    "Fetch customer records by ID, email, or with temporal filtering.",
    {
      ids: z.array(z.string()).optional().describe("Customer IDs"),
      emails: z.array(z.string()).optional().describe("Customer email addresses"),
      ...temporalPaginationSchema,
    },
    async (params) => {
      try {
        const extraFilters: Array<{ field: string; value: string; conditionType: string }> = [];
        if (params.ids?.length) extraFilters.push(idsFilter("entity_id", params.ids));
        if (params.emails?.length) extraFilters.push(idsFilter("email", params.emails));

        const criteria = buildSearchCriteria({ ...params, extraFilters });
        const result = await client.get<any>("customers/search", criteria);
        const customers = (result.items || []).map((c: any) => mapM2CustomerToOnx(c, vendorNs));

        return successResult({ customers });
      } catch (error: any) {
        return errorResult(`get-customers failed: ${error.message}`);
      }
    }
  );
}

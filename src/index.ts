#!/usr/bin/env node

/**
 * magento2-onx
 *
 * An onX (Order Network eXchange) adapter for Magento 2 / Adobe Commerce.
 * Implements the Commerce Operations Foundation's onX specification
 * as an MCP (Model Context Protocol) server.
 *
 * This adapter translates between onX's standardized commerce schemas
 * and Magento 2's REST API, enabling any onX-compatible client
 * (AI agents, OMS, WMS, 3PLs) to interact with a Magento 2 store
 * using the Foundation's common operational language.
 *
 * Tools (12): 5 actions + 7 queries — matching the reference server exactly.
 *
 * @see https://commerceopsfoundation.org/onx/
 * @see https://github.com/commerce-operations-foundation/mcp-reference-server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { MagentoClient } from "./client/magento-client.js";

// Action tools (5)
import { registerCreateSalesOrder } from "./tools/create-sales-order.js";
import { registerUpdateOrder } from "./tools/update-order.js";
import { registerCancelOrder } from "./tools/cancel-order.js";
import { registerFulfillOrder } from "./tools/fulfill-order.js";
import { registerCreateReturn } from "./tools/create-return.js";

// Query tools (7)
import { registerGetOrders } from "./tools/get-orders.js";
import { registerGetCustomers } from "./tools/get-customers.js";
import { registerGetProducts } from "./tools/get-products.js";
import { registerGetProductVariants } from "./tools/get-product-variants.js";
import { registerGetInventory } from "./tools/get-inventory.js";
import { registerGetFulfillments } from "./tools/get-fulfillments.js";
import { registerGetReturns } from "./tools/get-returns.js";

async function main() {
  const config = loadConfig();
  const client = new MagentoClient(config);
  const ns = config.vendorNamespace;
  const currency = config.storeCurrency;

  const server = new McpServer({
    name: "magento2-onx",
    version: "0.1.0",
    description:
      "onX adapter for Magento 2 / Adobe Commerce — Commerce Operations Foundation",
  });

  // Register all 12 onX tools (5 actions + 7 queries)
  registerCreateSalesOrder(server, client, ns);
  registerUpdateOrder(server, client, ns);
  registerCancelOrder(server, client, ns);
  registerFulfillOrder(server, client, ns);
  registerCreateReturn(server, client, ns);

  registerGetOrders(server, client, ns);
  registerGetCustomers(server, client, ns);
  registerGetProducts(server, client, ns, currency);
  registerGetProductVariants(server, client, ns, currency);
  registerGetInventory(server, client, ns);
  registerGetFulfillments(server, client, ns);
  registerGetReturns(server, client, ns);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`magento2-onx v0.1.0 connected to ${config.baseUrl}`);
}

main().catch((error) => {
  console.error("Fatal error starting magento2-onx:", error);
  process.exit(1);
});

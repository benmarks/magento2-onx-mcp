# magento2-onx-mcp

An [onX (Order Network eXchange)](https://commerceopsfoundation.org/onx/) adapter for Magento 2 and Adobe Commerce. Implements the [Commerce Operations Foundation](https://commerceopsfoundation.org/)'s onX specification as an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server.

This adapter enables any onX-compatible system — AI agents, OMS, WMS, 3PLs, ERPs — to interact with a Magento 2 store using a standardized commerce operations language.

## What This Does

The adapter sits between onX clients and Magento 2's REST API, translating standardized onX requests into Magento API calls and mapping responses back to onX schemas:

```
onX Client (AI agent, OMS, WMS, etc.)
        │
        ▼
   ┌────────────────┐
   │  magento2-onx  │  ← This adapter
   │  (MCP Server)  │
   └────────────────┘
        │
        ▼
   Magento 2 REST API
```

## onX Coverage

Implements all 12 operations from the onX reference server (5 actions + 7 queries) across 7 commerce primitives.

### Action Tools (5)

| Tool | Description |
|------|-------------|
| `create-sales-order` | Create new orders from any channel |
| `update-order` | Modify order details and metadata |
| `cancel-order` | Cancel orders with reason tracking |
| `fulfill-order` | Mark orders as fulfilled and return shipment details |
| `create-return` | Create returns for order items with refund/exchange tracking |

### Query Tools (7)

| Tool | Description |
|------|-------------|
| `get-orders` | Retrieve orders with filtering by ID, status, name, date range |
| `get-customers` | Fetch customer records by ID or email |
| `get-products` | Get product catalog entries by ID or SKU |
| `get-product-variants` | Retrieve variant-level data (simple products linked to configurables) |
| `get-inventory` | Check stock levels across MSI sources |
| `get-fulfillments` | List fulfillment/shipment records and statuses |
| `get-returns` | Query return records (RMA on Commerce, credit memos on Open Source) |

### Commerce Primitives (7)

Order, Customer, Product, ProductVariant, InventoryItem, Fulfillment, Return

## Compatibility

- **Magento Open Source** 2.4.x — Full support. Returns use credit memos.
- **Adobe Commerce** 2.4.x — Full support. Returns use native RMA with credit memo fallback.
- **Adobe Commerce as a Cloud Service (ACCS)** — Compatible via REST API.
- **Mage-OS** — Compatible (shares Magento 2 API surface).

## Quick Start

### Prerequisites

- Node.js 18+
- A Magento 2 instance with REST API access
- An integration access token (Admin > System > Integrations)

### Installation

```bash
git clone https://github.com/benmarks/magento2-onx-mcp.git
cd magento2-onx-mcp
npm install
cp .env.example .env
# Edit .env with your Magento 2 credentials
```

### Configuration

Edit `.env` with your Magento 2 connection details:

```env
M2_BASE_URL=https://your-store.example.com
M2_ACCESS_TOKEN=your_integration_access_token
```

See `.env.example` for all configuration options including OAuth, multi-store, and MSI settings.

### Build & Run

```bash
npm run build
npm start
```

### Development

```bash
npm run dev    # Watch mode with hot reload
npm test       # Run tests
npm run lint   # Lint
```

### Use with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "magento2-onx": {
      "command": "node",
      "args": ["/path/to/magento2-onx/dist/index.js"],
      "env": {
        "M2_BASE_URL": "https://your-store.example.com",
        "M2_ACCESS_TOKEN": "your_token"
      }
    }
  }
}
```

## Architecture

```
src/
├── index.ts                        # MCP server entry point
├── config.ts                       # Environment configuration
├── client/
│   └── magento-client.ts           # Magento 2 REST API client
├── mappers/
│   ├── order-mapper.ts             # M2 order → onX Order
│   ├── product-mapper.ts           # M2 product → onX Product
│   ├── product-variant-mapper.ts   # M2 simple product → onX ProductVariant
│   └── customer-mapper.ts          # M2 customer → onX Customer
└── tools/                          # 12 onX MCP tool implementations
    ├── _helpers.ts                 # Shared TemporalPagination & response helpers
    ├── create-sales-order.ts       # Action
    ├── update-order.ts             # Action
    ├── cancel-order.ts             # Action
    ├── fulfill-order.ts            # Action
    ├── create-return.ts            # Action
    ├── get-orders.ts               # Query
    ├── get-customers.ts            # Query
    ├── get-products.ts             # Query
    ├── get-product-variants.ts     # Query
    ├── get-inventory.ts            # Query
    ├── get-fulfillments.ts         # Query
    └── get-returns.ts              # Query
```

## Custom Fields

Per the onX spec, platform-specific fields are passed through using the `customFields` array with namespaced names. This adapter uses the `m2` namespace by default (configurable via `ONX_VENDOR_NAMESPACE`):

```json
{
  "customFields": [
    { "name": "m2:state", "value": "processing" },
    { "name": "m2:status", "value": "pending_shipment" },
    { "name": "m2:store_id", "value": "1" }
  ]
}
```

## Contributing

Contributions welcome. Please open an issue first to discuss significant changes.

## License

Apache 2.0 — See [LICENSE](./LICENSE).

## Links

- [Commerce Operations Foundation](https://commerceopsfoundation.org/)
- [onX Specification](https://commerceopsfoundation.org/onx/)
- [onX Reference Server](https://github.com/commerce-operations-foundation/mcp-reference-server)
- [Model Context Protocol](https://modelcontextprotocol.io/)

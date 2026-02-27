/**
 * Type definitions for Magento 2 REST API response shapes.
 *
 * These interfaces model the JSON structures returned by M2's admin REST API
 * endpoints. Field names match M2's snake_case convention exactly.
 */

// ---------- Shared ----------

export interface M2Address {
  firstname?: string;
  lastname?: string;
  company?: string;
  street?: string[];
  city?: string;
  region_code?: string;
  region?: string;
  postcode?: string;
  country_id?: string;
  telephone?: string;
  email?: string;
}

export interface M2Region {
  region_code?: string;
  region?: string;
  region_id?: number;
}

export interface M2CustomAttribute {
  attribute_code: string;
  value: string;
}

// ---------- Product ----------

export interface M2ConfigurableOptionValue {
  value_index: number;
}

export interface M2ConfigurableOption {
  attribute_id: number;
  label: string;
  attribute_code?: string;
  values?: M2ConfigurableOptionValue[];
}

export interface M2CategoryLink {
  category_id: string;
  position?: number;
}

export interface M2MediaGalleryEntry {
  id?: number;
  file: string;
  media_type?: string;
  label?: string;
  position?: number;
  disabled?: boolean;
}

export interface M2Product {
  id: number;
  sku: string;
  name: string;
  status: number;
  price: number;
  weight?: number;
  type_id: string;
  attribute_set_id: number;
  created_at: string;
  updated_at: string;
  custom_attributes?: M2CustomAttribute[];
  media_gallery_entries?: M2MediaGalleryEntry[];
  extension_attributes?: {
    configurable_product_options?: M2ConfigurableOption[];
    category_links?: M2CategoryLink[];
  };
}

// ---------- Customer ----------

export interface M2CustomerAddress {
  default_shipping?: boolean;
  default_billing?: boolean;
  firstname?: string;
  lastname?: string;
  company?: string;
  street?: string[];
  city?: string;
  region?: M2Region;
  postcode?: string;
  country_id?: string;
  telephone?: string;
}

export interface M2Customer {
  id: number;
  email: string;
  firstname: string;
  lastname: string;
  addresses?: M2CustomerAddress[];
  created_at: string;
  updated_at: string;
  group_id: number;
  gender?: number;
}

// ---------- Order ----------

export interface M2OrderItem {
  item_id: number;
  sku: string;
  name?: string;
  qty_ordered: number;
  price: number;
  discount_amount?: number;
  row_total: number;
  product_type?: string;
}

export interface M2Order {
  entity_id: number;
  ext_order_id?: string;
  increment_id: string;
  state: string;
  status: string;
  store_id: number;
  items: M2OrderItem[];
  customer_email: string;
  customer_firstname?: string;
  customer_lastname?: string;
  billing_address?: M2Address;
  order_currency_code: string;
  subtotal: number;
  grand_total: number;
  tax_amount: number;
  discount_amount?: number;
  payment?: { method: string };
  shipping_description?: string;
  shipping_method?: string;
  shipping_amount?: number;
  created_at: string;
  updated_at: string;
  extension_attributes?: {
    shipping_assignments?: Array<{
      shipping?: {
        address?: M2Address;
      };
    }>;
  };
}

// ---------- Shipment ----------

export interface M2ShipmentItem {
  entity_id?: number;
  sku: string;
  qty: number;
  name?: string;
}

export interface M2ShipmentTrack {
  track_number: string;
  carrier_code?: string;
  title?: string;
  carrier_title?: string;
}

export interface M2Shipment {
  entity_id: number;
  order_id: number;
  increment_id?: string;
  items?: M2ShipmentItem[];
  tracks?: M2ShipmentTrack[];
  shipping_address?: M2Address;
  created_at: string;
  updated_at: string;
  extension_attributes?: {
    source_code?: string;
  };
}

// ---------- RMA ----------

export interface M2RmaItem {
  entity_id?: number;
  order_item_id: number;
  product_sku?: string;
  qty_requested: number;
  reason?: string;
  condition?: string;
  resolution?: string;
  product_price?: number;
  product_name?: string;
}

export interface M2RmaComment {
  comment: string;
  is_visible_on_front?: boolean;
  is_customer_notified?: boolean;
}

export interface M2RmaTrack {
  carrier_title?: string;
  track_number: string;
}

export interface M2Rma {
  entity_id: number;
  increment_id?: string;
  order_id: number;
  status?: string;
  items?: M2RmaItem[];
  comments?: M2RmaComment[];
  tracks?: M2RmaTrack[];
  date_requested?: string;
}

// ---------- Credit Memo ----------

export interface M2CreditMemoItem {
  entity_id?: number;
  order_item_id: number;
  sku?: string;
  qty: number;
  price?: number;
  row_total?: number;
  name?: string;
}

export interface M2CreditMemoComment {
  comment: string;
}

export interface M2CreditMemo {
  entity_id: number;
  increment_id?: string;
  order_id: number;
  invoice_id?: number;
  items?: M2CreditMemoItem[];
  comments?: M2CreditMemoComment[];
  subtotal?: number;
  grand_total?: number;
  shipping_amount?: number;
  adjustment_negative?: number;
  created_at: string;
  updated_at: string;
}

// ---------- Inventory ----------

export interface M2SourceItem {
  sku: string;
  source_code: string;
  quantity: number;
}

export interface M2StockItem {
  qty: number;
}

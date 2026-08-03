export type ProductStatus = "active" | "inactive";
export type InvoiceStatus = "created" | "completed" | "cancelled";
export type InvoiceAuditLabel = "retail" | "internal_shipper" | "external_shipper";
export type ExternalAdvanceMethod = "transfer" | "cash" | "mixed";
export type ExtraChargeType = "shipping" | "packing" | "other";

export interface Permission {
  id: number;
  code: string;
  name: string;
  module: string;
}

export interface RoleSummary { id: number; name: string; }
export interface Role extends RoleSummary {
  description?: string | null;
  is_system: boolean;
  permissions: Permission[];
  created_at: string;
  updated_at: string;
}
export interface UserSummary { id: number; username: string; display_name: string; }
export interface User extends UserSummary {
  is_active: boolean;
  shipper_id?: number | null;
  roles: RoleSummary[];
  permissions: string[];
  created_at: string;
  updated_at: string;
}
export interface RolePayload { name: string; description?: string; permission_codes: string[]; }
export interface UserPayload { username: string; display_name: string; password?: string; is_active: boolean; role_ids: number[]; }
export interface Shipper {
  id: number;
  user_id: number;
  user: UserSummary;
  phone?: string | null;
  note?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
export interface ShipperPayload {
  username?: string;
  display_name?: string;
  password?: string;
  phone?: string;
  note?: string;
  is_active?: boolean;
}
export interface LoginResponse { access_token: string; token_type: string; expires_at: string; user: User; }
export interface SoldProductReportRow {
  product_code: string;
  product_name: string;
  unit: string;
  quantity_sold: string;
  sales_revenue: string;
}

export interface Customer {
  id: number;
  code: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  note?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface CustomerPayload {
  code: string;
  name: string;
  phone?: string;
  address?: string;
  note?: string;
}

export interface Product {
  id: number;
  code: string;
  name: string;
  category_id?: number | null;
  category?: ProductCategory | null;
  unit: string;
  sale_price: string;
  cost_price: string;
  stock_quantity: string;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface ProductPayload {
  code: string;
  name: string;
  category_id?: number | null;
  unit: string;
  sale_price: string;
  cost_price: string;
  stock_quantity: string;
  status: ProductStatus;
}

export interface ProductCategory {
  id: number;
  name: string;
  note?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface ProductCategoryPayload {
  name: string;
  note?: string;
}

export interface InvoiceItemPayload {
  product_id: number;
  quantity: string;
  unit_price?: string;
}

export interface InvoiceExtraChargePayload {
  charge_type: ExtraChargeType;
  name?: string;
  amount: string;
  note?: string;
}

export interface ExtraChargeSetting {
  id: number;
  charge_type: ExtraChargeType;
  name: string;
  default_amount: string;
  is_active: boolean;
  note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExtraChargeSettingPayload {
  name?: string;
  default_amount?: string;
  is_active?: boolean;
  note?: string;
}

export interface InvoicePayload {
  customer_id?: number | null;
  status: InvoiceStatus;
  sold_at?: string | null;
  is_paid_by_transfer?: boolean;
  note?: string;
  items: InvoiceItemPayload[];
  extra_charges: InvoiceExtraChargePayload[];
  reason?: string;
}

export interface InvoiceItem {
  id: number;
  product_id?: number | null;
  product_code: string;
  product_name: string;
  unit: string;
  quantity: string;
  unit_price: string;
  line_total: string;
}

export interface InvoiceExtraCharge {
  id: number;
  charge_type: ExtraChargeType;
  name: string;
  amount: string;
  note?: string | null;
}

export interface Invoice {
  id: number;
  code: string;
  customer_id?: number | null;
  customer?: Customer | null;
  status: InvoiceStatus;
  sold_at: string;
  audit_label?: InvoiceAuditLabel | null;
  assigned_shipper_id?: number | null;
  assigned_shipper?: Shipper | null;
  audited_at?: string | null;
  audited_by_user_id?: number | null;
  delivered_at?: string | null;
  delivered_by_user_id?: number | null;
  is_paid_by_transfer: boolean;
  external_shipper_name?: string | null;
  external_shipper_phone?: string | null;
  external_advance_method?: ExternalAdvanceMethod | null;
  external_transfer_amount: string;
  external_cash_amount: string;
  external_shipping_fee: string;
  external_advance_amount: string;
  note?: string | null;
  subtotal: string;
  total_extra_charges: string;
  total_amount: string;
  items: InvoiceItem[];
  extra_charges: InvoiceExtraCharge[];
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface InvoiceListItem extends Invoice {
  is_edited: boolean;
}

export interface InvoicePage {
  items: InvoiceListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ExternalHandoffPayload {
  advance_method: ExternalAdvanceMethod;
  shipping_fee: string;
  transfer_amount: string;
  cash_amount: string;
}

export interface ShipHandoverPayload {
  invoice_ids: number[];
  audit_label: "retail" | "external_shipper";
  external_handoff?: ExternalHandoffPayload;
}

export type ExternalHandoverBatchStatus = "active" | "cancelled";

export interface ExternalHandoverBatchItem {
  id: number;
  invoice_id: number;
  is_active: boolean;
  added_at: string;
  removed_at?: string | null;
  invoice: Invoice;
}

export interface ExternalHandoverBatch {
  id: number;
  code: string;
  status: ExternalHandoverBatchStatus;
  handed_over_at: string;
  advance_method: ExternalAdvanceMethod;
  transfer_amount: string;
  cash_amount: string;
  shipping_fee: string;
  advance_amount: string;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  cancelled_at?: string | null;
  cancelled_by_name?: string | null;
  items: ExternalHandoverBatchItem[];
  created_at: string;
  updated_at: string;
}

export interface ExternalHandoverBatchUpdatePayload {
  invoice_ids: number[];
  external_handoff: ExternalHandoffPayload;
}

export type DashboardTimePreset = "today" | "7days" | "month" | "year";

export interface DashboardProductSummary {
  key: string;
  name: string;
  quantity: string;
  revenue: string;
}

export interface DashboardRevenuePoint {
  key: string;
  label: string;
  full_label: string;
  value: string;
  show_label: boolean;
}

export interface DashboardRecentInvoice {
  id: number;
  code: string;
  customer?: Customer | null;
  status: InvoiceStatus;
  sold_at: string;
  audit_label?: InvoiceAuditLabel | null;
  assigned_shipper_id?: number | null;
  assigned_shipper?: Shipper | null;
  audited_at?: string | null;
  audited_by_user_id?: number | null;
  total_amount: string;
}

export interface DashboardSummary {
  period: DashboardTimePreset;
  product_revenue: string;
  extra_charge_revenue: string;
  created_invoice_count: number;
  created_customer_count: number;
  revenue_chart: DashboardRevenuePoint[];
  top_products_by_quantity: DashboardProductSummary[];
  top_products_by_revenue: DashboardProductSummary[];
  recent_invoices: DashboardRecentInvoice[];
}

export interface InvoiceHistory {
  id: number;
  invoice_id: number;
  action: "created" | "updated" | "deleted";
  changed_by_user_id?: number | null;
  changed_by_name?: string | null;
  reason?: string | null;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
  created_at: string;
}

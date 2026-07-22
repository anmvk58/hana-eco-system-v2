export type ProductStatus = "active" | "inactive";
export type InvoiceStatus = "created" | "cancelled";
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
  roles: RoleSummary[];
  permissions: string[];
  created_at: string;
  updated_at: string;
}
export interface RolePayload { name: string; description?: string; permission_codes: string[]; }
export interface UserPayload { username: string; display_name: string; password?: string; is_active: boolean; role_ids: number[]; }
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

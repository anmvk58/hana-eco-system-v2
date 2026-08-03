import type {
  Customer,
  CustomerPayload,
  DashboardSummary,
  DashboardTimePreset,
  ExtraChargeSetting,
  ExtraChargeSettingPayload,
  ExtraChargeType,
  Invoice,
  InvoiceAuditLabel,
  InvoiceHistory,
  InvoicePage,
  InvoicePayload,
  InvoiceStatus,
  Product,
  ProductCategory,
  ProductCategoryPayload,
  ProductPayload,
  Permission,
  Role,
  RolePayload,
  User,
  UserPayload,
  Shipper,
  ShipperPayload,
  LoginResponse,
  SoldProductReportRow,
  ShipHandoverPayload,
  ExternalHandoverBatch,
  ExternalHandoverBatchUpdatePayload,
} from "../types";

const runtimeApiUrl = new URL("/api", window.location.origin);
runtimeApiUrl.port = "8000";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || runtimeApiUrl.toString();

type QueryValue = string | number | boolean | null | undefined;

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

type InvoiceListFilters = {
  status?: InvoiceStatus;
  customer_id?: number;
  code?: string;
  customer_phone?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  page_size?: number;
  audit_label?: InvoiceAuditLabel;
  unaudited?: boolean;
};

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(`${API_BASE_URL}${path}`);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function request<T>(path: string, options: RequestInit = {}, query?: Record<string, QueryValue>): Promise<T> {
  const token = localStorage.getItem("hana-access-token");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...options,
      signal: options.signal ?? controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Máy chủ không phản hồi. Vui lòng thử lại.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      message = typeof data.detail === "string" ? data.detail : message;
    } catch {
      // Keep the generic message when the response is not JSON.
    }
    if (response.status === 401 && token && path !== "/auth/login") {
      window.dispatchEvent(new Event("hana-auth-expired"));
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function listAllInvoices(filters?: Omit<InvoiceListFilters, "page" | "page_size">) {
  const firstPage = await request<InvoicePage>("/invoices", {}, { ...filters, page: 1, page_size: 100 });
  const invoices = [...firstPage.items];
  for (let page = 2; page <= firstPage.total_pages; page += 1) {
    const nextPage = await request<InvoicePage>("/invoices", {}, { ...filters, page, page_size: 100 });
    invoices.push(...nextPage.items);
  }
  return invoices;
}

export const api = {
  auth: {
    login: (username: string, password: string) => request<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
    me: () => request<User>("/auth/me"),
    logout: () => request<void>("/auth/logout", { method: "POST" }),
  },
  access: {
    permissions: () => request<Permission[]>("/permissions"),
    roles: () => request<Role[]>("/roles"),
    createRole: (payload: RolePayload) => request<Role>("/roles", { method: "POST", body: JSON.stringify(payload) }),
    updateRole: (id: number, payload: RolePayload) => request<Role>(`/roles/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    removeRole: (id: number) => request<void>(`/roles/${id}`, { method: "DELETE" }),
    users: () => request<User[]>("/users"),
    createUser: (payload: UserPayload) => request<User>("/users", { method: "POST", body: JSON.stringify(payload) }),
    updateUser: (id: number, payload: Partial<UserPayload>) => request<User>(`/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    removeUser: (id: number) => request<void>(`/users/${id}`, { method: "DELETE" }),
  },
  shippers: {
    list: () => request<Shipper[]>("/shippers"),
    create: (payload: ShipperPayload) => request<Shipper>("/shippers", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: number, payload: ShipperPayload) => request<Shipper>(`/shippers/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    remove: (id: number) => request<void>(`/shippers/${id}`, { method: "DELETE" }),
  },
  shipping: {
    availableInvoices: () => request<Invoice[]>("/shipping/available-invoices"),
    claimedInvoices: (fromDate?: string, toDate?: string) => request<Invoice[]>("/shipping/claimed-invoices", {}, { from_date: fromDate, to_date: toDate }),
    claim: (invoiceIds: number[]) => request<Invoice[]>("/shipping/claim", { method: "POST", body: JSON.stringify({ invoice_ids: invoiceIds }) }),
    markDelivered: (invoiceId: number) => request<Invoice>(`/shipping/invoices/${invoiceId}/delivered`, { method: "POST" }),
  },
  shipManagement: {
    unauditedInvoices: (fromDate?: string, toDate?: string) =>
      request<Invoice[]>("/ship-management/unaudited-invoices", {}, { from_date: fromDate, to_date: toDate }),
    unauditedInvoiceByCode: (code: string) =>
      request<Invoice>("/ship-management/unaudited-invoice-by-code", {}, { code }),
    handover: (payload: ShipHandoverPayload) => request<Invoice[]>("/ship-management/handover", { method: "POST", body: JSON.stringify(payload) }),
    externalBatches: (fromDate?: string, toDate?: string) =>
      request<ExternalHandoverBatch[]>("/ship-management/external-handover-batches", {}, { from_date: fromDate, to_date: toDate }),
    externalBatch: (id: number) => request<ExternalHandoverBatch>(`/ship-management/external-handover-batches/${id}`),
    updateExternalBatch: (id: number, payload: ExternalHandoverBatchUpdatePayload) =>
      request<ExternalHandoverBatch>(`/ship-management/external-handover-batches/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    cancelExternalBatch: (id: number) =>
      request<ExternalHandoverBatch>(`/ship-management/external-handover-batches/${id}/cancel`, { method: "POST" }),
  },
  customers: {
    list: (search?: string, limit = 50) => request<Customer[]>("/customers", {}, { search, limit }),
    create: (payload: CustomerPayload) => request<Customer>("/customers", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: number, payload: Partial<CustomerPayload>) =>
      request<Customer>(`/customers/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    remove: (id: number) => request<void>(`/customers/${id}`, { method: "DELETE" }),
  },
  products: {
    list: (search?: string) => request<Product[]>("/products", {}, { search }),
    create: (payload: ProductPayload) => request<Product>("/products", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: number, payload: Partial<ProductPayload>) =>
      request<Product>(`/products/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    remove: (id: number) => request<void>(`/products/${id}`, { method: "DELETE" }),
  },
  productCategories: {
    list: () => request<ProductCategory[]>("/product-categories"),
    create: (payload: ProductCategoryPayload) =>
      request<ProductCategory>("/product-categories", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: number, payload: Partial<ProductCategoryPayload>) =>
      request<ProductCategory>(`/product-categories/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    remove: (id: number) => request<void>(`/product-categories/${id}`, { method: "DELETE" }),
  },
  extraChargeSettings: {
    list: () => request<ExtraChargeSetting[]>("/extra-charge-settings"),
    update: (chargeType: ExtraChargeType, payload: ExtraChargeSettingPayload) =>
      request<ExtraChargeSetting>(`/extra-charge-settings/${chargeType}`, { method: "PUT", body: JSON.stringify(payload) }),
  },
  reports: {
    soldProducts: (filters?: { from_date?: string; to_date?: string }) =>
      request<SoldProductReportRow[]>("/reports/sold-products", {}, filters),
  },
  dashboard: {
    summary: (period: DashboardTimePreset) => request<DashboardSummary>("/dashboard/summary", {}, { period }),
  },
  invoices: {
    list: (filters?: InvoiceListFilters) => request<InvoicePage>("/invoices", {}, filters),
    listAll: listAllInvoices,
    create: (payload: InvoicePayload) => request<Invoice>("/invoices", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: number, payload: InvoicePayload) =>
      request<Invoice>(`/invoices/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    get: (id: number) => request<Invoice>(`/invoices/${id}`),
    remove: (id: number, reason?: string) => request<void>(`/invoices/${id}`, { method: "DELETE" }, { reason }),
    cancel: (id: number, reason: string) => request<Invoice>(`/invoices/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
    history: (id: number) => request<InvoiceHistory[]>(`/invoices/${id}/history`),
    print: (id: number) => request<Invoice>(`/invoices/${id}/print`),
    audit: (id: number, auditLabel: Exclude<InvoiceAuditLabel, "internal_shipper">) =>
      request<Invoice>(`/invoices/${id}/audit`, { method: "POST", body: JSON.stringify({ audit_label: auditLabel }) }),
  },
};

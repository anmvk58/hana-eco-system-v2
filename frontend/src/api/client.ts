import type {
  Customer,
  CustomerPayload,
  ExtraChargeSetting,
  ExtraChargeSettingPayload,
  ExtraChargeType,
  Invoice,
  InvoiceHistory,
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
  LoginResponse,
  SoldProductReportRow,
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

type QueryValue = string | number | boolean | null | undefined;

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
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
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
  customers: {
    list: (search?: string) => request<Customer[]>("/customers", {}, { search }),
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
  invoices: {
    list: (filters?: { status?: InvoiceStatus; customer_id?: number; from_date?: string; to_date?: string }) =>
      request<Invoice[]>("/invoices", {}, filters),
    create: (payload: InvoicePayload) => request<Invoice>("/invoices", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: number, payload: InvoicePayload) =>
      request<Invoice>(`/invoices/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    get: (id: number) => request<Invoice>(`/invoices/${id}`),
    remove: (id: number, reason?: string) => request<void>(`/invoices/${id}`, { method: "DELETE" }, { reason }),
    cancel: (id: number, reason: string) => request<Invoice>(`/invoices/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
    history: (id: number) => request<InvoiceHistory[]>(`/invoices/${id}/history`),
    print: (id: number) => request<Invoice>(`/invoices/${id}/print`),
  },
};

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
  const response = await fetch(buildUrl(path, query), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-User-Name": "Frontend User",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      message = typeof data.detail === "string" ? data.detail : message;
    } catch {
      // Keep the generic message when the response is not JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
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
  invoices: {
    list: (filters?: { status?: InvoiceStatus; customer_id?: number; from_date?: string; to_date?: string }) =>
      request<Invoice[]>("/invoices", {}, filters),
    create: (payload: InvoicePayload) => request<Invoice>("/invoices", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: number, payload: InvoicePayload) =>
      request<Invoice>(`/invoices/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    get: (id: number) => request<Invoice>(`/invoices/${id}`),
    remove: (id: number, reason?: string) => request<void>(`/invoices/${id}`, { method: "DELETE" }, { reason }),
    history: (id: number) => request<InvoiceHistory[]>(`/invoices/${id}/history`),
    print: (id: number) => request<Invoice>(`/invoices/${id}/print`),
  },
};

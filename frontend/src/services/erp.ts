/**
 * Typed client for every Module 1 endpoint. Works unchanged against the real
 * FastAPI backend or the in-browser demo adapter (see lib/demo).
 */
import api from "@/lib/api";
import type {
  ConsumptionReport, FabricImport, FabricLot, FabricLotSummary, FabricRoll, InsightsReport,
  InventorySummary, Issuance, KnittingSession, LowStockItem, Me, ProductionReport, RollTrace,
  Supplier, SupplierDetail, TeamMember, Token, WeavingSession, YarnTransaction, YarnType,
} from "@/types";

const B = "/api/v1";
type Q = Record<string, string | number | boolean | undefined | null>;
type Body = Record<string, unknown>;

const clean = (q?: Q) =>
  q ? Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== "")) : undefined;
const get = <T,>(url: string, q?: Q) => api.get<T>(`${B}${url}`, { params: clean(q) }).then((r) => r.data);
const post = <T,>(url: string, body?: Body) => api.post<T>(`${B}${url}`, body ?? {}).then((r) => r.data);
const patch = <T,>(url: string, body: Body) => api.patch<T>(`${B}${url}`, body).then((r) => r.data);
const del = (url: string) => api.delete(`${B}${url}`).then(() => undefined);

export const authApi = {
  login: (email: string, password: string) => post<Token>("/auth/login", { email, password }),
  register: (body: Body) => post<Token>("/auth/register-tenant", body),
  demo: () => post<Token>("/auth/demo"),
  me: () => get<Me>("/auth/me"),
};

export const teamApi = {
  list: () => get<TeamMember[]>("/team/members"),
  add: (body: Body) => post<TeamMember>("/team/members", body),
};

export const supplierApi = {
  list: (q?: Q) => get<Supplier[]>("/fabric-suppliers", q),
  get: (id: string) => get<SupplierDetail>(`/fabric-suppliers/${id}`),
  create: (body: Body) => post<Supplier>("/fabric-suppliers", body),
  update: (id: string, body: Body) => patch<Supplier>(`/fabric-suppliers/${id}`, body),
  remove: (id: string) => del(`/fabric-suppliers/${id}`),
};

export const lotApi = {
  list: (q?: Q) => get<FabricLot[]>("/fabric-lots", q),
  get: (id: string) => get<FabricLot>(`/fabric-lots/${id}`),
  create: (body: Body) => post<FabricLot>("/fabric-lots", body),
  update: (id: string, body: Body) => patch<FabricLot>(`/fabric-lots/${id}`, body),
  remove: (id: string) => del(`/fabric-lots/${id}`),
  summary: (id: string) => get<FabricLotSummary>(`/fabric-lots/${id}/summary`),
  rolls: (id: string) => get<FabricRoll[]>(`/fabric-lots/${id}/rolls`),
  addRoll: (id: string, body: Body) => post<FabricRoll>(`/fabric-lots/${id}/rolls`, body),
  addRollsBulk: (id: string, body: Body) => post<FabricRoll[]>(`/fabric-lots/${id}/rolls/bulk`, body),
};

export const rollApi = {
  list: (q?: Q) => get<FabricRoll[]>("/fabric-rolls", q),
  get: (id: string) => get<FabricRoll>(`/fabric-rolls/${id}`),
  update: (id: string, body: Body) => patch<FabricRoll>(`/fabric-rolls/${id}`, body),
  remove: (id: string) => del(`/fabric-rolls/${id}`),
  issue: (id: string, body: Body) => post<Issuance>(`/fabric-rolls/${id}/issue`, body),
  issuances: (id: string) => get<Issuance[]>(`/fabric-rolls/${id}/issuances`),
  trace: (id: string) => get<RollTrace>(`/fabric-rolls/${id}/trace`),
  allIssuances: (q?: Q) => get<Issuance[]>("/fabric-issuances", q),
};

export const yarnApi = {
  list: (q?: Q) => get<YarnType[]>("/yarn-types", q),
  get: (id: string) => get<YarnType>(`/yarn-types/${id}`),
  create: (body: Body) => post<YarnType>("/yarn-types", body),
  update: (id: string, body: Body) => patch<YarnType>(`/yarn-types/${id}`, body),
  transactions: (id: string, q?: Q) => get<YarnTransaction[]>(`/yarn-types/${id}/transactions`, q),
  post: (id: string, body: Body) => post<YarnTransaction>(`/yarn-types/${id}/transactions`, body),
};

export const productionApi = {
  weaving: (q?: Q) => get<WeavingSession[]>("/weaving-sessions", q),
  logWeaving: (body: Body) => post<WeavingSession>("/weaving-sessions", body),
  knitting: (q?: Q) => get<KnittingSession[]>("/knitting-sessions", q),
  logKnitting: (body: Body) => post<KnittingSession>("/knitting-sessions", body),
};

export const importApi = {
  list: (q?: Q) => get<FabricImport[]>("/fabric-imports", q),
  get: (id: string) => get<FabricImport>(`/fabric-imports/${id}`),
  create: (body: Body) => post<FabricImport>("/fabric-imports", body),
  update: (id: string, body: Body) => patch<FabricImport>(`/fabric-imports/${id}`, body),
  receive: (id: string, body: Body) => post<FabricLot>(`/fabric-imports/${id}/receive`, body),
};

export const reportApi = {
  inventory: () => get<InventorySummary>("/fabric-reports/inventory-summary"),
  consumption: (q?: Q) => get<ConsumptionReport>("/fabric-reports/consumption", q),
  production: (q?: Q) => get<ProductionReport>("/fabric-reports/production", q),
  lowStock: () => get<LowStockItem[]>("/fabric-reports/low-stock"),
  insights: () => get<InsightsReport>("/fabric-reports/insights"),
  stockCsv: () => api.get<string>(`${B}/fabric-reports/stock.csv`, { responseType: "text" }).then((r) => r.data),
};

export function apiError(err: unknown, fallback = "Something went wrong"): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { loc?: unknown[]; msg?: string };
    const field = first.loc?.slice(-1)[0];
    return field ? `${String(field).replace(/_/g, " ")}: ${first.msg}` : first.msg ?? fallback;
  }
  return fallback;
}

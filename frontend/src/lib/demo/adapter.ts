/**
 * Axios adapter that serves the Textile ERP API from the browser.
 * Same routes, same status codes, same error shape ({detail}) as FastAPI, so
 * every page and service works unchanged in both modes.
 */
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import type { Role } from "@/types";
import {
  ApiError, DemoState, PERMISSIONS, STORAGE_KEY, addRoll, addRollsBulk, can, createImport, createLot,
  createSupplier, createYarn, issueRoll, logKnitting, logWeaving, n, postTxn, receiveImport, requirePerm,
  supplierDetail, today, updateImport,
} from "./engine";
import * as rep from "./reports";
import { seed } from "./seed";

let state: DemoState | null = null;

function load(): DemoState {
  if (state) return state;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state = JSON.parse(raw) as DemoState;
        return state;
      }
    } catch {
      /* corrupted or blocked storage → fall through to a fresh seed */
    }
  }
  state = seed();
  save();
  return state;
}

function save() {
  if (typeof window === "undefined" || !state) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: the demo keeps working in memory */
  }
}

export function resetDemo(role: Role = "owner") {
  state = seed(role);
  save();
}

export function setDemoRole(role: Role) {
  const s = load();
  s.role = role;
  save();
}

const TOKEN = "browser-demo-session";

function authPayload(s: DemoState) {
  const member = s.members.find((m) => m.role === s.role) ?? s.members[0];
  return {
    access_token: TOKEN,
    token_type: "bearer",
    user: { id: member.user_id, email: member.email, full_name: member.full_name, role: s.role },
    tenant: s.tenant,
  };
}

type Handler = (s: DemoState, p: string[], body: Record<string, unknown>, q: Record<string, string>) => unknown;
type Route = [method: string, pattern: RegExp, handler: Handler, status?: number];

const ID = "([0-9a-f-]{36})";
const byNewest = <T extends { created_at: string }>(a: T, b: T) => b.created_at.localeCompare(a.created_at);
const range = (q: Record<string, string>) => {
  const to = q.to || today();
  const from = q.from || new Date(new Date(to).getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  if (from > to) throw new ApiError(422, "'from' must be on or before 'to'");
  return [from, to] as const;
};
const match = (v: string | null | undefined, needle?: string) => !needle || (v ?? "").toLowerCase().includes(needle.toLowerCase());
const one = <T extends { id: string }>(list: T[], id: string, label: string) => {
  const x = list.find((i) => i.id === id);
  if (!x) throw new ApiError(404, `${label} not found`);
  return x;
};
const patchFields = (obj: Record<string, unknown>, body: Record<string, unknown>, allowed: string[]) => {
  for (const k of allowed) if (k in body && body[k] !== undefined) obj[k] = body[k];
  obj.updated_at = new Date().toISOString();
  return obj;
};

const routes: Route[] = [
  // auth
  ["post", /^\/auth\/demo$/, (s) => authPayload(s), 201],
  ["post", /^\/auth\/login$/, () => {
    throw new ApiError(401, "This is the browser demo — use “Enter demo” instead of signing in.");
  }],
  ["post", /^\/auth\/register-tenant$/, () => {
    throw new ApiError(400, "Registration needs the real backend. The browser demo runs a pre-seeded mill.");
  }],
  ["get", /^\/auth\/me$/, (s) => ({
    ...authPayload(s).user,
    permissions: Object.keys(PERMISSIONS).filter((p) => can(s, p)).sort(),
    tenant: s.tenant,
  })],

  // team
  ["get", /^\/team\/members$/, (s) => (requirePerm(s, "team_view"), s.members)],
  ["post", /^\/team\/members$/, (s, _p, b) => {
    requirePerm(s, "user_manage");
    if (s.members.some((m) => m.email === b.email)) throw new ApiError(409, "A user with this email already exists");
    if (!["manager", "operator", "accountant"].includes(String(b.role))) throw new ApiError(422, "role: invalid");
    const m = { id: crypto.randomUUID(), user_id: crypto.randomUUID(), email: String(b.email), full_name: String(b.full_name),
      role: b.role as Role, is_active: true, created_at: new Date().toISOString() };
    s.members.push(m);
    return m;
  }, 201],

  // suppliers
  ["get", /^\/fabric-suppliers$/, (s, _p, _b, q) =>
    (requirePerm(s, "fabric_read"), s.suppliers.filter((x) => match(x.name, q.search) || match(x.city, q.search))
      .sort((a, b) => a.name.localeCompare(b.name)))],
  ["post", /^\/fabric-suppliers$/, (s, _p, b) => (requirePerm(s, "fabric_supplier_write"), createSupplier(s, b)), 201],
  ["get", new RegExp(`^/fabric-suppliers/${ID}$`), (s, [id]) => (requirePerm(s, "fabric_read"), supplierDetail(s, id))],
  ["patch", new RegExp(`^/fabric-suppliers/${ID}$`), (s, [id], b) => (requirePerm(s, "fabric_supplier_write"),
    patchFields(one(s.suppliers, id, "Supplier") as never, b, ["name", "contact_person", "phone", "email", "address", "city", "country", "payment_terms", "notes"]))],

  // lots
  ["get", /^\/fabric-lots$/, (s, _p, _b, q) => {
    requirePerm(s, "fabric_read");
    return s.lots
      .filter((l) => (!q.status || l.status === q.status) && (!q.fabric_category || l.fabric_category === q.fabric_category)
        && (!q.supplier_id || l.supplier_id === q.supplier_id)
        && (match(l.lot_number, q.search) || match(l.fabric_type, q.search) || match(l.color, q.search)))
      .sort((a, b) => b.received_date.localeCompare(a.received_date) || byNewest(a, b));
  }],
  ["post", /^\/fabric-lots$/, (s, _p, b) => (requirePerm(s, "fabric_write"), createLot(s, b)), 201],
  ["get", new RegExp(`^/fabric-lots/${ID}$`), (s, [id]) => (requirePerm(s, "fabric_read"), one(s.lots, id, "Fabric lot"))],
  ["patch", new RegExp(`^/fabric-lots/${ID}$`), (s, [id], b) => {
    requirePerm(s, "fabric_write");
    const lot = one(s.lots, id, "Fabric lot");
    if (b.lot_number && b.lot_number !== lot.lot_number && s.lots.some((l) => l.lot_number === b.lot_number))
      throw new ApiError(409, `Lot number '${b.lot_number}' already exists`);
    return patchFields(lot as never, b, ["lot_number", "fabric_type", "fabric_category", "color", "gsm", "width_cm",
      "total_meters", "received_date", "supplier", "supplier_id", "cost_per_meter", "status", "notes"]);
  }],
  ["delete", new RegExp(`^/fabric-lots/${ID}$`), (s, [id]) => {
    requirePerm(s, "fabric_delete");
    one(s.lots, id, "Fabric lot");
    if (s.rolls.some((r) => r.lot_id === id && n(r.issued_meters) > 0))
      throw new ApiError(409, "Lot has issued rolls; it is part of the production record and cannot be deleted");
    s.lots = s.lots.filter((l) => l.id !== id);
    s.rolls = s.rolls.filter((r) => r.lot_id !== id);
    return null;
  }, 204],
  ["get", new RegExp(`^/fabric-lots/${ID}/summary$`), (s, [id]) => {
    requirePerm(s, "fabric_read");
    const lot = one(s.lots, id, "Fabric lot");
    const rolls = s.rolls.filter((r) => r.lot_id === id);
    const sum = (pred: (r: (typeof rolls)[number]) => boolean, v: (r: (typeof rolls)[number]) => number) =>
      rolls.filter(pred).reduce((a, r) => a + v(r), 0);
    const rem = (r: (typeof rolls)[number]) => n(r.length_meters) - n(r.issued_meters);
    const onHand = sum(() => true, rem);
    return {
      lot_id: id, roll_count: rolls.length, total_meters: sum(() => true, (r) => n(r.length_meters)).toFixed(2),
      meters_available: sum((r) => r.status === "available", rem).toFixed(2),
      meters_reserved: sum((r) => r.status === "reserved", rem).toFixed(2),
      meters_consumed: sum((r) => r.status === "consumed", (r) => n(r.length_meters)).toFixed(2),
      meters_issued: sum(() => true, (r) => n(r.issued_meters)).toFixed(2),
      stock_value_pkr: lot.cost_per_meter !== null ? (onHand * n(lot.cost_per_meter)).toFixed(2) : null,
    };
  }],
  ["get", new RegExp(`^/fabric-lots/${ID}/rolls$`), (s, [id]) => (requirePerm(s, "fabric_read"), one(s.lots, id, "Fabric lot"),
    s.rolls.filter((r) => r.lot_id === id).sort((a, b) => a.roll_number.localeCompare(b.roll_number)))],
  ["post", new RegExp(`^/fabric-lots/${ID}/rolls$`), (s, [id], b) => (requirePerm(s, "fabric_write"), addRoll(s, id, b)), 201],
  ["post", new RegExp(`^/fabric-lots/${ID}/rolls/bulk$`), (s, [id], b) => (requirePerm(s, "fabric_write"), addRollsBulk(s, id, b)), 201],

  // rolls
  ["get", /^\/fabric-rolls$/, (s, _p, _b, q) => (requirePerm(s, "fabric_read"), s.rolls
    .filter((r) => (!q.lot_id || r.lot_id === q.lot_id) && (!q.status || r.status === q.status) && match(r.roll_number, q.search))
    .sort((a, b) => a.roll_number.localeCompare(b.roll_number)))],
  ["get", new RegExp(`^/fabric-rolls/${ID}$`), (s, [id]) => (requirePerm(s, "fabric_read"), one(s.rolls, id, "Fabric roll"))],
  ["patch", new RegExp(`^/fabric-rolls/${ID}$`), (s, [id], b) => {
    requirePerm(s, "fabric_write");
    const r = one(s.rolls, id, "Fabric roll");
    if (["issued", "consumed"].includes(r.status) && b.status) throw new ApiError(409, `Roll is ${r.status}; its status is driven by issuances`);
    if (b.status && !["available", "reserved"].includes(String(b.status))) throw new ApiError(422, "status: must be available or reserved");
    patchFields(r as never, b, ["location", "grade", "status", "weight_kg"]);
    return r;
  }],
  ["delete", new RegExp(`^/fabric-rolls/${ID}$`), (s, [id]) => {
    requirePerm(s, "fabric_delete");
    const r = one(s.rolls, id, "Fabric roll");
    if (n(r.issued_meters) > 0) throw new ApiError(409, "Roll has issuances and cannot be deleted");
    s.rolls = s.rolls.filter((x) => x.id !== id);
    return null;
  }, 204],
  ["post", new RegExp(`^/fabric-rolls/${ID}/issue$`), (s, [id], b) => (requirePerm(s, "fabric_write"), issueRoll(s, id, b)), 201],
  ["get", new RegExp(`^/fabric-rolls/${ID}/issuances$`), (s, [id]) => (requirePerm(s, "fabric_read"), one(s.rolls, id, "Fabric roll"),
    s.issuances.filter((i) => i.roll_id === id))],
  ["get", new RegExp(`^/fabric-rolls/${ID}/trace$`), (s, [id]) => (requirePerm(s, "fabric_read"), one(s.rolls, id, "Fabric roll"), rep.trace(s, id))],
  ["get", /^\/fabric-issuances$/, (s, _p, _b, q) => (requirePerm(s, "fabric_read"), s.issuances
    .filter((i) => !q.department || i.issued_to_department === q.department)
    .sort((a, b) => b.issued_date.localeCompare(a.issued_date) || byNewest(a, b)))],

  // yarn
  ["get", /^\/yarn-types$/, (s, _p, _b, q) => (requirePerm(s, "fabric_read"), s.yarn
    .filter((y) => (!q.fiber_type || y.fiber_type === q.fiber_type) && (q.low_stock !== "true" || n(y.current_stock_kg) < n(y.reorder_level_kg)))
    .sort((a, b) => a.fiber_type.localeCompare(b.fiber_type) || a.yarn_count.localeCompare(b.yarn_count)))],
  ["post", /^\/yarn-types$/, (s, _p, b) => (requirePerm(s, "fabric_write"), createYarn(s, b)), 201],
  ["get", new RegExp(`^/yarn-types/${ID}$`), (s, [id]) => (requirePerm(s, "fabric_read"), one(s.yarn, id, "Yarn type"))],
  ["patch", new RegExp(`^/yarn-types/${ID}$`), (s, [id], b) => (requirePerm(s, "fabric_write"),
    patchFields(one(s.yarn, id, "Yarn type") as never, b, ["yarn_count", "ply", "fiber_type", "color_name", "supplier_id", "unit_cost_per_kg", "reorder_level_kg", "notes"]))],
  ["get", new RegExp(`^/yarn-types/${ID}/transactions$`), (s, [id], _b, q) => (requirePerm(s, "fabric_read"), one(s.yarn, id, "Yarn type"),
    s.txns.filter((t) => t.yarn_type_id === id && (!q.from || t.transaction_date >= q.from) && (!q.to || t.transaction_date <= q.to))
      .sort((a, b) => b.seq - a.seq))],
  ["post", new RegExp(`^/yarn-types/${ID}/transactions$`), (s, [id], b) => (requirePerm(s, "fabric_write"), postTxn(s, id, b)), 201],

  // production
  ["get", /^\/weaving-sessions$/, (s, _p, _b, q) => (requirePerm(s, "fabric_read"), s.weaving
    .filter((w) => (!q.lot_id || w.lot_id === q.lot_id) && (!q.loom || w.loom_number === q.loom)
      && (!q.from || w.session_date >= q.from) && (!q.to || w.session_date <= q.to))
    .sort((a, b) => b.session_date.localeCompare(a.session_date) || byNewest(a, b)))],
  ["post", /^\/weaving-sessions$/, (s, _p, b) => (requirePerm(s, "fabric_write"), logWeaving(s, b)), 201],
  ["get", /^\/knitting-sessions$/, (s, _p, _b, q) => (requirePerm(s, "fabric_read"), s.knitting
    .filter((k) => (!q.yarn_type_id || k.yarn_type_id === q.yarn_type_id) && (!q.machine || k.machine_number === q.machine)
      && (!q.from || k.session_date >= q.from) && (!q.to || k.session_date <= q.to))
    .sort((a, b) => b.session_date.localeCompare(a.session_date) || byNewest(a, b)))],
  ["post", /^\/knitting-sessions$/, (s, _p, b) => (requirePerm(s, "fabric_write"), logKnitting(s, b)), 201],

  // imports
  ["get", /^\/fabric-imports$/, (s, _p, _b, q) => (requirePerm(s, "fabric_read"), s.imports
    .filter((i) => (!q.status || i.status === q.status) && (!q.supplier_id || i.supplier_id === q.supplier_id))
    .sort((a, b) => b.lc_opened_date.localeCompare(a.lc_opened_date)))],
  ["post", /^\/fabric-imports$/, (s, _p, b) => (requirePerm(s, "fabric_import_write"), createImport(s, b)), 201],
  ["get", new RegExp(`^/fabric-imports/${ID}$`), (s, [id]) => (requirePerm(s, "fabric_read"), one(s.imports, id, "Import"))],
  ["patch", new RegExp(`^/fabric-imports/${ID}$`), (s, [id], b) => (requirePerm(s, "fabric_import_write"), updateImport(s, id, b))],
  ["post", new RegExp(`^/fabric-imports/${ID}/receive$`), (s, [id], b) => {
    requirePerm(s, "fabric_write");
    requirePerm(s, "fabric_import_write");
    return receiveImport(s, id, b);
  }, 201],

  // reports
  ["get", /^\/fabric-reports\/inventory-summary$/, (s) => (requirePerm(s, "report_view"), rep.inventorySummary(s))],
  ["get", /^\/fabric-reports\/consumption$/, (s, _p, _b, q) => (requirePerm(s, "report_view"), rep.consumption(s, ...range(q)))],
  ["get", /^\/fabric-reports\/production$/, (s, _p, _b, q) => (requirePerm(s, "report_view"), rep.production(s, ...range(q)))],
  ["get", /^\/fabric-reports\/low-stock$/, (s) => (requirePerm(s, "report_view"), rep.lowStock(s))],
  ["get", /^\/fabric-reports\/insights$/, (s) => (requirePerm(s, "report_view"), rep.insights(s))],
  ["get", /^\/fabric-reports\/stock\.csv$/, (s) => (requirePerm(s, "report_view"), rep.stockCsv(s))],
];

export const demoAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  // A small, realistic delay so loading states are exercised like they are in production.
  await new Promise((r) => setTimeout(r, 120 + Math.random() * 120));

  const method = (config.method ?? "get").toLowerCase();
  const url = new URL(config.url ?? "", "http://demo.local");
  const path = url.pathname.replace(/^\/api\/v1/, "").replace(/\/$/, "");
  const query: Record<string, string> = Object.fromEntries(url.searchParams.entries());
  for (const [k, v] of Object.entries((config.params ?? {}) as Record<string, unknown>))
    if (v !== undefined && v !== null) query[k] = String(v);
  let body: Record<string, unknown> = {};
  if (typeof config.data === "string" && config.data) body = JSON.parse(config.data);
  else if (config.data && typeof config.data === "object") body = config.data as Record<string, unknown>;

  const respond = (status: number, data: unknown): AxiosResponse => ({
    data, status, statusText: String(status), headers: {}, config, request: {},
  });
  const fail = (status: number, detail: string): never => {
    const res = respond(status, { detail });
    throw new AxiosError(detail, String(status), config, {}, res);
  };

  const s = load();
  const isPublic = path === "/auth/demo" || path === "/auth/login" || path === "/auth/register-tenant";
  const authHeader = String((config.headers as Record<string, unknown>)?.Authorization ?? "");
  if (!isPublic && authHeader !== `Bearer ${TOKEN}`) fail(401, "Missing auth token");

  for (const [m, re, handler, status] of routes) {
    if (m !== method) continue;
    const hit = path.match(re);
    if (!hit) continue;
    try {
      const data = handler(s, hit.slice(1), body, query);
      save();
      return respond(status ?? 200, data);
    } catch (e) {
      if (e instanceof ApiError) fail(e.status, e.detail);
      const err = e as { status?: number; message?: string };
      if (err?.status) fail(err.status, err.message ?? "Error");
      throw e;
    }
  }
  return fail(404, "Not Found");
};

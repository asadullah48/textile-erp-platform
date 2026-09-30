/**
 * In-browser demo database.
 *
 * A faithful, deliberately small port of the backend's business rules so the
 * public demo behaves like the real system: yarn balances come from a ledger,
 * lot status is derived from issuances, landed cost is computed from its
 * parts, LC status only moves forward, and RBAC uses the same permission map.
 * The source of truth remains backend/app/services — if they ever disagree,
 * the backend wins and this file is the bug.
 */
import type {
  FabricImport, FabricLot, FabricRoll, Issuance, KnittingSession, Role, Supplier, TeamMember,
  WeavingSession, YarnTransaction, YarnType,
} from "@/types";

export const STORAGE_KEY = "textile-erp-demo-v1";

export const PERMISSIONS: Record<string, Role[]> = {
  fabric_read: ["owner", "manager", "operator", "accountant"],
  fabric_write: ["owner", "manager", "operator"],
  fabric_delete: ["owner", "manager"],
  fabric_supplier_write: ["owner", "manager"],
  fabric_import_write: ["owner", "manager", "accountant"],
  report_view: ["owner", "manager", "operator", "accountant"],
  user_manage: ["owner"],
  team_view: ["owner", "manager"],
};

export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

export interface DemoState {
  version: 1;
  createdAt: string;
  role: Role;
  tenant: { id: string; org_name: string; slug: string; currency: string; industry: string; is_demo: true };
  user: { id: string; email: string; full_name: string };
  members: TeamMember[];
  suppliers: Supplier[];
  lots: FabricLot[];
  rolls: FabricRoll[];
  issuances: Issuance[];
  yarn: YarnType[];
  txns: (YarnTransaction & { seq: number })[];
  weaving: WeavingSession[];
  knitting: KnittingSession[];
  imports: FabricImport[];
  seq: number;
}

// --------------------------------------------------------------------------- utils

export const n = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? 0 : Number(v));
export const f = (v: number, dp = 2) => (Math.round(v * 10 ** dp) / 10 ** dp).toFixed(dp);
export const today = () => new Date().toISOString().slice(0, 10);
export const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

function row(s: DemoState) {
  return { id: uuid(), tenant_id: s.tenant.id, created_at: new Date().toISOString(), updated_at: null };
}

export function can(s: DemoState, perm: string) {
  return (PERMISSIONS[perm] ?? []).includes(s.role);
}
export function requirePerm(s: DemoState, perm: string) {
  if (!can(s, perm)) throw new ApiError(403, `Role '${s.role}' lacks permission '${perm}'`);
}
function need<T extends { id: string }>(list: T[], id: string, label: string): T {
  const found = list.find((x) => x.id === id);
  if (!found) throw new ApiError(404, `${label} not found`);
  return found;
}
function touch(o: { updated_at: string | null }) {
  o.updated_at = new Date().toISOString();
}

// --------------------------------------------------------------------------- suppliers

export function createSupplier(s: DemoState, b: Partial<Supplier>): Supplier {
  if (!b.name || b.name.length < 2) throw new ApiError(422, "name: must be at least 2 characters");
  const sup: Supplier = {
    ...row(s), name: b.name, contact_person: b.contact_person ?? null, phone: b.phone ?? null,
    email: b.email ?? null, address: b.address ?? null, city: b.city ?? null, country: b.country ?? "PK",
    payment_terms: b.payment_terms ?? null, notes: b.notes ?? null,
  };
  s.suppliers.push(sup);
  return sup;
}

export function supplierDetail(s: DemoState, id: string) {
  const sup = need(s.suppliers, id, "Supplier");
  const lots = s.lots.filter((l) => l.supplier_id === id);
  return {
    ...sup,
    stats: {
      lots_received: lots.length,
      meters_received: f(lots.reduce((a, l) => a + n(l.total_meters), 0)),
      purchase_value_pkr: f(lots.reduce((a, l) => a + n(l.total_meters) * n(l.cost_per_meter), 0)),
      open_imports: s.imports.filter((i) => i.supplier_id === id && ["in_transit", "cleared"].includes(i.status)).length,
      yarn_types_supplied: s.yarn.filter((y) => y.supplier_id === id).length,
    },
  };
}

// --------------------------------------------------------------------------- lots & rolls

export function createLot(s: DemoState, b: Record<string, unknown>): FabricLot {
  const lot_number = String(b.lot_number ?? "").trim();
  if (!lot_number) throw new ApiError(422, "lot_number: field required");
  if (s.lots.some((l) => l.lot_number === lot_number)) throw new ApiError(409, `Lot number '${lot_number}' already exists`);
  if (!b.fabric_type || !b.color || b.total_meters === undefined || !b.received_date)
    throw new ApiError(422, "fabric_type, color, total_meters and received_date are required");
  let supplierName = (b.supplier as string) || null;
  if (b.supplier_id) supplierName = supplierName ?? need(s.suppliers, String(b.supplier_id), "Supplier").name;
  const lot: FabricLot = {
    ...row(s),
    lot_number,
    fabric_type: String(b.fabric_type),
    fabric_category: (b.fabric_category as FabricLot["fabric_category"]) ?? "woven",
    color: String(b.color),
    gsm: b.gsm ? f(n(b.gsm as string)) : null,
    width_cm: b.width_cm ? f(n(b.width_cm as string)) : null,
    total_meters: f(n(b.total_meters as string)),
    received_date: String(b.received_date),
    supplier: supplierName,
    supplier_id: (b.supplier_id as string) || null,
    import_id: null,
    cost_per_meter: b.cost_per_meter !== undefined && b.cost_per_meter !== null && b.cost_per_meter !== ""
      ? f(n(b.cost_per_meter as string), 4) : null,
    status: (b.status as FabricLot["status"]) ?? "pending",
    notes: (b.notes as string) || null,
  };
  s.lots.push(lot);
  return lot;
}

export function refreshLotStatus(s: DemoState, lot: FabricLot) {
  const rolls = s.rolls.filter((r) => r.lot_id === lot.id);
  if (!rolls.length) return;
  const length = rolls.reduce((a, r) => a + n(r.length_meters), 0);
  const issued = rolls.reduce((a, r) => a + n(r.issued_meters), 0);
  lot.status = issued <= 0 ? "in_stock" : issued >= length ? "fully_consumed" : "partially_consumed";
}

function newRoll(s: DemoState, lot: FabricLot, b: Record<string, unknown>): FabricRoll {
  return {
    ...row(s), lot_id: lot.id, roll_number: String(b.roll_number), length_meters: f(n(b.length_meters as string)),
    issued_meters: "0.00", remaining_meters: f(n(b.length_meters as string)),
    weight_kg: b.weight_kg ? f(n(b.weight_kg as string), 3) : null, grade: (b.grade as FabricRoll["grade"]) || null,
    status: (b.status as FabricRoll["status"]) ?? "available", location: (b.location as string) || null,
  };
}

function ensureUniqueRolls(s: DemoState, numbers: string[]) {
  const clash = numbers.find((x) => s.rolls.some((r) => r.roll_number === x));
  if (clash) throw new ApiError(409, `Roll number '${clash}' already exists`);
}

export function addRoll(s: DemoState, lotId: string, b: Record<string, unknown>): FabricRoll {
  const lot = need(s.lots, lotId, "Fabric lot");
  if (!b.roll_number || n(b.length_meters as string) <= 0) throw new ApiError(422, "roll_number and a positive length are required");
  ensureUniqueRolls(s, [String(b.roll_number)]);
  const r = newRoll(s, lot, b);
  s.rolls.push(r);
  if (lot.status === "pending") refreshLotStatus(s, lot);
  return r;
}

export function addRollsBulk(s: DemoState, lotId: string, b: Record<string, unknown>): FabricRoll[] {
  const lot = need(s.lots, lotId, "Fabric lot");
  const count = n(b.count as string), start = b.start === undefined ? 1 : n(b.start as string);
  if (count < 1 || count > 500) throw new ApiError(422, "count: must be between 1 and 500");
  if (n(b.length_meters as string) <= 0) throw new ApiError(422, "length_meters: must be greater than 0");
  const width = Math.max(3, String(start + count - 1).length);
  const numbers = Array.from({ length: count }, (_, i) => `${b.prefix}${String(start + i).padStart(width, "0")}`);
  ensureUniqueRolls(s, numbers);
  const rolls = numbers.map((roll_number) => newRoll(s, lot, { ...b, roll_number, status: "available" }));
  s.rolls.push(...rolls);
  if (lot.status === "pending") refreshLotStatus(s, lot);
  return rolls;
}

export function issueRoll(s: DemoState, rollId: string, b: Record<string, unknown>): Issuance {
  const roll = need(s.rolls, rollId, "Fabric roll");
  const remaining = n(roll.length_meters) - n(roll.issued_meters);
  if (roll.status === "reserved" && !b.cmt_order_reference)
    throw new ApiError(409, "Roll is reserved — issue it against a CMT order reference");
  if (remaining <= 0) throw new ApiError(409, "Roll has no remaining meters");
  const meters = b.issued_meters ? n(b.issued_meters as string) : remaining;
  if (meters <= 0) throw new ApiError(422, "issued_meters: must be greater than 0");
  if (meters > remaining + 1e-9) throw new ApiError(409, `Only ${f(remaining)} m remain on roll ${roll.roll_number}`);
  if (!b.issued_to_department) throw new ApiError(422, "issued_to_department: field required");
  const iss: Issuance = {
    ...row(s), roll_id: roll.id, issued_to_department: b.issued_to_department as Issuance["issued_to_department"],
    cmt_order_reference: (b.cmt_order_reference as string) || null, issued_meters: f(meters),
    issued_kg: b.issued_kg ? f(n(b.issued_kg as string), 3) : null,
    issued_date: (b.issued_date as string) || today(), issued_by: s.user.id, notes: (b.notes as string) || null,
  };
  s.issuances.push(iss);
  roll.issued_meters = f(n(roll.issued_meters) + meters);
  roll.remaining_meters = f(n(roll.length_meters) - n(roll.issued_meters));
  roll.status = n(roll.issued_meters) >= n(roll.length_meters) ? "consumed" : "issued";
  touch(roll);
  refreshLotStatus(s, need(s.lots, roll.lot_id, "Fabric lot"));
  return iss;
}

// --------------------------------------------------------------------------- yarn

export const yarnLabel = (y: YarnType) =>
  `${y.yarn_count}${y.ply > 1 && !y.yarn_count.includes("/") ? `/${y.ply}` : ""} ${y.fiber_type[0].toUpperCase()}${y.fiber_type.slice(1)}${y.color_name ? ` · ${y.color_name}` : ""}`;

export function postTxn(s: DemoState, yarnId: string, b: Record<string, unknown>, source = "manual") {
  const y = need(s.yarn, yarnId, "Yarn type");
  const type = b.transaction_type as YarnTransaction["transaction_type"];
  const implied = ({ receipt: "in", issue: "out", wastage: "out" } as const)[type as "receipt"];
  let direction = b.direction as "in" | "out" | undefined;
  if (implied) {
    if (direction && direction !== implied) throw new ApiError(422, `${type} is always '${implied}'`);
    direction = implied;
  } else if (!direction) throw new ApiError(422, "adjustment requires direction 'in' or 'out'");
  const qty = n(b.quantity_kg as string);
  if (!(qty > 0)) throw new ApiError(422, "quantity_kg: must be greater than 0");
  const current = n(y.current_stock_kg);
  if (direction === "out" && qty > current + 1e-9)
    throw new ApiError(409, `Insufficient stock for ${yarnLabel(y)}: ${f(current, 3)} kg on hand, ${f(qty, 3)} kg requested`);
  const balance = direction === "out" ? current - qty : current + qty;
  const unit = b.unit_cost !== undefined && b.unit_cost !== null && b.unit_cost !== "" ? n(b.unit_cost as string) : n(y.unit_cost_per_kg);
  const t = {
    ...row(s), seq: ++s.seq, yarn_type_id: y.id, transaction_type: type, direction, quantity_kg: f(qty, 3),
    balance_after_kg: f(balance, 3), unit_cost: f(unit), total_cost: f(qty * unit),
    lot_reference: (b.lot_reference as string) || null, order_reference: (b.order_reference as string) || null,
    source, transaction_date: (b.transaction_date as string) || today(), notes: (b.notes as string) || null,
    created_by: s.user.id,
  };
  s.txns.push(t);
  y.current_stock_kg = f(balance, 3);
  if (type === "receipt" && b.unit_cost !== undefined && b.unit_cost !== null && b.unit_cost !== "") y.unit_cost_per_kg = f(unit);
  touch(y);
  return t;
}

export function createYarn(s: DemoState, b: Record<string, unknown>): YarnType {
  if (!b.yarn_count || !b.fiber_type || b.unit_cost_per_kg === undefined) throw new ApiError(422, "yarn_count, fiber_type and unit_cost_per_kg are required");
  if (b.supplier_id) need(s.suppliers, String(b.supplier_id), "Supplier");
  const y: YarnType = {
    ...row(s), yarn_count: String(b.yarn_count), ply: n(b.ply as string) || 1, fiber_type: String(b.fiber_type),
    color_name: (b.color_name as string) || null, supplier_id: (b.supplier_id as string) || null,
    unit_cost_per_kg: f(n(b.unit_cost_per_kg as string)), reorder_level_kg: f(n(b.reorder_level_kg as string), 3),
    current_stock_kg: "0.000", notes: (b.notes as string) || null,
  };
  s.yarn.push(y);
  if (n(b.opening_stock_kg as string) > 0)
    postTxn(s, y.id, { transaction_type: "receipt", quantity_kg: b.opening_stock_kg, unit_cost: b.unit_cost_per_kg, notes: "Opening stock" });
  return y;
}

// --------------------------------------------------------------------------- production

export function logWeaving(s: DemoState, b: Record<string, unknown>): WeavingSession {
  const lot = need(s.lots, String(b.lot_id), "Fabric lot");
  if (!b.loom_number || !b.session_date || !(n(b.produced_meters as string) > 0))
    throw new ApiError(422, "loom_number, session_date and produced_meters are required");
  if (!!b.yarn_type_id !== !!b.yarn_consumed_kg) throw new ApiError(422, "yarn_type_id and yarn_consumed_kg must be given together");
  let txnId: string | null = null;
  if (b.yarn_type_id) {
    txnId = postTxn(s, String(b.yarn_type_id), {
      transaction_type: "issue", quantity_kg: b.yarn_consumed_kg, lot_reference: lot.lot_number,
      transaction_date: b.session_date, notes: `Weaving · loom ${b.loom_number} · ${b.shift ?? "day"} shift`,
    }, "weaving").id;
  }
  const w: WeavingSession = {
    ...row(s), lot_id: lot.id, loom_number: String(b.loom_number), operator_name: (b.operator_name as string) || null,
    session_date: String(b.session_date), shift: (b.shift as string) || "day", start_time: null, end_time: null,
    picks_per_inch: b.picks_per_inch ? n(b.picks_per_inch as string) : null, ends_per_inch: b.ends_per_inch ? n(b.ends_per_inch as string) : null,
    produced_meters: f(n(b.produced_meters as string)), produced_kg: b.produced_kg ? f(n(b.produced_kg as string), 3) : null,
    quality_grade: (b.quality_grade as WeavingSession["quality_grade"]) || "A",
    yarn_type_id: (b.yarn_type_id as string) || null, yarn_consumed_kg: b.yarn_consumed_kg ? f(n(b.yarn_consumed_kg as string), 3) : null,
    yarn_transaction_id: txnId, notes: (b.notes as string) || null,
  };
  s.weaving.push(w);
  return w;
}

export function logKnitting(s: DemoState, b: Record<string, unknown>): KnittingSession {
  const lotRef = b.lot_id ? need(s.lots, String(b.lot_id), "Fabric lot").lot_number : null;
  if (!b.machine_number || !b.session_date || !(n(b.produced_kg as string) > 0) || !(n(b.yarn_consumed_kg as string) > 0))
    throw new ApiError(422, "machine_number, session_date, produced_kg and yarn_consumed_kg are required");
  const txn = postTxn(s, String(b.yarn_type_id), {
    transaction_type: "issue", quantity_kg: b.yarn_consumed_kg, lot_reference: lotRef,
    transaction_date: b.session_date, notes: `Knitting · machine ${b.machine_number} · ${b.shift ?? "day"} shift`,
  }, "knitting");
  const k: KnittingSession = {
    ...row(s), yarn_type_id: String(b.yarn_type_id), lot_id: (b.lot_id as string) || null,
    machine_number: String(b.machine_number), operator_name: (b.operator_name as string) || null,
    session_date: String(b.session_date), shift: (b.shift as string) || "day",
    gauge: b.gauge ? n(b.gauge as string) : null, course_count: b.course_count ? n(b.course_count as string) : null,
    produced_kg: f(n(b.produced_kg as string), 3), yarn_consumed_kg: f(n(b.yarn_consumed_kg as string), 3),
    quality_grade: (b.quality_grade as KnittingSession["quality_grade"]) || "A", yarn_transaction_id: txn.id,
    notes: (b.notes as string) || null,
  };
  s.knitting.push(k);
  return k;
}

// --------------------------------------------------------------------------- imports

const STATUS_ORDER = ["in_transit", "cleared", "warehoused", "consumed"];

export function landed(i: Pick<FabricImport, "fob_cost" | "exchange_rate" | "freight_cost_pkr" | "insurance_cost_pkr" | "duties_paid_pkr" | "quantity_meters">) {
  const total = Math.round((n(i.fob_cost) * n(i.exchange_rate) + n(i.freight_cost_pkr) + n(i.insurance_cost_pkr) + n(i.duties_paid_pkr)) * 100) / 100;
  return { total_landed_cost_pkr: f(total), landed_cost_per_meter_pkr: f(total / n(i.quantity_meters), 4) };
}

export function createImport(s: DemoState, b: Record<string, unknown>): FabricImport {
  need(s.suppliers, String(b.supplier_id), "Supplier");
  const lc = String(b.lc_number ?? "").trim();
  if (!lc) throw new ApiError(422, "lc_number: field required");
  if (s.imports.some((i) => i.lc_number === lc)) throw new ApiError(409, `LC '${lc}' already exists`);
  for (const k of ["quantity_meters", "fob_cost", "exchange_rate"])
    if (!(n(b[k] as string) > 0)) throw new ApiError(422, `${k.replace(/_/g, " ")}: must be greater than 0`);
  const base = {
    fob_cost: f(n(b.fob_cost as string)), exchange_rate: f(n(b.exchange_rate as string), 4),
    freight_cost_pkr: f(n(b.freight_cost_pkr as string)), insurance_cost_pkr: f(n(b.insurance_cost_pkr as string)),
    duties_paid_pkr: f(n(b.duties_paid_pkr as string)), quantity_meters: f(n(b.quantity_meters as string)),
  };
  const imp: FabricImport = {
    ...row(s), lc_number: lc, shipment_reference: (b.shipment_reference as string) || null,
    supplier_id: String(b.supplier_id), fabric_type: String(b.fabric_type), quantity_kg: b.quantity_kg ? f(n(b.quantity_kg as string), 3) : null,
    currency: String(b.currency ?? "USD"), ...base, ...landed(base), port_of_entry: (b.port_of_entry as string) || "Karachi",
    lc_opened_date: String(b.lc_opened_date ?? today()), clearance_date: null, warehouse_arrival_date: null,
    status: "in_transit", notes: (b.notes as string) || null,
  };
  s.imports.push(imp);
  return imp;
}

export function updateImport(s: DemoState, id: string, b: Record<string, unknown>): FabricImport {
  const imp = need(s.imports, id, "Import");
  const next = b.status as FabricImport["status"] | undefined;
  if (next && next !== imp.status) {
    if (STATUS_ORDER.indexOf(next) < STATUS_ORDER.indexOf(imp.status))
      throw new ApiError(409, `Import status cannot move back from '${imp.status}' to '${next}'`);
    if (next === "warehoused") throw new ApiError(409, "Use Receive to warehouse an import — it opens the lot");
    if (next === "cleared" && !b.clearance_date && !imp.clearance_date) b.clearance_date = today();
  }
  const costKeys = ["exchange_rate", "freight_cost_pkr", "insurance_cost_pkr", "duties_paid_pkr"];
  if (["warehoused", "consumed"].includes(imp.status) && costKeys.some((k) => k in b))
    throw new ApiError(409, "Costs are locked once an import is warehoused (its lot is already valued)");
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined) continue;
    if (costKeys.includes(k)) (imp as unknown as Record<string, unknown>)[k] = f(n(v as string), k === "exchange_rate" ? 4 : 2);
    else (imp as unknown as Record<string, unknown>)[k] = v;
  }
  Object.assign(imp, landed(imp));
  touch(imp);
  return imp;
}

export function receiveImport(s: DemoState, id: string, b: Record<string, unknown>): FabricLot {
  const imp = need(s.imports, id, "Import");
  if (["warehoused", "consumed"].includes(imp.status)) throw new ApiError(409, `Import is already ${imp.status}`);
  const sup = need(s.suppliers, imp.supplier_id, "Supplier");
  const arrival = (b.warehouse_arrival_date as string) || today();
  const count = n(b.roll_count as string);
  const prefix = (b.roll_prefix as string) || `${b.lot_number}-R`;
  const numbers = Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(3, "0")}`);
  ensureUniqueRolls(s, numbers);
  const lot = createLot(s, {
    lot_number: b.lot_number, fabric_type: imp.fabric_type, fabric_category: "imported", color: b.color || "As per LC",
    total_meters: imp.quantity_meters, received_date: arrival, supplier: sup.name, supplier_id: sup.id,
    cost_per_meter: imp.landed_cost_per_meter_pkr, status: "in_stock",
    notes: `LC ${imp.lc_number}${imp.shipment_reference ? ` · B/L ${imp.shipment_reference}` : ""}`,
  });
  lot.import_id = imp.id;
  if (count) {
    const each = Math.round((n(imp.quantity_meters) / count) * 100) / 100;
    numbers.forEach((roll_number, i) => {
      const length = i < count - 1 ? each : n(imp.quantity_meters) - each * (count - 1);
      s.rolls.push(newRoll(s, lot, { roll_number, length_meters: length, location: b.location, status: "available" }));
    });
  }
  imp.clearance_date = imp.clearance_date ?? arrival;
  imp.warehouse_arrival_date = arrival;
  imp.status = "warehoused";
  touch(imp);
  return lot;
}

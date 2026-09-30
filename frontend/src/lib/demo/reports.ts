/** Reports, Mill Pulse and traceability for the in-browser demo.
 *  Thresholds match backend/app/services/report_service.py exactly. */
import type { Insight, InsightsReport, RollTrace, TraceEvent } from "@/types";
import { DemoState, daysBetween, f, n, today, yarnLabel } from "./engine";

const DEAD_STOCK_DAYS = 90;
const IMPORT_TRANSIT_DAYS = 45;
const PORT_DWELL_DAYS = 7;
const YARN_COVER_DAYS = 7;
const YARN_USAGE_WINDOW_DAYS = 14;
const LOOM_WINDOW_DAYS = 30;
const LOOM_MIN_SESSIONS = 3;
const LOOM_GRADE_A_MIN_PCT = 80;

const onHand = (r: { length_meters: string; issued_meters: string }) => n(r.length_meters) - n(r.issued_meters);
const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

export function inventorySummary(s: DemoState) {
  const cats = new Map<string, { lots: Set<string>; rolls: number; meters: number; value: number }>();
  let unvalued = 0;
  for (const lot of s.lots) {
    const c = cats.get(lot.fabric_category) ?? { lots: new Set(), rolls: 0, meters: 0, value: 0 };
    c.lots.add(lot.id);
    for (const r of s.rolls.filter((x) => x.lot_id === lot.id && ["available", "reserved", "issued"].includes(x.status))) {
      c.meters += onHand(r);
      if (r.status === "available") c.rolls++;
      if (lot.cost_per_meter === null) unvalued += onHand(r);
      else c.value += onHand(r) * n(lot.cost_per_meter);
    }
    cats.set(lot.fabric_category, c);
  }
  const fabric = [...cats.entries()].sort().map(([k, c]) => ({
    fabric_category: k, lots: c.lots.size, rolls_available: c.rolls, meters_available: f(c.meters), stock_value_pkr: f(c.value),
  }));
  const yarnValue = s.yarn.reduce((a, y) => a + n(y.current_stock_kg) * n(y.unit_cost_per_kg), 0);
  return {
    fabric,
    yarn: {
      yarn_types: s.yarn.length,
      stock_kg: f(s.yarn.reduce((a, y) => a + n(y.current_stock_kg), 0), 3),
      stock_value_pkr: f(yarnValue),
      below_reorder: s.yarn.filter((y) => n(y.current_stock_kg) < n(y.reorder_level_kg)).length,
    },
    total_value_pkr: f(fabric.reduce((a, c) => a + n(c.stock_value_pkr), 0) + yarnValue),
    unvalued_meters: f(unvalued),
  };
}

export function consumption(s: DemoState, from: string, to: string) {
  const dept = new Map<string, number>();
  for (const i of s.issuances.filter((x) => inRange(x.issued_date, from, to)))
    dept.set(i.issued_to_department, (dept.get(i.issued_to_department) ?? 0) + n(i.issued_meters));
  const by = [...dept.entries()].sort((a, b) => b[1] - a[1]).map(([department, m]) => ({ department, meters: f(m) }));
  const txns = s.txns.filter((t) => inRange(t.transaction_date, from, to));
  return {
    date_from: from, date_to: to,
    meters_received: f(s.lots.filter((l) => inRange(l.received_date, from, to)).reduce((a, l) => a + n(l.total_meters), 0)),
    meters_issued: f(by.reduce((a, d) => a + n(d.meters), 0)),
    issued_by_department: by,
    yarn_in_kg: f(txns.filter((t) => t.direction === "in").reduce((a, t) => a + n(t.quantity_kg), 0), 3),
    yarn_out_kg: f(txns.filter((t) => t.direction === "out").reduce((a, t) => a + n(t.quantity_kg), 0), 3),
  };
}

function machineStats<T extends { quality_grade: string }>(rows: T[], key: (r: T) => string, out: (r: T) => number) {
  const m = new Map<string, { sessions: number; output: number; a: number }>();
  for (const r of rows) {
    const x = m.get(key(r)) ?? { sessions: 0, output: 0, a: 0 };
    x.sessions++;
    x.output += out(r);
    if (r.quality_grade === "A") x.a++;
    m.set(key(r), x);
  }
  return [...m.entries()].sort().map(([machine, x]) => ({
    machine, sessions: x.sessions, output: f(x.output), grade_a_pct: f((x.a * 100) / x.sessions, 1),
  }));
}

export function production(s: DemoState, from: string, to: string) {
  const w = s.weaving.filter((x) => inRange(x.session_date, from, to));
  const k = s.knitting.filter((x) => inRange(x.session_date, from, to));
  const looms = machineStats(w, (r) => r.loom_number, (r) => n(r.produced_meters));
  const machines = machineStats(k, (r) => r.machine_number, (r) => n(r.produced_kg));
  const grade_mix: Record<string, number> = { A: 0, B: 0, C: 0 };
  for (const r of [...w, ...k]) grade_mix[r.quality_grade] = (grade_mix[r.quality_grade] ?? 0) + 1;
  return {
    date_from: from, date_to: to,
    weaving_meters: f(looms.reduce((a, l) => a + n(l.output), 0)),
    knitting_kg: f(machines.reduce((a, l) => a + n(l.output), 0)),
    looms, knitting_machines: machines, grade_mix,
  };
}

export function lowStock(s: DemoState) {
  return s.yarn
    .filter((y) => n(y.current_stock_kg) < n(y.reorder_level_kg))
    .map((y) => ({
      yarn_type_id: y.id, label: yarnLabel(y), current_stock_kg: y.current_stock_kg, reorder_level_kg: y.reorder_level_kg,
      shortfall_kg: f(n(y.reorder_level_kg) - n(y.current_stock_kg), 3),
    }))
    .sort((a, b) => n(b.shortfall_kg) - n(a.shortfall_kg));
}

export function insights(s: DemoState): InsightsReport {
  const t = today();
  const found: Insight[] = [];
  const since = new Date(Date.now() - YARN_USAGE_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  for (const y of s.yarn) {
    const stock = n(y.current_stock_kg), reorder = n(y.reorder_level_kg), label = yarnLabel(y);
    if (reorder > 0 && stock < reorder) {
      found.push({
        rule: "yarn_below_reorder", severity: stock === 0 ? "critical" : "warning",
        title: `${label} is below its reorder level`,
        detail: `${f(stock, 3)} kg on hand against a reorder level of ${f(reorder, 3)} kg.`,
        evidence: { stock_kg: f(stock, 3), reorder_level_kg: f(reorder, 3), shortfall_kg: f(reorder - stock, 3) }, href: "/yarn",
      });
      continue;
    }
    const burn = s.txns
      .filter((x) => x.yarn_type_id === y.id && x.direction === "out" && x.transaction_type === "issue" && x.transaction_date > since)
      .reduce((a, x) => a + n(x.quantity_kg), 0);
    const daily = burn / YARN_USAGE_WINDOW_DAYS;
    if (daily > 0 && stock > 0) {
      const cover = Math.round((stock / daily) * 10) / 10;
      if (cover < YARN_COVER_DAYS)
        found.push({
          rule: "yarn_runway", severity: "warning", title: `${label}: about ${cover.toFixed(1)} days of cover left`,
          detail: `At the last ${YARN_USAGE_WINDOW_DAYS} days' average burn of ${daily.toFixed(1)} kg/day, stock runs out before a typical reorder lands.`,
          evidence: { stock_kg: f(stock, 3), avg_daily_issue_kg: f(daily), days_of_cover: cover.toFixed(1) }, href: "/yarn",
        });
    }
  }

  for (const lot of s.lots.filter((l) => l.status === "in_stock" && daysBetween(l.received_date, t) > DEAD_STOCK_DAYS)) {
    const meters = s.rolls.filter((r) => r.lot_id === lot.id).reduce((a, r) => a + onHand(r), 0);
    if (meters <= 0) continue;
    const age = daysBetween(lot.received_date, t);
    const value = lot.cost_per_meter !== null ? meters * n(lot.cost_per_meter) : null;
    found.push({
      rule: "dead_stock", severity: "warning", title: `Lot ${lot.lot_number} untouched for ${age} days`,
      detail: `${f(meters)} m of ${lot.fabric_type} has not been issued since it arrived` +
        (value !== null ? ` — PKR ${Math.round(value).toLocaleString("en-PK")} of working capital sitting on the rack.` : "."),
      evidence: { age_days: String(age), meters_on_hand: f(meters), value_pkr: value !== null ? f(value) : "unvalued" },
      href: `/fabric-lots/${lot.id}`,
    });
  }

  for (const imp of s.imports) {
    if (imp.status === "in_transit" && daysBetween(imp.lc_opened_date, t) > IMPORT_TRANSIT_DAYS) {
      const d = daysBetween(imp.lc_opened_date, t);
      found.push({
        rule: "import_overdue", severity: "warning", title: `LC ${imp.lc_number} in transit for ${d} days`,
        detail: `No clearance recorded ${d} days after the LC was opened (threshold ${IMPORT_TRANSIT_DAYS}).`,
        evidence: { lc_opened: imp.lc_opened_date, days: String(d) }, href: "/imports",
      });
    }
    if (imp.status === "cleared" && imp.clearance_date && daysBetween(imp.clearance_date, t) > PORT_DWELL_DAYS) {
      const d = daysBetween(imp.clearance_date, t);
      found.push({
        rule: "port_dwell", severity: "critical", title: `LC ${imp.lc_number} cleared ${d} days ago but not warehoused`,
        detail: `Cargo at ${imp.port_of_entry} past ${PORT_DWELL_DAYS} days risks demurrage and storage charges.`,
        evidence: { cleared: imp.clearance_date, days: String(d), port: imp.port_of_entry }, href: "/imports",
      });
    }
  }

  const window = new Date(Date.now() - LOOM_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  for (const l of machineStats(s.weaving.filter((w) => w.session_date > window), (r) => r.loom_number, () => 0)) {
    const pct = n(l.grade_a_pct);
    if (l.sessions >= LOOM_MIN_SESSIONS && pct < LOOM_GRADE_A_MIN_PCT) {
      const a = Math.round((pct * l.sessions) / 100);
      found.push({
        rule: "loom_quality", severity: "warning", title: `Loom ${l.machine}: only ${l.grade_a_pct}% A-grade`,
        detail: `${a} of ${l.sessions} sessions in the last ${LOOM_WINDOW_DAYS} days were A-grade (target ≥ ${LOOM_GRADE_A_MIN_PCT}%). Check tension, beam and operator rotation.`,
        evidence: { sessions: String(l.sessions), grade_a: String(a), grade_a_pct: l.grade_a_pct }, href: "/weaving",
      });
    }
  }

  const unvaluedLots = s.lots.filter((l) => l.cost_per_meter === null);
  const unvaluedRolls = s.rolls.filter((r) => unvaluedLots.some((l) => l.id === r.lot_id) && ["available", "reserved", "issued"].includes(r.status));
  const lotsWithStock = new Set(unvaluedRolls.map((r) => r.lot_id));
  if (lotsWithStock.size)
    found.push({
      rule: "unvalued_stock", severity: "info", title: `${lotsWithStock.size} lot(s) have no cost per meter`,
      detail: `${f(unvaluedRolls.reduce((a, r) => a + onHand(r), 0))} m on hand is excluded from stock valuation until a cost is set.`,
      evidence: { lots: String(lotsWithStock.size), meters: f(unvaluedRolls.reduce((a, r) => a + onHand(r), 0)) }, href: "/fabric-lots",
    });

  const order = { critical: 0, warning: 1, info: 2 } as const;
  found.sort((a, b) => order[a.severity] - order[b.severity]);
  return { generated_at: new Date().toISOString(), rules_evaluated: 7, insights: found };
}

export function trace(s: DemoState, rollId: string): RollTrace {
  const roll = s.rolls.find((r) => r.id === rollId);
  if (!roll) throw Object.assign(new Error("Fabric roll not found"), { status: 404 });
  const lot = s.lots.find((l) => l.id === roll.lot_id)!;
  const supplier = s.suppliers.find((x) => x.id === lot.supplier_id) ?? null;
  const imp = s.imports.find((x) => x.id === lot.import_id) ?? null;
  // Only sessions on or before the roll was registered can have produced it.
  const madeBy = roll.created_at.slice(0, 10);
  const weaving = s.weaving.filter((w) => w.lot_id === lot.id && w.session_date <= madeBy).sort((a, b) => a.session_date.localeCompare(b.session_date));
  const knitting = s.knitting.filter((k) => k.lot_id === lot.id && k.session_date <= madeBy).sort((a, b) => a.session_date.localeCompare(b.session_date));
  const issuances = s.issuances.filter((i) => i.roll_id === roll.id).sort((a, b) => a.issued_date.localeCompare(b.issued_date));
  const tl: TraceEvent[] = [];
  if (imp) {
    tl.push({ at: imp.lc_opened_date, kind: "import", title: `LC ${imp.lc_number} opened`,
      detail: `${imp.quantity_meters} m ${imp.fabric_type}, ${imp.currency} ${n(imp.fob_cost).toLocaleString()} FOB` });
    if (imp.clearance_date) tl.push({ at: imp.clearance_date, kind: "import", title: `Cleared at ${imp.port_of_entry}`,
      detail: `Landed cost PKR ${imp.landed_cost_per_meter_pkr}/m` });
  }
  tl.push({ at: lot.received_date, kind: "lot", title: `Lot ${lot.lot_number} ${lot.supplier || imp ? "received" : "completed"}`,
    detail: `${lot.fabric_type} · ${lot.color}${supplier ? ` · from ${supplier.name}` : ""}` });
  for (const w of weaving) tl.push({ at: w.session_date, kind: "weaving", title: `Woven on loom ${w.loom_number} (${w.shift} shift)`,
    detail: `${w.produced_meters} m · grade ${w.quality_grade}${w.operator_name ? ` · operator ${w.operator_name}` : ""}` });
  for (const k of knitting) tl.push({ at: k.session_date, kind: "knitting", title: `Knitted on machine ${k.machine_number}`,
    detail: `${k.produced_kg} kg · grade ${k.quality_grade}` });
  tl.push({ at: roll.created_at.slice(0, 10), kind: "roll", title: `Roll ${roll.roll_number} registered`,
    detail: `${roll.length_meters} m${roll.location ? ` · ${roll.location}` : ""}` });
  for (const i of issuances) tl.push({ at: i.issued_date, kind: "issue", title: `Issued to ${i.issued_to_department}`,
    detail: `${i.issued_meters} m${i.cmt_order_reference ? ` · order ${i.cmt_order_reference}` : ""}` });
  // Same-day events follow the physical order: production → lot → roll → issue.
  const rank: Record<TraceEvent["kind"], number> = { import: 0, weaving: 1, knitting: 1, lot: 2, roll: 3, issue: 4 };
  tl.sort((a, b) => a.at.localeCompare(b.at) || rank[a.kind] - rank[b.kind]);
  return { roll, lot, supplier, fabric_import: imp, weaving_sessions: weaving, knitting_sessions: knitting, issuances, timeline: tl };
}

export function stockCsv(s: DemoState) {
  const esc = (v: unknown) => {
    const x = String(v ?? "");
    return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
  };
  const lines = [["lot_number", "fabric_category", "fabric_type", "color", "supplier", "roll_number", "status", "grade",
    "length_m", "issued_m", "on_hand_m", "location", "cost_per_meter_pkr", "on_hand_value_pkr"].join(",")];
  const lots = [...s.lots].sort((a, b) => a.lot_number.localeCompare(b.lot_number));
  for (const lot of lots)
    for (const r of s.rolls.filter((x) => x.lot_id === lot.id).sort((a, b) => a.roll_number.localeCompare(b.roll_number)))
      lines.push([lot.lot_number, lot.fabric_category, lot.fabric_type, lot.color, lot.supplier, r.roll_number, r.status,
        r.grade, r.length_meters, r.issued_meters, f(onHand(r)), r.location, lot.cost_per_meter ?? "",
        lot.cost_per_meter !== null ? f(onHand(r) * n(lot.cost_per_meter)) : ""].map(esc).join(","));
  return lines.join("\n") + "\n";
}

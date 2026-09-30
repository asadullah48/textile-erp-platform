/** Seed for the in-browser demo — mirrors backend/app/services/demo_seed.py.
 *  Built through the engine (not literal rows), so every balance and status is
 *  derived the same way user actions derive them. All business names are fictional. */
import type { Role } from "@/types";
import {
  DemoState, addRollsBulk, createImport, createLot, createSupplier, createYarn, daysAgo,
  issueRoll, logKnitting, logWeaving, postTxn, receiveImport, updateImport,
} from "./engine";

export function seed(role: Role = "owner"): DemoState {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const s: DemoState = {
    version: 1,
    createdAt: new Date().toISOString(),
    role,
    tenant: { id: tenantId, org_name: "Demo Weaving Mills", slug: "demo-weaving-mills", currency: "PKR", industry: "fabric_mill", is_demo: true },
    user: { id: userId, email: "owner@demo.textile-erp.dev", full_name: "Demo Owner" },
    members: [],
    suppliers: [], lots: [], rolls: [], issuances: [], yarn: [], txns: [], weaving: [], knitting: [], imports: [],
    seq: 0,
  };
  const now = new Date().toISOString();
  s.members = [
    { id: crypto.randomUUID(), user_id: userId, email: s.user.email, full_name: "Demo Owner", role: "owner", is_active: true, created_at: now },
    { id: crypto.randomUUID(), user_id: crypto.randomUUID(), email: "manager@demo.textile-erp.dev", full_name: "Farhan Malik", role: "manager", is_active: true, created_at: now },
    { id: crypto.randomUUID(), user_id: crypto.randomUUID(), email: "floor@demo.textile-erp.dev", full_name: "Muhammad Aslam", role: "operator", is_active: true, created_at: now },
    { id: crypto.randomUUID(), user_id: crypto.randomUUID(), email: "accounts@demo.textile-erp.dev", full_name: "Ayesha Siddiqui", role: "accountant", is_active: true, created_at: now },
  ];

  // suppliers
  const chenab = createSupplier(s, { name: "Chenab Yarn Traders", contact_person: "Imran Butt", phone: "+92 41 555 0101", city: "Faisalabad", payment_terms: "30 days", notes: "Primary cotton yarn source" });
  const ravi = createSupplier(s, { name: "Ravi Poly Fibres", contact_person: "Sana Qureshi", phone: "+92 42 555 0144", city: "Lahore", payment_terms: "Advance" });
  const lyallpur = createSupplier(s, { name: "Lyallpur Greige House", contact_person: "Tariq Javed", phone: "+92 41 555 0190", city: "Faisalabad", payment_terms: "45 days" });
  const seaview = createSupplier(s, { name: "Seaview Textile Export Co.", contact_person: "Li Wen", country: "CN", city: "Ningbo", payment_terms: "90 days LC at sight" });
  const anatolia = createSupplier(s, { name: "Anatolia Denim Mills", contact_person: "Emre Kaya", country: "TR", city: "Denizli", payment_terms: "60 days LC" });

  // yarn
  const c20 = createYarn(s, { yarn_count: "20/1", fiber_type: "cotton", color_name: "Raw White", supplier_id: chenab.id, unit_cost_per_kg: "890", reorder_level_kg: "1500", opening_stock_kg: "4200" });
  const c30 = createYarn(s, { yarn_count: "30/1", fiber_type: "cotton", color_name: "Combed", supplier_id: chenab.id, unit_cost_per_kg: "1040", reorder_level_kg: "600", opening_stock_kg: "2900" });
  const p150 = createYarn(s, { yarn_count: "150D", fiber_type: "polyester", color_name: "Optical White", supplier_id: ravi.id, unit_cost_per_kg: "610", reorder_level_kg: "800", opening_stock_kg: "650" });
  createYarn(s, { yarn_count: "24/1", fiber_type: "blended", color_name: "60/40 CVC Grey Melange", supplier_id: ravi.id, unit_cost_per_kg: "760", reorder_level_kg: "600", opening_stock_kg: "2300" });
  postTxn(s, c20.id, { transaction_type: "receipt", quantity_kg: "1800", unit_cost: "905", transaction_date: daysAgo(20), notes: "GRN 4471 · truck LES-2291" });
  postTxn(s, c30.id, { transaction_type: "wastage", quantity_kg: "35", transaction_date: daysAgo(9), notes: "Moisture damage, bay 3" });

  // in-house woven / knitted lots — no supplier: the looms below made them. The lot
  // date is when the last piece was doffed, so production always precedes its rolls.
  const woven1 = createLot(s, { lot_number: "FSD-W-2409", fabric_type: "100% Cotton Poplin 40x40", fabric_category: "woven", color: "Greige", gsm: "115", width_cm: "147", total_meters: "2400", received_date: daysAgo(8), cost_per_meter: "312", notes: "Woven in-house · looms L-07 / L-12" });
  const rollsW1 = addRollsBulk(s, woven1.id, { prefix: "W2409-", count: 24, length_meters: "100", weight_kg: "17.2", grade: "A", location: "Rack A-3" });
  const woven2 = createLot(s, { lot_number: "FSD-W-2410", fabric_type: "PC Twill 2/1 (cotton warp, poly weft)", fabric_category: "woven", color: "Natural", gsm: "190", width_cm: "152", total_meters: "1800", received_date: daysAgo(1), cost_per_meter: "398", notes: "Woven in-house · looms L-03 / L-07 / L-12 / L-21" });
  const rollsW2 = addRollsBulk(s, woven2.id, { prefix: "W2410-", count: 18, length_meters: "100", weight_kg: "28.9", location: "Rack B-1" });
  const knit1 = createLot(s, { lot_number: "FSD-K-0931", fabric_type: "Single Jersey 30s", fabric_category: "knitted", color: "Raw White", gsm: "160", width_cm: "183", total_meters: "1500", received_date: daysAgo(2), cost_per_meter: "265", notes: "Knitted in-house · machines KM-2 / KM-4" });
  addRollsBulk(s, knit1.id, { prefix: "K0931-", count: 12, length_meters: "125", weight_kg: "36.4", location: "Bay 2" });
  // purchased greige
  const greige = createLot(s, { lot_number: "LGH-G-2412", fabric_type: "Cotton Lawn 60x60", fabric_category: "woven", color: "Greige", gsm: "95", width_cm: "142", total_meters: "1200", received_date: daysAgo(16), supplier_id: lyallpur.id, cost_per_meter: "285", notes: "Bill 7731 · 45 days" });
  const rollsG = addRollsBulk(s, greige.id, { prefix: "G2412-", count: 12, length_meters: "100", weight_kg: "14.1", location: "Rack C-2" });
  const old = createLot(s, { lot_number: "FSD-W-2305", fabric_type: "Cotton Canvas 10oz", fabric_category: "woven", color: "Khaki", gsm: "340", width_cm: "150", total_meters: "900", received_date: daysAgo(120), supplier_id: lyallpur.id, cost_per_meter: "540", notes: "Order cancelled by buyer" });
  addRollsBulk(s, old.id, { prefix: "W2305-", count: 9, length_meters: "100", location: "Rack D-7" });
  const unv = createLot(s, { lot_number: "FSD-W-2411", fabric_type: "Cambric 60x60", color: "Greige", total_meters: "600", received_date: daysAgo(2), supplier: "Walk-in trader (Jhang Bazar)" });
  addRollsBulk(s, unv.id, { prefix: "W2411-", count: 6, length_meters: "100", location: "Receiving" });

  // Rolls arrive with their lot, not "today" — keeps traceability timelines honest.
  for (const r of s.rolls) r.created_at = `${s.lots.find((l) => l.id === r.lot_id)!.received_date}T09:00:00.000Z`;

  // production
  const plan: [number, string, string, number, "A" | "B" | "C", number][] = [
    [14, "L-07", "day", 420, "A", 118], [13, "L-07", "night", 395, "A", 111], [12, "L-12", "day", 380, "B", 108],
    [11, "L-12", "night", 360, "C", 104], [10, "L-12", "day", 402, "B", 113], [9, "L-07", "day", 430, "A", 120],
    [8, "L-12", "night", 355, "A", 101], [6, "L-03", "day", 410, "A", 116], [5, "L-07", "night", 388, "A", 109],
    [4, "L-12", "day", 372, "B", 105], [3, "L-03", "night", 400, "A", 113], [2, "L-07", "day", 425, "A", 119],
    [1, "L-03", "day", 418, "A", 117],
  ];
  const ops: Record<string, string> = { "L-07": "Muhammad Aslam", "L-12": "Shahid Iqbal", "L-03": "Nadeem Akhtar" };
  for (const [d, loom, shift, m, g, kg] of plan)
    logWeaving(s, { lot_id: d >= 8 ? woven1.id : woven2.id, loom_number: loom, operator_name: ops[loom], session_date: daysAgo(d), shift, picks_per_inch: 72, ends_per_inch: 132, produced_meters: String(m), quality_grade: g, yarn_type_id: c20.id, yarn_consumed_kg: String(kg) });
  for (const [d, kg] of [[12, 60], [9, 55], [6, 62], [3, 58], [1, 57]])
    logWeaving(s, { lot_id: woven2.id, loom_number: "L-21", operator_name: "Asif Mehmood", session_date: daysAgo(d), shift: "day", produced_meters: "210", quality_grade: "A", yarn_type_id: p150.id, yarn_consumed_kg: String(kg) });
  for (const [d, machine, out, g] of [[8, "KM-2", 410, "A"], [7, "KM-2", 395, "A"], [6, "KM-4", 380, "B"], [4, "KM-4", 402, "A"], [2, "KM-2", 415, "A"]] as const)
    logKnitting(s, { yarn_type_id: c30.id, lot_id: knit1.id, machine_number: machine, operator_name: "Rizwan Ali", session_date: daysAgo(d), shift: "day", gauge: 24, course_count: 18, produced_kg: String(out), yarn_consumed_kg: (out * 1.04).toFixed(3), quality_grade: g });

  // issuances
  const iss: [typeof rollsW1[number], string, string | null, string | null, number][] = [
    [rollsW1[0], "cutting", null, "PO-SIA-1182", 6], [rollsW1[1], "cutting", null, "PO-SIA-1182", 6],
    [rollsW1[2], "cutting", "60", "PO-SIA-1182", 5], [rollsW1[3], "sampling", "12", null, 4],
    [rollsW1[4], "cutting", null, "PO-KHI-0417", 3], [rollsW2[0], "dyeing", null, "DY-0092", 0],
    [rollsW2[1], "dyeing", "45", "DY-0092", 0], [rollsG[0], "stitching", null, "PO-LHR-0233", 9],
    [rollsG[1], "stitching", "70", "PO-LHR-0233", 4],
  ];
  for (const [roll, dept, meters, ref, d] of iss)
    issueRoll(s, roll.id, { issued_to_department: dept, issued_meters: meters, cmt_order_reference: ref, issued_date: daysAgo(d) });

  // imports
  const wh = createImport(s, { lc_number: "MCB-LC-26-0712", shipment_reference: "COSU6218841", supplier_id: seaview.id, fabric_type: "Polyester Peach Skin 75D", quantity_meters: "6000", quantity_kg: "540", currency: "USD", fob_cost: "7800", exchange_rate: "279.35", freight_cost_pkr: "186000", insurance_cost_pkr: "21400", duties_paid_pkr: "512000", lc_opened_date: daysAgo(64) });
  updateImport(s, wh.id, { status: "cleared", clearance_date: daysAgo(22) });
  const impLot = receiveImport(s, wh.id, { lot_number: "IMP-CN-0712", color: "Navy", warehouse_arrival_date: daysAgo(19), roll_count: 12, location: "Import Bay 1" });
  for (const r of s.rolls.filter((x) => x.lot_id === impLot.id)) r.created_at = `${impLot.received_date}T09:00:00.000Z`;
  createImport(s, { lc_number: "HBL-LC-26-0803", supplier_id: anatolia.id, fabric_type: "Stretch Denim 11oz", quantity_meters: "4500", currency: "USD", fob_cost: "15750", exchange_rate: "280.10", lc_opened_date: daysAgo(52), notes: "Vessel rerouted via Jebel Ali" });
  const port = createImport(s, { lc_number: "MCB-LC-26-0829", shipment_reference: "MSKU7730214", supplier_id: seaview.id, fabric_type: "Nylon Taslan 228T", quantity_meters: "3000", currency: "USD", fob_cost: "4200", exchange_rate: "280.40", freight_cost_pkr: "98000", duties_paid_pkr: "276000", port_of_entry: "Karachi", lc_opened_date: daysAgo(35) });
  updateImport(s, port.id, { status: "cleared", clearance_date: daysAgo(10) });
  createImport(s, { lc_number: "UBL-LC-26-0915", supplier_id: anatolia.id, fabric_type: "Rigid Denim 13.5oz", quantity_meters: "3200", currency: "EUR", fob_cost: "12160", exchange_rate: "302.80", lc_opened_date: daysAgo(15) });

  return s;
}

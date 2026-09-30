// Mirrors backend/app/schemas. Decimals arrive from the API as strings;
// use num() from lib/utils to do arithmetic on them.
export type Dec = string;

export interface Tenant {
  id: string;
  org_name: string;
  slug: string;
  currency: string;
  industry?: string | null;
  is_demo?: boolean;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
}

export type Role = "owner" | "manager" | "operator" | "accountant";

export interface Token {
  access_token: string;
  token_type: string;
  user: User;
  tenant: Tenant;
}

export interface Me extends User {
  permissions: string[];
  tenant: Tenant;
}

interface Row {
  id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string | null;
}

export type LotStatus = "pending" | "in_stock" | "partially_consumed" | "fully_consumed";
export type RollStatus = "available" | "reserved" | "issued" | "consumed";
export type FabricCategory = "woven" | "knitted" | "imported" | "yarn_fabric";
export type ImportStatus = "in_transit" | "cleared" | "warehoused" | "consumed";
export type Department = "cutting" | "stitching" | "finishing" | "packing" | "dyeing" | "sampling" | "sale";
export type Grade = "A" | "B" | "C";

export interface Supplier extends Row {
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string;
  payment_terms: string | null;
  notes: string | null;
}

export interface SupplierDetail extends Supplier {
  stats: {
    lots_received: number;
    meters_received: Dec;
    purchase_value_pkr: Dec;
    open_imports: number;
    yarn_types_supplied: number;
  };
}

export interface FabricLot extends Row {
  lot_number: string;
  fabric_type: string;
  fabric_category: FabricCategory;
  color: string;
  gsm: Dec | null;
  width_cm: Dec | null;
  total_meters: Dec;
  received_date: string;
  supplier: string | null;
  supplier_id: string | null;
  import_id: string | null;
  cost_per_meter: Dec | null;
  status: LotStatus;
  notes: string | null;
}

export interface FabricRoll extends Row {
  lot_id: string;
  roll_number: string;
  length_meters: Dec;
  issued_meters: Dec;
  remaining_meters: Dec;
  weight_kg: Dec | null;
  grade: Grade | null;
  status: RollStatus;
  location: string | null;
}

export interface FabricLotSummary {
  lot_id: string;
  roll_count: number;
  total_meters: Dec;
  meters_available: Dec;
  meters_reserved: Dec;
  meters_consumed: Dec;
  meters_issued: Dec;
  stock_value_pkr: Dec | null;
}

export interface Issuance extends Row {
  roll_id: string;
  issued_to_department: Department;
  cmt_order_reference: string | null;
  issued_meters: Dec;
  issued_kg: Dec | null;
  issued_date: string;
  issued_by: string;
  notes: string | null;
}

export interface YarnType extends Row {
  yarn_count: string;
  ply: number;
  fiber_type: string;
  color_name: string | null;
  supplier_id: string | null;
  unit_cost_per_kg: Dec;
  reorder_level_kg: Dec;
  current_stock_kg: Dec;
  notes: string | null;
}

export interface YarnTransaction extends Row {
  yarn_type_id: string;
  transaction_type: "receipt" | "issue" | "adjustment" | "wastage";
  direction: "in" | "out";
  quantity_kg: Dec;
  balance_after_kg: Dec;
  unit_cost: Dec | null;
  total_cost: Dec | null;
  lot_reference: string | null;
  order_reference: string | null;
  source: string;
  transaction_date: string;
  notes: string | null;
  created_by: string;
}

export interface WeavingSession extends Row {
  lot_id: string;
  loom_number: string;
  operator_name: string | null;
  session_date: string;
  shift: string;
  start_time: string | null;
  end_time: string | null;
  picks_per_inch: number | null;
  ends_per_inch: number | null;
  produced_meters: Dec;
  produced_kg: Dec | null;
  quality_grade: Grade;
  yarn_type_id: string | null;
  yarn_consumed_kg: Dec | null;
  yarn_transaction_id: string | null;
  notes: string | null;
}

export interface KnittingSession extends Row {
  yarn_type_id: string;
  lot_id: string | null;
  machine_number: string;
  operator_name: string | null;
  session_date: string;
  shift: string;
  gauge: number | null;
  course_count: number | null;
  produced_kg: Dec;
  yarn_consumed_kg: Dec;
  quality_grade: Grade;
  yarn_transaction_id: string | null;
  notes: string | null;
}

export interface FabricImport extends Row {
  lc_number: string;
  shipment_reference: string | null;
  supplier_id: string;
  fabric_type: string;
  quantity_meters: Dec;
  quantity_kg: Dec | null;
  currency: string;
  fob_cost: Dec;
  exchange_rate: Dec;
  freight_cost_pkr: Dec;
  insurance_cost_pkr: Dec;
  duties_paid_pkr: Dec;
  total_landed_cost_pkr: Dec;
  landed_cost_per_meter_pkr: Dec;
  port_of_entry: string;
  lc_opened_date: string;
  clearance_date: string | null;
  warehouse_arrival_date: string | null;
  status: ImportStatus;
  notes: string | null;
}

export interface InventorySummary {
  fabric: { fabric_category: string; lots: number; rolls_available: number; meters_available: Dec; stock_value_pkr: Dec }[];
  yarn: { yarn_types: number; stock_kg: Dec; stock_value_pkr: Dec; below_reorder: number };
  total_value_pkr: Dec;
  unvalued_meters: Dec;
}

export interface ConsumptionReport {
  date_from: string;
  date_to: string;
  meters_received: Dec;
  meters_issued: Dec;
  issued_by_department: { department: string; meters: Dec }[];
  yarn_in_kg: Dec;
  yarn_out_kg: Dec;
}

export interface MachineOutput {
  machine: string;
  sessions: number;
  output: Dec;
  grade_a_pct: Dec;
}

export interface ProductionReport {
  date_from: string;
  date_to: string;
  weaving_meters: Dec;
  knitting_kg: Dec;
  looms: MachineOutput[];
  knitting_machines: MachineOutput[];
  grade_mix: Record<string, number>;
}

export interface LowStockItem {
  yarn_type_id: string;
  label: string;
  current_stock_kg: Dec;
  reorder_level_kg: Dec;
  shortfall_kg: Dec;
}

export interface Insight {
  rule: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  evidence: Record<string, string>;
  href: string | null;
}

export interface InsightsReport {
  generated_at: string;
  rules_evaluated: number;
  insights: Insight[];
}

export interface TraceEvent {
  at: string;
  kind: "import" | "lot" | "weaving" | "knitting" | "roll" | "issue";
  title: string;
  detail: string | null;
}

export interface RollTrace {
  roll: FabricRoll;
  lot: FabricLot;
  supplier: Supplier | null;
  fabric_import: FabricImport | null;
  weaving_sessions: WeavingSession[];
  knitting_sessions: KnittingSession[];
  issuances: Issuance[];
  timeline: TraceEvent[];
}

export interface TeamMember {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

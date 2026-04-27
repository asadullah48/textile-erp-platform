export interface Tenant {
  id: string;
  org_name: string;
  slug: string;
  currency: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

export interface Token {
  access_token: string;
  token_type: string;
  user: User;
  tenant: Tenant;
}

export interface FabricLot {
  id: string;
  tenant_id: string;
  lot_number: string;
  fabric_type: string;
  color: string;
  gsm: number | null;
  width_cm: number | null;
  total_meters: number;
  received_date: string;
  supplier: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface FabricRoll {
  id: string;
  tenant_id: string;
  lot_id: string;
  roll_number: string;
  length_meters: number;
  weight_kg: number | null;
  status: string;
  location: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface FabricLotSummary {
  lot_id: string;
  roll_count: number;
  total_meters: number;
  meters_available: number;
  meters_reserved: number;
  meters_consumed: number;
}

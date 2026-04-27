import api from "@/lib/api";
import type { FabricLot, FabricRoll, FabricLotSummary } from "@/types";

export type FabricLotCreate = Omit<FabricLot, "id" | "tenant_id" | "created_at" | "updated_at">;
export type FabricLotUpdate = Partial<FabricLotCreate>;
export type FabricRollCreate = Omit<FabricRoll, "id" | "tenant_id" | "lot_id" | "created_at" | "updated_at">;
export type FabricRollUpdate = Partial<FabricRollCreate>;

const BASE = "/api/v1";

export const fabricService = {
  // Lots
  getLots: () => api.get<FabricLot[]>(`${BASE}/fabric-lots`).then((r) => r.data),
  createLot: (data: FabricLotCreate) => api.post<FabricLot>(`${BASE}/fabric-lots`, data).then((r) => r.data),
  getLot: (id: string) => api.get<FabricLot>(`${BASE}/fabric-lots/${id}`).then((r) => r.data),
  updateLot: (id: string, data: FabricLotUpdate) =>
    api.patch<FabricLot>(`${BASE}/fabric-lots/${id}`, data).then((r) => r.data),
  deleteLot: (id: string) => api.delete(`${BASE}/fabric-lots/${id}`),

  // Rolls (standalone)
  getRolls: (lotId?: string) =>
    lotId
      ? api.get<FabricRoll[]>(`${BASE}/fabric-lots/${lotId}/rolls`).then((r) => r.data)
      : api.get<FabricRoll[]>(`${BASE}/fabric-rolls`).then((r) => r.data),
  createRoll: (lotId: string, data: FabricRollCreate) =>
    api.post<FabricRoll>(`${BASE}/fabric-lots/${lotId}/rolls`, data).then((r) => r.data),
  getRoll: (id: string) => api.get<FabricRoll>(`${BASE}/fabric-rolls/${id}`).then((r) => r.data),
  updateRoll: (id: string, data: FabricRollUpdate) =>
    api.patch<FabricRoll>(`${BASE}/fabric-rolls/${id}`, data).then((r) => r.data),
  deleteRoll: (id: string) => api.delete(`${BASE}/fabric-rolls/${id}`),

  // Summary
  getLotSummary: (lotId: string) =>
    api.get<FabricLotSummary>(`${BASE}/fabric-lots/${lotId}/summary`).then((r) => r.data),
};

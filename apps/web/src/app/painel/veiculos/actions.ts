"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mensagemDeErroRpc } from "../../../lib/rpc-errors";
import { createClient } from "../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../lib/supabase/organization-roles";

export type VeiculoState = { error: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = new Set(["admin", "manager", "support"]);
function value(data: FormData, key: string, max: number) { return String(data.get(key) ?? "").trim().slice(0, max); }

export async function criarVeiculo(_prev: VeiculoState, formData: FormData): Promise<VeiculoState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sua sessão expirou. Entre novamente." };
  const { roles, error: rolesError } = await getCurrentOrganizationRoles(supabase, user.id);
  if (rolesError || !roles.some((role) => ROLES.has(role))) return { error: "Seu perfil não pode cadastrar veículos." };

  const requestId = value(formData, "request_id", 36);
  const plate = value(formData, "plate", 12).toUpperCase();
  const vehicleType = value(formData, "vehicle_type", 24);
  const makeModel = value(formData, "make_model", 120);
  const capacity = value(formData, "capacity_description", 160);
  if (!UUID.test(requestId)) return { error: "Atualize a página e tente novamente." };
  if (!/^[A-Z]{3}[ -]?[0-9][A-Z0-9][0-9]{2}$/.test(plate)) return { error: "Informe uma placa válida, por exemplo ABC-1234 ou ABC1D23." };
  if (!["car", "motorcycle", "truck"].includes(vehicleType)) return { error: "Selecione a categoria do veículo." };
  const capacityKg = Number(value(formData, "capacity_kg", 12).replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(capacityKg) || capacityKg <= 0 || capacityKg > 100000) return { error: "Informe a capacidade de carga em kg (maior que zero)." };

  const { error } = await supabase.rpc("create_vehicle", {
    p_request_id: requestId,
    p_plate: plate,
    p_vehicle_type: vehicleType,
    p_make_model: makeModel || null,
    p_capacity_description: capacity || null,
    p_capacity_kg: capacityKg,
  });
  if (error) return { error: mensagemDeErroRpc(error.message) };
  revalidatePath("/painel/veiculos");
  revalidatePath("/painel/despacho");
  redirect("/painel/veiculos?cadastro=concluido");
}

export type EditarVeiculoState = { error: string | null; success: string | null };

export async function atualizarVeiculo(_prev: EditarVeiculoState, formData: FormData): Promise<EditarVeiculoState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sua sessão expirou. Entre novamente.", success: null };
  const { roles, error: rolesError } = await getCurrentOrganizationRoles(supabase, user.id);
  if (rolesError || !roles.some((role) => ROLES.has(role))) return { error: "Seu perfil não pode editar veículos.", success: null };

  const vehicleId = value(formData, "vehicle_id", 36);
  const makeModel = value(formData, "make_model", 120);
  const description = value(formData, "capacity_description", 160);
  const reason = value(formData, "reason", 500);
  const active = formData.get("active") === "on";
  const capacityKg = Number(value(formData, "capacity_kg", 12).replace(/\./g, "").replace(",", "."));
  if (!UUID.test(vehicleId)) return { error: "Veículo inválido.", success: null };
  if (!Number.isFinite(capacityKg) || capacityKg <= 0 || capacityKg > 100000) return { error: "Informe a capacidade de carga em kg (maior que zero).", success: null };
  if (!reason) return { error: "Informe o motivo da alteração.", success: null };

  const { error } = await supabase.rpc("update_vehicle", {
    p_vehicle_id: vehicleId,
    p_make_model: makeModel || null,
    p_capacity_kg: capacityKg,
    p_capacity_description: description || null,
    p_active: active,
    p_reason: reason,
  });
  if (error) {
    if (error.message.includes("vehicle_has_active_trip")) return { error: "Este veículo está em uma viagem ativa. Conclua ou reatribua a viagem antes de desativá-lo.", success: null };
    return { error: mensagemDeErroRpc(error.message), success: null };
  }
  revalidatePath("/painel/veiculos");
  revalidatePath("/painel/despacho");
  return { error: null, success: "Veículo atualizado." };
}

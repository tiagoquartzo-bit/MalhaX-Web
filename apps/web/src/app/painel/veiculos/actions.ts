"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mensagemDeErroRpc } from "../../../lib/rpc-errors";
import { createClient } from "../../../lib/supabase/server";

export type VeiculoState = { error: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = new Set(["admin", "manager", "support"]);
function value(data: FormData, key: string, max: number) { return String(data.get(key) ?? "").trim().slice(0, max); }

export async function criarVeiculo(_prev: VeiculoState, formData: FormData): Promise<VeiculoState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sua sessão expirou. Entre novamente." };
  const { data: roles, error: rolesError } = await supabase.from("organization_member_roles").select("role").eq("user_id", user.id);
  if (rolesError || !roles?.some(({ role }) => ROLES.has(role))) return { error: "Seu perfil não pode cadastrar veículos." };

  const requestId = value(formData, "request_id", 36);
  const plate = value(formData, "plate", 12).toUpperCase();
  const vehicleType = value(formData, "vehicle_type", 24);
  const makeModel = value(formData, "make_model", 120);
  const capacity = value(formData, "capacity_description", 160);
  if (!UUID.test(requestId)) return { error: "Atualize a página e tente novamente." };
  if (!/^[A-Z]{3}[ -]?[0-9][A-Z0-9][0-9]{2}$/.test(plate)) return { error: "Informe uma placa válida, por exemplo ABC-1234 ou ABC1D23." };
  if (!["car", "motorcycle", "truck"].includes(vehicleType)) return { error: "Selecione a categoria do veículo." };

  const { error } = await supabase.rpc("create_vehicle", {
    p_request_id: requestId,
    p_plate: plate,
    p_vehicle_type: vehicleType,
    p_make_model: makeModel || null,
    p_capacity_description: capacity || null,
  });
  if (error) return { error: mensagemDeErroRpc(error.message) };
  revalidatePath("/painel/veiculos");
  revalidatePath("/painel/despacho");
  redirect("/painel/veiculos?cadastro=concluido");
}

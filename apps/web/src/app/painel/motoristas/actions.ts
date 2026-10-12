"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";

export type MotoristaState = { error: string | null };
const INVITE_ROLES = new Set(["admin", "manager", "support"]);
const STATUS_ROLES = new Set(["admin", "manager", "support"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS_DESTINOS = new Set(["active", "suspended", "inactive", "rejected"]);

async function getAuthorizedRoles(allowed: Set<string>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "Sua sessão expirou. Entre novamente." };
  const { data: rows, error } = await supabase
    .from("organization_member_roles").select("role").eq("user_id", user.id);
  if (error || !rows?.some(({ role }) => allowed.has(role))) {
    return { supabase, error: "Seu perfil não tem permissão para esta ação." };
  }
  return { supabase, error: null };
}

export async function convidarMotorista(_prev: MotoristaState, formData: FormData): Promise<MotoristaState> {
  const { supabase, error: authError } = await getAuthorizedRoles(INVITE_ROLES);
  if (authError) return { error: authError };

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  if (fullName.length > 120 || fullName.split(/\s+/).filter(Boolean).length < 2) {
    return { error: "Informe nome e sobrenome do motorista." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || phone.length > 32) {
    return { error: "Revise o e-mail e o telefone informados." };
  }

  const { data, error } = await supabase.functions.invoke("invite-driver", {
    body: { full_name: fullName, email, phone: phone || null },
  });
  if (error || data?.status !== "invitation_sent") {
    return { error: "Não foi possível enviar o convite. Verifique se o serviço de e-mail local está disponível e tente novamente." };
  }

  revalidatePath("/painel/motoristas");
  redirect("/painel/motoristas?convite=enviado");
}

export async function alterarStatusMotorista(_prev: MotoristaState, formData: FormData): Promise<MotoristaState> {
  const { supabase, error: authError } = await getAuthorizedRoles(STATUS_ROLES);
  if (authError) return { error: authError };

  const driverId = String(formData.get("driver_id") ?? "");
  const status = String(formData.get("new_status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!UUID.test(driverId) || !STATUS_DESTINOS.has(status)) return { error: "Ação inválida. Atualize a página e tente novamente." };
  if (reason.length < 5 || reason.length > 500) return { error: "Informe um motivo com pelo menos 5 caracteres." };

  const { error } = await supabase.rpc("set_driver_status", {
    p_driver_id: driverId,
    p_new_status: status,
    p_reason: reason,
  });
  if (error) {
    const message = error.message;
    if (message.includes("driver_email_not_confirmed")) return { error: "O motorista precisa confirmar o e-mail antes da ativação." };
    if (message.includes("driver_has_active_trip")) return { error: "Motorista tem viagem ativa; conclua ou reassigne antes de alterar o acesso." };
    if (message.includes("invalid_driver_status_transition")) return { error: "Essa mudança de situação não é permitida." };
    if (message.includes("driver_not_found")) return { error: "Motorista não encontrado nesta empresa." };
    if (message.includes("forbidden")) return { error: "Seu perfil não pode alterar a situação do motorista." };
    return { error: "Não foi possível alterar a situação. Atualize a lista e tente novamente." };
  }

  revalidatePath("/painel/motoristas");
  revalidatePath("/painel");
  redirect("/painel/motoristas?status=atualizado");
}

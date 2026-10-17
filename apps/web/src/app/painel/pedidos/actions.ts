"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../lib/supabase/organization-roles";

export type CancelOrderState = { error: string | null; success: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function cancelarPedido(_prev: CancelOrderState, formData: FormData): Promise<CancelOrderState> {
  const orderId = String(formData.get("order_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!UUID.test(orderId)) return { error: "Pedido inválido.", success: null };
  if (!reason || reason.length > 500) return { error: "Informe o motivo do cancelamento (até 500 caracteres).", success: null };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sua sessão expirou. Entre novamente.", success: null };
  const { roles } = await getCurrentOrganizationRoles(supabase, user.id);
  if (!roles.some((role) => ["admin", "manager", "dispatcher"].includes(role))) return { error: "Seu perfil não pode cancelar pedidos.", success: null };
  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId, p_reason: reason });
  if (error) {
    if (error.message.includes("order_already_in_execution")) return { error: "O pedido já tem parada despachada ou volume coletado. Cancele a viagem primeiro ou trate pelo fluxo de devolução.", success: null };
    return { error: "Não foi possível cancelar o pedido. Atualize a página e tente novamente.", success: null };
  }
  revalidatePath("/painel/pedidos");
  revalidatePath("/painel/despacho");
  revalidatePath("/painel/paradas");
  return { error: null, success: "Pedido cancelado." };
}

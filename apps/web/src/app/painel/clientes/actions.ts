"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { mensagemDeErroRpc } from "../../../lib/rpc-errors";
import { createClient } from "../../../lib/supabase/server";

export type ClienteState = { error: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAPEIS_QUE_CADASTRAM = new Set(["admin", "manager", "dispatcher", "support"]);

function value(formData: FormData, key: string, maxLength: number): string {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

export async function criarCliente(_prev: ClienteState, formData: FormData): Promise<ClienteState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sua sessão expirou. Entre novamente." };

  const { data: roles, error: rolesError } = await supabase
    .from("organization_member_roles").select("role").eq("user_id", user.id);
  if (rolesError || !roles?.some(({ role }) => PAPEIS_QUE_CADASTRAM.has(role))) {
    return { error: "Seu perfil não pode cadastrar clientes." };
  }

  const requestId = value(formData, "request_id", 36);
  const name = value(formData, "name", 120);
  const contactName = value(formData, "contact_name", 120);
  const phone = value(formData, "phone", 32);
  const email = value(formData, "email", 254).toLowerCase();
  if (!UUID.test(requestId)) return { error: "Atualize a página e tente novamente." };
  if (!name) return { error: "Informe o nome do cliente." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Informe um e-mail válido." };

  const { error } = await supabase.rpc("create_client", {
    p_request_id: requestId,
    p_name: name,
    p_contact_name: contactName || null,
    p_phone: phone || null,
    p_email: email || null,
  });
  if (error) return { error: mensagemDeErroRpc(error.message) };

  revalidatePath("/painel");
  revalidatePath("/painel/clientes");
  revalidatePath("/painel/novo-pedido");
  redirect("/painel/clientes?cadastro=concluido");
}

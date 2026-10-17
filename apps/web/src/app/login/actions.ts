"use server";

import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";
import { hasBackofficeAccess, getOrganizationAccess } from "../../lib/auth/organization-access";

export type LoginState = { error: string | null };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Informe e-mail e senha." };
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { error: 'Autenticação indisponível. Configure o Supabase para habilitar o login.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Mensagem genérica de propósito: não revela se o e-mail existe.
    return { error: "E-mail ou senha inválidos." };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    await supabase.auth.signOut();
    return { error: "Não foi possível confirmar sua sessão. Entre novamente." };
  }

  const access = await getOrganizationAccess(supabase, user.id);
  if (!access.loaded || !access.organizationId) {
    await supabase.auth.signOut();
    return { error: "Não foi possível validar o vínculo da sua conta com a empresa. Tente novamente ou peça ajuda ao administrador." };
  }

  if (hasBackofficeAccess(access.roles)) {
    redirect("/painel");
  }

  if (access.roles.includes("driver")) {
    redirect("/acesso-motorista");
  }

  await supabase.auth.signOut();
  return { error: "Sua conta ainda não tem um perfil ativo na empresa. Peça ao administrador para conferir seu acesso." };
}

export async function signOut(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return;
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

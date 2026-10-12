"use server";

import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";

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
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Mensagem genérica de propósito: não revela se o e-mail existe.
    return { error: "E-mail ou senha inválidos." };
  }

  if (process.env.NODE_ENV === "development") {
    redirect("/dev-preview/controle");
  }

  const { data: roleRows, error: roleError } = await supabase
    .from("organization_member_roles")
    .select("role")
    .eq("user_id", data.user.id);

  if (roleError) {
    return { error: "Não foi possível identificar o perfil da conta. Tente novamente." };
  }

  const roles = (roleRows ?? []).map((row) => row.role as string);
  const hasDriverRole = roles.includes("driver");
  const hasOperationsRole = roles.some((role) =>
    ["admin", "manager", "dispatcher", "support", "finance"].includes(role),
  );

  if (hasDriverRole && !hasOperationsRole) {
    redirect("/motorista");
  }

  if (hasOperationsRole) {
    redirect("/painel");
  }

  return { error: "Esta conta ainda não tem um perfil de motorista ou acesso operacional." };
}

export async function signOut(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return;
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

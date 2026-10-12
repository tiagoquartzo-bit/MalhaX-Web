"use server";

import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";

export type PasswordState = { error: string | null };

export async function setInitialPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (password.length < 12 || password.length > 128) {
    return { error: "Use uma senha com pelo menos 12 caracteres." };
  }
  if (password !== confirmation) {
    return { error: "As senhas não coincidem." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Não foi possível salvar a senha. Tente novamente." };
  redirect("/acesso-indisponivel");
}

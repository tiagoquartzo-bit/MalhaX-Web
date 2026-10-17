import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../lib/supabase/organization-roles";

/** Garante usuário do financeiro (admin, gestor ou financeiro) e devolve o cliente Supabase. */
export async function financeiroOuRedireciona() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { roles } = await getCurrentOrganizationRoles(supabase, user.id);
  if (!roles.some((role) => ["admin", "manager", "finance"].includes(role))) redirect("/painel");
  return supabase;
}

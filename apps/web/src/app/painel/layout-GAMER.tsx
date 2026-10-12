import type { ReactNode } from "react";
import { createClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";

const PANEL_ROLES = new Set(["admin", "manager", "dispatcher", "support", "finance"]);

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roleRows, error } = await supabase
    .from("organization_member_roles")
    .select("role")
    .eq("user_id", user.id);
  const hasPanelAccess = !error && (roleRows ?? []).some(({ role }) => PANEL_ROLES.has(String(role)));

  if (!hasPanelAccess) {
    return <main style={{ maxWidth: 560, margin: "10vh auto", padding: 24, color: "#172336" }}>
      <h1>Acesso restrito</h1>
      <p>Seu perfil não tem acesso aos módulos operacionais.</p>
      <a href="/login">Voltar ao login</a>
    </main>;
  }

  return <>{children}</>;
}

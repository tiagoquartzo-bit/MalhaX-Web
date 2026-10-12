import { redirect } from "next/navigation";

import { ControlTower } from "../dev-preview/controle/control-tower-GAMER";
import { createClient } from "../../lib/supabase/server";

const PAPEIS_OPERACAO = ["admin", "manager", "dispatcher", "support", "finance"];

export default async function ControlePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: papeisRows } = await supabase
    .from("organization_member_roles")
    .select("role")
    .eq("user_id", user.id);

  const temAcessoOperacao = (papeisRows ?? []).some(({ role }) =>
    PAPEIS_OPERACAO.includes(String(role)),
  );

  if (!temAcessoOperacao) redirect("/login?error=acesso-restrito");

  return <ControlTower />;
}

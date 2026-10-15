import { redirect } from "next/navigation";

import { ControlTower } from "../dev-preview/controle/control-tower-GAMER";
import { createClient } from "../../lib/supabase/server";
import { getOrganizationAccess, hasBackofficeAccess } from "../../lib/auth/organization-access";
import { signOut } from "../login/actions";

export default async function ControlePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const access = await getOrganizationAccess(supabase, user.id);
  if (!access.loaded) {
    return <main style={{ maxWidth: 560, margin: "10vh auto", padding: 24 }}>
      <h1>Não foi possível confirmar seu acesso</h1>
      <p>Tente atualizar a página. Se o problema continuar, saia e entre novamente ou peça ajuda ao administrador.</p>
      <form action={signOut}><button type="submit">Sair</button></form>
    </main>;
  }
  if (access.roles.includes("driver") && !hasBackofficeAccess(access.roles)) redirect("/acesso-motorista");
  if (!hasBackofficeAccess(access.roles)) {
    return <main style={{ maxWidth: 560, margin: "10vh auto", padding: 24 }}>
      <h1>Acesso ao Backoffice não habilitado</h1>
      <p>Esta conta ainda não tem um perfil operacional ativo. Peça ao administrador da empresa para revisar seu acesso.</p>
      <form action={signOut}><button type="submit">Sair</button></form>
    </main>;
  }

  return <ControlTower />;
}

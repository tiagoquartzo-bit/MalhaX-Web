import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { BackofficeNav } from "./BackofficeNav";
import styles from "./backoffice.module.css";
import { signOut } from "../login/actions";
import { getOrganizationAccess, hasBackofficeAccess } from "../../lib/auth/organization-access";

export default async function BackofficeLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await getOrganizationAccess(supabase, user.id);
  if (!access.loaded) {
    return <main className={styles.accessDenied}>
      <span className={styles.accessMark} aria-hidden="true">X</span>
      <p className={styles.accessEyebrow}>MALHAX · ACESSO</p>
      <h1>Não foi possível confirmar seu acesso</h1>
      <p>Tente sair e entrar novamente. Se o problema continuar, peça ajuda ao administrador da empresa.</p>
      <form action={signOut}><button className={styles.accessButton} type="submit">Sair desta conta</button></form>
    </main>;
  }
  if (access.roles.includes("driver") && !hasBackofficeAccess(access.roles)) redirect("/acesso-motorista");
  if (!hasBackofficeAccess(access.roles)) {
    return <main className={styles.accessDenied}>
      <span className={styles.accessMark} aria-hidden="true">X</span>
      <p className={styles.accessEyebrow}>MALHAX · ACESSO</p>
      <h1>Acesso ao Backoffice não habilitado</h1>
      <p>Esta conta ainda não tem um perfil de gestão ou operação ativo. Motoristas acessam as viagens pelo aplicativo MalhaX. Peça ao administrador da empresa para revisar seu acesso.</p>
      <form action={signOut}><button className={styles.accessButton} type="submit">Sair desta conta</button></form>
    </main>;
  }

  const [{ data: profile }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  const roles = access.roles;
  const canOperate = roles.some((role) => ["admin", "manager", "dispatcher", "support"].includes(role));
  const canManage = roles.some((role) => ["admin", "manager", "support"].includes(role));
  const canDispatch = roles.some((role) => ["admin", "manager", "dispatcher"].includes(role));
  const canSeeFinance = roles.some((role) => ["admin", "manager", "finance"].includes(role));
  const roleNames: Record<string, string> = { admin: "Administrador", manager: "Gestor", dispatcher: "Despachante", support: "Suporte", finance: "Financeiro" };
  const roleLabel = roles.filter((role) => role in roleNames).map((role) => roleNames[role]).join(" · ") || "Equipe";
  return <div className={styles.shell}><BackofficeNav canOperate={canOperate} canManage={canManage} canDispatch={canDispatch} canSeeFinance={canSeeFinance} name={profile?.full_name ?? user?.email ?? "Equipe"} roleLabel={roleLabel} /><div className={styles.content}>{children}</div></div>;
}

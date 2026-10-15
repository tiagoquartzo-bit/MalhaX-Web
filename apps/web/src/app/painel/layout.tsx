import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { BackofficeNav } from "./BackofficeNav";
import styles from "./backoffice.module.css";
import { signOut } from "../login/actions";
import { OperationsQuickNav } from "./OperationsQuickNav";
import { getOrganizationAccess, hasBackofficeAccess } from "../../lib/auth/organization-access";

export default async function BackofficeLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await getOrganizationAccess(supabase, user.id);
  if (!access.loaded) {
    return <main style={{ maxWidth: 560, margin: "10vh auto", padding: 24 }}>
      <h1>Não foi possível confirmar seu acesso</h1>
      <p>Tente sair e entrar novamente. Se o problema continuar, peça ajuda ao administrador da empresa.</p>
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

  if (process.env.NODE_ENV === "development") {
    return <div className={styles.standaloneShell}>
      <header className={styles.standaloneHeader}>
        <Link href="/dev-preview/controle" className={styles.standaloneBrand}>
          <Image src="/malhax-symbol.svg" width={512} height={512} alt="" className={styles.standaloneSymbol} priority />
          <span className={styles.standaloneBrandWords}><span>Malha<span>X</span></span><small>LOGÍSTICA E TECNOLOGIA</small></span>
        </Link>
        <OperationsQuickNav />
        <div><Link href="/dev-preview/controle" className={styles.standaloneBack}>Voltar à Visão de controle</Link><form action={signOut}><button className={styles.signOut} type="submit">Sair</button></form></div>
      </header>
      <div className={styles.standaloneContent}>{children}</div>
    </div>;
  }
  const [{ data: profile }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  const roles = access.roles;
  const canOperate = roles.some((role) => ["admin", "manager", "dispatcher", "support"].includes(role));
  const canManage = roles.some((role) => ["admin", "manager", "support"].includes(role));
  const canDispatch = roles.some((role) => ["admin", "manager", "dispatcher"].includes(role));
  const canSeeFinance = canOperate || roles.includes("finance");
  return <div className={styles.shell}><BackofficeNav canOperate={canOperate} canManage={canManage} canDispatch={canDispatch} canSeeFinance={canSeeFinance} name={profile?.full_name ?? user?.email ?? "Equipe"} /><div className={styles.content}>{children}</div></div>;
}


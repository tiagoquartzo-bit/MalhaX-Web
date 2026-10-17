import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../lib/supabase/organization-roles";
import { ConviteMotoristaForm, DriverStatusForm } from "./forms";
import styles from "./drivers.module.css";
import { DriverContact } from "../DriverContact";

const VIEW_ROLES = new Set(["admin", "manager", "support"]);
const INVITE_ROLES = new Set(["admin", "manager", "support"]);
const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho", invited: "Convite enviado", pending_review: "Aguardando análise",
  active: "Ativo", rejected: "Reprovado", suspended: "Suspenso", inactive: "Inativo",
};
const STATUS_CLASS: Record<string, string> = {
  active: "active", invited: "pending", pending_review: "pending", draft: "pending",
  rejected: "blocked", suspended: "blocked", inactive: "muted",
};
const STATUS_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  draft: [{ value: "active", label: "Ativar" }, { value: "rejected", label: "Reprovar" }, { value: "inactive", label: "Inativar" }],
  invited: [{ value: "active", label: "Ativar após confirmação" }, { value: "rejected", label: "Reprovar" }, { value: "inactive", label: "Inativar" }],
  pending_review: [{ value: "active", label: "Aprovar e ativar" }, { value: "rejected", label: "Reprovar" }, { value: "inactive", label: "Inativar" }],
  active: [{ value: "suspended", label: "Suspender" }, { value: "inactive", label: "Inativar" }],
  suspended: [{ value: "active", label: "Reativar" }],
  inactive: [{ value: "active", label: "Reativar" }],
};

type Driver = { id: string; profile_id: string | null; status: string; created_at: string };
type Profile = { id: string; full_name: string; phone: string | null };

export default async function MotoristasPage({ searchParams }: { searchParams: Promise<{ convite?: string; status?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { roles } = await getCurrentOrganizationRoles(supabase, user.id);
  if (!roles.some((role) => VIEW_ROLES.has(role))) redirect("/painel");
  const canInvite = roles.some((role) => INVITE_ROLES.has(role));
  const canManageStatus = roles.some((role) => ["admin", "manager", "support"].includes(role));

  const { data: driverRows, error } = await supabase.from("drivers")
    .select("id, profile_id, status, created_at")
    .order("created_at", { ascending: false })
    .limit(500)
    .overrideTypes<Driver[], { merge: false }>();
  const driverIds = driverRows ?? [];
  const profileIds = [...new Set(driverIds.flatMap((driver) => driver.profile_id ? [driver.profile_id] : []))];
  const profileResult = profileIds.length
    ? await supabase.from("profiles").select("id, full_name, phone").in("id", profileIds).overrideTypes<Profile[], { merge: false }>()
    : { data: [] as Profile[], error: null };
  const nameByProfile = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile.full_name]));
  const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

  return (
    <main className={styles.page}>
      <p className={styles.back}><Link href="/painel">← Voltar ao painel</Link></p>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>MalhaX · acesso operacional</p>
        <h1>Motoristas</h1>
        <p>Convide, aprove, suspenda ou inative contas. Alterações de situação exigem justificativa e ficam auditadas.</p>
      </header>

      {params.convite === "enviado" ? <p className={styles.success} role="status">Convite enviado. A conta ficará pendente até a confirmação do e-mail.</p> : null}
      {params.status === "atualizado" ? <p className={styles.success} role="status">Situação atualizada e registrada no histórico.</p> : null}

      <div className={styles.layout}>
        {canInvite ? (
          <section className={styles.card}>
            <p className={styles.eyebrow}>Novo acesso</p>
            <h2>Convidar motorista</h2>
            <ConviteMotoristaForm />
          </section>
        ) : null}

        <section className={`${styles.card} ${!canInvite ? styles.fullWidth : ""}`}>
          <div className={styles.listHeading}>
            <div><p className={styles.eyebrow}>Contas desta empresa</p><h2>Equipe de rua</h2></div>
            <span className={styles.count}>{driverIds.length}</span>
          </div>
          {error || profileResult.error ? <p role="alert" className={styles.error}>Não foi possível carregar os motoristas. Confira as permissões do banco.</p> : null}
          {!error && driverIds.length === 0 ? <p className={styles.empty}>Nenhum motorista cadastrado.</p> : null}
          {driverIds.length > 0 ? (
            <ul className={styles.list}>
              {driverIds.map((driver) => {
                const status = driver.status;
                const label = STATUS_LABEL[status] ?? status.replaceAll("_", " ");
                const tone = STATUS_CLASS[status] ?? "muted";
                const name = driver.profile_id ? nameByProfile.get(driver.profile_id) : null;
                const options = canManageStatus ? STATUS_OPTIONS[status] ?? [] : [];
                return (
                  <li className={styles.driver} key={driver.id}>
                    <div className={styles.driverHeader}>
                      <span className={styles.avatar} aria-hidden="true">{name?.trim().slice(0, 1).toLocaleUpperCase("pt-BR") ?? "M"}</span>
                      <span className={styles.driverName}><strong>{name ?? "Convite em processamento"}</strong><small>Cadastro em {dateFormat.format(new Date(driver.created_at))}</small></span>
                      <span className={`${styles.badge} ${styles[tone]}`}>{label}</span>
                    </div>
                    {driver.profile_id ? <DriverContact name={name ?? "Motorista"} phone={profileResult.data?.find((profile) => profile.id === driver.profile_id)?.phone ?? null} /> : null}
                    {options.length > 0 ? <DriverStatusForm driverId={driver.id} options={options} /> : null}
                    {status === "rejected" ? <p className={styles.muted}>Conta preservada no histórico; não pode acessar viagens.</p> : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      </div>
    </main>
  );
}

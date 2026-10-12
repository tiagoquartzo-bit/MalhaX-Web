import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { ClienteForm } from "./form";
import styles from "./clients.module.css";

const ROLES = new Set(["admin", "manager", "dispatcher", "support"]);
type ClienteRow = { id: string; name: string; active: boolean; created_at: string };

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ cadastro?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roles } = await supabase.from("organization_member_roles").select("role").eq("user_id", user.id);
  if (!roles?.some(({ role }) => ROLES.has(role))) redirect("/painel");

  const { data, error } = await supabase.from("clients")
    .select("id, name, active, created_at")
    .order("name", { ascending: true })
    .limit(500)
    .overrideTypes<ClienteRow[], { merge: false }>();
  const clientes = data ?? [];
  const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

  return (
    <main className={styles.page}>
      <p className={styles.back}><Link href="/painel">← Voltar ao painel</Link></p>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>MalhaX · cadastros</p>
        <h1>Clientes</h1>
        <p>Cadastre os contratantes que poderão ser associados aos pedidos desta empresa.</p>
      </header>

      {params.cadastro === "concluido" ? <p role="status" className={styles.success}>Cliente cadastrado. Ele já pode ser usado em um novo pedido.</p> : null}

      <div className={styles.columns}>
        <section className={styles.card} aria-labelledby="new-client-title">
          <p className={styles.eyebrow}>Novo cadastro</p>
          <h2 id="new-client-title">Adicionar cliente</h2>
          <ClienteForm requestId={randomUUID()} />
        </section>

        <section className={styles.card} aria-labelledby="client-list-title">
          <div className={styles.listHeading}>
            <div><p className={styles.eyebrow}>Base da empresa</p><h2 id="client-list-title">Clientes cadastrados</h2></div>
            <span className={styles.count}>{clientes.length}</span>
          </div>
          {error ? <p role="alert" className={styles.error}>Não foi possível carregar os clientes. Confira as permissões do banco.</p> : null}
          {!error && clientes.length === 0 ? <p className={styles.empty}>Nenhum cliente cadastrado ainda.</p> : null}
          {clientes.length > 0 ? (
            <ul className={styles.list}>
              {clientes.map((cliente) => (
                <li key={cliente.id} className={styles.item}>
                  <span className={styles.avatar} aria-hidden="true">{cliente.name.trim().slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
                  <span className={styles.clientText}><strong>{cliente.name}</strong><small>Desde {dateFormat.format(new Date(cliente.created_at))}</small></span>
                  <span className={cliente.active ? styles.active : styles.inactive}>{cliente.active ? "Ativo" : "Inativo"}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <Link className={styles.secondaryLink} href="/painel/novo-pedido">Criar pedido para um cliente →</Link>
        </section>
      </div>
    </main>
  );
}

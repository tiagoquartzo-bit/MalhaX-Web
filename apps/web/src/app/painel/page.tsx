import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";
import { signOut } from "../login/actions";
import styles from "./dashboard.module.css";

type PedidoLinha = {
  id: string;
  order_number: number;
  external_reference: string | null;
  status: string;
  created_at: string;
  clients: { name: string } | null;
};

type ViagemLinha = {
  id: string;
  trip_number: number;
  status: string;
  planned_start_at: string | null;
};

const PAPEIS_OPERACAO = ["admin", "manager", "dispatcher", "support", "finance"];
const PAPEIS_CRIAM_PEDIDO = ["admin", "manager", "dispatcher"];

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default async function PainelPage() {
  if (process.env.NODE_ENV === "development") redirect("/dev-preview/controle");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: perfil }, { data: papeisRows }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("organization_member_roles").select("role").eq("user_id", user.id),
  ]);

  const papeis = (papeisRows ?? []).map((r) => r.role as string);
  const temAcessoOperacao = papeis.some((p) => PAPEIS_OPERACAO.includes(p));
  const podeCriarPedido = papeis.some((p) => PAPEIS_CRIAM_PEDIDO.includes(p));

  if (!temAcessoOperacao) {
    return (
      <main className={styles.restricted}>
        <p className={styles.eyebrow}>MALHAX · ACESSO OPERACIONAL</p>
        <h1>Acesso restrito</h1>
        <p>Seu usuário não tem acesso ao painel de operações. Motoristas usam o aplicativo MalhaX.</p>
        <form action={signOut}>
          <button className={styles.primaryButton} type="submit">Sair da conta</button>
        </form>
      </main>
    );
  }

  // Selecionar colunas explicitamente: frete e repasse não têm GRANT de leitura
  // em orders, e um select("*") falharia por privilégio de coluna.
  const [{ data: pedidos }, { data: viagens }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, external_reference, status, created_at, clients(name)")
      .order("created_at", { ascending: false })
      .limit(50)
      .overrideTypes<PedidoLinha[], { merge: false }>(),
    supabase
      .from("trips")
      .select("id, trip_number, status, planned_start_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .overrideTypes<ViagemLinha[], { merge: false }>(),
  ]);

  return (
    <main className={styles.dashboard}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}><span /> MALHAX · CENTRAL DE OPERAÇÕES</p>
          <h1>Visão de controle</h1>
          <p className={styles.welcome}>Olá, {perfil?.full_name ?? user.email}. Acompanhe pedidos, viagens e a operação da sua equipe.</p>
        </div>
        {podeCriarPedido ? <Link className={styles.primaryButton} href="/painel/novo-pedido"><span aria-hidden="true">＋</span> Novo pedido</Link> : null}
      </header>

      <nav className={styles.shortcuts} aria-label="Atalhos operacionais">
        <Link href="/painel/paradas"><span className={styles.shortcutIcon}>↔</span><span><strong>Coletas e entregas</strong><small>Consulte e ajuste as paradas</small></span><span className={styles.arrow}>↗</span></Link>
        <Link href="/painel/despacho"><span className={styles.shortcutIcon}>⇄</span><span><strong>Despacho de viagens</strong><small>Organize pedidos em viagens</small></span><span className={styles.arrow}>↗</span></Link>
        <Link href="/painel/ao-vivo"><span className={styles.shortcutIcon}>⌖</span><span><strong>Acompanhamento ao vivo</strong><small>Veja a operação em andamento</small></span><span className={styles.arrow}>↗</span></Link>
      </nav>

      <section className={styles.metrics} aria-label="Resumo da operação">
        <article className={styles.metric}><span className={styles.metricIcon}>▤</span><div><strong>{(pedidos ?? []).length}</strong><span>Pedidos recentes</span></div><small>últimos 50</small></article>
        <article className={styles.metric}><span className={styles.metricIcon}>⌁</span><div><strong>{(viagens ?? []).length}</strong><span>Viagens recentes</span></div><small>últimas 50</small></article>
        <Link className={styles.metricAction} href="/painel/transbordos"><span className={styles.metricIcon}>⇄</span><div><strong>Transbordos</strong><span>Transferência entre viagens</span></div><span className={styles.metricActionArrow}>↗</span></Link>
      </section>

      <div className={styles.sections}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}><div><p className={styles.sectionLabel}>OPERAÇÃO</p><h2>Pedidos recentes</h2></div><Link className={styles.textLink} href="/painel/paradas">Ver coletas e entregas <span>→</span></Link></div>
          {(pedidos ?? []).length ? <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Pedido</th><th>Cliente</th><th>Referência</th><th>Status</th><th>Criado em</th></tr></thead><tbody>{(pedidos ?? []).map((p) => <tr key={p.id}><td><strong>#{p.order_number}</strong></td><td>{p.clients?.name ?? "—"}</td><td>{p.external_reference ?? "—"}</td><td><span className={styles.status}>{p.status}</span></td><td>{dataHora.format(new Date(p.created_at))}</td></tr>)}</tbody></table></div> : <div className={styles.empty}><span className={styles.emptyIcon}>▤</span><strong>Nenhum pedido cadastrado ainda</strong><p>Quando um pedido for criado, ele aparecerá aqui para acompanhamento.</p>{podeCriarPedido ? <Link className={styles.secondaryButton} href="/painel/novo-pedido">Criar primeiro pedido</Link> : null}</div>}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}><div><p className={styles.sectionLabel}>LOGÍSTICA</p><h2>Viagens recentes</h2></div><Link className={styles.textLink} href="/painel/historico-motoristas">Histórico de motoristas <span>→</span></Link></div>
          {(viagens ?? []).length ? <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Viagem</th><th>Status</th><th>Início previsto</th><th>Detalhes</th></tr></thead><tbody>{(viagens ?? []).map((v) => <tr key={v.id}><td><strong>#{v.trip_number}</strong></td><td><span className={styles.status}>{v.status}</span></td><td>{v.planned_start_at ? dataHora.format(new Date(v.planned_start_at)) : "A definir"}</td><td><Link className={styles.textLink} href={`/painel/viagens/${v.id}`}>Abrir viagem →</Link></td></tr>)}</tbody></table></div> : <div className={styles.empty}><span className={styles.emptyIcon}>⌁</span><strong>Nenhuma viagem cadastrada</strong><p>As viagens criadas pela equipe aparecerão nesta área.</p><Link className={styles.secondaryButton} href="/painel/despacho">Ir para despacho</Link></div>}
        </section>
      </div>
      <footer className={styles.footer}><span>MalhaX · Logística e Tecnologia</span><span>Conectado como {user.email}</span></footer>
    </main>
  );
}






import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";
import { signOut } from "../login/actions";

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
      <main style={{ maxWidth: 560, margin: "10vh auto", padding: 24 }}>
        <h1>Acesso restrito</h1>
        <p>Seu usuário não tem acesso ao painel de operações. Motoristas usam o aplicativo Android.</p>
        <form action={signOut}>
          <button type="submit">Sair</button>
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
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ marginBottom: 0 }}>Painel de operações</h1>
          <small>{perfil?.full_name ?? user.email}</small>
        </div>
        <form action={signOut}>
          <button type="submit">Sair</button>
        </form>
      </header>

      <nav style={{ display: "flex", gap: 16, margin: "24px 0" }}>
        <Link href="/painel/paradas">Coletas e entregas</Link>
        <Link href="/painel/historico-motoristas">Histórico de motoristas</Link>
      </nav>
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Pedidos</h2>
          {podeCriarPedido ? <Link href="/painel/novo-pedido">Novo pedido</Link> : null}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Nº</th>
              <th align="left">Cliente</th>
              <th align="left">Referência</th>
              <th align="left">Status</th>
              <th align="left">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {(pedidos ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.order_number}</td>
                <td>{p.clients?.name ?? "—"}</td>
                <td>{p.external_reference ?? "—"}</td>
                <td>{p.status}</td>
                <td>{dataHora.format(new Date(p.created_at))}</td>
              </tr>
            ))}
            {(pedidos ?? []).length === 0 ? (
              <tr>
                <td colSpan={5}>Nenhum pedido ainda.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <nav style={{ display: "flex", gap: 16, margin: "24px 0" }}>
        <Link href="/painel/paradas">Coletas e entregas</Link>
        <Link href="/painel/historico-motoristas">Histórico de motoristas</Link>
      </nav>
      <section>
        <h2>Viagens</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Nº</th>
              <th align="left">Status</th>
              <th align="left">Início previsto</th>
              <th align="left">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {(viagens ?? []).map((v) => (
              <tr key={v.id}>
                <td>{v.trip_number}</td>
                <td>{v.status}</td>
                <td>{v.planned_start_at ? dataHora.format(new Date(v.planned_start_at)) : "—"}</td>
                <td><Link href={"/painel/viagens/" + v.id}>Abrir viagem</Link></td>
              </tr>
            ))}
            {(viagens ?? []).length === 0 ? (
              <tr>
                <td colSpan={4}>Nenhuma viagem cadastrada.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}






import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../lib/supabase/organization-roles";
import { CancelOrderForm } from "./cancel-form";
import styles from "../clientes/clients.module.css";

type OrderRow = { id: string; order_number: number; external_reference: string | null; status: string; created_at: string; freight_value?: number | null; clients: { name: string } | null };
type StopRow = { order_id: string; status: string };

const STATUS: Record<string, string> = {
  draft: "Rascunho", pending_dispatch: "Aguardando despacho", partially_assigned: "Parcialmente despachado", planned: "Planejado",
  in_progress: "Em execução", completed: "Concluído", exception: "Com ocorrência", cancelled: "Cancelado",
};
const OPS = ["admin", "manager", "dispatcher", "support", "finance"];
const CANCEL = ["admin", "manager", "dispatcher"];
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function PedidosPage({ searchParams }: { searchParams: Promise<{ criado?: string }> }) {
  const { criado } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { roles } = await getCurrentOrganizationRoles(supabase, user.id);
  if (!roles.some((role) => OPS.includes(role))) redirect("/painel");
  const canCancel = roles.some((role) => CANCEL.includes(role));

  const canSeeMoney = roles.some((role) => ["admin", "manager", "finance"].includes(role));
  const { data, error } = await supabase.from("orders")
    .select("id, order_number, external_reference, status, created_at, clients(name)")
    .order("created_at", { ascending: false }).limit(200).overrideTypes<OrderRow[], { merge: false }>();
  const orders = data ?? [];
  if (canSeeMoney && orders.length) {
    const { data: finData } = await supabase.rpc("order_financials", { p_order_ids: orders.map((order) => order.id) });
    const fin = (finData ?? []) as Array<{ order_id: string; freight_value: number | null }>;
    const frete = new Map(fin.map((row) => [row.order_id, row.freight_value]));
    for (const order of orders) order.freight_value = frete.get(order.id) ?? null;
  }
  const { data: stopRows } = orders.length
    ? await supabase.from("order_stops").select("order_id, status").in("order_id", orders.map((order) => order.id)).overrideTypes<StopRow[], { merge: false }>()
    : { data: [] as StopRow[] };
  const stopsByOrder = new Map<string, string[]>();
  for (const stop of stopRows ?? []) stopsByOrder.set(stop.order_id, [...(stopsByOrder.get(stop.order_id) ?? []), stop.status]);

  return <main className={styles.page}>
    <header className={styles.heading}>
      <p className={styles.eyebrow}>Operação · Pedidos</p>
      <h1>Pedidos</h1>
      <p>Situação de cada pedido. Pedidos que ainda não foram despachados podem ser cancelados com motivo registrado.</p>
    </header>
    {criado && /^[0-9a-f-]{36}$/i.test(criado) ? (
      <p className={styles.success}>
        Pedido cadastrado. Próximos passos: <Link className={styles.secondaryLink} href={`/etiquetas/${criado}`}>imprimir as etiquetas dos volumes</Link> e <Link className={styles.secondaryLink} href="/painel/despacho">montar a viagem no despacho</Link>.
      </p>
    ) : null}
    {canCancel ? <p><Link className={styles.secondaryLink} href="/painel/novo-pedido">＋ Novo pedido</Link></p> : null}
    {error ? <p role="alert" className={styles.error}>Não foi possível carregar os pedidos.</p> : null}
    <section className={styles.card}>
      <div className={styles.listHeading}><h2>Últimos pedidos</h2><span className={styles.count}>{orders.length}</span></div>
      {orders.length === 0 ? <p className={styles.empty}>Nenhum pedido cadastrado.</p> : null}
      <ul className={styles.list}>
        {orders.map((order) => {
          const stopStatuses = stopsByOrder.get(order.id) ?? [];
          const cancellable = canCancel && order.status !== "cancelled" && stopStatuses.every((status) => status === "pending_dispatch" || status === "exception");
          return <li key={order.id} className={styles.item} style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
            <span className={styles.avatar}>#{order.order_number}</span>
            <span className={styles.clientText}>
              <strong>{order.clients?.name ?? "Cliente"}{order.external_reference ? ` · ${order.external_reference}` : ""}</strong>
              <small>criado em {dataHora.format(new Date(order.created_at))} · {stopStatuses.length} {stopStatuses.length === 1 ? "parada" : "paradas"}{canSeeMoney ? ` · frete ${order.freight_value ? Number(order.freight_value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "não informado"}` : ""}</small>
            </span>
            <span className={order.status === "cancelled" ? styles.inactive : styles.active}>{STATUS[order.status] ?? order.status}</span>
            {order.status !== "cancelled" ? <Link className={styles.secondaryLink} href={`/etiquetas/${order.id}`}>Etiquetas</Link> : null}
            {cancellable ? <div style={{ flexBasis: "100%" }}><CancelOrderForm orderId={order.id} orderNumber={order.order_number} /></div> : null}
          </li>;
        })}
      </ul>
    </section>
  </main>;
}

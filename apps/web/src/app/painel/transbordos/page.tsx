import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { rejectCargoTransfer } from "./actions";
import { CargoTransferRequestForm } from "./CargoTransferRequestForm";
import { ApproveTransfer } from "./ApproveTransfer";
import styles from "./transbordos.module.css";

type Trip = { id: string; trip_number: number; status: string; drivers: { profiles: { full_name: string } | null } | null };
type Transfer = { id: string; status: string; reason: string; details: string; requested_at: string; source_trip: { trip_number: number; drivers: { profiles: { full_name: string } | null } | null } | null; destination_trip: { trip_number: number; drivers: { profiles: { full_name: string } | null } | null } | null; cargo_transfer_items: Array<{ packages: { package_code: string; description: string | null; quantity: number } | null }>; cargo_transfer_events: Array<{ id: string; event_type: string; details: string | null; occurred_at: string }> };
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const reasonLabels: Record<string, string> = { planned_handoff: "Transbordo planejado", vehicle_breakdown: "Veículo indisponível", route_change: "Mudança de rota" };
const statusLabels: Record<string, string> = { pending_support: "Aguardando aprovação", authorized: "Aguardando leitura do QR", awaiting_source: "Aguardando confirmação de saída", completed: "Concluído", rejected: "Recusado", expired: "QR expirado" };
const eventLabels: Record<string, string> = { requested: "Solicitação registrada", authorized: "Transbordo autorizado", rejected: "Solicitação recusada", receiver_confirmed: "Motorista de destino confirmou o recebimento", source_confirmed: "Motorista de origem confirmou a entrega", completed: "Custódia transferida", route_updated: "Paradas pendentes adicionadas à viagem de destino", manual_route_adjustment: "Revisão manual da rota necessária" };

export default async function CargoTransfersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roles } = await supabase.from("organization_member_roles").select("role").eq("user_id", user.id);
  if (!(roles ?? []).some((r) => ["admin", "manager", "dispatcher", "support"].includes(r.role))) redirect("/painel");
  const canReview = (roles ?? []).some((r) => ["admin", "manager", "support"].includes(r.role));
  const db = supabase as any;
  const [{ data: tripRows }, { data: transferRows, error }] = await Promise.all([
    db.from("trips").select("id, trip_number, status, drivers(profiles!drivers_profile_id_fkey(full_name))").in("status", ["assigned", "accepted", "in_progress"]).order("planned_start_at", { ascending: true }),
    db.from("cargo_transfers").select("id,status,reason,details,requested_at,source_trip:trips!cargo_transfers_source_trip_id_fkey(trip_number,drivers(profiles!drivers_profile_id_fkey(full_name))),destination_trip:trips!cargo_transfers_destination_trip_id_fkey(trip_number,drivers(profiles!drivers_profile_id_fkey(full_name))),cargo_transfer_items(packages(package_code,description,quantity)),cargo_transfer_events(id,event_type,details,occurred_at)").order("requested_at", { ascending: false }).limit(80),
  ]);
  const trips = (tripRows ?? []) as Trip[];
  const transfers = (transferRows ?? []) as Transfer[];
  const pending = transfers.filter((item) => item.status === "pending_support").length;
  const inProgress = transfers.filter((item) => ["authorized", "awaiting_source"].includes(item.status)).length;
  const completed = transfers.filter((item) => item.status === "completed").length;
  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>OPERAÇÃO · CUSTÓDIA DE CARGA</p><h1>Transbordo</h1><p>Transfira volumes entre viagens com aprovação e confirmação dos motoristas.</p></div>
      <div className={styles.headerNote}><span className={styles.liveDot} /> Fluxo rastreável</div>
    </header>
    <section className={styles.process} aria-label="Etapas do transbordo">
      <div><span className={styles.stepNumber}>01</span><span><strong>Solicitar</strong><small>Origem, destino e volumes</small></span></div><span className={styles.stepArrow}>→</span>
      <div><span className={styles.stepNumber}>02</span><span><strong>Autorizar</strong><small>Gestor ou suporte emite o QR</small></span></div><span className={styles.stepArrow}>→</span>
      <div><span className={styles.stepNumber}>03</span><span><strong>Confirmar</strong><small>Destino lê; origem confirma</small></span></div>
    </section>
    <section className={styles.summary} aria-label="Resumo das solicitações">
      <article><span>Para aprovar</span><strong>{error ? "—" : pending}</strong><small>aguardando gestor ou suporte</small></article>
      <article><span>Em transferência</span><strong>{error ? "—" : inProgress}</strong><small>QR emitido ou confirmações pendentes</small></article>
      <article><span>Concluídos</span><strong>{error ? "—" : completed}</strong><small>custódia confirmada</small></article>
    </section>
    <div className={styles.grid}>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><span className={styles.panelIcon}>＋</span><div><p className={styles.sectionLabel}>NOVA MOVIMENTAÇÃO</p><h2>Solicitar transbordo</h2></div></div>
        <p className={styles.panelIntro}>Escolha as viagens e informe os volumes que mudarão de responsável.</p>
        {trips.length < 2 ? <div className={styles.emptyState}><strong>Faltam viagens ativas</strong><p>São necessárias duas viagens ativas para abrir uma solicitação.</p></div> : <CargoTransferRequestForm trips={trips} />}
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><span className={styles.panelIcon}>↔</span><div><p className={styles.sectionLabel}>ACOMPANHAMENTO</p><h2>Solicitações recentes <span className={styles.count}>{error ? "—" : transfers.length}</span></h2></div></div>
        {error ? <p className={styles.error}>Não foi possível carregar as solicitações. Confira as permissões do banco.</p> : null}
        {!transfers.length && !error ? <div className={styles.emptyState}><strong>Nenhum transbordo por enquanto</strong><p>Quando alguém solicitar uma transferência, o andamento aparecerá aqui.</p></div> : null}
        <div className={styles.list}>{transfers.map((transfer) => <article className={styles.transfer} key={transfer.id}>
          <div className={styles.transferTop}><div><span className={`${styles.status} ${styles[`status_${transfer.status}`] ?? ""}`}>{statusLabels[transfer.status] ?? transfer.status}</span><h3>{reasonLabels[transfer.reason] ?? transfer.reason}</h3></div><time>{dateTime.format(new Date(transfer.requested_at))}</time></div>
          <div className={styles.route}><div><small>ORIGEM</small><strong>Viagem #{transfer.source_trip?.trip_number ?? "—"}</strong><span>{transfer.source_trip?.drivers?.profiles?.full_name ?? "Motorista"}</span></div><span className={styles.routeArrow}>→</span><div><small>DESTINO</small><strong>Viagem #{transfer.destination_trip?.trip_number ?? "—"}</strong><span>{transfer.destination_trip?.drivers?.profiles?.full_name ?? "Motorista"}</span></div></div>
          <p className={styles.details}>{transfer.details}</p>
          <div className={styles.packageHeader}><span>Volumes nesta solicitação</span><strong>{transfer.cargo_transfer_items.length}</strong></div>
          <div className={styles.packages}>{transfer.cargo_transfer_items.map(({ packages }) => packages ? <span key={packages.package_code}>{packages.package_code}{packages.quantity > 1 ? ` ×${packages.quantity}` : ""}</span> : null)}</div>
          {transfer.cargo_transfer_events.length ? <details className={styles.timeline}><summary>Histórico do transbordo <span>{transfer.cargo_transfer_events.length} eventos</span></summary><ol>{[...transfer.cargo_transfer_events].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)).map((event) => <li key={event.id}><span className={styles.timelineDot} /><div><strong>{eventLabels[event.event_type] ?? event.event_type}</strong><time>{dateTime.format(new Date(event.occurred_at))}</time>{event.details ? <p>{event.details}</p> : null}</div></li>)}</ol></details> : null}
          {transfer.status === "pending_support" ? (canReview ? <div className={styles.actions}><ApproveTransfer id={transfer.id} /><form action={rejectCargoTransfer}><input type="hidden" name="transferId" value={transfer.id} /><input name="note" required minLength={3} maxLength={1000} placeholder="Motivo da recusa" aria-label="Motivo da recusa" /><button className={styles.secondaryButton} type="submit">Recusar</button></form></div> : <p className={styles.hint}>Aguardando análise de um gestor ou do suporte.</p>) : null}
          {transfer.status === "authorized" || transfer.status === "awaiting_source" ? <div className={styles.notice}><strong>Próxima ação dos motoristas</strong><p>O QR vale por 15 minutos e só conclui após as duas confirmações. As paradas elegíveis serão encaminhadas automaticamente quando o fluxo terminar.</p></div> : null}
          {transfer.status === "completed" ? (() => { const manual = transfer.cargo_transfer_events.some((event) => event.event_type === "manual_route_adjustment"); const moved = transfer.cargo_transfer_events.some((event) => event.event_type === "route_updated"); return <div className={styles.notice}><strong>{manual ? "Transferência concluída · revisar rota" : "Custódia transferida"}</strong><p>{manual ? "Paradas já iniciadas ou viagens não editáveis exigem revisão manual no despacho. As demais paradas pendentes foram encaminhadas automaticamente." : moved ? "As paradas pendentes e elegíveis já foram adicionadas à viagem de destino." : "A equipe pode conferir as paradas atualizadas no despacho."}</p></div>; })() : null}
        </article>)}</div>
      </section>
    </div>
  </main>;
}




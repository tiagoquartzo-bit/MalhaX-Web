import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../../lib/supabase/organization-roles";
import { TripStopControls } from "./controls";
import { TripManagement } from "./management";
import styles from "./trip.module.css";

type Trip = {
  id: string; trip_number: number; driver_id: string; vehicle_id: string | null;
  status: string; planned_start_at: string | null; started_at: string | null; completed_at: string | null;
};
type Stop = {
  id: string; sequence_number: number; stop_type: string; status: string;
  address_label: string; address_line: string; city: string | null;
  planned_at: string | null; arrived_at: string | null; completed_at: string | null; failure_reason: string | null;
};
type Task = {
  id: string; order_id: string; stop_type: string; address_label: string;
  address_line: string; city: string | null; created_at: string;
};

const EDIT_ROLES = ["admin", "manager", "dispatcher"];
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });

function label(value: string) {
  const labels: Record<string, string> = {
    assigned: "Atribuída", accepted: "Aceita pelo motorista", in_progress: "Em andamento",
    paused: "Pausada", completed: "Concluída", cancelled: "Cancelada",
    pending: "Pendente", arrived: "Chegou ao local", failed: "Falhou", skipped: "Retirada da viagem",
    pickup: "Coleta", delivery: "Entrega",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function statusClass(status: string) {
  if (status === "completed") return styles.statusComplete;
  if (status === "failed" || status === "cancelled") return styles.statusProblem;
  if (status === "in_progress" || status === "arrived" || status === "accepted") return styles.statusActive;
  if (status === "skipped") return styles.statusMuted;
  return styles.statusPending;
}

export default async function TripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(tripId)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [roleAccess, { data: tripData }] = await Promise.all([
    getCurrentOrganizationRoles(supabase, user.id),
    supabase.from("trips")
      .select("id, trip_number, driver_id, vehicle_id, status, planned_start_at, started_at, completed_at")
      .eq("id", tripId).maybeSingle(),
  ]);
  if (!tripData) notFound();
  const trip = tripData as Trip;
  const roles = roleAccess.roles;
  const canManage = roles.some((role) => EDIT_ROLES.includes(role));
  const canReorderStatus = ["assigned", "accepted"].includes(trip.status);

  const [{ data: stopData }, { data: driverData }, vehicleResult] = await Promise.all([
    supabase.from("trip_stops")
      .select("id, sequence_number, stop_type, status, address_label, address_line, city, planned_at, arrived_at, completed_at, failure_reason")
      .eq("trip_id", tripId).order("sequence_number", { ascending: true }),
    supabase.from("drivers").select("profile_id").eq("id", trip.driver_id).maybeSingle(),
    trip.vehicle_id
      ? supabase.from("vehicles").select("plate, make_model").eq("id", trip.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const stops = (stopData ?? []) as Stop[];
  const profileId = driverData?.profile_id ?? null;

  const [{ data: profile }, availableResult] = await Promise.all([
    profileId
      ? supabase.from("profiles").select("full_name").eq("id", profileId).maybeSingle()
      : Promise.resolve({ data: null }),
    canManage
      ? supabase.from("order_stops")
          .select("id, order_id, stop_type, status, address_label, address_line, city, created_at")
          .in("status", ["pending_dispatch", "exception"])
          .order("created_at", { ascending: true }).limit(100)
      : Promise.resolve({ data: [] as Task[] }),
  ]);

  const available = (availableResult.data ?? []) as Task[];
  const orderIds = [...new Set(available.map((task) => task.order_id))];
  const { data: orders } = orderIds.length
    ? await supabase.from("orders").select("id, order_number").in("id", orderIds)
    : { data: [] };
  const orderNumbers = new Map((orders ?? []).map((order) => [order.id, order.order_number]));
  const taskOptions = available.map((task) => ({
    id: task.id, stop_type: task.stop_type, address_label: task.address_label,
    address_line: task.address_line, city: task.city, order_number: orderNumbers.get(task.order_id) ?? null,
  }));

  const { data: driverRows } = canManage
    ? await supabase.from("drivers").select("id, profile_id").eq("status", "active").limit(250)
    : { data: [] as Array<{ id: string; profile_id: string | null }> };
  const driverProfileIds = (driverRows ?? []).flatMap((row) => row.profile_id ? [row.profile_id] : []);
  const { data: driverProfiles } = driverProfileIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", driverProfileIds)
    : { data: [] as Array<{ id: string; full_name: string }> };
  const driverNames = new Map((driverProfiles ?? []).map((row) => [row.id, row.full_name]));
  const activeDrivers = (driverRows ?? []).flatMap((row) => {
    const name = row.profile_id ? driverNames.get(row.profile_id) : undefined;
    return name ? [{ id: row.id, name }] : [];
  });

  const vehicle = vehicleResult.data as { plate: string; make_model: string | null } | null;
  const allStopsPending = stops.length > 0 && stops.every((stop) => stop.status === "pending");
  const canEditTrip = canManage && ["assigned", "accepted", "in_progress"].includes(trip.status);

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <p style={{ margin: "8px 0 14px" }}><Link href="/painel/viagens">← Viagens</Link></p>
        <div className={styles.pageHeading}>
          <div>
            <p className={styles.eyebrow}>GESTÃO DE ROTAS</p>
            <h1>Viagem #{trip.trip_number}</h1>
            <p className={styles.subtitle}>{({ assigned: "Aguardando o motorista aceitar no aplicativo.", accepted: "Aceita. Aguardando o motorista tocar em Iniciar viagem.", in_progress: "Em rota. As paradas abaixo são atualizadas pelo aplicativo.", paused: "Pausada pelo gestor. O motorista não consegue executar paradas.", completed: "Viagem concluída.", cancelled: "Viagem cancelada. As paradas pendentes voltaram para o despacho." } as Record<string, string>)[trip.status] ?? "Acompanhe a sequência, o motorista e as ocorrências desta viagem."}</p>
          </div>
          <span className={styles.statusPill + " " + statusClass(trip.status)}>{label(trip.status)}</span>
        </div>

        <section className={styles.summaryGrid} aria-label="Resumo da viagem">
          <article className={styles.summaryCard}><span>Motorista</span><strong>{profile?.full_name ?? "Motorista"}</strong></article>
          <article className={styles.summaryCard}>
            <span>Veículo</span>
            <strong>{vehicle ? vehicle.plate + (vehicle.make_model ? " · " + vehicle.make_model : "") : "Não definido"}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span>Início previsto</span>
            <strong>{trip.planned_start_at ? dateTime.format(new Date(trip.planned_start_at)) : "Sem previsão"}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span>Progresso</span>
            <strong>{stops.filter((stop) => stop.status === "completed").length} de {stops.length} paradas realizadas</strong>
          </article>
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.eyebrow}>ROTA</p><h2>Paradas da viagem</h2></div>
            {trip.started_at ? <span className={styles.startedAt}>Iniciada {dateTime.format(new Date(trip.started_at))}</span> : null}
          </div>
          {stops.length ? (
            <ol className={styles.stopList}>
              {stops.map((stop, index) => (
                <li className={styles.stopItem} key={stop.id}>
                  <span className={styles.stopNumber}>{index + 1}</span>
                  <div className={styles.stopBody}>
                    <div className={styles.stopTitleLine}>
                      <div><span className={styles.stopType}>{label(stop.stop_type)}</span><h3>{stop.address_label}</h3></div>
                      <span className={styles.statusPill + " " + statusClass(stop.status)}>{label(stop.status)}</span>
                    </div>
                    <p className={styles.address}>{stop.address_line}{stop.city ? " · " + stop.city : ""}</p>
                    <div className={styles.stopMeta}>
                      {stop.planned_at ? <span>Previsão: {dateTime.format(new Date(stop.planned_at))}</span> : null}
                      {stop.arrived_at ? <span>Chegada: {dateTime.format(new Date(stop.arrived_at))}</span> : null}
                      {stop.completed_at ? <span>Finalizada: {dateTime.format(new Date(stop.completed_at))}</span> : null}
                      {stop.failure_reason ? <span className={styles.failureReason}>Motivo: {stop.failure_reason}</span> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : <div className={styles.emptyState}>Esta viagem ainda não tem paradas.</div>}
        </section>

        {canManage ? (
          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>SITUAÇÃO DA VIAGEM</p><h2>Pausar, cancelar ou trocar o motorista</h2></div>
            </div>
            <details>
              <summary style={{ cursor: "pointer", color: "#7fe5ee", fontWeight: 700 }}>Mostrar ações da viagem</summary>
              <div style={{ marginTop: "1rem" }}>
            <TripManagement tripId={tripId} status={trip.status} started={!allStopsPending} drivers={activeDrivers} currentDriverId={trip.driver_id} />
              </div>
            </details>
          </section>
        ) : null}

        <section className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.eyebrow}>CONTROLE DO GESTOR</p><h2>Alterar paradas da rota</h2></div>
          </div>
          <details>
          <summary style={{ cursor: "pointer", color: "#7fe5ee", fontWeight: 700 }}>Incluir, retirar ou reordenar paradas</summary>
          <div className={styles.syncNotice}>
            As alterações ficam registradas no servidor. O motorista verá a nova sequência quando o aplicativo atualizar a viagem.
          </div>
          {canReorderStatus && !allStopsPending
            ? <p className={styles.inlineNotice}>A reordenação está disponível antes de qualquer parada começar.</p>
            : null}
          <TripStopControls
            tripId={tripId}
            stops={stops.map(({ id, sequence_number, stop_type, status, address_label, address_line, city }) => ({
              id, sequence_number, stop_type, status, address_label, address_line, city,
            }))}
            availableTasks={taskOptions}
            canManage={canEditTrip}
            canReorder={canReorderStatus && allStopsPending}
          />
          {!canManage ? <p className={styles.inlineNotice}>Seu perfil pode acompanhar esta viagem, mas não editar as paradas.</p> : null}
          {canManage && !canEditTrip
            ? <p className={styles.inlineNotice}>Esta viagem está encerrada ou pausada e não aceita alterações.</p>
            : null}
          </details>
        </section>
      </div>
    </main>
  );
}

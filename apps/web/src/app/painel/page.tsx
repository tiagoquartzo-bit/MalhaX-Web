import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../lib/supabase/organization-roles";
import ui from "./ui.module.css";

type Trip = { id: string; trip_number: number; status: string; driver_id: string; planned_start_at: string | null; started_at: string | null };
type Stop = { id: string; trip_id: string; status: string; planned_at: string | null; sequence_number: number; address_label: string; stop_type: string };
type Task = { id: string; order_id: string; address_label: string; stop_type: string };
type Attention = { key: string; level: "bad" | "warn" | "info"; title: string; detail: string; href: string; action: string };

const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dia = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" });
const TRIP_LABEL: Record<string, string> = { assigned: "Aguardando aceite", accepted: "Aceita · não iniciada", in_progress: "Em rota", paused: "Pausada" };

function inicioDoDiaSaoPaulo(now: Date) {
  const data = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return new Date(`${data}T00:00:00-03:00`);
}

export default async function InicioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { roles } = await getCurrentOrganizationRoles(supabase, user.id);
  const canDispatch = roles.some((role) => ["admin", "manager", "dispatcher"].includes(role));
  const canManage = roles.some((role) => ["admin", "manager", "support"].includes(role));
  const now = new Date();
  const hoje = inicioDoDiaSaoPaulo(now).toISOString();

  const [profileResult, tripsResult, pendingTasksResult, exceptionTasksResult, completedTodayResult, vehiclesResult] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("trips").select("id, trip_number, status, driver_id, planned_start_at, started_at")
      .in("status", ["assigned", "accepted", "in_progress", "paused"]).order("planned_start_at", { ascending: true, nullsFirst: false }).limit(200)
      .overrideTypes<Trip[], { merge: false }>(),
    supabase.from("order_stops").select("id", { count: "exact", head: true }).eq("status", "pending_dispatch"),
    supabase.from("order_stops").select("id, order_id, address_label, stop_type").eq("status", "exception").order("updated_at", { ascending: false }).limit(20)
      .overrideTypes<Task[], { merge: false }>(),
    supabase.from("trip_stops").select("id", { count: "exact", head: true }).eq("status", "completed").gte("completed_at", hoje),
    canManage ? supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("active", true).is("capacity_kg", null) : Promise.resolve({ count: 0 }),
  ]);

  const trips = tripsResult.data ?? [];
  const tripIds = trips.map((trip) => trip.id);
  const driverIds = [...new Set(trips.map((trip) => trip.driver_id))];
  const [stopsResult, driversResult] = await Promise.all([
    tripIds.length
      ? supabase.from("trip_stops").select("id, trip_id, status, planned_at, sequence_number, address_label, stop_type").in("trip_id", tripIds).order("sequence_number").overrideTypes<Stop[], { merge: false }>()
      : Promise.resolve({ data: [] as Stop[] }),
    driverIds.length ? supabase.from("drivers").select("id, profile_id").in("id", driverIds) : Promise.resolve({ data: [] as Array<{ id: string; profile_id: string | null }> }),
  ]);
  const profileIds = (driversResult.data ?? []).flatMap((driver) => driver.profile_id ? [driver.profile_id] : []);
  const { data: profiles } = profileIds.length ? await supabase.from("profiles").select("id, full_name").in("id", profileIds) : { data: [] as Array<{ id: string; full_name: string }> };
  const nomePorPerfil = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const nomePorMotorista = new Map((driversResult.data ?? []).map((driver) => [driver.id, driver.profile_id ? nomePorPerfil.get(driver.profile_id) ?? "Motorista" : "Motorista"]));
  const stops = stopsResult.data ?? [];
  const stopsByTrip = new Map<string, Stop[]>();
  for (const stop of stops) stopsByTrip.set(stop.trip_id, [...(stopsByTrip.get(stop.trip_id) ?? []), stop]);

  const exceptionTasks = exceptionTasksResult.data ?? [];
  const exceptionOrderIds = [...new Set(exceptionTasks.map((task) => task.order_id))];
  const { data: exceptionOrders } = exceptionOrderIds.length ? await supabase.from("orders").select("id, order_number").in("id", exceptionOrderIds) : { data: [] as Array<{ id: string; order_number: number }> };
  const numeroPedido = new Map((exceptionOrders ?? []).map((order) => [order.id, order.order_number]));

  const attention: Attention[] = [];
  for (const stop of stops) {
    if (stop.planned_at && new Date(stop.planned_at) < now && ["pending", "arrived", "in_progress"].includes(stop.status)) {
      const trip = trips.find((item) => item.id === stop.trip_id);
      const atraso = Math.round((now.valueOf() - new Date(stop.planned_at).valueOf()) / 60000);
      attention.push({ key: "late-" + stop.id, level: atraso > 30 ? "bad" : "warn", title: `${stop.stop_type === "pickup" ? "Coleta" : "Entrega"} atrasada · ${stop.address_label}`,
        detail: `Viagem #${trip?.trip_number} · ${nomePorMotorista.get(trip?.driver_id ?? "") ?? ""} · previsão ${hora.format(new Date(stop.planned_at))} (${atraso} min)`, href: `/painel/viagens/${stop.trip_id}`, action: "Ver viagem" });
    }
  }
  for (const trip of trips) {
    const nome = nomePorMotorista.get(trip.driver_id) ?? "Motorista";
    if (trip.status === "assigned" && trip.planned_start_at && new Date(trip.planned_start_at).valueOf() - now.valueOf() < 30 * 60000) {
      attention.push({ key: "accept-" + trip.id, level: new Date(trip.planned_start_at) < now ? "bad" : "warn", title: `Viagem #${trip.trip_number} ainda não foi aceita`, detail: `${nome} · saída prevista ${hora.format(new Date(trip.planned_start_at))}`, href: `/painel/viagens/${trip.id}`, action: "Reatribuir ou contatar" });
    }
    if (trip.status === "accepted" && trip.planned_start_at && new Date(trip.planned_start_at) < now) {
      attention.push({ key: "start-" + trip.id, level: "warn", title: `Viagem #${trip.trip_number} aceita, mas não iniciada`, detail: `${nome} · saída prevista ${hora.format(new Date(trip.planned_start_at))}`, href: `/painel/viagens/${trip.id}`, action: "Ver viagem" });
    }
    if (trip.status === "paused") attention.push({ key: "pause-" + trip.id, level: "info", title: `Viagem #${trip.trip_number} está pausada`, detail: nome, href: `/painel/viagens/${trip.id}`, action: "Retomar" });
  }
  for (const task of exceptionTasks) {
    attention.push({ key: "exc-" + task.id, level: "bad", title: `Falha na ${task.stop_type === "pickup" ? "coleta" : "entrega"} · ${task.address_label}`, detail: `Pedido #${numeroPedido.get(task.order_id) ?? "—"} · precisa de nova tentativa ou cancelamento`, href: "/painel/paradas", action: "Tratar" });
  }
  if ((vehiclesResult.count ?? 0) > 0) attention.push({ key: "veh", level: "info", title: `${vehiclesResult.count} veículo(s) sem capacidade em kg`, detail: "Sem a capacidade, o despacho não consegue impedir excesso de carga.", href: "/painel/veiculos", action: "Informar" });
  const ordem = { bad: 0, warn: 1, info: 2 };
  attention.sort((a, b) => ordem[a.level] - ordem[b.level]);

  const pendentes = pendingTasksResult.count ?? 0;
  const emRota = trips.filter((trip) => trip.status === "in_progress").length;
  const aguardando = trips.filter((trip) => trip.status === "assigned" || trip.status === "accepted").length;
  const primeiroNome = (profileResult.data?.full_name ?? "").split(" ")[0];

  return <main className={ui.page}>
    <header className={ui.header}>
      <div>
        <p className={ui.eyebrow}>{dia.format(now)}</p>
        <h1>{primeiroNome ? `Olá, ${primeiroNome}` : "Início"}</h1>
        <p>O que está acontecendo agora e o que precisa da sua atenção.</p>
      </div>
      <div className={ui.actions}>
        {canDispatch ? <Link className={ui.button} href="/painel/novo-pedido">+ Novo pedido</Link> : null}
        {canDispatch ? <Link className={ui.buttonGhost} href="/painel/despacho">Montar viagem</Link> : null}
      </div>
    </header>

    <section className={ui.kpis} aria-label="Resumo">
      <Link href="/painel/despacho" className={`${ui.kpi} ${pendentes ? ui.kpiAlert : ""}`}><span>Paradas aguardando despacho</span><strong>{pendentes}</strong><small>{pendentes ? "Monte uma viagem →" : "Fila vazia"}</small></Link>
      <Link href="/painel/viagens?situacao=ativas" className={ui.kpi}><span>Viagens em rota</span><strong>{emRota}</strong><small>{aguardando} aguardando aceite ou saída</small></Link>
      <Link href="/painel/paradas" className={`${ui.kpi} ${exceptionTasks.length ? ui.kpiAlert : ""}`}><span>Falhas a tratar</span><strong>{exceptionTasks.length}</strong><small>Coletas/entregas não realizadas</small></Link>
      <div className={`${ui.kpi} ${ui.kpiGood}`}><span>Paradas concluídas hoje</span><strong>{completedTodayResult.count ?? 0}</strong><small>Desde 00:00</small></div>
    </section>

    <div className={ui.grid2}>
      <section className={ui.card}>
        <div className={ui.cardHeader}><h2>Precisa de atenção</h2><span className={ui.pill}>{attention.length}</span></div>
        {attention.length === 0 ? <p className={ui.empty}>Tudo em dia. Nenhum atraso, falha ou viagem parada.</p> : (
          <ul className={ui.list}>
            {attention.slice(0, 12).map((item) => <li key={item.key}>
              <Link className={ui.row} href={item.href}>
                <span className={`${ui.pill} ${item.level === "bad" ? ui.pillBad : item.level === "warn" ? ui.pillWarn : ui.pillInfo}`}>{item.level === "bad" ? "Urgente" : item.level === "warn" ? "Atenção" : "Aviso"}</span>
                <span className={ui.rowMain}><strong>{item.title}</strong><small>{item.detail}</small></span>
                <span className={ui.rowSide}>{item.action} →</span>
              </Link>
            </li>)}
          </ul>
        )}
      </section>

      <section className={ui.card}>
        <div className={ui.cardHeader}><h2>Viagens ativas</h2><Link href="/painel/viagens">Ver todas →</Link></div>
        {trips.length === 0 ? <p className={ui.empty}>Nenhuma viagem ativa.{canDispatch ? " Use o Despacho para montar a próxima." : ""}</p> : (
          <ul className={ui.list}>
            {trips.slice(0, 10).map((trip) => {
              const tripStops = stopsByTrip.get(trip.id) ?? [];
              const feitas = tripStops.filter((stop) => ["completed", "failed", "skipped"].includes(stop.status)).length;
              const proxima = tripStops.find((stop) => !["completed", "failed", "skipped"].includes(stop.status));
              const pct = tripStops.length ? Math.round((feitas / tripStops.length) * 100) : 0;
              return <li key={trip.id}><Link className={ui.row} href={`/painel/viagens/${trip.id}`}>
                <span className={ui.rowMain}>
                  <strong>#{trip.trip_number} · {nomePorMotorista.get(trip.driver_id) ?? "Motorista"}</strong>
                  <small>{proxima ? `Próxima: ${proxima.stop_type === "pickup" ? "coleta" : "entrega"} em ${proxima.address_label}` : "Todas as paradas encerradas"}</small>
                </span>
                <span className={ui.rowSide}>
                  <span className={`${ui.pill} ${trip.status === "in_progress" ? ui.pillGood : trip.status === "paused" ? ui.pillWarn : ""}`}>{TRIP_LABEL[trip.status] ?? trip.status}</span>
                  <span className={ui.progress} aria-label={`${feitas} de ${tripStops.length} paradas`}><i style={{ width: `${pct}%` }} /></span>
                </span>
              </Link></li>;
            })}
          </ul>
        )}
      </section>
    </div>
  </main>;
}

import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../lib/supabase/organization-roles";
import ui from "../ui.module.css";

type Trip = { id: string; trip_number: number; status: string; driver_id: string; vehicle_id: string | null; planned_start_at: string | null; started_at: string | null; completed_at: string | null };
type Stop = { trip_id: string; status: string; stop_type: string };

const SITUACOES = {
  ativas: { label: "Ativas", status: ["assigned", "accepted", "in_progress", "paused"] },
  concluidas: { label: "Concluídas", status: ["completed"] },
  canceladas: { label: "Canceladas", status: ["cancelled"] },
} as const;
const STATUS: Record<string, { label: string; tone: string }> = {
  assigned: { label: "Aguardando aceite", tone: "" }, accepted: { label: "Aceita", tone: "" }, in_progress: { label: "Em rota", tone: "good" },
  paused: { label: "Pausada", tone: "warn" }, completed: { label: "Concluída", tone: "good" }, cancelled: { label: "Cancelada", tone: "bad" },
};
const dataHora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export default async function ViagensPage({ searchParams }: { searchParams: Promise<{ situacao?: string }> }) {
  const params = await searchParams;
  const situacao = (params.situacao && params.situacao in SITUACOES ? params.situacao : "ativas") as keyof typeof SITUACOES;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { roles } = await getCurrentOrganizationRoles(supabase, user.id);
  const canDispatch = roles.some((role) => ["admin", "manager", "dispatcher"].includes(role));

  const { data, error } = await supabase.from("trips")
    .select("id, trip_number, status, driver_id, vehicle_id, planned_start_at, started_at, completed_at")
    .in("status", [...SITUACOES[situacao].status])
    .order(situacao === "ativas" ? "planned_start_at" : "completed_at", { ascending: situacao === "ativas", nullsFirst: false })
    .limit(200).overrideTypes<Trip[], { merge: false }>();
  const trips = data ?? [];
  const ids = trips.map((trip) => trip.id);
  const [stopsResult, driversResult, vehiclesResult] = await Promise.all([
    ids.length ? supabase.from("trip_stops").select("trip_id, status, stop_type").in("trip_id", ids).overrideTypes<Stop[], { merge: false }>() : Promise.resolve({ data: [] as Stop[] }),
    supabase.from("drivers").select("id, profile_id").in("id", [...new Set(trips.map((trip) => trip.driver_id))]),
    supabase.from("vehicles").select("id, plate").in("id", trips.flatMap((trip) => trip.vehicle_id ? [trip.vehicle_id] : [])),
  ]);
  const profileIds = (driversResult.data ?? []).flatMap((driver) => driver.profile_id ? [driver.profile_id] : []);
  const { data: profiles } = profileIds.length ? await supabase.from("profiles").select("id, full_name").in("id", profileIds) : { data: [] as Array<{ id: string; full_name: string }> };
  const nomePerfil = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const nomeMotorista = new Map((driversResult.data ?? []).map((driver) => [driver.id, driver.profile_id ? nomePerfil.get(driver.profile_id) : undefined]));
  const placa = new Map((vehiclesResult.data ?? []).map((vehicle) => [vehicle.id, vehicle.plate]));
  const paradas = new Map<string, Stop[]>();
  for (const stop of stopsResult.data ?? []) paradas.set(stop.trip_id, [...(paradas.get(stop.trip_id) ?? []), stop]);

  return <main className={ui.page}>
    <header className={ui.header}>
      <div><p className={ui.eyebrow}>Operação</p><h1>Viagens</h1><p>Acompanhe cada rota, veja o andamento das paradas e abra a viagem para pausar, cancelar ou trocar o motorista.</p></div>
      {canDispatch ? <div className={ui.actions}><Link className={ui.button} href="/painel/despacho">+ Montar viagem</Link></div> : null}
    </header>
    <nav className={ui.tabs} aria-label="Situação das viagens">
      {Object.entries(SITUACOES).map(([key, item]) => <Link key={key} href={`?situacao=${key}`} className={`${ui.tab} ${key === situacao ? ui.tabActive : ""}`} aria-current={key === situacao ? "page" : undefined}>{item.label}</Link>)}
    </nav>
    {error ? <p className={ui.error}>Não foi possível carregar as viagens. Atualize a página.</p> : null}
    {!error && trips.length === 0 ? <p className={ui.empty}>Nenhuma viagem {SITUACOES[situacao].label.toLowerCase()}.</p> : null}
    {trips.length ? <div className={ui.tableWrap}><table className={ui.table}>
      <thead><tr><th>Viagem</th><th>Motorista</th><th>Saída</th><th>Paradas</th><th>Situação</th><th></th></tr></thead>
      <tbody>{trips.map((trip) => {
        const lista = paradas.get(trip.id) ?? [];
        const feitas = lista.filter((stop) => stop.status === "completed").length;
        const falhas = lista.filter((stop) => stop.status === "failed").length;
        const status = STATUS[trip.status] ?? { label: trip.status, tone: "" };
        const tone = status.tone === "good" ? ui.pillGood : status.tone === "warn" ? ui.pillWarn : status.tone === "bad" ? ui.pillBad : "";
        return <tr key={trip.id}>
          <td><strong>#{trip.trip_number}</strong><small>{trip.vehicle_id ? placa.get(trip.vehicle_id) ?? "Veículo" : "Sem veículo"}</small></td>
          <td>{nomeMotorista.get(trip.driver_id) ?? "Motorista"}</td>
          <td>{trip.planned_start_at ? dataHora.format(new Date(trip.planned_start_at)) : "—"}{trip.started_at ? <small>Iniciou {dataHora.format(new Date(trip.started_at))}</small> : null}</td>
          <td>{feitas}/{lista.length} concluídas{falhas ? <small>{falhas} com falha</small> : null}<small>{lista.filter((stop) => stop.stop_type === "pickup").length} coletas · {lista.filter((stop) => stop.stop_type === "delivery").length} entregas</small></td>
          <td><span className={`${ui.pill} ${tone}`}>{status.label}</span></td>
          <td className={ui.num}><Link className={ui.buttonGhost} href={`/painel/viagens/${trip.id}`}>Abrir</Link></td>
        </tr>;
      })}</tbody>
    </table></div> : null}
  </main>;
}

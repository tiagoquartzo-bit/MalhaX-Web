import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../lib/supabase/organization-roles";
import { TrackingHistory, type TrackingPoint } from "./tracking-history";
import styles from "./page.module.css";

const OPS_ROLES = ["admin", "manager", "dispatcher", "support"];
type Position = { driver_id: string; trip_id: string; latitude: number; longitude: number; accuracy_meters: number | null; captured_at_device: string; received_at_server: string };
type Driver = { id: string; profile_id: string | null };
type Profile = { id: string; full_name: string };
type Trip = { id: string; trip_number: number };
type Search = { date?: string; driver?: string };

function saoPauloDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00-03:00`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export default async function TrackingHistoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const date = validDate(params.date) ? params.date : saoPauloDate();
  const start = new Date(`${date}T00:00:00-03:00`).toISOString();
  const [year, month, day] = date.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const end = new Date(`${nextDay}T00:00:00-03:00`).toISOString();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { roles } = await getCurrentOrganizationRoles(supabase, user.id);
  if (!roles.some((role) => OPS_ROLES.includes(role))) redirect("/painel");

  const { data, error } = await supabase.from("tracking_positions")
    .select("driver_id, trip_id, latitude, longitude, accuracy_meters, captured_at_device, received_at_server")
    .gte("captured_at_device", start).lt("captured_at_device", end)
    .order("captured_at_device", { ascending: true }).limit(10000)
    .overrideTypes<Position[], { merge: false }>();
  const positions = data ?? [];
  const driverIds = [...new Set(positions.map((point) => point.driver_id))];
  const tripIds = [...new Set(positions.map((point) => point.trip_id))];
  let driverRows: Driver[] = [];
  let profileRows: Profile[] = [];
  let tripRows: Trip[] = [];
  if (driverIds.length) {
    const result = await supabase.from("drivers").select("id, profile_id").in("id", driverIds).overrideTypes<Driver[], { merge: false }>();
    driverRows = result.data ?? [];
    const profileIds = [...new Set(driverRows.map((driver) => driver.profile_id).filter((id): id is string => Boolean(id)))];
    if (profileIds.length) {
      const profiles = await supabase.from("profiles").select("id, full_name").in("id", profileIds).overrideTypes<Profile[], { merge: false }>();
      profileRows = profiles.data ?? [];
    }
  }
  if (tripIds.length) {
    const result = await supabase.from("trips").select("id, trip_number").in("id", tripIds).overrideTypes<Trip[], { merge: false }>();
    tripRows = result.data ?? [];
  }
  const profileMap = new Map<string, string>(profileRows.map((profile): [string, string] => [profile.id, profile.full_name]));
  const driverNames = new Map<string, string>(driverRows.map((driver): [string, string] => [driver.id, (driver.profile_id && profileMap.get(driver.profile_id)) || "Motorista"]));
  const tripNumbers = new Map<string, number>(tripRows.map((trip): [string, number] => [trip.id, trip.trip_number]));
  const drivers = driverIds.map((id) => ({ id, name: driverNames.get(id) ?? "Motorista" })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const selectedDriver = drivers.some((driver) => driver.id === params.driver) ? params.driver! : "";
  const visiblePositions = selectedDriver ? positions.filter((point) => point.driver_id === selectedDriver) : positions;
  const points: TrackingPoint[] = visiblePositions.map((point) => ({
    driverId: point.driver_id, driverName: driverNames.get(point.driver_id) ?? "Motorista",
    tripId: point.trip_id, tripNumber: tripNumbers.get(point.trip_id) ?? 0,
    latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy_meters,
    capturedAt: point.captured_at_device, receivedAt: point.received_at_server,
  }));

  return <main className={styles.page}>
    <Link href="/painel" className={styles.backLink}>← Voltar à operação</Link>
    <header className={styles.heading}>
      <p className={styles.eyebrow}><span aria-hidden="true" /> Operação · Rotas</p>
      <h1>Histórico diário de motoristas</h1>
      <p>Consulte os pontos GPS capturados durante as viagens, visualize os trajetos registrados e exporte os dados para análise.</p>
    </header>
    {error ? <p role="alert" className={styles.error}>Não foi possível consultar o histórico GPS. Confira as permissões de leitura.</p> : <TrackingHistory date={date} selectedDriver={selectedDriver} drivers={drivers} points={points} />}
  </main>;
}


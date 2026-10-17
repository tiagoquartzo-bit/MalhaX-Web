import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../lib/supabase/organization-roles";
import { LiveMap, type LiveDriver } from "./live-map";
import styles from "./live.module.css";
import { DriverContact } from "../DriverContact";

const ROLES = ["admin", "manager", "dispatcher", "support"];
type Trip = { id: string; trip_number: number; driver_id: string };
type Position = { trip_id: string; driver_id: string; latitude: number; longitude: number; accuracy_meters: number | null; captured_at_device: string; received_at_server: string };
type Driver = { id: string; profile_id: string | null };
type Profile = { id: string; full_name: string; phone: string | null };

export default async function AoVivoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { roles, error: roleError } = await getCurrentOrganizationRoles(supabase, user.id);
  if (roleError || !roles.some((role) => ROLES.includes(role))) redirect("/painel");
  const { data: tripRows, error } = await supabase.from("trips").select("id, trip_number, driver_id").in("status", ["assigned", "accepted", "in_progress"]).order("created_at", { ascending: false }).limit(300).overrideTypes<Trip[], { merge: false }>();
  const trips = tripRows ?? [];
  const tripIds = trips.map((trip) => trip.id);
  const driverIds = [...new Set(trips.map((trip) => trip.driver_id))];
  let positions: Position[] = [];
  let drivers: Driver[] = [];
  let profiles: Profile[] = [];
  if (tripIds.length) {
    const [positionResult, driverResult] = await Promise.all([
      supabase.from("tracking_positions").select("trip_id, driver_id, latitude, longitude, accuracy_meters, captured_at_device, received_at_server").in("trip_id", tripIds).order("captured_at_device", { ascending: false }).limit(3000).overrideTypes<Position[], { merge: false }>(),
      supabase.from("drivers").select("id, profile_id").in("id", driverIds).overrideTypes<Driver[], { merge: false }>(),
    ]);
    positions = positionResult.data ?? [];
    drivers = driverResult.data ?? [];
    const profileIds = [...new Set(drivers.map(({ profile_id }) => profile_id).filter((id): id is string => Boolean(id)))];
    if (profileIds.length) {
      const result = await supabase.from("profiles").select("id, full_name, phone").in("id", profileIds).overrideTypes<Profile[], { merge: false }>();
      profiles = result.data ?? [];
    }
  }
  const latestByTrip = new Map<string, Position>();
  for (const position of positions) if (!latestByTrip.has(position.trip_id)) latestByTrip.set(position.trip_id, position);
  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name]));
  const phones = new Map(profiles.map((profile) => [profile.id, profile.phone]));
  const profileByDriver = new Map(drivers.map((driver) => [driver.id, driver.profile_id]));
  const liveDrivers: LiveDriver[] = trips.map((trip) => {
    const point = latestByTrip.get(trip.id);
    const profileId = profileByDriver.get(trip.driver_id);
    return { id: trip.driver_id, name: (profileId && names.get(profileId)) || "Motorista", phone: (profileId && phones.get(profileId)) || null, tripNumber: trip.trip_number, latitude: point?.latitude ?? null, longitude: point?.longitude ?? null, accuracy: point?.accuracy_meters ?? null, capturedAt: point?.captured_at_device ?? null, receivedAt: point?.received_at_server ?? null };
  });
  return <main className={styles.page}><p><Link href="/painel">← Painel de operações</Link></p><header className={styles.header}><div><p className={styles.eyebrow}>MalhaX · suporte operacional</p><h1>Acompanhamento ao vivo</h1><p>Última localização recebida por viagem ativa. Posições antigas aparecem sinalizadas.</p></div><Link href="/painel/historico-motoristas">Ver histórico e baixar CSV</Link></header>{error ? <p role="alert" className={styles.notice}>Não foi possível consultar as viagens ativas. Verifique as permissões do banco.</p> : <LiveMap drivers={liveDrivers} />}</main>;
}

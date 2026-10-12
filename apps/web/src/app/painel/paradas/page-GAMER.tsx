import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { StopBoard, type StopRow } from "./stop-board-GAMER";

type BaseStop = { id: string; order_id: string; stop_type: string; status: string; address_label: string; address_line: string; district: string | null; city: string | null; state: string | null; created_at: string };
type OrderRow = { id: string; order_number: number; external_reference: string | null };
type TripStop = { id: string; source_order_stop_id: string | null; trip_id: string; sequence_number: number; status: string; failure_reason: string | null; attempt_number: number; planned_at: string | null };
type Trip = { id: string; trip_number: number; driver_id: string };
type Driver = { id: string; profile_id: string | null };
type Profile = { id: string; full_name: string };
type EventRow = { id: string; stop_id: string; event_type: string; from_status: string | null; to_status: string | null; reason: string | null; server_received_at: string; latitude: number | null; longitude: number | null; location_accuracy_meters: number | null };
type ProofRow = { id: string; stop_id: string; storage_path: string; location_photo_path: string | null; recipient_name: string | null; received_at_server: string; captured_at_device: string; location_captured_at_device: string | null; latitude: number | null; longitude: number | null; location_accuracy_meters: number | null };
const OPS_ROLES = ["admin", "manager", "dispatcher", "support"];

export default async function ParadasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roles } = await supabase.from("organization_member_roles").select("role").eq("user_id", user.id);
  if (!(roles ?? []).some((item) => OPS_ROLES.includes(item.role))) redirect("/painel");

  const { data, error } = await supabase.from("order_stops")
    .select("id, order_id, stop_type, status, address_label, address_line, district, city, state, created_at")
    .order("created_at", { ascending: false }).limit(100)
    .overrideTypes<BaseStop[], { merge: false }>();
  if (error) return <main style={{ maxWidth: 1200, margin: "0 auto", padding: 28 }}><Link href="/painel">← Painel de operações</Link><h1>Coletas e entregas</h1><p role="alert">Não foi possível carregar as paradas. Atualize a página ou verifique o acesso operacional.</p></main>;

  const stops = data ?? [];
  const stopIds = stops.map((item) => item.id);
  const orderIds = [...new Set(stops.map((item) => item.order_id))];
  let orders: OrderRow[] = [];
  let attempts: TripStop[] = [];
  if (orderIds.length) {
    const result = await supabase.from("orders").select("id, order_number, external_reference").in("id", orderIds).overrideTypes<OrderRow[], { merge: false }>();
    orders = result.data ?? [];
  }
  if (stopIds.length) {
    const result = await supabase.from("trip_stops").select("id, source_order_stop_id, trip_id, sequence_number, status, failure_reason, attempt_number, planned_at").in("source_order_stop_id", stopIds).order("attempt_number", { ascending: false }).overrideTypes<TripStop[], { merge: false }>();
    attempts = result.data ?? [];
  }
  const latestAttempt = new Map<string, TripStop>();
  for (const attempt of attempts) if (attempt.source_order_stop_id && !latestAttempt.has(attempt.source_order_stop_id)) latestAttempt.set(attempt.source_order_stop_id, attempt);

  const tripIds = [...new Set(attempts.map((item) => item.trip_id))];
  let trips: Trip[] = [];
  let drivers: Driver[] = [];
  let profiles: Profile[] = [];
  if (tripIds.length) {
    const result = await supabase.from("trips").select("id, trip_number, driver_id").in("id", tripIds).overrideTypes<Trip[], { merge: false }>();
    trips = result.data ?? [];
    const driverIds = [...new Set(trips.map((trip) => trip.driver_id))];
    const driverResult = await supabase.from("drivers").select("id, profile_id").in("id", driverIds).overrideTypes<Driver[], { merge: false }>();
    drivers = driverResult.data ?? [];
    const profileIds = [...new Set(drivers.map((driver) => driver.profile_id).filter((id): id is string => Boolean(id)))];
    if (profileIds.length) {
      const profileResult = await supabase.from("profiles").select("id, full_name").in("id", profileIds).overrideTypes<Profile[], { merge: false }>();
      profiles = profileResult.data ?? [];
    }
  }
  const executionIds = [...new Set(attempts.map((item) => item.id))];
  let events: EventRow[] = [];
  let proofs: Array<ProofRow & { image_url: string | null; location_image_url: string | null }> = [];
  if (executionIds.length) {
    const [eventResult, proofResult] = await Promise.all([
      supabase.from("stop_events").select("id, stop_id, event_type, from_status, to_status, reason, server_received_at, latitude, longitude, location_accuracy_meters").in("stop_id", executionIds).order("server_received_at", { ascending: false }).limit(500).overrideTypes<EventRow[], { merge: false }>(),
      supabase.from("delivery_proofs").select("id, stop_id, storage_path, location_photo_path, recipient_name, received_at_server, captured_at_device, location_captured_at_device, latitude, longitude, location_accuracy_meters").in("stop_id", executionIds).order("received_at_server", { ascending: false }).limit(300).overrideTypes<ProofRow[], { merge: false }>(),
    ]);
    events = eventResult.data ?? [];
    proofs = await Promise.all((proofResult.data ?? []).map(async (proof) => {
      const { data: signed, error: signedError } = await supabase.storage
        .from("delivery-proofs")
        .createSignedUrl(proof.storage_path, 300);
      const locationSigned = proof.location_photo_path
        ? await supabase.storage.from("delivery-proofs").createSignedUrl(proof.location_photo_path, 300)
        : null;
      return {
        ...proof,
        image_url: signedError ? null : signed.signedUrl,
        location_image_url: !locationSigned || locationSigned.error ? null : locationSigned.data.signedUrl,
      };
    }));
  }

  const orderMap = new Map<string, OrderRow>(orders.map((item): [string, OrderRow] => [item.id, item]));
  const tripMap = new Map<string, Trip>(trips.map((item): [string, Trip] => [item.id, item]));
  const driverMap = new Map(drivers.map((item): [string, Driver] => [item.id, item]));
  const profileMap = new Map(profiles.map((item): [string, string] => [item.id, item.full_name]));
  const attemptByExecution = new Map(attempts.map((item) => [item.id, item.attempt_number]));
  const eventMap = new Map<string, StopRow["history"]>();
  for (const event of events) {
    const list = eventMap.get(event.stop_id) ?? [];
    list.push({ id: event.id, title: event.event_type, detail: [`Tentativa ${attemptByExecution.get(event.stop_id) ?? 1}`, event.from_status && `${event.from_status} → ${event.to_status ?? ""}`, event.reason].filter(Boolean).join(" · "), at: event.server_received_at, latitude: event.latitude, longitude: event.longitude, accuracy: event.location_accuracy_meters });
    eventMap.set(event.stop_id, list);
  }
  const proofMap = new Map<string, StopRow["proofs"]>();
  for (const proof of proofs) {
    const list = proofMap.get(proof.stop_id) ?? [];
    list.push({ recipient: proof.recipient_name, at: proof.received_at_server, capturedAt: proof.captured_at_device, locationCapturedAt: proof.location_captured_at_device, latitude: proof.latitude, longitude: proof.longitude, accuracy: proof.location_accuracy_meters, imageUrl: proof.image_url, locationImageUrl: proof.location_image_url, hasLocationPhoto: Boolean(proof.location_photo_path), attemptNumber: attemptByExecution.get(proof.stop_id) ?? 1 });
    proofMap.set(proof.stop_id, list);
  }
  const rows: StopRow[] = stops.map((stop) => {
    const order = orderMap.get(stop.order_id);
    const attempt = latestAttempt.get(stop.id);
    const trip = attempt ? tripMap.get(attempt.trip_id) : undefined;
    const tripDriver = trip ? driverMap.get(trip.driver_id) : undefined;
    const latestProofs = proofMap.get(attempt?.id ?? "") ?? [];
    const isOverdue = Boolean(attempt?.planned_at && new Date(attempt.planned_at) < new Date() && !["completed", "failed", "skipped"].includes(attempt.status));
    const occurrenceReasons = [
      stop.status === "pending_dispatch" ? "Sem despacho" : null,
      stop.status === "exception" || attempt?.status === "failed" ? "Falha registrada" : null,
      isOverdue ? "Previsão vencida" : null,
      stop.stop_type === "delivery" && attempt?.status === "completed" && latestProofs.length === 0 ? "Sem comprovante" : null,
      stop.stop_type === "delivery" && attempt?.status === "completed" && latestProofs.some((proof) => !proof.hasLocationPhoto) ? "Foto da fachada ausente" : null,
      stop.stop_type === "delivery" && attempt?.status === "completed" && latestProofs.length > 0 && latestProofs.every((proof) => proof.latitude === null || proof.longitude === null) ? "GPS ausente" : null,
      stop.stop_type === "delivery" && attempt?.status === "completed" && latestProofs.some((proof) => proof.accuracy !== null && proof.accuracy > 50) ? "GPS impreciso" : null,
    ].filter((reason): reason is string => reason !== null);
    const fullHistory = attempts.filter((row) => row.source_order_stop_id === stop.id).flatMap((row) => eventMap.get(row.id) ?? []).sort((a, b) => b.at.localeCompare(a.at));
    const fullProofs = attempts.filter((row) => row.source_order_stop_id === stop.id).flatMap((row) => proofMap.get(row.id) ?? []).sort((a, b) => b.at.localeCompare(a.at));
    return { id: stop.id, createdAt: stop.created_at, orderNumber: order?.order_number ?? null, reference: order?.external_reference ?? null, kind: stop.stop_type, status: stop.status, address: [stop.address_label, stop.address_line, stop.district, stop.city, stop.state].filter(Boolean).join(", "), tripNumber: trip?.trip_number ?? null, driverName: tripDriver?.profile_id ? profileMap.get(tripDriver.profile_id) ?? null : null, sequence: attempt?.sequence_number ?? null, executionStatus: attempt?.status ?? null, attemptNumber: attempt?.attempt_number ?? null, failureReason: attempt?.failure_reason ?? null, occurrenceReasons, history: fullHistory, proofs: fullProofs };
  });

  return <main style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 24px" }}>
    <p><Link href="/painel">← Painel de operações</Link></p>
    <h1>Coletas e entregas</h1>
    <p>Paradas solicitadas, tentativas executadas e histórico operacional.</p>
    <StopBoard rows={rows} />
  </main>;
}


import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { StopBoard, type StopRow } from "./stop-board";

type BaseStop = { id: string; order_id: string; stop_type: string; status: string; address_label: string; address_line: string; district: string | null; city: string | null; state: string | null; created_at: string };
type OrderRow = { id: string; order_number: number; external_reference: string | null };
type TripStop = { id: string; source_order_stop_id: string | null; trip_id: string; sequence_number: number; status: string; failure_reason: string | null; attempt_number: number };
type Trip = { id: string; trip_number: number };
type EventRow = { id: string; stop_id: string; event_type: string; from_status: string | null; to_status: string | null; reason: string | null; server_received_at: string; latitude: number | null; longitude: number | null; location_accuracy_meters: number | null };
type ProofRow = { id: string; stop_id: string; recipient_name: string | null; received_at_server: string; latitude: number | null; longitude: number | null; location_accuracy_meters: number | null };
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
    const result = await supabase.from("trip_stops").select("id, source_order_stop_id, trip_id, sequence_number, status, failure_reason, attempt_number").in("source_order_stop_id", stopIds).order("attempt_number", { ascending: false }).overrideTypes<TripStop[], { merge: false }>();
    attempts = result.data ?? [];
  }
  const latestAttempt = new Map<string, TripStop>();
  for (const attempt of attempts) if (attempt.source_order_stop_id && !latestAttempt.has(attempt.source_order_stop_id)) latestAttempt.set(attempt.source_order_stop_id, attempt);

  const tripIds = [...new Set([...latestAttempt.values()].map((item) => item.trip_id))];
  let trips: Trip[] = [];
  if (tripIds.length) {
    const result = await supabase.from("trips").select("id, trip_number").in("id", tripIds).overrideTypes<Trip[], { merge: false }>();
    trips = result.data ?? [];
  }
  const executionIds = [...new Set([...latestAttempt.values()].map((item) => item.id))];
  let events: EventRow[] = [];
  let proofs: ProofRow[] = [];
  if (executionIds.length) {
    const [eventResult, proofResult] = await Promise.all([
      supabase.from("stop_events").select("id, stop_id, event_type, from_status, to_status, reason, server_received_at, latitude, longitude, location_accuracy_meters").in("stop_id", executionIds).order("server_received_at", { ascending: false }).limit(500).overrideTypes<EventRow[], { merge: false }>(),
      supabase.from("delivery_proofs").select("id, stop_id, recipient_name, received_at_server, latitude, longitude, location_accuracy_meters").in("stop_id", executionIds).order("received_at_server", { ascending: false }).limit(300).overrideTypes<ProofRow[], { merge: false }>(),
    ]);
    events = eventResult.data ?? [];
    proofs = proofResult.data ?? [];
  }

  const orderMap = new Map<string, OrderRow>(orders.map((item): [string, OrderRow] => [item.id, item]));
  const tripMap = new Map<string, Trip>(trips.map((item): [string, Trip] => [item.id, item]));
  const eventMap = new Map<string, StopRow["history"]>();
  for (const event of events) {
    const list = eventMap.get(event.stop_id) ?? [];
    list.push({ id: event.id, title: event.event_type, detail: [event.from_status && `${event.from_status} → ${event.to_status ?? ""}`, event.reason].filter(Boolean).join(" · "), at: event.server_received_at, latitude: event.latitude, longitude: event.longitude, accuracy: event.location_accuracy_meters });
    eventMap.set(event.stop_id, list);
  }
  const proofMap = new Map<string, StopRow["proofs"]>();
  for (const proof of proofs) {
    const list = proofMap.get(proof.stop_id) ?? [];
    list.push({ recipient: proof.recipient_name, at: proof.received_at_server, latitude: proof.latitude, longitude: proof.longitude, accuracy: proof.location_accuracy_meters });
    proofMap.set(proof.stop_id, list);
  }
  const rows: StopRow[] = stops.map((stop) => {
    const order = orderMap.get(stop.order_id);
    const attempt = latestAttempt.get(stop.id);
    const trip = attempt ? tripMap.get(attempt.trip_id) : undefined;
    return { id: stop.id, orderNumber: order?.order_number ?? null, reference: order?.external_reference ?? null, kind: stop.stop_type, status: stop.status, address: [stop.address_label, stop.address_line, stop.district, stop.city, stop.state].filter(Boolean).join(", "), tripNumber: trip?.trip_number ?? null, sequence: attempt?.sequence_number ?? null, executionStatus: attempt?.status ?? null, attemptNumber: attempt?.attempt_number ?? null, failureReason: attempt?.failure_reason ?? null, history: eventMap.get(attempt?.id ?? "") ?? [], proofs: proofMap.get(attempt?.id ?? "") ?? [] };
  });

  return <main style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 24px" }}>
    <p><Link href="/painel">← Painel de operações</Link></p>
    <h1>Coletas e entregas</h1>
    <p>Paradas solicitadas, tentativas executadas e histórico operacional.</p>
    <StopBoard rows={rows} />
  </main>;
}


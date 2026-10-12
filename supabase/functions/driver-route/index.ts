import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json(401, { error: "not_authenticated" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const orsKey = Deno.env.get("OPENROUTESERVICE_API_KEY");
  if (!supabaseUrl || !anonKey || !orsKey) return json(503, { error: "routing_service_not_configured" });

  let body: { trip_id?: unknown; stop_id?: unknown; origin?: unknown };
  try { body = await request.json(); } catch { return json(400, { error: "invalid_json" }); }
  const tripId = typeof body.trip_id === "string" ? body.trip_id : "";
  const stopId = typeof body.stop_id === "string" ? body.stop_id : "";
  const origin = body.origin;
  if (!tripId || !stopId || !origin || typeof origin !== "object") return json(400, { error: "invalid_route_request" });
  const originLat = Number((origin as Record<string, unknown>).latitude);
  const originLng = Number((origin as Record<string, unknown>).longitude);
  if (!Number.isFinite(originLat) || !Number.isFinite(originLng) || Math.abs(originLat) > 90 || Math.abs(originLng) > 180) return json(400, { error: "invalid_origin" });

  const caller = createClient(supabaseUrl, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${bearer}` } } });
  const { data: auth, error: authError } = await caller.auth.getUser(bearer);
  if (authError || !auth.user) return json(401, { error: "not_authenticated" });
  const { data: driverId, error: driverError } = await caller.rpc("current_driver_id");
  if (driverError || !driverId) return json(403, { error: "driver_profile_required" });
  const { data: trip } = await caller.from("trips").select("id, status").eq("id", tripId).eq("driver_id", driverId).maybeSingle();
  if (!trip || !["accepted", "in_progress", "paused"].includes(trip.status)) return json(404, { error: "trip_not_available" });
  const { data: stop } = await caller.from("trip_stops").select("id, latitude, longitude").eq("id", stopId).eq("trip_id", tripId).maybeSingle();
  if (!stop || typeof stop.latitude !== "number" || typeof stop.longitude !== "number") return json(404, { error: "stop_coordinates_missing" });

  try {
    const response = await fetch("https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson", {
      method: "POST",
      headers: { Authorization: orsKey, "Content-Type": "application/json", Accept: "application/geo+json, application/json" },
      body: JSON.stringify({ coordinates: [[originLng, originLat], [stop.longitude, stop.latitude]], instructions: true, geometry: true, preference: "recommended" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return json(response.status === 429 ? 429 : 502, { error: response.status === 429 ? "routing_quota_exceeded" : "route_calculation_failed" });
    const data = await response.json();
    const feature = data?.features?.[0];
    if (!feature?.geometry?.coordinates?.length || !feature?.properties?.segments?.[0]?.steps) return json(502, { error: "route_response_invalid" });
    return json(200, {
      geometry: feature.geometry,
      distance_meters: feature.properties.summary?.distance ?? null,
      duration_seconds: feature.properties.summary?.duration ?? null,
      steps: feature.properties.segments.flatMap((segment: { steps?: Array<{ instruction?: string; distance?: number; duration?: number; way_points?: number[] }> }) => segment.steps ?? []).map((step: { instruction?: string; distance?: number; duration?: number; way_points?: number[] }) => ({
        instruction: step.instruction ?? "Continue pela via",
        distance_meters: step.distance ?? 0,
        duration_seconds: step.duration ?? 0,
        coordinate_index: step.way_points?.[0] ?? 0,
      })),
      attribution: "Rota © openrouteservice · Dados © OpenStreetMap",
    });
  } catch {
    return json(502, { error: "routing_provider_unavailable" });
  }
});

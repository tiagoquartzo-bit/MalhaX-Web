import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ORDER_ROLES = new Set(["admin", "manager", "dispatcher"]);
const PRECISE_ACCURACY = new Set(["address", "interpolated", "point", "rooftop"]);
const MAX_STOPS = 20;

type AddressInput = {
  stop_index: number;
  address_line: string;
  address_extra?: string;
  district?: string;
  city: string;
  state: string;
  postal_code?: string;
};

type GeocodeFeature = {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function readText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalized(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR")
    : "";
}

function requestedHouseNumber(addressLine: string): string | null {
  const match = addressLine.match(/(?:^|[,\s])(?:n[º°.]?\s*)?(\d+[a-z]?)\s*$/i);
  return match?.[1]?.toLocaleLowerCase("pt-BR") ?? null;
}

function geocodePoint(feature: GeocodeFeature, address: AddressInput) {
  if (feature.geometry?.type !== "Point" || !Array.isArray(feature.geometry.coordinates)) return null;
  const [longitude, latitude] = feature.geometry.coordinates.map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  const properties = feature.properties ?? {};
  const confidence = Number(properties.confidence);
  const accuracy = readText(properties.accuracy, 32).toLocaleLowerCase("en-US");
  const layer = readText(properties.layer, 32).toLocaleLowerCase("en-US");
  const houseNumber = readText(properties.housenumber, 24).toLocaleLowerCase("pt-BR");
  const expectedHouseNumber = requestedHouseNumber(address.address_line);
  const resultState = readText(properties.region_a, 16);
  const resultCountry = readText(properties.country_a, 8).toLocaleUpperCase("en-US");

  if (!Number.isFinite(confidence) || confidence < 0.8) return null;
  if (!PRECISE_ACCURACY.has(accuracy) && !(layer === "address" && houseNumber)) return null;
  if (expectedHouseNumber && houseNumber !== expectedHouseNumber) return null;
  if (!expectedHouseNumber && !["point", "rooftop"].includes(accuracy)) return null;
  if (resultState && normalized(resultState) !== normalized(address.state)) return null;
  if (resultCountry && resultCountry !== "BRA" && resultCountry !== "BR") return null;

  return { latitude, longitude, confidence };
}

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = radians(b.latitude - a.latitude);
  const deltaLng = radians(b.longitude - a.longitude);
  const haversine = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(deltaLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function validAddress(value: unknown): AddressInput | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const stop_index = Number(item.stop_index);
  const address_line = readText(item.address_line, 240);
  const city = readText(item.city, 100);
  const state = readText(item.state, 2).toLocaleUpperCase("en-US");
  if (!Number.isInteger(stop_index) || stop_index < 1 || !address_line || !city || !/^[A-Z]{2}$/.test(state)) return null;
  return {
    stop_index,
    address_line,
    address_extra: readText(item.address_extra, 120),
    district: readText(item.district, 100),
    city,
    state,
    postal_code: readText(item.postal_code, 12),
  };
}

async function geocodeAddress(address: AddressInput, apiKey: string) {
  const url = new URL("https://api.heigit.org/pelias/v1/search");
  const query = [
    address.address_line,
    address.address_extra,
    address.district,
    address.city,
    address.state,
    address.postal_code,
    "Brasil",
  ].filter(Boolean).join(", ");
  url.searchParams.set("text", query);
  url.searchParams.set("size", "5");
  url.searchParams.set("boundary.country", "BRA");

  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return { providerError: response.status } as const;

  const result = await response.json();
  const features = Array.isArray(result?.features) ? result.features as GeocodeFeature[] : [];
  const candidates = features
    .map((feature) => geocodePoint(feature, address))
    .filter((point): point is { latitude: number; longitude: number; confidence: number } => point !== null)
    .sort((a, b) => b.confidence - a.confidence);
  const best = candidates[0];
  const runnerUp = candidates[1];
  if (best && runnerUp && best.confidence - runnerUp.confidence < 0.08 && distanceMeters(best, runnerUp) > 100) {
    return { point: null } as const;
  }
  return { point: best ? { latitude: best.latitude, longitude: best.longitude } : null } as const;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });

  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json(401, { error: "not_authenticated" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const orsKey = Deno.env.get("OPENROUTESERVICE_API_KEY");
  if (!supabaseUrl || !anonKey || !orsKey) return json(503, { error: "geocoding_service_not_configured" });

  let body: { stops?: unknown };
  try {
    const rawBody = await request.text();
    if (rawBody.length > 64_000) return json(413, { error: "request_too_large" });
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "invalid_json" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "invalid_request" });
  if (!Array.isArray(body.stops) || body.stops.length === 0 || body.stops.length > MAX_STOPS) {
    return json(400, { error: "invalid_stop_list" });
  }

  const addresses = body.stops.map(validAddress);
  if (addresses.some((address) => address === null)) return json(400, { error: "invalid_stop_address" });
  const validAddresses = addresses as AddressInput[];
  if (new Set(validAddresses.map((address) => address.stop_index)).size !== validAddresses.length) {
    return json(400, { error: "duplicate_stop_index" });
  }

  const caller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: auth, error: authError } = await caller.auth.getUser(bearer);
  if (authError || !auth.user) return json(401, { error: "not_authenticated" });
  const { data: roles, error: roleError } = await caller
    .from("organization_member_roles")
    .select("role")
    .eq("user_id", auth.user.id);
  if (roleError || !roles?.some(({ role }) => ORDER_ROLES.has(role))) {
    return json(403, { error: "order_creation_role_required" });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const [index, address] of validAddresses.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 700));
    try {
      const result = await geocodeAddress(address, orsKey);
      if ("providerError" in result) {
        return json(result.providerError === 429 ? 429 : 502, {
          error: result.providerError === 429 ? "geocoding_rate_limit" : "geocoding_provider_unavailable",
        });
      }
      results.push(result.point
        ? { stop_index: address.stop_index, status: "matched", ...result.point }
        : { stop_index: address.stop_index, status: "needs_map_pin" });
    } catch {
      return json(502, { error: "geocoding_provider_unavailable" });
    }
  }

  return json(200, { results });
});

import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import type { StopStatus, StopType, TripStatus } from "@activia/shared";

import { supabase } from "./supabase";

export type DriverStop = {
  id: string;
  tripId: string;
  sequence: number;
  type: StopType;
  status: StopStatus;
  addressLabel: string;
  addressLine: string;
  addressExtra: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  contactName: string | null;
  contactPhone: string | null;
  latitude: number | null;
  longitude: number | null;
  instructions: string | null;
  packages: Array<{ code: string; description: string | null; action: string }>;
};

export type DriverTrip = {
  id: string;
  number: number;
  status: TripStatus;
  plannedStartAt: string | null;
  vehiclePlate: string | null;
  stops: DriverStop[];
};

export type DriverRoute = {
  geometry: { type: "LineString"; coordinates: Array<[number, number]> };
  distance_meters: number | null;
  duration_seconds: number | null;
  steps: Array<{ instruction: string; distance_meters: number; duration_seconds: number; coordinate_index: number }>;
  attribution: string;
};

export async function calculateDriverRoute(tripId: string, stopId: string, origin: { latitude: number; longitude: number }): Promise<DriverRoute> {
  const { data, error } = await supabase.functions.invoke("driver-route", {
    body: { trip_id: tripId, stop_id: stopId, origin },
  });
  const messages: Record<string, string> = {
    routing_service_not_configured: "O serviço de rotas está ativo, mas falta configurar a chave gratuita do OpenRouteService no backend.",
    stop_coordinates_missing: "Esta parada ainda não tem coordenadas cadastradas.",
    routing_quota_exceeded: "O limite diário de rotas foi atingido. Tente novamente mais tarde.",
    routing_provider_unavailable: "O serviço de rotas está indisponível no momento.",
    route_calculation_failed: "Não foi possível calcular a rota para este destino.",
    trip_not_available: "Esta viagem não está disponível para navegação.",
    driver_profile_required: "Esta conta não possui um perfil de motorista ativo.",
  };
  if (error) {
    const errorContext = (error as Error & { context?: unknown }).context;
    const context = errorContext && typeof errorContext === "object" && "response" in errorContext
      ? (errorContext as { response?: unknown }).response ?? errorContext
      : errorContext;
    if (context && typeof context === "object" && "status" in context) {
      const response = context as { status?: number; clone?: () => { json?: () => Promise<unknown> } };
      let payload: { error?: string } | null = null;
      try {
        const cloned = response.clone?.();
        if (cloned?.json) payload = await cloned.json() as { error?: string };
      } catch { /* respostas do gateway podem não ser JSON */ }
      if (payload?.error && messages[payload.error]) throw new Error(messages[payload.error]);
      if (response.status === 401) throw new Error("A sessão do motorista expirou. Saia e entre novamente no MalhaX.");
      if (response.status === 404) throw new Error("A função de navegação não foi encontrada no Supabase local.");
      if (response.status === 503) throw new Error("A função de navegação está ativa, mas falta configurar a chave gratuita do OpenRouteService no backend.");
    }
    if (error.name === "FunctionsFetchError") throw new Error("Não foi possível conectar ao Supabase local pelo emulador. Confira a conexão entre o emulador e o computador.");
    throw new Error(`Falha ao acessar o serviço de navegação (${error.name || "erro de rede"}).`);
  }
  if (!data?.geometry?.coordinates?.length || !Array.isArray(data.steps)) {
    throw new Error(messages[data?.error] ?? "Resposta de rota inválida. Tente novamente.");
  }
  return data as DriverRoute;
}

export type ProofDraft = {
  photo: ImagePicker.ImagePickerAsset;
  locationPhoto: ImagePicker.ImagePickerAsset;
  recipientName: string;
  capturedAt: string;
  locationCapturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  storageId: string;
};

export type CapturedStopEvent = {
  stopId: string;
  deviceEventId: string;
  status: StopStatus;
  reason: string | null;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
};

export async function loadAssignedTrips(): Promise<DriverTrip[]> {
  const { data: tripRows, error: tripError } = await supabase
    .from("trips")
    .select("id, trip_number, status, planned_start_at, vehicle_id")
    .in("status", ["assigned", "accepted", "in_progress", "paused"])
    .order("planned_start_at", { ascending: true, nullsFirst: false });
  if (tripError) throw tripError;
  if (!tripRows?.length) return [];

  const tripIds = tripRows.map((trip) => trip.id);
  const [{ data: stopRows, error: stopError }, { data: vehicleRows }] = await Promise.all([
    supabase
      .from("trip_stops")
      .select("id, trip_id, sequence_number, stop_type, status, address_label, address_line, address_extra, district, city, state, postal_code, contact_name, contact_phone, latitude, longitude, instructions")
      .in("trip_id", tripIds)
      .order("sequence_number", { ascending: true }),
    supabase.from("vehicles").select("id, plate").in(
      "id",
      tripRows.flatMap((trip) => trip.vehicle_id ? [trip.vehicle_id] : []),
    ),
  ]);
  if (stopError) throw stopError;

  const stopIds = (stopRows ?? []).map((stop) => stop.id);
  const { data: packageRows, error: packageError } = stopIds.length
    ? await supabase
        .from("stop_packages")
        .select("stop_id, expected_action, packages(package_code, description, custodian_trip_id)")
        .in("stop_id", stopIds)
    : { data: [], error: null };
  if (packageError) throw packageError;

  const stopTripById = new Map((stopRows ?? []).map((stop) => [stop.id, stop.trip_id]));
  const packagesByStop = new Map<string, DriverStop["packages"]>();
  for (const row of packageRows ?? []) {
    const related = row.packages as unknown as { package_code: string; description: string | null; custodian_trip_id: string | null } | null;
    if (related?.custodian_trip_id && related.custodian_trip_id !== stopTripById.get(row.stop_id)) continue;
    const list = packagesByStop.get(row.stop_id) ?? [];
    if (related) list.push({ code: related.package_code, description: related.description, action: row.expected_action });
    packagesByStop.set(row.stop_id, list);
  }
  const stopsByTrip = new Map<string, DriverStop[]>();
  for (const row of stopRows ?? []) {
    const list = stopsByTrip.get(row.trip_id) ?? [];
    list.push({
      id: row.id,
      tripId: row.trip_id,
      sequence: row.sequence_number,
      type: row.stop_type as StopType,
      status: row.status as StopStatus,
      addressLabel: row.address_label,
      addressLine: row.address_line,
      addressExtra: row.address_extra,
      district: row.district,
      city: row.city,
      state: row.state,
      postalCode: row.postal_code,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      latitude: row.latitude,
      longitude: row.longitude,
      instructions: row.instructions,
      packages: packagesByStop.get(row.id) ?? [],
    });
    stopsByTrip.set(row.trip_id, list);
  }
  const plates = new Map((vehicleRows ?? []).map((vehicle) => [vehicle.id, vehicle.plate]));
  return tripRows.map((trip) => ({
    id: trip.id,
    number: trip.trip_number,
    status: trip.status as TripStatus,
    plannedStartAt: trip.planned_start_at,
    vehiclePlate: trip.vehicle_id ? plates.get(trip.vehicle_id) ?? null : null,
    stops: stopsByTrip.get(trip.id) ?? [],
  }));
}

export async function captureLocation() {
  const permission = await Location.getForegroundPermissionsAsync().catch(() => null);
  if (!permission?.granted) return null;
  const currentFix = Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.BestForNavigation,
    mayShowUserSettingsDialog: false,
  });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000));
  const position = await Promise.race([currentFix, timeout]).catch(() => null);
  const location = position ?? await Location.getLastKnownPositionAsync({ maxAge: 120_000, requiredAccuracy: 200 }).catch(() => null);
  if (!location || location.coords.accuracy === null) return null;
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracyMeters: location.coords.accuracy,
    capturedAt: new Date(location.timestamp).toISOString(),
  };
}

export async function setStopStatus(
  stopId: string,
  status: StopStatus,
  deviceEventId: string,
  reason?: string,
): Promise<void> {
  const location = await captureLocation();
  await submitStopEvent({
    stopId,
    deviceEventId,
    status,
    reason: reason ?? null,
    capturedAt: location?.capturedAt ?? new Date().toISOString(),
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    accuracyMeters: location?.accuracyMeters ?? null,
  });
}

export async function createStopEvent(
  stopId: string,
  status: StopStatus,
  deviceEventId: string,
  reason?: string,
): Promise<CapturedStopEvent> {
  const location = await captureLocation();
  return {
    stopId,
    deviceEventId,
    status,
    reason: reason ?? null,
    capturedAt: location?.capturedAt ?? new Date().toISOString(),
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    accuracyMeters: location?.accuracyMeters ?? null,
  };
}

export async function submitStopEvent(event: CapturedStopEvent): Promise<void> {
  const { error } = await supabase.rpc("record_stop_event", {
    p_stop_id: event.stopId,
    p_device_event_id: event.deviceEventId,
    p_to_status: event.status,
    p_reason: event.reason,
    p_device_captured_at: event.capturedAt,
    p_latitude: event.latitude,
    p_longitude: event.longitude,
    p_location_accuracy_meters: event.accuracyMeters,
  });
  if (error) throw error;
}

export async function acceptAssignedTrip(tripId: string): Promise<void> {
  const { error } = await supabase.rpc("accept_trip", { p_trip_id: tripId });
  if (error) throw error;
}

export async function captureDeliveryPhoto(): Promise<ImagePicker.ImagePickerAsset> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error("Permita o acesso à câmera para fotografar a entrega.");
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.75,
    exif: false,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]) throw new Error("Captura da foto cancelada.");
  return result.assets[0];
}

function photoContentType(asset: ImagePicker.ImagePickerAsset): "image/jpeg" | "image/png" | "image/webp" {
  if (asset.mimeType === "image/png") return "image/png";
  if (asset.mimeType === "image/webp") return "image/webp";
  if (!asset.mimeType || asset.mimeType === "image/jpeg") return "image/jpeg";
  throw new Error("Formato não aceito. Tire novamente a foto em JPEG, PNG ou WebP.");
}

export async function registerDeliveryProof(
  stop: Pick<DriverStop, "id" | "tripId">,
  draft: ProofDraft,
  completionEventId: string,
): Promise<void> {
  const contentType = photoContentType(draft.photo);
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const objectName = `${draft.storageId}.${extension}`;
  const locationContentType = photoContentType(draft.locationPhoto);
  const locationExtension = locationContentType === "image/png" ? "png" : locationContentType === "image/webp" ? "webp" : "jpg";
  const locationObjectName = `${draft.storageId}-local.${locationExtension}`;
  const storagePath = `${stop.tripId}/${stop.id}/${objectName}`;
  const locationStoragePath = `${stop.tripId}/${stop.id}/${locationObjectName}`;
  const deliveryFile = new FileSystem.File(draft.photo.uri);
  const locationFile = new FileSystem.File(draft.locationPhoto.uri);
  if (deliveryFile.size > 20 * 1024 * 1024 || locationFile.size > 20 * 1024 * 1024) {
    throw new Error("Cada foto deve ter no máximo 20 MB.");
  }
  const uploadEvidence = async (asset: ImagePicker.ImagePickerAsset, path: string, name: string, type: string) => {
    const file = new FileSystem.File(asset.uri);
    const { error: uploadError } = await supabase.storage.from("delivery-proofs")
      .upload(path, await file.arrayBuffer(), { contentType: type, cacheControl: "3600", upsert: false });
    if (!uploadError) return;
    // Reutiliza o mesmo objeto se o Storage gravou e a resposta se perdeu na rede.
    const { data: existingFiles, error: listError } = await supabase.storage
      .from("delivery-proofs").list(`${stop.tripId}/${stop.id}`, { search: name, limit: 1 });
    if (listError || !existingFiles?.some((item) => item.name === name)) throw uploadError;
  };

  await uploadEvidence(draft.photo, storagePath, objectName, contentType);
  await uploadEvidence(draft.locationPhoto, locationStoragePath, locationObjectName, locationContentType);

  const { error: proofError } = await supabase.rpc("register_delivery_proof", {
    p_stop_id: stop.id,
    p_storage_path: storagePath,
    p_location_storage_path: locationStoragePath,
    p_recipient_name: draft.recipientName.trim(),
    p_captured_at_device: draft.capturedAt,
    p_location_captured_at_device: draft.locationCapturedAt,
    p_latitude: draft.latitude,
    p_longitude: draft.longitude,
    p_location_accuracy_meters: draft.accuracyMeters,
    p_package_id: null,
  });
  if (proofError) throw proofError;

  const { error: statusError } = await supabase.rpc("record_stop_event", {
    p_stop_id: stop.id,
    p_device_event_id: completionEventId,
    p_to_status: "completed",
    p_device_captured_at: draft.capturedAt,
    p_latitude: draft.latitude,
    p_longitude: draft.longitude,
    p_location_accuracy_meters: draft.accuracyMeters,
  });
  if (statusError) throw statusError;
}

export function newDeviceEventId(): string {
  return Crypto.randomUUID();
}

export function newProofStorageId(): string {
  return Crypto.randomUUID();
}






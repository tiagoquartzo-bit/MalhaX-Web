import * as Crypto from "expo-crypto";
import { File, Paths } from "expo-file-system";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";

import { supabase } from "./supabase";

export const DRIVER_LOCATION_TASK = "malhax-driver-location-v1";
const ACTIVE_TRIP_KEY = "malhax.driver.active-tracking-trip";
const ACTIVE_USER_KEY = "malhax.driver.active-tracking-user";
const queueFile = new File(Paths.document, "malhax-driver-tracking-queue.json");
const tempQueueFile = new File(Paths.document, "malhax-driver-tracking-queue.tmp");

type QueuedPosition = {
  userId: string; tripId: string; deviceEventId: string; capturedAt: string;
  latitude: number; longitude: number; accuracyMeters: number | null;
};
type TripTrackingState = { status: string; completed_at: string | null; updated_at: string };

async function readQueue(): Promise<QueuedPosition[]> {
  if (!queueFile.exists) return [];
  const parsed: unknown = JSON.parse(await queueFile.text());
  if (!Array.isArray(parsed)) throw new Error("Fila local de GPS inválida.");
  return parsed as QueuedPosition[];
}

async function saveQueue(positions: QueuedPosition[]) {
  const tempQueueFile = new File(Paths.document, `malhax-driver-tracking-queue-${Crypto.randomUUID()}.tmp`);
  tempQueueFile.create({ intermediates: true, overwrite: false });
  tempQueueFile.write(JSON.stringify(positions));
  await tempQueueFile.move(queueFile, { overwrite: true });
}

let queueOperation = Promise.resolve();
function withQueueLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = queueOperation.then(operation, operation);
  queueOperation = result.then(() => undefined, () => undefined);
  return result;
}

let syncInProgress: Promise<number> | null = null;
export function syncQueuedDriverPositions(): Promise<number> {
  if (syncInProgress) return syncInProgress;
  syncInProgress = (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;
    const queue = await withQueueLock(readQueue);
    const sentIds = new Set<string>();
    let sent = 0;
    for (const point of queue) {
      if (point.userId !== user.id) continue;
      const { error } = await supabase.rpc("record_driver_position", {
        p_trip_id: point.tripId,
        p_device_event_id: point.deviceEventId,
        p_captured_at_device: point.capturedAt,
        p_latitude: point.latitude,
        p_longitude: point.longitude,
        p_accuracy_meters: point.accuracyMeters,
      });
      if (!error) { sentIds.add(point.deviceEventId); sent += 1; }
    }
    await withQueueLock(async () => {
      const latestQueue = await readQueue();
      await saveQueue(latestQueue.filter((point) => !sentIds.has(point.deviceEventId)));
    });
    return sent;
  })().finally(() => { syncInProgress = null; });
  return syncInProgress;
}

async function enqueuePositions(tripId: string, userId: string, locations: Location.LocationObject[]) {
  if (!locations.length) return;
  await withQueueLock(async () => {
    const queue = await readQueue();
    for (const location of locations) {
      queue.push({
        userId, tripId, deviceEventId: Crypto.randomUUID(),
        capturedAt: new Date(location.timestamp).toISOString(),
        latitude: location.coords.latitude, longitude: location.coords.longitude,
        accuracyMeters: location.coords.accuracy,
      });
    }
    await saveQueue(queue);
  });
}

async function stopSystemLocationUpdates() {
  if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  }
}

async function finishTracking() {
  await stopSystemLocationUpdates();
  await SecureStore.deleteItemAsync(ACTIVE_TRIP_KEY);
  await SecureStore.deleteItemAsync(ACTIVE_USER_KEY);
  await syncQueuedDriverPositions();
}

TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(DRIVER_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const [tripId, userId] = await Promise.all([
    SecureStore.getItemAsync(ACTIVE_TRIP_KEY), SecureStore.getItemAsync(ACTIVE_USER_KEY),
  ]);
  if (!tripId || !userId) {
    await stopSystemLocationUpdates();
    return;
  }

  const { data: trip, error: tripError } = await supabase
    .from("trips").select("status, completed_at, updated_at").eq("id", tripId).maybeSingle()
    .overrideTypes<TripTrackingState | null, { merge: false }>();
  if (tripError) {
    await enqueuePositions(tripId, userId, data?.locations ?? []);
    await syncQueuedDriverPositions();
    return;
  }
  if (!trip) {
    await finishTracking();
    return;
  }

  if (trip.status !== "in_progress") {
    const locations = (data?.locations ?? []).filter((location) => {
      const capturedAt = location.timestamp;
      if (trip.status === "completed" && trip.completed_at) return capturedAt <= new Date(trip.completed_at).getTime();
      if (trip.status === "paused" || trip.status === "cancelled") return capturedAt <= new Date(trip.updated_at).getTime();
      return false;
    });
    await enqueuePositions(tripId, userId, locations);
    await finishTracking();
    return;
  }

  await enqueuePositions(tripId, userId, data?.locations ?? []);
  await syncQueuedDriverPositions();
});

export async function getDriverTrackingState() {
  const [tripId, userId, queue] = await Promise.all([
    SecureStore.getItemAsync(ACTIVE_TRIP_KEY), SecureStore.getItemAsync(ACTIVE_USER_KEY), withQueueLock(readQueue),
  ]);
  return { tripId, queuedCount: userId ? queue.filter((point) => point.userId === userId).length : 0 };
}

export async function startDriverTracking(tripId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Entre novamente no aplicativo antes de iniciar o rastreamento.");

  const { data: trip, error: tripError } = await supabase.from("trips").select("status").eq("id", tripId).maybeSingle();
  if (tripError || !trip || trip.status !== "in_progress") throw new Error("O rastreamento só pode começar após a viagem iniciar. Atualize a viagem e tente novamente.");
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) throw new Error("A permissão de localização durante o uso do app é necessária para iniciar o histórico GPS.");
  let background = await Location.getBackgroundPermissionsAsync();
  if (!background.granted) background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) throw new Error("Para registrar a rota com a tela apagada, habilite a localização em segundo plano nas configurações do Android.");

  const [currentTripId, currentUserId] = await Promise.all([
    SecureStore.getItemAsync(ACTIVE_TRIP_KEY), SecureStore.getItemAsync(ACTIVE_USER_KEY),
  ]);
  if (currentTripId && currentTripId !== tripId) throw new Error("Já existe outra viagem com rastreamento ativo. Encerre o rastreamento anterior antes de iniciar esta.");
  if (currentUserId && currentUserId !== user.id) throw new Error("O rastreamento ativo pertence a outra sessão. Saia e entre com a conta correta.");

  await SecureStore.setItemAsync(ACTIVE_TRIP_KEY, tripId);
  await SecureStore.setItemAsync(ACTIVE_USER_KEY, user.id);
  try {
    if (!(await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK))) {
      await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, locationOptions);
    }
  } catch (error) {
    await SecureStore.deleteItemAsync(ACTIVE_TRIP_KEY);
    await SecureStore.deleteItemAsync(ACTIVE_USER_KEY);
    throw error;
  }
  await syncQueuedDriverPositions();
}

const locationOptions: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 15_000,
  distanceInterval: 15,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: false,
  foregroundService: {
    notificationTitle: "MalhaX registrando a rota",
    notificationBody: "A localização é registrada durante a viagem ativa para o acompanhamento operacional.",
    killServiceOnDestroy: false,
  },
};

export async function stopDriverTracking(tripId?: string) {
  if (tripId) {
    const currentTripId = await SecureStore.getItemAsync(ACTIVE_TRIP_KEY);
    if (currentTripId !== tripId) return;
  }
  await finishTracking();
}

export async function resumeDriverTrackingIfActive() {
  const tripId = await SecureStore.getItemAsync(ACTIVE_TRIP_KEY);
  if (!tripId) return;
  const { data: trip, error } = await supabase.from("trips").select("status").eq("id", tripId).maybeSingle();
  if (error) return;
  if (!trip || trip.status !== "in_progress") {
    await finishTracking();
    return;
  }
  const [foreground, background] = await Promise.all([
    Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync(),
  ]);
  if (!foreground.granted || !background.granted) return;
  if (!(await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK))) {
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, locationOptions);
  }
  await syncQueuedDriverPositions();
}



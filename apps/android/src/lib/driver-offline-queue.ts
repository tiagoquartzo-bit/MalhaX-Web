import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import type { ImagePickerAsset } from "expo-image-picker";

import type { CapturedStopEvent, DriverStop, ProofDraft } from "./driver-api";
import { registerDeliveryProof, submitStopEvent } from "./driver-api";
import { supabase } from "./supabase";

const queueFile = new FileSystem.File(FileSystem.Paths.document, "malhax-driver-actions.json");
const maxQueuedActions = 50;

type QueueBase = {
  id: string;
  actorUserId: string;
  tripId: string;
  stopId: string;
  createdAt: string;
  attempts: number;
  state: "queued" | "needs_attention";
};

export type QueuedDriverAction = QueueBase & (
  | { kind: "status"; event: CapturedStopEvent }
  | {
      kind: "delivery_proof";
      completionEventId: string;
      storageId: string;
      recipientName: string;
      capturedAt: string;
      locationCapturedAt: string | null;
      latitude: number | null;
      longitude: number | null;
      accuracyMeters: number | null;
      photoUri: string;
      mimeType: string | null;
      locationPhotoUri: string;
      locationPhotoMimeType: string | null;
    }
);

export type QueueSyncResult = { sentCount: number; queuedCount: number; needsAttention: boolean };

async function readQueue(): Promise<QueuedDriverAction[]> {
  if (!queueFile.exists) return [];
  const parsed: unknown = JSON.parse(await queueFile.text());
  if (!Array.isArray(parsed)) throw new Error("A fila de sincronização do aparelho está inválida.");
  return parsed as QueuedDriverAction[];
}

async function writeQueue(actions: QueuedDriverAction[]) {
  const temporary = new FileSystem.File(FileSystem.Paths.document, `malhax-driver-actions-${Crypto.randomUUID()}.tmp`);
  temporary.create({ intermediates: true, overwrite: false });
  temporary.write(JSON.stringify(actions));
  await temporary.move(queueFile, { overwrite: true });
}

let queueOperation = Promise.resolve();
function withQueueLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = queueOperation.then(operation, operation);
  queueOperation = result.then(() => undefined, () => undefined);
  return result;
}

let syncInProgress: Promise<QueueSyncResult> | null = null;

function currentUserId(sessionUserId: string | undefined): string {
  if (!sessionUserId) throw new Error("Entre novamente quando houver conexão para sincronizar as ações salvas.");
  return sessionUserId;
}

async function appendAction(action: QueuedDriverAction) {
  await withQueueLock(async () => {
    const queue = await readQueue();
    if (queue.length >= maxQueuedActions) throw new Error("A fila está cheia. Sincronize as ações pendentes antes de continuar.");
    await writeQueue([...queue, action]);
  });
}

export async function enqueueStopEvent(tripId: string, event: CapturedStopEvent): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  await appendAction({
    id: event.deviceEventId,
    actorUserId: currentUserId(session?.user.id),
    tripId,
    stopId: event.stopId,
    createdAt: new Date().toISOString(),
    attempts: 0,
    state: "queued",
    kind: "status",
    event,
  });
}

export async function enqueueDeliveryProof(
  stop: Pick<DriverStop, "id" | "tripId">,
  draft: ProofDraft,
  completionEventId: string,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const actorUserId = currentUserId(session?.user.id);
  const source = new FileSystem.File(draft.photo.uri);
  const locationSource = new FileSystem.File(draft.locationPhoto.uri);
  if (source.size > 20 * 1024 * 1024 || locationSource.size > 20 * 1024 * 1024) throw new Error("Cada foto deve ter no máximo 20 MB.");
  const extension = draft.photo.mimeType === "image/png" ? "png" : draft.photo.mimeType === "image/webp" ? "webp" : "jpg";
  const storedPhoto = new FileSystem.File(FileSystem.Paths.document, `malhax-proof-${draft.storageId}.${extension}`);
  const locationExtension = draft.locationPhoto.mimeType === "image/png" ? "png" : draft.locationPhoto.mimeType === "image/webp" ? "webp" : "jpg";
  const storedLocationPhoto = new FileSystem.File(FileSystem.Paths.document, `malhax-proof-${draft.storageId}-local.${locationExtension}`);
  await source.copy(storedPhoto, { overwrite: true });
  try {
    await locationSource.copy(storedLocationPhoto, { overwrite: true });
  } catch (error) {
    if (storedPhoto.exists) storedPhoto.delete();
    throw error;
  }

  try {
    await appendAction({
      id: completionEventId,
      actorUserId,
      tripId: stop.tripId,
      stopId: stop.id,
      createdAt: new Date().toISOString(),
      attempts: 0,
      state: "queued",
      kind: "delivery_proof",
      completionEventId,
      storageId: draft.storageId,
      recipientName: draft.recipientName,
      capturedAt: draft.capturedAt,
      locationCapturedAt: draft.locationCapturedAt,
      latitude: draft.latitude,
      longitude: draft.longitude,
      accuracyMeters: draft.accuracyMeters,
      photoUri: storedPhoto.uri,
      mimeType: draft.photo.mimeType ?? null,
      locationPhotoUri: storedLocationPhoto.uri,
      locationPhotoMimeType: draft.locationPhoto.mimeType ?? null,
    });
  } catch (error) {
    if (storedPhoto.exists) storedPhoto.delete();
    if (storedLocationPhoto.exists) storedLocationPhoto.delete();
    throw error;
  }
}

export async function loadQueuedDriverActions(): Promise<QueuedDriverAction[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user.id;
  if (!userId) return [];
  return withQueueLock(async () => (await readQueue()).filter((item) => item.actorUserId === userId));
}

export function isConnectivityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /network request failed|failed to fetch|fetch failed|networkerror|load failed|connection (?:lost|refused|reset)|timed? ?out|internet connection|no internet|offline|econn(?:refused|reset|aborted)|nsurlerrordomain/i.test(message);
}

function asImageAsset(uri: string, mimeType: string | null): ImagePickerAsset {
  return { uri, mimeType } as ImagePickerAsset;
}

async function removeAction(id: string) {
  await withQueueLock(async () => {
    const queue = await readQueue();
    await writeQueue(queue.filter((item) => item.id !== id));
  });
}

async function markNeedsAttention(id: string) {
  await withQueueLock(async () => {
    const queue = await readQueue();
    await writeQueue(queue.map((item) => item.id === id
      ? { ...item, attempts: item.attempts + 1, state: "needs_attention" }
      : item));
  });
}

export function syncQueuedDriverActions(): Promise<QueueSyncResult> {
  if (syncInProgress) return syncInProgress;
  syncInProgress = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user.id;
    if (!userId) return { sentCount: 0, queuedCount: (await readQueue()).length, needsAttention: false };

    const queue = await withQueueLock(readQueue);
    const userQueue = queue.filter((item) => item.actorUserId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let sentCount = 0;
    let needsAttention = false;
    for (const action of userQueue) {
      try {
        if (action.kind === "status") {
          await submitStopEvent(action.event);
        } else {
          if (!action.locationPhotoUri) throw new Error("Este comprovante salvo não contém a foto da fachada. Refaça as duas fotos antes de enviar.");
          await registerDeliveryProof(
            { id: action.stopId, tripId: action.tripId },
            {
              photo: asImageAsset(action.photoUri, action.mimeType),
              locationPhoto: asImageAsset(action.locationPhotoUri, action.locationPhotoMimeType),
              recipientName: action.recipientName,
              capturedAt: action.capturedAt,
              locationCapturedAt: action.locationCapturedAt ?? (action.latitude !== null ? action.capturedAt : null),
              latitude: action.latitude,
              longitude: action.longitude,
              accuracyMeters: action.accuracyMeters,
              storageId: action.storageId,
            },
            action.completionEventId,
          );
        }
        await removeAction(action.id);
        if (action.kind === "delivery_proof") {
          const file = new FileSystem.File(action.photoUri);
          if (file.exists) file.delete();
          const locationPhoto = new FileSystem.File(action.locationPhotoUri);
          if (locationPhoto.exists) locationPhoto.delete();
        }
        sentCount += 1;
      } catch (error) {
        if (!isConnectivityError(error)) {
          await markNeedsAttention(action.id);
          needsAttention = true;
        } else {
          await withQueueLock(async () => {
            const latest = await readQueue();
            await writeQueue(latest.map((item) => item.id === action.id ? { ...item, attempts: item.attempts + 1 } : item));
          });
        }
        break;
      }
    }

    const remaining = await withQueueLock(readQueue);
    return {
      sentCount,
      queuedCount: remaining.filter((item) => item.actorUserId === userId).length,
      needsAttention: needsAttention || remaining.some((item) => item.actorUserId === userId && item.state === "needs_attention"),
    };
  })().finally(() => { syncInProgress = null; });
  return syncInProgress;
}

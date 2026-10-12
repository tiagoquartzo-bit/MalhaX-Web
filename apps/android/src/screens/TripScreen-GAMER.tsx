import { useEffect, useRef, useState } from "react";
import {
  AppState,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { StopStatus } from "@activia/shared";
import { getDriverTrackingState, startDriverTracking, stopDriverTracking } from "../lib/driver-tracking";
import type { DriverStop, DriverTrip, ProofDraft } from "../lib/driver-api";
import {
  captureDeliveryPhoto,
  captureLocation,
  createStopEvent,
  newDeviceEventId,
  newProofStorageId,
  registerDeliveryProof,
  submitStopEvent,
} from "../lib/driver-api";
import {
  enqueueDeliveryProof,
  enqueueStopEvent,
  isConnectivityError,
  loadQueuedDriverActions,
  syncQueuedDriverActions,
  type QueuedDriverAction,
} from "../lib/driver-offline-queue";
import { tripLabels } from "./TripsScreen";
import { GpsStatusPanel } from "../components/GpsStatusPanel";

const closedStatuses = new Set(["completed", "failed", "skipped"]);

export function TripScreen({
  trip,
  onBack,
  onChanged,
  onSupport,
}: {
  trip: DriverTrip;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onSupport: () => void;
}) {
  const eventIds = useRef(new Map<string, string>());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [locationPhoto, setLocationPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [proofCapturedAt, setProofCapturedAt] = useState<string | null>(null);
  const [storageId, setStorageId] = useState<string | null>(null);
  const [proofLocation, setProofLocation] = useState<Awaited<ReturnType<typeof captureLocation>> | null>(null);
  const [gpsWarning, setGpsWarning] = useState<string | null>(null);
  const [occurrenceReason, setOccurrenceReason] = useState("");
  const [trackingTripId, setTrackingTripId] = useState<string | null>(null);
  const [queuedGpsCount, setQueuedGpsCount] = useState(0);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [queuedActions, setQueuedActions] = useState<QueuedDriverAction[]>([]);
  const [queueSyncBusy, setQueueSyncBusy] = useState(false);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);

  async function refreshQueuedActions() {
    setQueuedActions(await loadQueuedDriverActions());
  }

  async function synchronizeActions() {
    if (queueSyncBusy) return;
    setQueueSyncBusy(true);
    try {
      const result = await syncQueuedDriverActions();
      await refreshQueuedActions();
      if (result.sentCount > 0) {
        setQueueNotice(`${result.sentCount} ${result.sentCount === 1 ? "ação sincronizada" : "ações sincronizadas"}.`);
        await onChanged();
      } else if (result.queuedCount > 0 && !result.needsAttention) {
        setQueueNotice("O servidor ainda não confirmou as ações. Elas continuam salvas no aparelho.");
      }
    } catch {
      setQueueNotice("Não foi possível sincronizar agora. As ações continuam salvas no aparelho.");
    } finally {
      setQueueSyncBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    const synchronizeIfNeeded = async () => {
      try {
        const pending = await loadQueuedDriverActions();
        if (!active) return;
        setQueuedActions(pending);
        if (!pending.length) return;
        const result = await syncQueuedDriverActions();
        if (!active) return;
        setQueuedActions(await loadQueuedDriverActions());
        if (result.sentCount) await onChanged();
      } catch {
        // A fila permanece no armazenamento privado do app; a próxima tentativa poderá concluí-la.
      }
    };
    void synchronizeIfNeeded();
    const timer = setInterval(() => { void synchronizeIfNeeded(); }, 25_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void synchronizeIfNeeded();
    });
    return () => { active = false; clearInterval(timer); subscription.remove(); };
  }, [trip.id]);

  useEffect(() => {
    let active = true;
    const refreshTracking = async () => {
      try {
        const state = await getDriverTrackingState();
        if (active) { setTrackingTripId(state.tripId); setQueuedGpsCount(state.queuedCount); }
      } catch { if (active) setError("Não foi possível consultar o estado do histórico GPS."); }
    };
    void refreshTracking();
    const timer = setInterval(() => { void refreshTracking(); }, 20_000);
    return () => { active = false; clearInterval(timer); };
  }, [trip.id]);

  useEffect(() => {
    if (trip.status === "completed" || trip.status === "cancelled") {
      void getDriverTrackingState().then(async (current) => {
        if (current.tripId !== trip.id) return;
        await stopDriverTracking(trip.id);
        const state = await getDriverTrackingState();
        setTrackingTripId(state.tripId);
        setQueuedGpsCount(state.queuedCount);
      }).catch(() => setError("A viagem encerrou; os pontos GPS pendentes serão sincronizados quando houver conexão."));
    }
  }, [trip.status, trip.id]);

  async function enableTracking() {
    setTrackingBusy(true);
    setError(null);
    try {
      await startDriverTracking(trip.id);
      const state = await getDriverTrackingState();
      setTrackingTripId(state.tripId);
      setQueuedGpsCount(state.queuedCount);
    } catch (trackingError) {
      setError(trackingError instanceof Error ? trackingError.message : "Não foi possível iniciar o histórico GPS.");
    } finally { setTrackingBusy(false); }
  }

  function confirmTrackingStart() {
    Alert.alert(
      "Iniciar histórico GPS",
      "Durante esta viagem, o MalhaX registra posições para montar o trajeto do dia. O Android mantém uma notificação visível enquanto o rastreamento está ativo. Você pode interrompê-lo a qualquer momento; isso deixará um intervalo no histórico.",
      [{ text: "Agora não", style: "cancel" }, { text: "Continuar", onPress: () => void enableTracking() }],
    );
  }

  async function disableTracking() {
    setTrackingBusy(true);
    try {
      await stopDriverTracking(trip.id);
      const state = await getDriverTrackingState();
      setTrackingTripId(state.tripId);
      setQueuedGpsCount(state.queuedCount);
    } catch { setError("O rastreamento foi interrompido; posições pendentes permanecem no aparelho até a conexão voltar."); }
    finally { setTrackingBusy(false); }
  }

  const queuedStatusByStop = new Map<string, StopStatus>();
  const tripQueuedActions = queuedActions.filter((action) => action.tripId === trip.id);
  const tripNeedsAttention = tripQueuedActions.some((action) => action.state === "needs_attention");
  for (const action of tripQueuedActions) {
    queuedStatusByStop.set(action.stopId, action.kind === "status" ? action.event.status : "completed");
  }
  const displayedStops = trip.stops.map((stop) => {
    const localStatus = queuedStatusByStop.get(stop.id);
    return localStatus ? { ...stop, status: localStatus } : stop;
  });
  const activeStop = displayedStops.find((stop) => !closedStatuses.has(stop.status));
  const closedStopCount = displayedStops.filter((stop) => closedStatuses.has(stop.status)).length;
  const pendingStopCount = displayedStops.length - closedStopCount;
  const occurrenceCount = displayedStops.filter((stop) => stop.status === "failed").length;
  const progressPercent = displayedStops.length ? Math.round((closedStopCount / displayedStops.length) * 100) : 0;

  async function changeStatus(stop: DriverStop, nextStatus: "arrived" | "in_progress" | "completed" | "failed", reason?: string) {
    const eventKey = `${stop.id}:${nextStatus}`;
    const eventId = eventIds.current.get(eventKey) ?? newDeviceEventId();
    eventIds.current.set(eventKey, eventId);
    setBusy(stop.id);
    setError(null);
    try {
      const event = await createStopEvent(stop.id, nextStatus, eventId, reason);
      try {
        await submitStopEvent(event);
      } catch (submitError) {
        if (!isConnectivityError(submitError)) throw submitError;
        await enqueueStopEvent(stop.tripId, event);
        eventIds.current.delete(eventKey);
        setQueueNotice(event.latitude === null
          ? "Ação salva no aparelho sem GPS. O status será sincronizado e ficará sinalizado para o gestor."
          : "Ação salva no aparelho. O servidor ainda não confirmou a atualização.");
        await refreshQueuedActions();
        if (nextStatus === "failed") setOccurrenceReason("");
        return;
      }
      eventIds.current.delete(eventKey);
      await onChanged();
      if (event.latitude === null) setQueueNotice("Status atualizado. O GPS não respondeu; essa parada ficará sinalizada para o gestor.");
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "A alteração não foi confirmada. Confira a conexão e tente novamente.");
    } finally {
      setBusy(null);
    }
  }

  async function takePhoto() {
    setError(null);
    try {
      const asset = await captureDeliveryPhoto();
      setPhoto(asset);
      setLocationPhoto(null);
      setProofCapturedAt(null);
      setStorageId(newProofStorageId());
      setProofLocation(null);
      setGpsWarning(null);
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "Não foi possível capturar foto e localização.");
    }
  }

  async function takeLocationPhoto() {
    setError(null);
    try {
      setLocationPhoto(await captureDeliveryPhoto());
      setProofCapturedAt(new Date().toISOString());
      const location = await captureLocation();
      setProofLocation(location);
      setGpsWarning(location
        ? location.accuracyMeters !== null && location.accuracyMeters > 50
          ? `Precisão GPS baixa (±${Math.round(location.accuracyMeters)} m). A entrega pode continuar; tente atualizar a localização se possível.`
          : null
        : "GPS indisponível. A entrega pode continuar; o comprovante ficará sinalizado sem localização.");
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "Não foi possível fotografar a fachada/local.");
    }
  }

  async function retryProofLocation() {
    setError(null);
    try {
      const location = await captureLocation();
      setProofLocation(location);
      setGpsWarning(location
        ? location.accuracyMeters !== null && location.accuracyMeters > 50
          ? `Precisão GPS baixa (±${Math.round(location.accuracyMeters)} m). Você pode atualizar novamente ou concluir a entrega.`
          : null
        : "GPS continua indisponível. Você pode concluir a entrega sem coordenadas.");
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "Não foi possível obter a localização.");
    }
  }

  async function completeDelivery(stop: DriverStop) {
    if (!photo || !locationPhoto || !storageId || !recipientName.trim()) {
      setError("Informe quem recebeu e fotografe a entrega e a fachada/local antes de concluir.");
      return;
    }
    const completionKey = `${stop.id}:completed`;
    const completionEventId = eventIds.current.get(completionKey) ?? newDeviceEventId();
    eventIds.current.set(completionKey, completionEventId);
    const draft: ProofDraft = {
      photo,
      locationPhoto,
      recipientName: recipientName.trim(),
      capturedAt: proofCapturedAt ?? new Date().toISOString(),
      locationCapturedAt: proofLocation?.capturedAt ?? null,
      latitude: proofLocation?.latitude ?? null,
      longitude: proofLocation?.longitude ?? null,
      accuracyMeters: proofLocation?.accuracyMeters ?? null,
      storageId,
    };
    setBusy(stop.id);
    setError(null);
    try {
      try {
        await registerDeliveryProof(stop, draft, completionEventId);
      } catch (proofError) {
        if (!isConnectivityError(proofError)) throw proofError;
        await enqueueDeliveryProof(stop, draft, completionEventId);
        eventIds.current.delete(completionKey);
        setQueueNotice(proofLocation
          ? "As duas fotos e a localização foram salvas no aparelho. A entrega aguarda sincronização."
          : "As duas fotos foram salvas no aparelho sem GPS. A entrega aguarda sincronização e ficará sinalizada para o gestor.");
        setRecipientName("");
        setPhoto(null);
        setLocationPhoto(null);
        setProofCapturedAt(null);
        setStorageId(null);
        setProofLocation(null);
        setGpsWarning(null);
        await refreshQueuedActions();
        return;
      }
      eventIds.current.delete(completionKey);
      setRecipientName("");
      setPhoto(null);
      setLocationPhoto(null);
      setProofCapturedAt(null);
      setStorageId(null);
      setProofLocation(null);
      setGpsWarning(null);
      await onChanged();
    } catch (proofError) {
      const message = proofError instanceof Error ? proofError.message : "Não foi possível confirmar a entrega.";
      setError(message.includes("delivery_proof_required")
        ? "A entrega ainda não foi confirmada. Confira os dados e tente novamente."
        : message);
    } finally {
      setBusy(null);
    }
  }

  async function openNavigation(stop: DriverStop) {
    const destination = stop.latitude !== null && stop.longitude !== null
      ? `${stop.latitude},${stop.longitude}`
      : [stop.addressLine, stop.addressExtra, stop.district, stop.city, stop.state, stop.postalCode].filter(Boolean).join(", ");
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
    try {
      await Linking.openURL(url);
    } catch {
      setError("Não foi possível abrir o aplicativo de mapas.");
    }
  }

  async function callContact(stop: DriverStop) {
    const phone = stop.contactPhone?.replace(/[^\d+]/g, "");
    if (!phone) return;
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      setError("Não foi possível abrir o discador do telefone.");
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ Viagens</Text></Pressable>
        <Text style={styles.headerBrand}>MALHAX</Text>
        <Pressable accessibilityRole="button" onPress={onSupport} style={styles.support}><Text style={styles.supportText}>Suporte</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Viagem #{trip.number}</Text>
        <Text style={styles.subtitle}>{trip.status === "in_progress" ? "Viagem em andamento" : tripLabels.tripStatusLabel[trip.status] ?? trip.status}{trip.vehiclePlate ? ` · ${trip.vehiclePlate}` : ""}</Text>
        <View style={styles.progressPanel}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Andamento da rota</Text>
            <Text style={styles.progressCount}>{closedStopCount}/{trip.stops.length}</Text>
          </View>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progressPercent }} style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.progressCaption}>
            {pendingStopCount} {pendingStopCount === 1 ? "parada pendente" : "paradas pendentes"}{occurrenceCount ? ` · ${occurrenceCount} ${occurrenceCount === 1 ? "ocorrência" : "ocorrências"}` : ""}
          </Text>
        </View>
        {queuedActions.length ? (
          <View style={[styles.queuePanel, tripNeedsAttention && styles.queuePanelAttention]} accessibilityLiveRegion="polite">
            <Text style={styles.queuePanelTitle}>{tripNeedsAttention ? "Ação precisa de atenção" : "Sincronização pendente"}</Text>
            <Text style={styles.queueText}>{tripQueuedActions.length === 1 ? "1 ação desta viagem está salva" : `${tripQueuedActions.length} ações desta viagem estão salvas`} no armazenamento privado do app. O servidor ainda não confirmou.</Text>
            {queueNotice ? <Text style={styles.queueNotice}>{queueNotice}</Text> : null}
            <Pressable accessibilityRole="button" disabled={queueSyncBusy} onPress={() => void synchronizeActions()} style={styles.queueAction}>
              <Text style={styles.queueActionText}>{queueSyncBusy ? "Sincronizando…" : "Tentar sincronizar"}</Text>
            </Pressable>
          </View>
        ) : queueNotice ? <Text style={styles.queueSuccess} accessibilityLiveRegion="polite">{queueNotice}</Text> : null}
        {trip.status === "paused" ? <Text style={styles.pausedBanner}>Esta viagem está pausada. Fale com o suporte antes de continuar.</Text> : null}
        {trip.status === "in_progress" ? (
        <View style={styles.trackingPanel}>
          <Text style={styles.trackingTitle}>{trackingTripId === trip.id ? "Histórico GPS ativo" : "Histórico GPS da viagem"}</Text>
          <Text style={styles.trackingText}>{trackingTripId === trip.id ? `O trajeto está sendo registrado. ${queuedGpsCount ? `${queuedGpsCount} ponto(s) aguardam sincronização.` : "Os pontos estão sincronizados."}` : "Ative para registrar o trajeto mesmo com a tela apagada. O app solicitará acesso à localização em segundo plano."}</Text>
          {trackingTripId === trip.id ? <Pressable disabled={trackingBusy} onPress={() => Alert.alert("Interromper histórico GPS?", "O mapa terá uma lacuna a partir de agora. Os pontos já registrados continuam salvos.", [{ text: "Manter ativo", style: "cancel" }, { text: "Interromper", style: "destructive", onPress: () => void disableTracking() }])} style={styles.stopTracking}><Text style={styles.stopTrackingText}>{trackingBusy ? "Atualizando…" : "Interromper rastreamento"}</Text></Pressable> : trackingTripId ? <Text style={styles.trackingWarning}>Outra viagem está com o GPS ativo.</Text> : <Pressable disabled={trackingBusy} onPress={confirmTrackingStart} style={styles.startTracking}><Text style={styles.startTrackingText}>{trackingBusy ? "Iniciando…" : "Iniciar histórico GPS"}</Text></Pressable>}
        </View>
      ) : null}
        {trip.status === "in_progress" ? <GpsStatusPanel active={trackingTripId === trip.id} stops={displayedStops} /> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {displayedStops.map((stop) => {
          const isActive = activeStop?.id === stop.id;
          const isBusy = busy === stop.id;
          const awaitingSync = queuedStatusByStop.has(stop.id);
          return (
            <View key={stop.id} style={[styles.stopCard, isActive && styles.activeStop]}>
              <View style={styles.stopTop}>
                <View style={styles.sequence}><Text style={styles.sequenceText}>{stop.sequence}</Text></View>
                <View style={styles.stopHeading}>
                  <Text style={styles.stopType}>{tripLabels.stopTypeLabel[stop.type] ?? stop.type}</Text>
                  <Text style={styles.stopTitle}>{stop.addressLabel}</Text>
                </View>
                <Text style={styles.stopStatus}>{awaitingSync ? "Pendente de sync" : tripLabels.stopStatusLabel[stop.status] ?? stop.status}</Text>
              </View>
              {awaitingSync ? <Text style={styles.queuedStopNote}>Atualização salva no aparelho; aguardando confirmação do servidor.</Text> : null}
              <Text style={styles.address}>{stop.addressLine}{stop.addressExtra ? `, ${stop.addressExtra}` : ""}</Text>
              <Text style={styles.addressMuted}>{[stop.district, stop.city, stop.state, stop.postalCode].filter(Boolean).join(" · ")}</Text>
              {stop.latitude !== null && stop.longitude !== null ? (
                <Text selectable style={styles.stopCoordinates}>Coordenadas do destino · {stop.latitude.toFixed(6)}, {stop.longitude.toFixed(6)}</Text>
              ) : (
                <Text style={styles.stopCoordinatesMissing}>GPS do destino não cadastrado · o Maps usará o endereço</Text>
              )}
              {stop.contactName ? <Text style={styles.contact}>{stop.contactName}</Text> : null}
              {stop.contactPhone ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Ligar para ${stop.contactName || "o contato da parada"}, ${stop.contactPhone}`} hitSlop={8} onPress={() => void callContact(stop)} style={styles.callContact}>
                  <Text style={styles.callContactText}>☎  {stop.contactPhone}  ·  Ligar</Text>
                </Pressable>
              ) : null}
              {stop.instructions ? <Text style={styles.instructions}>Orientação: {stop.instructions}</Text> : null}
              <View style={styles.packages}>
                {stop.packages.map((item, index) => <Text key={`${item.code}-${index}`} style={styles.packageCode}>{item.action === "load" ? "Coletar" : item.action === "unload" ? "Entregar" : "Retorno"} · {item.code}{item.description ? ` · ${item.description}` : ""}</Text>)}
              </View>
              {isActive ? <Pressable onPress={() => void openNavigation(stop)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Abrir rota no Google Maps</Text></Pressable> : null}
              {isActive && trip.status !== "paused" && stop.status === "pending" ? <ActionButton busy={isBusy} label="Cheguei ao local" onPress={() => void changeStatus(stop, "arrived")} /> : null}
              {isActive && trip.status !== "paused" && stop.status === "arrived" ? <ActionButton busy={isBusy} label="Iniciar atendimento" onPress={() => void changeStatus(stop, "in_progress")} /> : null}
              {isActive && trip.status !== "paused" && stop.status === "in_progress" && stop.type !== "delivery" ? <ActionButton busy={isBusy} label="Concluir parada" onPress={() => void changeStatus(stop, "completed")} /> : null}
              {isActive && trip.status !== "paused" && stop.status === "in_progress" && stop.type === "delivery" ? (
                <View style={styles.proofPanel}>
                  <Text style={styles.proofTitle}>Comprovante de entrega</Text>
                  <Text style={styles.label}>Nome de quem recebeu</Text>
                  <TextInput onChangeText={setRecipientName} placeholder="Nome e sobrenome" placeholderTextColor="#75839a" style={styles.input} value={recipientName} />
                  <Pressable disabled={isBusy} onPress={() => void takePhoto()} style={styles.secondaryButton}>
                    <Text style={styles.secondaryText}>{photo ? "Refazer foto da entrega" : "1 · Fotografar a entrega"}</Text>
                  </Pressable>
                  {photo ? <Image resizeMode="cover" source={{ uri: photo.uri }} style={styles.preview} /> : null}
                  <Text style={styles.label}>Foto obrigatória da fachada/local</Text>
                  <Text style={styles.gpsHint}>Enquadre a frente da casa, loja ou ponto de entrega para identificar o endereço.</Text>
                  <Pressable disabled={isBusy} onPress={() => void takeLocationPhoto()} style={styles.secondaryButton}>
                    <Text style={styles.secondaryText}>{locationPhoto ? "Refazer foto do local" : "2 · Fotografar a fachada/local"}</Text>
                  </Pressable>
                  {locationPhoto ? <Image resizeMode="cover" source={{ uri: locationPhoto.uri }} style={styles.preview} /> : null}
                  {proofLocation ? (
                    <Text style={proofLocation.accuracyMeters !== null && proofLocation.accuracyMeters > 50 ? styles.gpsWarning : styles.gpsText}>
                      GPS capturado · {proofLocation.accuracyMeters === null ? "precisão não informada" : `precisão ±${Math.round(proofLocation.accuracyMeters)} m`}
                    </Text>
                  ) : null}
                  {locationPhoto && (!proofLocation || (proofLocation.accuracyMeters !== null && proofLocation.accuracyMeters > 50)) ? (
                    <Pressable onPress={() => void retryProofLocation()} style={styles.secondaryButton}><Text style={styles.secondaryText}>{proofLocation ? "Atualizar GPS (precisão baixa)" : "Tentar GPS novamente"}</Text></Pressable>
                  ) : null}
                  {!locationPhoto ? <Text style={styles.gpsHint}>A localização será capturada após a foto da fachada/local.</Text> : null}
                  {gpsWarning ? <Text style={styles.gpsWarning}>{gpsWarning}</Text> : null}
                  <ActionButton busy={isBusy} disabled={!photo || !locationPhoto || !recipientName.trim()} label="Confirmar entrega" onPress={() => void completeDelivery(stop)} />
                </View>
              ) : null}
              {isActive && trip.status !== "paused" ? (
                <View style={styles.occurrencePanel}>
                  <Text style={styles.label}>Não conseguiu concluir? Descreva o motivo</Text>
                  <TextInput multiline onChangeText={setOccurrenceReason} placeholder="Ex.: destinatário ausente, endereço fechado..." placeholderTextColor="#75839a" style={[styles.input, styles.reasonInput]} value={occurrenceReason} />
                  <ActionButton busy={isBusy} disabled={occurrenceReason.trim().length < 5} label="Registrar ocorrência" onPress={() => void changeStatus(stop, "failed", occurrenceReason.trim())} />
                </View>
              ) : null}
              {!isActive && !closedStatuses.has(stop.status) ? <Text style={styles.sequenceHint}>Aguarde concluir a parada anterior para iniciar esta.</Text> : null}
            </View>
          );
        })}
        {!activeStop && tripQueuedActions.length ? <View style={styles.queuePanel}><Text style={styles.queuePanelTitle}>Rota aguardando sincronização</Text><Text style={styles.queueText}>As ações desta viagem estão salvas no aparelho. O suporte só verá as conclusões quando o servidor confirmar.</Text></View> : null}
        {!activeStop && !tripQueuedActions.length ? <View style={styles.finished}><Text style={styles.finishedTitle}>Rota concluída</Text><Text style={styles.addressMuted}>Todas as paradas foram encerradas.</Text></View> : null}
      </ScrollView>
    </View>
  );
}

function ActionButton({
  label,
  busy,
  disabled = false,
  onPress,
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable disabled={busy || disabled} onPress={onPress} style={[styles.actionButton, (busy || disabled) && styles.disabled]}>
      {busy ? <ActivityIndicator color="#07101e" /> : <Text style={styles.actionText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#070e1a", paddingTop: 14 },
  header: { height: 46, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { paddingVertical: 8, paddingRight: 12 },
  backText: { color: "#38e1ff", fontSize: 15, fontWeight: "700" },
  support: { paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: "#00c2cb", borderRadius: 9 },
  supportText: { color: "#38e1ff", fontSize: 12, fontWeight: "800" },
  headerBrand: { color: "#38e1ff", letterSpacing: 2.2, fontSize: 11, fontWeight: "900" },
  content: { padding: 18, paddingBottom: 44 },
  title: { color: "#f5f8fc", fontSize: 28, fontWeight: "800", marginTop: 8 },
  subtitle: { color: "#92a1b6", fontSize: 14, marginTop: 5, marginBottom: 18 },
  progressPanel: { padding: 14, borderWidth: 1, borderColor: "#243a4f", borderRadius: 14, backgroundColor: "#0d1929", marginBottom: 16 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressTitle: { color: "#d9e3ee", fontSize: 13, fontWeight: "700" },
  progressCount: { color: "#38e1ff", fontSize: 14, fontWeight: "900" },
  progressTrack: { height: 7, borderRadius: 99, backgroundColor: "#1e3045", marginTop: 11, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 99, backgroundColor: "#00c2cb" },
  progressCaption: { color: "#8d9bb0", fontSize: 12, marginTop: 8 },
  queuePanel: { padding: 14, borderWidth: 1, borderColor: "#6b552f", borderRadius: 14, backgroundColor: "#2b2418", marginBottom: 15 },
  queuePanelAttention: { borderColor: "#8a4743", backgroundColor: "#301d21" },
  queuePanelTitle: { color: "#f4ce80", fontSize: 14, fontWeight: "800" },
  queueText: { color: "#d7c8a7", fontSize: 12, lineHeight: 18, marginTop: 5 },
  queueNotice: { color: "#f5ddb0", fontSize: 12, lineHeight: 18, marginTop: 7 },
  queueAction: { minHeight: 40, alignSelf: "flex-start", justifyContent: "center", marginTop: 10, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: "#96743c" },
  queueActionText: { color: "#ffe3a0", fontSize: 12, fontWeight: "800" },
  queueSuccess: { color: "#75dfb2", fontSize: 12, marginBottom: 12 },
  queuedStopNote: { color: "#f4ce80", fontSize: 11, lineHeight: 16, marginTop: 9 },
  stopCard: { padding: 16, borderWidth: 1, borderColor: "#24344a", backgroundColor: "#0d1929", borderRadius: 17, marginBottom: 13 },
  activeStop: { borderColor: "#00c2cb" },
  stopTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  sequence: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#112b3b" },
  sequenceText: { color: "#38e1ff", fontWeight: "900" },
  stopHeading: { flex: 1 },
  stopType: { color: "#8ea0b8", fontSize: 11, textTransform: "uppercase", fontWeight: "800", letterSpacing: 0.7 },
  stopTitle: { color: "#f5f8fc", fontSize: 16, fontWeight: "800", marginTop: 3 },
  stopStatus: { color: "#b9c7d8", fontSize: 11, maxWidth: 100, textAlign: "right" },
  address: { color: "#d0d9e5", lineHeight: 21, marginTop: 14 },
  addressMuted: { color: "#8d9bb0", fontSize: 13, lineHeight: 19, marginTop: 4 },
  stopCoordinates: { color: "#7894aa", fontSize: 11, lineHeight: 17, marginTop: 6 },
  stopCoordinatesMissing: { color: "#c6a35e", fontSize: 11, lineHeight: 17, marginTop: 6 },
  contact: { color: "#a9b7c9", fontSize: 13, marginTop: 9 },
  callContact: { alignSelf: "flex-start", minHeight: 42, justifyContent: "center", marginTop: 4, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "#12273a" },
  callContactText: { color: "#68d9c0", fontSize: 13, fontWeight: "700" },
  instructions: { color: "#f4ce80", fontSize: 13, lineHeight: 19, marginTop: 10 },
  packages: { marginTop: 12, gap: 5 },
  packageCode: { color: "#8ea0b8", fontSize: 12 },
  secondaryButton: { minHeight: 44, marginTop: 12, borderRadius: 11, borderWidth: 1, borderColor: "#2c4960", alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  secondaryText: { color: "#38e1ff", fontSize: 14, fontWeight: "700" },
  actionButton: { minHeight: 48, marginTop: 12, borderRadius: 12, backgroundColor: "#00c2cb", alignItems: "center", justifyContent: "center" },
  actionText: { color: "#07101e", fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  proofPanel: { marginTop: 18, padding: 13, borderRadius: 14, backgroundColor: "#091321", borderWidth: 1, borderColor: "#1f3045" },
  proofTitle: { color: "#f5f8fc", fontSize: 16, fontWeight: "800" },
  label: { color: "#c6d1de", fontSize: 12, fontWeight: "700", marginTop: 13, marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#26364c", borderRadius: 10, backgroundColor: "#0d1929", color: "#f5f8fc", paddingHorizontal: 12, fontSize: 15 },
  preview: { width: "100%", height: 190, borderRadius: 11, marginTop: 12, backgroundColor: "#15243a" },
  gpsText: { color: "#55d9a9", marginTop: 11, fontSize: 13, fontWeight: "700" },
  gpsWarning: { color: "#f4ce80", marginTop: 10, fontSize: 12, lineHeight: 18 },
  gpsHint: { color: "#8493a8", marginTop: 11, fontSize: 13 },
  sequenceHint: { color: "#8493a8", fontSize: 12, marginTop: 12 },
  occurrencePanel: { marginTop: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#26364c" },
  reasonInput: { minHeight: 70, textAlignVertical: "top", paddingTop: 11 },
  pausedBanner: { color: "#f4ce80", backgroundColor: "#342a18", padding: 12, borderRadius: 10, marginBottom: 14, lineHeight: 19 },
  trackingPanel: { marginBottom: 15, padding: 14, borderRadius: 13, borderWidth: 1, borderColor: "#20515b", backgroundColor: "#0b2029" },
  trackingTitle: { color: "#67e8f9", fontSize: 14, fontWeight: "800" },
  trackingText: { color: "#a8bacb", fontSize: 12, lineHeight: 18, marginTop: 6 },
  startTracking: { minHeight: 42, marginTop: 11, borderRadius: 10, backgroundColor: "#00c2cb", alignItems: "center", justifyContent: "center" },
  startTrackingText: { color: "#07101e", fontWeight: "800" },
  stopTracking: { minHeight: 42, marginTop: 11, borderRadius: 10, borderWidth: 1, borderColor: "#714e38", alignItems: "center", justifyContent: "center" },
  stopTrackingText: { color: "#f4ce80", fontWeight: "800" },
  trackingWarning: { color: "#f4ce80", fontSize: 12, marginTop: 10 },
  error: { color: "#ffb4aa", backgroundColor: "#321c23", padding: 12, borderRadius: 10, lineHeight: 19, marginBottom: 14 },
  finished: { padding: 22, borderRadius: 16, alignItems: "center", borderWidth: 1, borderColor: "#1d5948", backgroundColor: "#0c251f" },
  finishedTitle: { color: "#55d9a9", fontSize: 18, fontWeight: "900" },
});










import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { DriverTrip } from "../lib/driver-api";
import { acceptAssignedTrip } from "../lib/driver-api";
import { loadQueuedDriverActions, syncQueuedDriverActions, type QueuedDriverAction } from "../lib/driver-offline-queue";
import { MalhaXMark } from "../components/MalhaXMark";

const tripStatusLabel: Record<string, string> = {
  assigned: "Aguardando aceite", accepted: "Aceita", in_progress: "Em andamento", paused: "Pausada",
};
const stopStatusLabel: Record<string, string> = {
  pending: "Pendente", arrived: "No local", in_progress: "Em atendimento", completed: "Concluída", failed: "Com ocorrência", skipped: "Ignorada",
};
const stopTypeLabel: Record<string, string> = { pickup: "Coleta", delivery: "Entrega", return_to_base: "Retorno à base" };
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export function TripsScreen({
  trips,
  loading,
  onRefresh,
  onOpenTrip,
  onSignOut,
  onSupport,
}: {
  trips: DriverTrip[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onOpenTrip: (trip: DriverTrip) => void;
  onSignOut: () => void;
  onSupport: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [busyTrip, setBusyTrip] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queuedActions, setQueuedActions] = useState<QueuedDriverAction[]>([]);
  const [syncBusy, setSyncBusy] = useState(false);
  const [queueNeedsAttention, setQueueNeedsAttention] = useState(false);
  const [showPackages, setShowPackages] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  async function refreshQueue() {
    setQueuedActions(await loadQueuedDriverActions());
  }

  async function synchronizeQueue() {
    if (syncBusy) return;
    setSyncBusy(true);
    try {
      const result = await syncQueuedDriverActions();
      await refreshQueue();
      setQueueNeedsAttention(result.needsAttention);
      if (result.sentCount) await onRefresh();
    } catch {
      setError("Não foi possível sincronizar as ações salvas. Elas continuam no aparelho.");
    } finally {
      setSyncBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    const checkQueue = async () => {
      try {
        const pending = await loadQueuedDriverActions();
        if (!active) return;
        setQueuedActions(pending);
        if (!pending.length) return;
        const result = await syncQueuedDriverActions();
        if (!active) return;
        setQueuedActions(await loadQueuedDriverActions());
        setQueueNeedsAttention(result.needsAttention);
        if (result.sentCount) await onRefresh();
      } catch { /* A fila fica no armazenamento privado para uma nova tentativa. */ }
    };
    void checkQueue();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void checkQueue();
        void onRefresh().then(() => setLastUpdatedAt(new Date())).catch(() => undefined);
      }
    });
    return () => { active = false; subscription.remove(); };
  }, [onRefresh]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try { await onRefresh(); setLastUpdatedAt(new Date()); }
    catch { setError("Não foi possível sincronizar as viagens. Verifique a conexão e tente novamente."); }
    finally { setRefreshing(false); }
  }

  async function accept(trip: DriverTrip) {
    setBusyTrip(trip.id);
    setError(null);
    try {
      await acceptAssignedTrip(trip.id);
      await onRefresh();
    } catch {
      setError("Não foi possível aceitar a viagem. Atualize a lista e tente novamente.");
    } finally {
      setBusyTrip(null);
    }
  }

  const queuedStatusByStop = new Map<string, DriverTrip["stops"][number]["status"]>();
  for (const action of queuedActions) {
    queuedStatusByStop.set(action.stopId, action.kind === "status" ? action.event.status : "completed");
  }
  const displayedTrips = trips.map((trip) => ({
    ...trip,
    stops: trip.stops.map((stop) => {
      const localStatus = queuedStatusByStop.get(stop.id);
      return localStatus ? { ...stop, status: localStatus } : stop;
    }),
  }));

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerIdentity}><MalhaXMark size={42} /><View><Text style={styles.brand}>MALHAX</Text><Text style={styles.heading}>Minhas viagens</Text></View></View>
        <View style={styles.headerActions}><Pressable accessibilityRole="button" onPress={onSupport} style={styles.supportButton}><Text style={styles.supportText}>Suporte</Text></Pressable><Pressable accessibilityRole="button" onPress={onSignOut} style={styles.signOut}><Text style={styles.signOutText}>Sair</Text></Pressable></View>
      </View>
      <View style={styles.quickActions}>
        <Pressable accessibilityRole="button" onPress={() => setShowPackages((value) => !value)} style={[styles.quickAction, showPackages && styles.quickActionActive]}>
          <Text style={styles.quickIcon}>▦</Text><Text style={styles.quickLabel}>Caixas e volumes</Text>
          <Text style={styles.quickMeta}>{displayedTrips.reduce((sum, trip) => sum + trip.stops.reduce((stopSum, stop) => stopSum + stop.packages.length, 0), 0)} itens</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onSupport} style={styles.quickAction}>
          <Text style={styles.quickIcon}>✉</Text><Text style={styles.quickLabel}>Falar com suporte</Text><Text style={styles.quickMeta}>Chat da operação</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={refreshing} onPress={() => void refresh()} style={styles.quickAction}>
          <Text style={styles.quickIcon}>↻</Text><Text style={styles.quickLabel}>Atualizações</Text><Text style={styles.quickMeta}>{refreshing ? "Sincronizando…" : lastUpdatedAt ? `Atualizado ${lastUpdatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}` : "Verificar rotas"}</Text>
        </Pressable>
      </View>
      {showPackages ? (
        <View style={styles.packageSummary}>
          <View style={styles.packageSummaryTop}><Text style={styles.packageSummaryTitle}>Caixas e volumes das viagens</Text><Pressable accessibilityRole="button" onPress={() => setShowPackages(false)}><Text style={styles.closeSummary}>Fechar</Text></Pressable></View>
          {displayedTrips.flatMap((trip) => trip.stops.flatMap((stop) => stop.packages.map((item, index) => ({ trip, stop, item, key: `${trip.id}-${stop.id}-${item.code}-${index}` })))).length ?
            displayedTrips.flatMap((trip) => trip.stops.flatMap((stop) => stop.packages.map((item, index) => ({ trip, stop, item, key: `${trip.id}-${stop.id}-${item.code}-${index}` })))).map(({ trip, stop, item, key }) => (
              <View key={key} style={styles.packageRow}><View style={styles.packageCodeWrap}><Text style={styles.packageCodeTitle}>{item.code}</Text><Text style={styles.packageDescription}>{item.description || "Volume sem descrição"}</Text></View><Text style={styles.packageDestination}>{trip.number} · {stop.addressLabel}</Text></View>
            )) : <Text style={styles.packageEmpty}>Ainda não há volumes associados às viagens atribuídas.</Text>}
        </View>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading && trips.length > 0 ? (
        <View style={styles.syncing}>
          <ActivityIndicator color="#38e1ff" size="small" />
          <Text style={styles.syncingText}>Sincronizando viagens…</Text>
        </View>
      ) : null}
      {queuedActions.length ? (
        <View style={[styles.queuePanel, queueNeedsAttention && styles.queueAttention]} accessibilityLiveRegion="polite">
          <Text style={styles.queueTitle}>{queueNeedsAttention ? "Ação aguardando revisão" : "Ações aguardando sincronização"}</Text>
          <Text style={styles.queueBody}>{queuedActions.length === 1 ? "1 atualização permanece salva" : `${queuedActions.length} atualizações permanecem salvas`} neste aparelho. O painel do suporte será atualizado após a confirmação do servidor.</Text>
          <Pressable accessibilityRole="button" disabled={syncBusy} onPress={() => void synchronizeQueue()} style={styles.queueButton}>
            <Text style={styles.queueButtonText}>{syncBusy ? "Sincronizando…" : "Tentar sincronizar"}</Text>
          </Pressable>
        </View>
      ) : null}
      <ScrollView
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#38e1ff" />}
      >
          {loading && trips.length === 0 ? <ActivityIndicator color="#38e1ff" style={{ marginTop: 40 }} /> : null}
          {displayedTrips.map((trip) => {
            const openStops = trip.stops.filter((stop) => !["completed", "failed", "skipped"].includes(stop.status));
            const nextStop = openStops[0];
            return (
              <View key={trip.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View><Text style={styles.tripNumber}>Viagem #{trip.number}</Text><Text style={styles.muted}>{trip.plannedStartAt ? dateTime.format(new Date(trip.plannedStartAt)) : "Sem horário planejado"}</Text></View>
                  <View style={styles.statusPill}><Text style={styles.statusText}>{tripStatusLabel[trip.status] ?? trip.status}</Text></View>
                </View>
                {trip.vehiclePlate ? <Text style={styles.vehicle}>Veículo · {trip.vehiclePlate}</Text> : null}
                <Text style={styles.stopCount}>{trip.stops.length} paradas · {openStops.length} pendentes</Text>
                {nextStop ? <Text style={styles.nextStop}>{stopTypeLabel[nextStop.type]} · {nextStop.addressLabel}</Text> : <Text style={styles.nextStop}>Todas as paradas encerradas</Text>}
                {nextStop ? <Text style={styles.address} numberOfLines={2}>{nextStop.addressLine}{nextStop.district ? `, ${nextStop.district}` : ""}{nextStop.city ? ` · ${nextStop.city}` : ""}</Text> : null}
                {trip.status === "assigned" ? (
                  <Pressable disabled={busyTrip === trip.id} onPress={() => void accept(trip)} style={[styles.button, busyTrip === trip.id && styles.disabled]}>
                    {busyTrip === trip.id ? <ActivityIndicator color="#07101e" /> : <Text style={styles.buttonText}>Aceitar viagem</Text>}
                  </Pressable>
                ) : (
                  <Pressable onPress={() => onOpenTrip(trip)} style={styles.button}><Text style={styles.buttonText}>Abrir rota</Text></Pressable>
                )}
              </View>
            );
          })}
          {trips.length === 0 && !loading ? <View style={styles.empty}><Text style={styles.emptyTitle}>Nenhuma viagem atribuída</Text><Text style={styles.muted}>Puxe a tela para atualizar. As novas rotas aparecerão aqui.</Text></View> : null}
      </ScrollView>
    </View>
  );
}

export const tripLabels = { tripStatusLabel, stopStatusLabel, stopTypeLabel, dateTime };

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#070e1a", paddingTop: 22 },
  header: { paddingHorizontal: 22, paddingBottom: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerIdentity: { flexDirection: "row", alignItems: "center", gap: 10 },
  quickActions: { flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingBottom: 14 },
  quickAction: { flex: 1, minHeight: 92, padding: 10, borderRadius: 13, borderWidth: 1, borderColor: "#24344a", backgroundColor: "#0d1929", justifyContent: "center" },
  quickActionActive: { borderColor: "#00c2cb", backgroundColor: "#102738" },
  quickIcon: { color: "#38e1ff", fontSize: 18, fontWeight: "900" },
  quickLabel: { color: "#f5f8fc", fontSize: 11, lineHeight: 15, fontWeight: "800", marginTop: 5 },
  quickMeta: { color: "#8d9bb0", fontSize: 10, marginTop: 3 },
  packageSummary: { marginHorizontal: 18, marginBottom: 12, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: "#243a4f", backgroundColor: "#0d1929" },
  packageSummaryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  packageSummaryTitle: { color: "#f5f8fc", fontSize: 14, fontWeight: "800" },
  closeSummary: { color: "#38e1ff", fontSize: 12, fontWeight: "700" },
  packageRow: { paddingVertical: 9, borderTopWidth: 1, borderTopColor: "#1d2b3d", gap: 3 },
  packageCodeWrap: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  packageCodeTitle: { color: "#38e1ff", fontSize: 13, fontWeight: "900" },
  packageDescription: { color: "#c2cedd", fontSize: 12, flexShrink: 1 },
  packageDestination: { color: "#8292a8", fontSize: 11 },
  packageEmpty: { color: "#9aa9bc", fontSize: 12, lineHeight: 18, paddingVertical: 8 },
  brand: { color: "#38e1ff", fontSize: 11, letterSpacing: 2.4, fontWeight: "900" },
  heading: { color: "#f5f8fc", fontSize: 26, fontWeight: "800", marginTop: 4 },
  signOut: { paddingVertical: 10, paddingHorizontal: 13, borderRadius: 10, borderWidth: 1, borderColor: "#26364c" },
  headerActions: { flexDirection: "row", gap: 8 },
  supportButton: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#00c2cb" },
  supportText: { color: "#38e1ff", fontSize: 13, fontWeight: "700" },
  signOutText: { color: "#c9d4e3", fontSize: 13, fontWeight: "700" },
  list: { paddingHorizontal: 18, paddingBottom: 40, gap: 14 },
  card: { padding: 17, borderWidth: 1, borderColor: "#24344a", borderRadius: 18, backgroundColor: "#0d1929" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  tripNumber: { color: "#f5f8fc", fontSize: 18, fontWeight: "800" },
  muted: { color: "#8d9bb0", fontSize: 13, marginTop: 5 },
  statusPill: { backgroundColor: "#112b3b", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { color: "#38e1ff", fontSize: 11, fontWeight: "800" },
  vehicle: { color: "#b8c5d5", marginTop: 12 },
  stopCount: { color: "#a5b3c5", fontSize: 13, marginTop: 14 },
  nextStop: { color: "#f5f8fc", fontSize: 15, fontWeight: "700", marginTop: 9 },
  address: { color: "#98a7bb", lineHeight: 19, marginTop: 4 },
  button: { minHeight: 48, marginTop: 17, backgroundColor: "#00c2cb", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#07101e", fontWeight: "800", fontSize: 15 },
  disabled: { opacity: 0.5 },
  empty: { alignItems: "center", padding: 30, marginTop: 30, borderColor: "#24344a", borderWidth: 1, borderRadius: 18 },
  emptyTitle: { color: "#f5f8fc", fontSize: 17, fontWeight: "800" },
  error: { color: "#ffb4aa", marginHorizontal: 20, marginBottom: 12, lineHeight: 20 },
  syncing: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingBottom: 10 },
  syncingText: { color: "#8d9bb0", fontSize: 12 },
  queuePanel: { marginHorizontal: 18, marginBottom: 12, padding: 14, borderRadius: 13, borderWidth: 1, borderColor: "#80643a", backgroundColor: "#292316" },
  queueAttention: { borderColor: "#a75b4c", backgroundColor: "#321c23" },
  queueTitle: { color: "#f4ce80", fontSize: 14, fontWeight: "800" },
  queueBody: { color: "#d7c8a7", fontSize: 12, lineHeight: 18, marginTop: 5 },
  queueButton: { minHeight: 40, alignSelf: "flex-start", justifyContent: "center", marginTop: 10, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: "#96743c" },
  queueButtonText: { color: "#ffe3a0", fontSize: 12, fontWeight: "800" },
});


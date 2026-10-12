import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./src/lib/supabase";
import { loadAssignedTrips, type DriverTrip } from "./src/lib/driver-api";
import { resumeDriverTrackingIfActive, stopDriverTracking } from "./src/lib/driver-tracking";
import { LoginScreen } from "./src/screens/LoginScreen";
import { TripsScreen } from "./src/screens/TripsScreen";
import { TripScreen } from "./src/screens/TripScreen";
import { SupportScreen } from "./src/screens/SupportScreen";
import { DriverGpsScreen } from "./src/screens/DriverGpsScreen";
import { CargoTransfersScreen } from "./src/screens/CargoTransfersScreen";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [trips, setTrips] = useState<DriverTrip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [gpsOpen, setGpsOpen] = useState(false);
  const [cargoTransfersOpen, setCargoTransfersOpen] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [supportNotice, setSupportNotice] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const refreshPendingRef = useRef(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setSession(data.session);
      setConnectionError(Boolean(error));
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (session) void resumeDriverTrackingIfActive();
    else void stopDriverTracking().catch(() => undefined);
  }, [authReady, session?.user.id]);
  async function refreshTrips() {
    if (loadingRef.current) {
      refreshPendingRef.current = true;
      return;
    }
    loadingRef.current = true;
    setLoadingTrips(true);
    setConnectionError(false);
    try {
      setTrips(await loadAssignedTrips());
    } catch {
      setConnectionError(true);
    } finally {
      loadingRef.current = false;
      setLoadingTrips(false);
      if (refreshPendingRef.current) {
        refreshPendingRef.current = false;
        void refreshTrips();
      }
    }
  }

  useEffect(() => {
    if (!session) {
      setTrips([]);
      setSelectedTripId(null);
      return;
    }
    void refreshTrips();
  }, [session?.user.id]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`malhax-driver-routes-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => {
        void refreshTrips();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cargo_transfers" }, () => {
        void refreshTrips();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_stops" }, () => {
        void refreshTrips();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, (payload) => {
        const incoming = payload.new as { sender_user_id?: string };
        if (incoming.sender_user_id && incoming.sender_user_id !== session.user.id) {
          setSupportNotice("Nova resposta do suporte. Toque para abrir a conversa.");
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session?.user.id]);

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.center}>
        <Text style={styles.setupTitle}>Configure a conexão do aplicativo</Text>
        <Text style={styles.setupText}>Crie `apps/android/.env` a partir de `.env.example` e informe a URL local/hospedada e a chave pública do Supabase. Não use a chave `service_role` no celular.</Text>
        <StatusBar barStyle="light-content" />
      </View>
    );
  }
  if (!authReady) {
    return <View style={styles.center}><ActivityIndicator color="#38e1ff" /><StatusBar barStyle="light-content" /></View>;
  }
  if (!session) return <><LoginScreen /><StatusBar barStyle="light-content" /></>;

  if (supportOpen) return <><SupportScreen trips={trips} tripId={selectedTripId} onBack={() => { setSupportOpen(false); setSupportNotice(null); }} /><StatusBar barStyle="light-content" /></>;
  if (cargoTransfersOpen) return <><CargoTransfersScreen trips={trips} onBack={() => setCargoTransfersOpen(false)} onChanged={refreshTrips} /><StatusBar barStyle="light-content" /></>;
  if (gpsOpen) return <><DriverGpsScreen stops={trips.flatMap((trip) => trip.stops)} supportNotice={supportNotice} onSupport={() => { setSupportNotice(null); setSupportOpen(true); }} onBack={() => setGpsOpen(false)} /><StatusBar barStyle="light-content" /></>;

  const selectedTrip = trips.find((trip) => trip.id === selectedTripId);
  if (selectedTrip) {
    return <><TripScreen trip={selectedTrip} supportNotice={supportNotice} onBack={() => setSelectedTripId(null)} onChanged={refreshTrips} onSupport={() => { setSupportNotice(null); setSupportOpen(true); }} /><StatusBar barStyle="light-content" /></>;
  }
  return (
    <>
      {connectionError ? <View style={styles.connectionBanner}><Text style={styles.connectionText}>Sem sincronização com o servidor. Atualize quando a conexão voltar.</Text></View> : null}
      <TripsScreen
        trips={trips}
        loading={loadingTrips}
        onRefresh={refreshTrips}
        onOpenTrip={(trip) => setSelectedTripId(trip.id)}
        onSignOut={() => void (async () => { try { await stopDriverTracking(); } finally { await supabase.auth.signOut(); } })()}
        supportNotice={supportNotice}
        onSupport={() => { setSupportNotice(null); setSupportOpen(true); }}
        onOpenGps={() => setGpsOpen(true)}
        onOpenTransbordo={() => setCargoTransfersOpen(true)}
      />
      <StatusBar barStyle="light-content" />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: 28, backgroundColor: "#070e1a" },
  setupTitle: { color: "#f5f8fc", fontSize: 21, fontWeight: "800" },
  setupText: { color: "#aab6c7", fontSize: 15, lineHeight: 23, marginTop: 12 },
  connectionBanner: { paddingHorizontal: 16, paddingVertical: 9, backgroundColor: "#3b2b12" },
  connectionText: { color: "#f4ce80", fontSize: 12, textAlign: "center" },
});






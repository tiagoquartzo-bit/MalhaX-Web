import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import MapView, { Marker, UrlTile } from "react-native-maps";
import type { DriverStop } from "../lib/driver-api";

type GpsMode = "inactive" | "loading" | "active" | "unavailable";

const timeFormatter = new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium", timeZone: "America/Sao_Paulo" });

export function GpsStatusPanel({ active, stops, liveOnly = false }: { active: boolean; stops: DriverStop[]; liveOnly?: boolean }) {
  const shouldWatch = active || liveOnly;
  const [mode, setMode] = useState<GpsMode>(shouldWatch ? "loading" : "inactive");
  const [position, setPosition] = useState<Location.LocationObject | null>(null);
  const [now, setNow] = useState(Date.now());
  const mapRef = useRef<MapView | null>(null);
  const mappedStops = useMemo(() => stops.filter((stop) => stop.latitude !== null && stop.longitude !== null), [stops]);
  const initialRegion = useMemo(() => {
    if (mappedStops.length) {
      const latitude = mappedStops.reduce((sum, stop) => sum + stop.latitude!, 0) / mappedStops.length;
      const longitude = mappedStops.reduce((sum, stop) => sum + stop.longitude!, 0) / mappedStops.length;
      return { latitude, longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 };
    }
    if (position) return { latitude: position.coords.latitude, longitude: position.coords.longitude, latitudeDelta: 0.025, longitudeDelta: 0.025 };
    return null;
  }, [mappedStops, position]);

  useEffect(() => {
    if (!shouldWatch) {
      setMode("inactive");
      setPosition(null);
      return;
    }

    let mounted = true;
    let subscription: Location.LocationSubscription | null = null;
    let attaching = false;

    async function attachGps() {
      if (attaching || !mounted || AppState.currentState !== "active") return;
      attaching = true;
      setMode((current) => current === "active" ? current : "loading");
      try {
        const permission = liveOnly
          ? await Location.requestForegroundPermissionsAsync()
          : await Location.getForegroundPermissionsAsync();
        if (!mounted) return;
        if (!permission.granted) {
          setMode("unavailable");
          return;
        }
        const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 90_000, requiredAccuracy: 200 }).catch(() => null);
        if (mounted && lastKnown) setPosition(lastKnown);
        subscription?.remove();
        subscription = await Location.watchPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 10_000,
          distanceInterval: 10,
        }, (nextPosition) => {
          if (!mounted) return;
          setPosition(nextPosition);
          setNow(Date.now());
          setMode("active");
        });
        if (mounted) setMode("active");
      } catch {
        if (mounted) setMode("unavailable");
      } finally {
        attaching = false;
      }
    }

    void attachGps();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void attachGps();
      else {
        subscription?.remove();
        subscription = null;
      }
    });
    const clock = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      mounted = false;
      appState.remove();
      clearInterval(clock);
      subscription?.remove();
    };
  }, [liveOnly, shouldWatch]);

  const ageMs = position ? now - position.timestamp : Number.POSITIVE_INFINITY;
  const stale = ageMs > 90_000;
  const accuracy = position?.coords.accuracy;
  const gpsLabel = !shouldWatch
    ? "Ative o histórico GPS para mostrar sua posição durante a viagem."
    : mode === "loading" && !position
      ? "Buscando o sinal GPS do aparelho…"
      : mode === "unavailable"
        ? "GPS indisponível. Confira a permissão e o sinal de localização do Android."
        : stale
          ? "Última posição recebida; o sinal está desatualizado."
          : accuracy !== null && accuracy !== undefined && accuracy <= 50
            ? liveOnly ? "GPS ao vivo nesta tela · boa precisão" : "GPS ativo · boa precisão"
            : liveOnly ? "GPS ao vivo nesta tela · precisão reduzida" : "GPS ativo · precisão reduzida";

  return (
    <View style={styles.panel} accessibilityLiveRegion="polite">
      <View style={styles.headingRow}>
        <View style={[styles.dot, shouldWatch && mode === "active" && !stale ? styles.dotActive : styles.dotInactive]} />
        <Text style={styles.title}>Sua localização no MalhaX</Text>
        {position ? <Text style={styles.accuracy}>{accuracy == null ? "Precisão indisponível" : `±${Math.round(accuracy)} m`}</Text> : null}
      </View>
      <Text style={styles.caption}>{gpsLabel}</Text>
      {position ? (
        <>
          <Text selectable style={styles.coordinates}>Lat. {position.coords.latitude.toFixed(6)} · Long. {position.coords.longitude.toFixed(6)}</Text>
          <Text style={styles.updated}>Última atualização: {timeFormatter.format(new Date(position.timestamp))}</Text>
        </>
      ) : null}
      <View style={styles.mapHeading}>
        <Text style={styles.mapTitle}>{liveOnly && !stops.length ? "Mapa da sua localização" : "Mapa da rota"}</Text>
        <Text style={styles.mapCount}>{mappedStops.length}/{stops.length} paradas com coordenadas</Text>
      </View>
      {initialRegion ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation={shouldWatch}
          showsMyLocationButton={shouldWatch}
          toolbarEnabled={false}
          loadingEnabled
          accessibilityLabel="Mapa da viagem com posição atual e paradas"
        >
          <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} tileSize={256} zIndex={1} />
          {mappedStops.map((stop) => (
            <Marker
              key={stop.id}
              coordinate={{ latitude: stop.latitude!, longitude: stop.longitude! }}
              title={`${stop.sequence}. ${stop.addressLabel}`}
              description={`${stop.type === "pickup" ? "Coleta" : "Entrega"} · ${stop.addressLine}`}
              pinColor={stop.status === "completed" ? "#12a879" : stop.status === "failed" ? "#e35b65" : "#087eaa"}
            />
          ))}
        </MapView>
      ) : (
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapPlaceholderTitle}>Aguardando posição GPS</Text>
          <Text style={styles.mapPlaceholderText}>
            O mapa será centralizado quando o GPS responder ou quando houver coordenadas cadastradas nas paradas.
          </Text>
        </View>
      )}
      {initialRegion ? <Text style={styles.attribution}>© OpenStreetMap contributors</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginBottom: 15, padding: 14, borderWidth: 1, borderColor: "#20515b", borderRadius: 13, backgroundColor: "#0b2029" },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 9 },
  dotActive: { backgroundColor: "#2ed49a" },
  dotInactive: { backgroundColor: "#f0b84b" },
  title: { flex: 1, color: "#67e8f9", fontSize: 14, fontWeight: "800" },
  accuracy: { color: "#b8c8d8", fontSize: 11, fontWeight: "700" },
  caption: { color: "#a8bacb", fontSize: 12, lineHeight: 18, marginTop: 7 },
  coordinates: { color: "#d8e5f1", fontSize: 12, fontWeight: "700", marginTop: 8 },
  updated: { color: "#8d9bb0", fontSize: 11, marginTop: 4 },
  mapHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, marginBottom: 8, gap: 6 },
  mapTitle: { color: "#e4edf5", fontSize: 13, fontWeight: "800" },
  mapCount: { color: "#9aabba", fontSize: 10 },
  map: { height: 250, borderRadius: 10, overflow: "hidden" },
  mapPlaceholder: { minHeight: 124, borderRadius: 10, borderWidth: 1, borderColor: "#27404d", backgroundColor: "#102631", justifyContent: "center", padding: 14 },
  mapPlaceholderTitle: { color: "#8aeaf0", fontSize: 13, fontWeight: "800", marginBottom: 6 },
  mapPlaceholderText: { color: "#b5c4d1", fontSize: 11, lineHeight: 17 },
  attribution: { color: "#8d9bb0", fontSize: 10, textAlign: "right", marginTop: 5 },
});


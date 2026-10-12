import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { RouteMap } from "./RouteMap";
import { calculateDriverRoute, type DriverRoute, type DriverStop } from "../lib/driver-api";

type GpsMode = "inactive" | "loading" | "active" | "unavailable";

const timeFormatter = new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium", timeZone: "America/Sao_Paulo" });

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function distanceLabel(meters: number) { return meters >= 1000 ? `${(meters / 1000).toFixed(1).replace(".", ",")} km` : `${Math.max(0, Math.round(meters / 10) * 10)} m`; }

export function GpsStatusPanel({ active, stops, liveOnly = false, fallbackCenter, tripId, activeStop }: { active: boolean; stops: DriverStop[]; liveOnly?: boolean; fallbackCenter?: { latitude: number; longitude: number; label: string }; tripId?: string; activeStop?: DriverStop }) {
  const shouldWatch = active || liveOnly;
  const [mode, setMode] = useState<GpsMode>(shouldWatch ? "loading" : "inactive");
  const [position, setPosition] = useState<Location.LocationObject | null>(null);
  const [now, setNow] = useState(Date.now());
  const [route, setRoute] = useState<DriverRoute | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const lastAutoRerouteAt = useRef(0);
  const mappedStops = useMemo(() => stops.filter((stop) => stop.latitude !== null && stop.longitude !== null), [stops]);
  const initialRegion = useMemo(() => {
    if (mappedStops.length) {
      const latitude = mappedStops.reduce((sum, stop) => sum + stop.latitude!, 0) / mappedStops.length;
      const longitude = mappedStops.reduce((sum, stop) => sum + stop.longitude!, 0) / mappedStops.length;
      return { latitude, longitude };
    }
    if (position) return { latitude: position.coords.latitude, longitude: position.coords.longitude };
    return fallbackCenter ? { latitude: fallbackCenter.latitude, longitude: fallbackCenter.longitude } : null;
  }, [fallbackCenter, mappedStops, position]);

  useEffect(() => { setRoute(null); setRouteError(null); }, [activeStop?.id]);

  const guidance = useMemo(() => {
    if (!route || !position || !route.steps.length) return null;
    const coords = route.geometry.coordinates;
    const here = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    coords.forEach(([longitude, latitude], index) => {
      const distance = distanceMeters(here, { latitude, longitude });
      if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
    });
    let stepIndex = 0;
    for (let index = 1; index < route.steps.length; index += 1) {
      if (route.steps[index].coordinate_index > nearestIndex) break;
      stepIndex = index;
    }
    const step = route.steps[stepIndex];
    const targetIndex = stepIndex + 1 < route.steps.length
      ? route.steps[stepIndex + 1].coordinate_index
      : Math.min(coords.length - 1, step.coordinate_index);
    const target = coords[Math.max(0, Math.min(coords.length - 1, targetIndex))];
    const distanceToManeuver = distanceMeters(here, { latitude: target[1], longitude: target[0] });
    return { instruction: step.instruction, distanceToManeuver, nearestDistance, stepIndex, totalSteps: route.steps.length };
  }, [position, route]);

  async function startNavigation() {
    if (!tripId || !activeStop || !position) {
      setRouteError(!position ? "Aguardando o sinal GPS para calcular a rota." : "Não há parada ativa com coordenadas para navegar.");
      return;
    }
    setRouteBusy(true);
    setRouteError(null);
    try {
      setRoute(await calculateDriverRoute(tripId, activeStop.id, { latitude: position.coords.latitude, longitude: position.coords.longitude }));
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : "Não foi possível calcular a rota.");
    } finally { setRouteBusy(false); }
  }

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
          timeInterval: route ? 2_000 : 10_000,
          distanceInterval: route ? 5 : 10,
        }, (nextPosition) => {
          if (!mounted) return;
          setPosition(nextPosition);
          setNow(Date.now());
          setMode("active");
        });
        void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then((currentPosition) => {
            if (!mounted) return;
            setPosition(currentPosition);
            setNow(Date.now());
          })
          .catch(() => undefined);
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
  }, [liveOnly, route, shouldWatch]);

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

  useEffect(() => {
    if (!route || !guidance || !position || !tripId || !activeStop || routeBusy) return;
    const accuracyMeters = position.coords.accuracy;
    if (now - position.timestamp > 30_000 || (accuracyMeters !== null && accuracyMeters > 100)) return;
    if (guidance.nearestDistance <= 120 || Date.now() - lastAutoRerouteAt.current < 30_000) return;
    lastAutoRerouteAt.current = Date.now();
    setRouteBusy(true);
    setRouteError(null);
    void calculateDriverRoute(tripId, activeStop.id, {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    }).then(setRoute).catch((error) => {
      setRouteError(error instanceof Error ? error.message : "Não foi possível recalcular a rota.");
    }).finally(() => setRouteBusy(false));
  }, [activeStop, guidance, now, position, route, routeBusy, tripId]);

  return (
    <View style={styles.panel} accessibilityLiveRegion="polite">
      <View style={styles.headingRow}>
        <View style={[styles.dot, shouldWatch && mode === "active" && !stale ? styles.dotActive : styles.dotInactive]} />
        <Text style={styles.title}>Sua localização no MalhaX</Text>
        {position ? <Text style={styles.accuracy}>{accuracy == null ? "Precisão indisponível" : `±${Math.round(accuracy)} m`}</Text> : null}
      </View>
      <Text style={styles.caption}>{gpsLabel}</Text>
      {tripId && activeStop ? (
        <View style={styles.navigationPanel}>
          {guidance ? (
            <>
              <Text style={styles.navigationEyebrow}>NAVEGAÇÃO · {guidance.stepIndex + 1}/{guidance.totalSteps}</Text>
              <Text accessibilityLiveRegion="polite" style={styles.navigationInstruction}>{guidance.instruction}</Text>
              <Text style={styles.navigationDistance}>{distanceLabel(guidance.distanceToManeuver)} até a próxima manobra</Text>
              {guidance.nearestDistance > 120 ? <Text style={styles.offRoute}>Você pode ter saído da rota. Recalcule antes de continuar.</Text> : null}
              <Pressable accessibilityRole="button" onPress={() => void startNavigation()} disabled={routeBusy} style={styles.navigationButton}>
                <Text style={styles.navigationButtonText}>{routeBusy ? "Recalculando…" : "Recalcular rota"}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.navigationEyebrow}>ORIENTAÇÃO PELAS RUAS</Text>
              <Text style={styles.navigationHint}>Calcule o trajeto até a próxima parada e acompanhe as manobras aqui no MalhaX.</Text>
              <Pressable accessibilityRole="button" onPress={() => void startNavigation()} disabled={routeBusy || !position} style={[styles.navigationButton, (routeBusy || !position) && styles.navigationButtonDisabled]}>
                <Text style={styles.navigationButtonText}>{routeBusy ? "Calculando rota…" : "Iniciar navegação"}</Text>
              </Pressable>
            </>
          )}
          {routeError ? <Text accessibilityRole="alert" style={styles.navigationError}>{routeError}</Text> : null}
          {route ? <Text style={styles.routeAttribution}>{route.attribution}{route.distance_meters != null ? ` · ${distanceLabel(route.distance_meters)}` : ""}{route.duration_seconds != null ? ` · ${Math.round(route.duration_seconds / 60)} min` : ""}</Text> : null}
        </View>
      ) : null}
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
      {!position && fallbackCenter && !mappedStops.length ? <Text style={styles.mapReference}>Referência aproximada do bairro · {fallbackCenter.label} (não representa o GPS)</Text> : null}
      {initialRegion ? (
        <RouteMap center={initialRegion} stops={mappedStops} position={position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : null} routeCoordinates={route?.geometry.coordinates} navigating={Boolean(route)} />
      ) : (
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapPlaceholderTitle}>Aguardando posição GPS</Text>
          <Text style={styles.mapPlaceholderText}>
            O mapa será centralizado quando o GPS responder ou quando houver coordenadas cadastradas nas paradas.
          </Text>
        </View>
      )}
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
  mapReference: { color: "#f0b84b", fontSize: 10, lineHeight: 15, marginBottom: 7 },
  mapPlaceholder: { minHeight: 124, borderRadius: 10, borderWidth: 1, borderColor: "#27404d", backgroundColor: "#102631", justifyContent: "center", padding: 14 },
  mapPlaceholderTitle: { color: "#8aeaf0", fontSize: 13, fontWeight: "800", marginBottom: 6 },
  mapPlaceholderText: { color: "#b5c4d1", fontSize: 11, lineHeight: 17 },
  attribution: { color: "#8d9bb0", fontSize: 10, textAlign: "right", marginTop: 5 },
  navigationPanel: { marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#23616b", backgroundColor: "#0d2a35" },
  navigationEyebrow: { color: "#32d6df", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  navigationInstruction: { color: "#f1f6fb", fontSize: 19, lineHeight: 25, fontWeight: "800", marginTop: 6 },
  navigationDistance: { color: "#b4c5d4", fontSize: 12, marginTop: 4 },
  navigationHint: { color: "#bdcbd7", fontSize: 12, lineHeight: 18, marginTop: 6 },
  navigationButton: { minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#00b9c3", marginTop: 10, paddingHorizontal: 14 },
  navigationButtonDisabled: { opacity: 0.5 },
  navigationButtonText: { color: "#061521", fontSize: 13, fontWeight: "900" },
  navigationError: { color: "#ff9b9b", fontSize: 11, lineHeight: 16, marginTop: 8 },
  routeAttribution: { color: "#91a7b8", fontSize: 9, lineHeight: 13, marginTop: 8 },
  offRoute: { color: "#ffc76b", fontSize: 11, marginTop: 6 },
});


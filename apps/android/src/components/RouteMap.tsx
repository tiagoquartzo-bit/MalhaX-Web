import { useMemo, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Camera, GeoJSONSource, Layer, Map as MapLibreMap, ViewAnnotation } from "@maplibre/maplibre-react-native";
import type { DriverStop } from "../lib/driver-api";

type Coordinate = { latitude: number; longitude: number };
type LngLat = [number, number];

const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";

function getZoom(points: Coordinate[]) {
  if (points.length < 2) return 14;
  const latSpan = Math.max(...points.map((point) => point.latitude)) - Math.min(...points.map((point) => point.latitude));
  const lngSpan = Math.max(...points.map((point) => point.longitude)) - Math.min(...points.map((point) => point.longitude));
  const span = Math.max(latSpan, lngSpan, 0.002);
  return Math.max(5, Math.min(15, Math.log2(360 / span) - 1.8));
}

export function RouteMap({ center, stops, position, routeCoordinates, navigating = false }: { center: Coordinate; stops: DriverStop[]; position: Coordinate | null; routeCoordinates?: LngLat[] | null; navigating?: boolean }) {
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.max(250, screenWidth - 76);
  const height = 250;
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const mappedStops = useMemo(() => stops
    .filter((stop): stop is DriverStop & { latitude: number; longitude: number } => stop.latitude !== null && stop.longitude !== null)
    .sort((a, b) => a.sequence - b.sequence), [stops]);
  const points = useMemo(() => [
    ...mappedStops.map(({ latitude, longitude }) => ({ latitude, longitude })),
    ...(position ? [position] : []),
  ], [mappedStops, position]);
  const initialCenter = points.length
    ? {
        latitude: (Math.min(...points.map((point) => point.latitude)) + Math.max(...points.map((point) => point.latitude))) / 2,
        longitude: (Math.min(...points.map((point) => point.longitude)) + Math.max(...points.map((point) => point.longitude))) / 2,
      }
    : center;
  const routeLine = useMemo(() => ({
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: routeCoordinates ?? [],
    },
  }), [mappedStops, routeCoordinates]);

  return (
    <View>
      <View style={[styles.viewport, { width, height }]}>
        <MapLibreMap
          style={StyleSheet.absoluteFill}
          mapStyle={MAP_STYLE}
          logo
          logoPosition={{ bottom: 8, left: 8 }}
          attribution
          attributionPosition={{ bottom: 8, right: 8 }}
          compass={false}
          onDidFinishLoadingMap={() => { setMapLoaded(true); setMapFailed(false); }}
          onDidFailLoadingMap={() => setMapFailed(true)}
        >
          <Camera initialViewState={{ center: [initialCenter.longitude, initialCenter.latitude], zoom: getZoom(points) }} trackUserLocation={navigating ? "course" : undefined} />
          {(routeCoordinates?.length ?? 0) > 1 ? (
            <GeoJSONSource id="route-line-source" data={routeLine}>
              <Layer
                id="route-line"
                type="line"
                layout={{ "line-cap": "round", "line-join": "round" }}
                paint={{ "line-color": "#00c2cb", "line-width": navigating ? 6 : 4, "line-opacity": 0.95 }}
              />
            </GeoJSONSource>
          ) : null}
          {mappedStops.map((stop) => {
            const color = stop.status === "completed" ? "#12a879" : stop.status === "failed" ? "#e35b65" : "#087eaa";
            return (
              <ViewAnnotation key={stop.id} id={`stop-${stop.id}`} lngLat={[stop.longitude, stop.latitude]} anchor="center">
                <View style={[styles.stopPin, { backgroundColor: color }]}><Text style={styles.pinText}>{stop.sequence}</Text></View>
              </ViewAnnotation>
            );
          })}
          {position ? (
            <ViewAnnotation id="driver-current-position" lngLat={[position.longitude, position.latitude]} anchor="center">
              <View style={styles.driverHalo}><View style={styles.driverDot} /></View>
            </ViewAnnotation>
          ) : null}
        </MapLibreMap>
        {!mapLoaded ? (
          <View pointerEvents="none" style={styles.mapMessage}>
            <Text style={styles.mapTitle}>{mapFailed ? "Mapa indisponível" : "Carregando mapa…"}</Text>
            <Text style={styles.mapText}>{mapFailed ? "Verifique sua conexão e tente novamente." : "OpenFreeMap · OpenStreetMap"}</Text>
          </View>
        ) : null}
        <View pointerEvents="none" style={styles.mapLabel}><Text style={styles.mapLabelText}>{navigating ? "NAVEGAÇÃO PELAS RUAS" : "PARADAS DA VIAGEM"}</Text></View>
      </View>
      <Text style={styles.attributionText}>Dados © OpenStreetMap · mapa OpenFreeMap</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { alignSelf: "center", overflow: "hidden", borderRadius: 10, backgroundColor: "#102631" },
  mapMessage: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(16,38,49,0.92)", paddingHorizontal: 24 },
  mapTitle: { color: "#8aeaf0", fontSize: 14, lineHeight: 20, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  mapText: { color: "#b5c4d1", fontSize: 12, lineHeight: 18, textAlign: "center" },
  stopPin: { minWidth: 30, height: 30, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", borderRadius: 16, borderWidth: 2, borderColor: "#ffffff", elevation: 4 },
  pinText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  driverHalo: { width: 28, height: 28, borderRadius: 15, borderWidth: 2, borderColor: "#ffffff", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,194,203,0.22)", elevation: 5 },
  driverDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#00c2cb" },
  mapLabel: { position: "absolute", top: 8, left: 8, borderRadius: 5, backgroundColor: "rgba(7,19,33,0.82)", paddingHorizontal: 7, paddingVertical: 4 },
  mapLabelText: { color: "#d8e5f1", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  attributionText: { color: "#8d9bb0", fontSize: 10, textAlign: "right", marginTop: 5 },
});

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./tracking-history.module.css";
import { addOpenFreeMapLayer } from "../../../lib/maps/openfreemap";

export type TrackingPoint = {
  driverId: string; driverName: string; tripId: string; tripNumber: number;
  latitude: number; longitude: number; accuracy: number | null;
  capturedAt: string; receivedAt: string;
};

const colors = ["#087e8b", "#2563eb", "#d97706", "#7c3aed", "#059669", "#db2777", "#475569"];
const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
const csvCell = (value: string | number | null) => {
  let text = value == null ? "" : String(value);
  if (typeof value === "string" && /^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export function TrackingHistory({ date, selectedDriver, drivers, points }: { date: string; selectedDriver: string; drivers: { id: string; name: string }[]; points: TrackingPoint[] }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState("");
  const [exported, setExported] = useState(false);
  const groups = useMemo(() => {
    const result = new Map<string, TrackingPoint[]>();
    for (const point of points) {
      const key = `${point.driverId}:${point.tripId}`;
      result.set(key, [...(result.get(key) ?? []), point]);
    }
    return [...result.entries()].map(([key, rows]) => ({ key, rows }));
  }, [points]);

  useEffect(() => {
    let active = true;
    let map: import("leaflet").Map | null = null;
    let layers: import("leaflet").LayerGroup | null = null;
    if (!mapElement.current || points.length === 0) return;
    void import("leaflet").then(async (L) => {
      if (!active || !mapElement.current) return;
      map = L.map(mapElement.current, { scrollWheelZoom: true }).setView([points[0].latitude, points[0].longitude], 14);
      layers = L.layerGroup().addTo(map);
      try {
        await addOpenFreeMapLayer(map, () => active && setMapError("O mapa base não respondeu; os registros e a exportação CSV continuam disponíveis."), () => active);
      } catch {
        if (active) setMapError("Não foi possível carregar o mapa. Os registros e a exportação CSV continuam disponíveis.");
      }
      if (!active) return;

      groups.forEach((group, index) => {
        const route = group.rows;
        const coordinates: [number, number][] = route.map((point) => [point.latitude, point.longitude]);
        const color = colors[index % colors.length];
        L.polyline(coordinates, { color, weight: 5, opacity: 0.82, lineCap: "round", lineJoin: "round" }).addTo(layers!);
        const start = route[0];
        const end = route[route.length - 1];
        const startMarker = L.circleMarker([start.latitude, start.longitude], { radius: 8, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }).addTo(layers!);
        const endMarker = L.circleMarker([end.latitude, end.longitude], { radius: 8, color: "#fff", weight: 2, fillColor: "#dc2626", fillOpacity: 1 }).addTo(layers!);
        startMarker.bindTooltip(`Início · viagem #${start.tripNumber} · ${dateTime(start.capturedAt)}`);
        endMarker.bindTooltip(`Último ponto · viagem #${end.tripNumber} · ${dateTime(end.capturedAt)}`);
      });
      const allCoordinates = points.map((point) => [point.latitude, point.longitude] as [number, number]);
      if (allCoordinates.length > 1) map.fitBounds(L.latLngBounds(allCoordinates).pad(0.12));
      else map.setView(allCoordinates[0], 16);
      window.setTimeout(() => map?.invalidateSize(), 100);
    }).catch(() => active && setMapError("Não foi possível carregar o mapa. Os registros e a exportação CSV continuam disponíveis."));
    return () => { active = false; layers?.clearLayers(); map?.off(); map?.remove(); };
  }, [points, groups]);

  function downloadCsv() {
    const header = ["motorista", "data_captura_dispositivo", "data_recebimento_servidor", "viagem", "latitude", "longitude", "precisao_metros"];
    const records = points.map((point) => [
      csvCell(point.driverName), csvCell(dateTime(point.capturedAt)), csvCell(dateTime(point.receivedAt)),
      csvCell(point.tripNumber), csvCell(point.latitude), csvCell(point.longitude), csvCell(point.accuracy),
    ].join(";"));
    const csv = `\uFEFF${header.join(";")}\r\n${records.join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `malhax-rastreamento-${date}${selectedDriver ? "-motorista" : ""}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExported(true);
    window.setTimeout(() => setExported(false), 2500);
  }

  return <>
    <form method="get" className={styles.filters}>
      <label>Dia<input type="date" name="date" defaultValue={date} key={date} required /></label>
      <label>Motorista<select name="driver" defaultValue={selectedDriver}><option value="">Todos com registros</option>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</select></label>
      <button type="submit" className={styles.secondary}>Consultar</button>
      <button type="button" onClick={downloadCsv} disabled={!points.length} className={styles.export}>Baixar CSV ({points.length})</button>
      {exported ? <span role="status" className={styles.success}>Arquivo baixado.</span> : null}
    </form>
    <div className={styles.stats}><article><strong>{points.length}</strong><span>registros GPS</span></article><article><strong>{groups.length}</strong><span>viagens rastreadas</span></article><article><strong>{drivers.length}</strong><span>motoristas no dia</span></article></div>
    {mapError ? <p className={styles.mapError} role="status">{mapError}</p> : null}
    {points.length ? <div className={styles.map} ref={mapElement} aria-label="Mapa com os trajetos registrados dos motoristas" /> : <div className={styles.empty}><strong>Nenhum registro GPS para este dia.</strong><p>O mapa e o CSV serão preenchidos quando o app do motorista enviar as posições registradas durante as viagens.</p></div>}
    <section className={styles.tableWrap}><h2>Registros do dia</h2><div className={styles.scroll}><table><thead><tr><th>Motorista</th><th>Viagem</th><th>Horário da captura</th><th>Latitude</th><th>Longitude</th><th>Precisão</th><th>Recebido pelo servidor</th></tr></thead><tbody>{points.map((point, index) => <tr key={`${point.tripId}-${point.capturedAt}-${index}`}><td>{point.driverName}</td><td>#{point.tripNumber}</td><td>{dateTime(point.capturedAt)}</td><td>{point.latitude.toFixed(6)}</td><td>{point.longitude.toFixed(6)}</td><td>{point.accuracy == null ? "—" : `${Math.round(point.accuracy)} m`}</td><td>{dateTime(point.receivedAt)}</td></tr>)}{points.length === 0 ? <tr><td colSpan={7} className={styles.noRows}>Sem posições registradas.</td></tr> : null}</tbody></table></div></section>
  </>;
}

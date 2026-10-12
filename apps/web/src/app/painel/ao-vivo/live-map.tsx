"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./live.module.css";
import { DriverContact } from "../DriverContact";

export type LiveDriver = { id: string; name: string; phone: string | null; tripNumber: number; latitude: number | null; longitude: number | null; accuracy: number | null; capturedAt: string | null; receivedAt: string | null };
const MAP_WIDTH = 600;
const MAP_HEIGHT = 380;
const TILE_SIZE = 256;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function project(latitude: number, longitude: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = clamp(latitude, -85.05112878, 85.05112878) * Math.PI / 180;
  return {
    x: (longitude + 180) / 360 * scale,
    y: (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * scale,
  };
}
function ageLabel(date: string | null, now: number) {
  if (!date) return "Sem posição GPS";
  const minutes = Math.max(0, Math.floor((now - new Date(date).valueOf()) / 60000));
  if (minutes < 1) return "Atualizado agora";
  if (minutes < 60) return `Atualizado há ${minutes} min`;
  return `Atualizado há ${Math.floor(minutes / 60)} h`;
}

export function LiveMap({ drivers }: { drivers: LiveDriver[] }) {
  const router = useRouter();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => { setNow(Date.now()); router.refresh(); }, 10_000);
    return () => window.clearInterval(timer);
  }, [router]);
  const located = drivers.filter((driver) => driver.latitude !== null && driver.longitude !== null);
  const minLat = located.length ? Math.min(...located.map((driver) => driver.latitude!)) : 0;
  const maxLat = located.length ? Math.max(...located.map((driver) => driver.latitude!)) : 0;
  const minLon = located.length ? Math.min(...located.map((driver) => driver.longitude!)) : 0;
  const maxLon = located.length ? Math.max(...located.map((driver) => driver.longitude!)) : 0;
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;
  const spanLon = Math.max((maxLon - minLon) * Math.max(0.2, Math.cos(centerLat * Math.PI / 180)), 0.012);
  const spanLat = Math.max(maxLat - minLat, 0.012);
  const zoom = clamp(Math.floor(Math.log2(Math.min((MAP_WIDTH / TILE_SIZE) * 360 / spanLon, (MAP_HEIGHT / TILE_SIZE) * 180 / spanLat))), 2, 18);
  const center = project(centerLat, centerLon, zoom);
  const left = center.x - MAP_WIDTH / 2;
  const top = center.y - MAP_HEIGHT / 2;
  const tiles = [];
  for (let tileY = Math.floor(top / TILE_SIZE); tileY <= Math.floor((top + MAP_HEIGHT) / TILE_SIZE); tileY += 1) {
    for (let tileX = Math.floor(left / TILE_SIZE); tileX <= Math.floor((left + MAP_WIDTH) / TILE_SIZE); tileX += 1) {
      const worldTiles = 2 ** zoom;
      if (tileY < 0 || tileY >= worldTiles) continue;
      const wrappedX = ((tileX % worldTiles) + worldTiles) % worldTiles;
      tiles.push({ key: `${zoom}-${wrappedX}-${tileY}`, url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`, x: tileX * TILE_SIZE - left, y: tileY * TILE_SIZE - top });
    }
  }
  const point = (latitude: number, longitude: number) => {
    const projected = project(latitude, longitude, zoom);
    return { x: projected.x - left, y: projected.y - top };
  };
  return <>
    <div className={styles.liveMeta}><span className={styles.pulse} />Consulta as posições a cada 10 segundos <span>· painel atualizado {new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium" }).format(now)}</span></div>
    {located.length ? <section className={styles.coordinateMap} aria-label="Mapa viário OpenStreetMap com posição GPS dos motoristas">
      <div className={styles.mapHeading}><strong>Posições GPS recebidas</strong><span>Mapa OpenStreetMap · atualização a cada 10 segundos</span></div>
      <div className={styles.mapViewport} role="img" aria-label={`Mapa OpenStreetMap com ${located.length} motorista(s) localizado(s)`}>
        {tiles.map((tile) => <img key={tile.key} className={styles.mapTile} src={tile.url} alt="" draggable={false} style={{ left: `${tile.x / MAP_WIDTH * 100}%`, top: `${tile.y / MAP_HEIGHT * 100}%` }} />)}
        <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
          {located.map((driver) => {
            const position = point(driver.latitude!, driver.longitude!);
            return <g key={`${driver.id}-${driver.tripNumber}`} transform={`translate(${position.x},${position.y})`}><circle r="12" className={styles.dot}/><text y="-18">{driver.name} · #{driver.tripNumber}</text><title>{driver.name}; lat {driver.latitude!.toFixed(6)}, lon {driver.longitude!.toFixed(6)}</title></g>;
          })}
        </svg>
      </div>
      <div className={styles.mapAttribution}>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></div>
    </section> : <div className={styles.empty}>Nenhuma viagem em execução com posição GPS recebida. A tela indicará os motoristas assim que o aplicativo enviar o primeiro ponto.</div>}
    <ul className={styles.list}>{drivers.map((driver) => {
      const stale = !driver.capturedAt || now - new Date(driver.capturedAt).valueOf() > 5 * 60_000;
      const lowPrecision = driver.accuracy !== null && driver.accuracy > 50;
      const lastCaptured = ageLabel(driver.capturedAt, now).replace("Atualizado", "GPS capturado");
      return <li key={`${driver.id}-${driver.tripNumber}`} className={styles.driver}><div><strong>{driver.name}</strong><span>Viagem #{driver.tripNumber}</span><DriverContact name={driver.name} phone={driver.phone} /></div><div className={stale || lowPrecision ? styles.stale : styles.fresh}>{lastCaptured}{driver.accuracy != null ? ` · precisão ${Math.round(driver.accuracy)} m${lowPrecision ? " (baixa)" : ""}` : " · precisão indisponível"}{driver.receivedAt ? ` · recebido ${new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date(driver.receivedAt))}` : ""}</div></li>;
    })}{drivers.length === 0 ? <li className={styles.empty}>Não há viagens ativas neste momento.</li> : null}</ul>
  </>;
}

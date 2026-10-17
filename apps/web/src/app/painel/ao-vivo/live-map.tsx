"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./live.module.css";
import { DriverContact } from "../DriverContact";
import { addOpenFreeMapLayer } from "../../../lib/maps/openfreemap";

export type LiveDriver = { id: string; name: string; phone: string | null; tripNumber: number; latitude: number | null; longitude: number | null; accuracy: number | null; capturedAt: string | null; receivedAt: string | null };
function ageLabel(date: string | null, now: number) {
  if (!date) return "Sem posição GPS";
  const minutes = Math.max(0, Math.floor((now - new Date(date).valueOf()) / 60000));
  if (minutes < 1) return "Atualizado agora";
  if (minutes < 60) return `Atualizado há ${minutes} min`;
  return `Atualizado há ${Math.floor(minutes / 60)} h`;
}

export function LiveMap({ drivers }: { drivers: LiveDriver[] }) {
  const router = useRouter();
  const mapElement = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(0);
  const [mapError, setMapError] = useState<{ mapPoints: string; message: string } | null>(null);
  useEffect(() => {
    const initialClock = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => { setNow(Date.now()); router.refresh(); }, 10_000);
    return () => { window.clearTimeout(initialClock); window.clearInterval(timer); };
  }, [router]);
  const located = drivers.filter((driver) => driver.latitude !== null && driver.longitude !== null);
  const mapPoints = JSON.stringify(located.map(({ id, name, tripNumber, latitude, longitude, accuracy }) => ({ id, name, tripNumber, latitude, longitude, accuracy })));

  useEffect(() => {
    if (!mapElement.current) return;
    const points = JSON.parse(mapPoints) as Array<Pick<LiveDriver, "id" | "name" | "tripNumber" | "latitude" | "longitude" | "accuracy">>;
    if (!points.length) return;
    let active = true;
    let map: import("leaflet").Map | null = null;
    void import("leaflet").then(async (L) => {
      if (!active || !mapElement.current) return;
      const coordinates = points.map((point) => [point.latitude!, point.longitude!] as [number, number]);
      map = L.map(mapElement.current, { scrollWheelZoom: true, preferCanvas: true }).setView(coordinates[0], 14);
      try {
        await addOpenFreeMapLayer(map, () => {
          if (active) setMapError({ mapPoints, message: "O provedor do mapa não respondeu. A lista de posições GPS continua disponível abaixo." });
        }, () => active);
      } catch {
        if (active) setMapError({ mapPoints, message: "Não foi possível carregar o mapa. A lista de posições GPS continua disponível abaixo." });
      }
      if (!active) return;
      points.forEach((point) => {
        const marker = L.circleMarker([point.latitude!, point.longitude!], {
          radius: 9, color: "#e7fbff", weight: 3, fillColor: "#00c2cb", fillOpacity: 1,
        }).addTo(map!);
        const tooltip = document.createElement("span");
        tooltip.textContent = `${point.name} · viagem #${point.tripNumber}${point.accuracy == null ? "" : ` · ±${Math.round(point.accuracy)} m`}`;
        marker.bindTooltip(tooltip);
      });
      if (coordinates.length > 1) map.fitBounds(L.latLngBounds(coordinates).pad(0.18));
      else map.setView(coordinates[0], 16);
      window.setTimeout(() => map?.invalidateSize(), 100);
    }).catch(() => {
      if (active) setMapError({ mapPoints, message: "Não foi possível carregar o mapa. A lista de posições GPS continua disponível abaixo." });
    });
    return () => { active = false; map?.off(); map?.remove(); };
  }, [mapPoints]);

  return <>
    <div className={styles.liveMeta}><span className={styles.pulse} />Consulta as posições a cada 10 segundos <span>· painel atualizado {now ? new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium" }).format(now) : "sincronizando"}</span></div>
    {located.length ? <section className={styles.coordinateMap} aria-label="Mapa OpenFreeMap com dados do OpenStreetMap e posição GPS dos motoristas">
      <div className={styles.mapHeading}><strong>Posições GPS recebidas</strong><span>Mapa OpenFreeMap · atualização a cada 10 segundos</span></div>
      <div ref={mapElement} className={styles.mapViewport} aria-label={`Mapa OpenFreeMap com ${located.length} motorista(s) localizado(s)`} />
      {mapError?.mapPoints === mapPoints ? <p className={styles.mapError} role="status">{mapError.message}</p> : null}
    </section> : <div className={styles.empty}>Nenhuma viagem em execução com posição GPS recebida. A tela indicará os motoristas assim que o aplicativo enviar o primeiro ponto.</div>}
    <ul className={styles.list}>{drivers.map((driver) => {
      const stale = !driver.capturedAt || now - new Date(driver.capturedAt).valueOf() > 5 * 60_000;
      const lowPrecision = driver.accuracy !== null && driver.accuracy > 50;
      const lastCaptured = ageLabel(driver.capturedAt, now).replace("Atualizado", "GPS capturado");
      return <li key={`${driver.id}-${driver.tripNumber}`} className={styles.driver}><div><strong>{driver.name}</strong><span>Viagem #{driver.tripNumber}</span><DriverContact name={driver.name} phone={driver.phone} /></div><div className={stale || lowPrecision ? styles.stale : styles.fresh}>{lastCaptured}{driver.accuracy != null ? ` · precisão ${Math.round(driver.accuracy)} m${lowPrecision ? " (baixa)" : ""}` : " · precisão indisponível"}{driver.receivedAt ? ` · recebido ${new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date(driver.receivedAt))}` : ""}</div></li>;
    })}{drivers.length === 0 ? <li className={styles.empty}>Não há viagens ativas neste momento.</li> : null}</ul>
  </>;
}

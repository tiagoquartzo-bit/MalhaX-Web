"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "../../../lib/supabase/config";
import styles from "./live.module.css";
import { DriverContact } from "../DriverContact";

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
  const [now, setNow] = useState(0);
  const [realtimeStatus, setRealtimeStatus] = useState("CONNECTING");
  useEffect(() => {
    const { url, anonKey } = getSupabaseConfig();
    const client = createBrowserClient(url, anonKey);
    const channel = client.channel("live-driver-positions")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tracking_positions" }, () => router.refresh())
      .subscribe((status) => setRealtimeStatus(status));
    const initialClock = window.setTimeout(() => setNow(Date.now()), 0);
    const clock = window.setInterval(() => setNow(Date.now()), 10_000);
    const fallback = window.setInterval(() => router.refresh(), 60_000);
    return () => {
      window.clearInterval(clock);
      window.clearTimeout(initialClock);
      window.clearInterval(fallback);
      void client.removeChannel(channel);
    };
  }, [router]);
  const located = drivers.filter((driver) => driver.latitude !== null && driver.longitude !== null);
  const minLat = Math.min(...located.map((driver) => driver.latitude!));
  const maxLat = Math.max(...located.map((driver) => driver.latitude!));
  const minLon = Math.min(...located.map((driver) => driver.longitude!));
  const maxLon = Math.max(...located.map((driver) => driver.longitude!));
  const x = (lon: number) => 40 + (maxLon === minLon ? 50 : ((lon - minLon) / (maxLon - minLon)) * 520);
  const y = (lat: number) => 340 - (maxLat === minLat ? 50 : ((lat - minLat) / (maxLat - minLat)) * 280);
  return <>
    <div className={styles.liveMeta}><span className={styles.pulse} />{realtimeStatus === "SUBSCRIBED" ? "Canal GPS conectado · atualizações imediatas" : "Reconectando canal GPS · consulta de segurança a cada minuto"} <span>· painel atualizado {now ? new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium" }).format(now) : "sincronizando"}</span></div>
    {located.length ? <section className={styles.coordinateMap} aria-label="Visualização local das coordenadas dos motoristas, sem mapa externo">
      <div className={styles.mapHeading}><strong>Posições GPS recebidas</strong><span>Visualização de coordenadas · sem envio a serviços de mapa</span></div>
      <svg viewBox="0 0 600 380" role="img" aria-label="Posição relativa dos motoristas por latitude e longitude">
        {[0,1,2,3,4].map((i) => <g key={i}><line x1={40 + i*130} y1="30" x2={40 + i*130} y2="350"/><line x1="30" y1={60 + i*70} x2="580" y2={60 + i*70}/></g>)}
        {located.map((driver) => <g key={`${driver.id}-${driver.tripNumber}`} transform={`translate(${x(driver.longitude!)},${y(driver.latitude!)})`}><circle r="11" className={styles.dot}/><text y="-16">{driver.name} · #{driver.tripNumber}</text><title>{driver.name}; lat {driver.latitude!.toFixed(6)}, lon {driver.longitude!.toFixed(6)}</title></g>)}
      </svg>
      <div className={styles.axisLabels}><span>Oeste · {minLon.toFixed(5)}</span><span>Longitude → {maxLon.toFixed(5)}</span></div>
      <p className={styles.mapDisclaimer}>A posição relativa não representa ruas nem distância percorrida. Para mapa viário, é necessário configurar um provedor aprovado para os dados GPS.</p>
    </section> : <div className={styles.empty}>Nenhuma viagem em execução com posição GPS recebida. A tela indicará os motoristas assim que o aplicativo enviar o primeiro ponto.</div>}
    <ul className={styles.list}>{drivers.map((driver) => {
      const stale = !driver.capturedAt || now - new Date(driver.capturedAt).valueOf() > 5 * 60_000;
      const lowPrecision = driver.accuracy !== null && driver.accuracy > 50;
      const lastCaptured = ageLabel(driver.capturedAt, now).replace("Atualizado", "GPS capturado");
      return <li key={`${driver.id}-${driver.tripNumber}`} className={styles.driver}><div><strong>{driver.name}</strong><span>Viagem #{driver.tripNumber}</span><DriverContact name={driver.name} phone={driver.phone} /></div><div className={stale || lowPrecision ? styles.stale : styles.fresh}>{lastCaptured}{driver.accuracy != null ? ` · precisão ${Math.round(driver.accuracy)} m${lowPrecision ? " (baixa)" : ""}` : " · precisão indisponível"}{driver.receivedAt ? ` · recebido ${new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date(driver.receivedAt))}` : ""}</div></li>;
    })}{drivers.length === 0 ? <li className={styles.empty}>Não há viagens ativas neste momento.</li> : null}</ul>
  </>;
}

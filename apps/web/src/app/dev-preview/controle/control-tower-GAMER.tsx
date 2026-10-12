"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Map as LeafletMap, CircleMarker as LeafletCircleMarker, Polyline as LeafletPolyline } from "leaflet";

import { IndicatorSelector } from "./indicator-selector";
import { InteractiveMap } from "./interactive-map";
import { signOut } from "../../login/actions";
import styles from "./control-GAMER.module.css";

type PeriodKind = "today" | "month" | "semester" | "year" | "custom";
type TabKind = "overview" | "tasks" | "drivers" | "history" | "analytics" | "proofs" | "messages";

const tabs: { id: TabKind; label: string }[] = [
  { id: "overview", label: "Visão geral" },
  { id: "tasks", label: "Coletas e entregas" },
  { id: "drivers", label: "Motoristas" },
  { id: "history", label: "Histórico de rotas" },
  { id: "analytics", label: "Indicadores" },
  { id: "proofs", label: "Comprovantes" },
  { id: "messages", label: "Conversas" },
];

const drivers = [
  { name: "Rafael Oliveira", vehicle: "Honda CG 160 · FGH-4J28", category: "Moto", status: "Em rota", gps: "há 18 s", accuracy: "± 8 m", completed: "14 / 16", tone: "cyan" },
  { name: "Marcos Santos", vehicle: "Honda CG 160 · JKT-9A12", category: "Moto", status: "Atrasado", gps: "há 42 s", accuracy: "± 14 m", completed: "9 / 13", tone: "amber" },
  { name: "João Pereira", vehicle: "Fiorino · RXP-2C51", category: "Carro/utilitário", status: "Em rota", gps: "há 1 min", accuracy: "± 11 m", completed: "11 / 15", tone: "green" },
  { name: "Camila Souza", vehicle: "Caminhão leve · MNB-7D63", category: "Caminhão", status: "Em rota", gps: "há 2 min", accuracy: "± 16 m", completed: "7 / 10", tone: "green" },
];

const tasks = [
  { order: "#2841", type: "Coleta", client: "Papelaria Central", address: "Rua das Flores, 142", driver: "Rafael Oliveira", time: "08:45", status: "Realizada", tone: "green" },
  { order: "#2841", type: "Entrega", client: "Escola Novo Horizonte", address: "Rua Monte Azul, 51", driver: "Rafael Oliveira", time: "10:20", status: "Realizada", tone: "green" },
  { order: "#2838", type: "Entrega", client: "Centro Educacional Vida", address: "Rua dos Pinheiros, 220", driver: "Marcos Santos", time: "14:20", status: "Atrasada · 32 min", tone: "amber" },
  { order: "#2844", type: "Coleta", client: "Distribuidora Escolar", address: "Av. Carlos Lacerda, 980", driver: "João Pereira", time: "15:10", status: "Pendente", tone: "cyan" },
  { order: "#2827", type: "Entrega", client: "Loja Estação", address: "Rua João Dias, 305", driver: "João Pereira", time: "14:05", status: "Não realizada", tone: "amber" },
  { order: "#2840", type: "Entrega", client: "Mercado Primavera", address: "Rua Barão, 90", driver: "Rafael Oliveira", time: "14:42", status: "Comprovante pendente", tone: "amber" },
  { order: "#2850", type: "Coleta", client: "Farmácia Popular", address: "Estrada do Campo Limpo, 810", driver: "Marcos Santos", time: "15:30", status: "Pendente", tone: "cyan" },
  { order: "#2819", type: "Entrega", client: "Colégio Integração", address: "Rua Antonio da Silva, 74", driver: "—", time: "—", status: "Cancelada", tone: "muted" },
];

const proofs = [
  { order: "#2840", driver: "Rafael Oliveira", time: "14:42", recipient: "Ana", accuracy: "± 8 m", photo: "proofPhoto" },
  { order: "#2839", driver: "João Pereira", time: "14:31", recipient: "Paulo", accuracy: "± 11 m", photo: "proofPhoto photoAlt" },
  { order: "#2837", driver: "Marcos Santos", time: "14:08", recipient: "Lúcia", accuracy: "± 14 m", photo: "proofPhoto photoThird" },
];

const conversation = [
  { who: "Rafael · motorista", time: "14:36", text: "O endereço está fechado. Já registrei a ocorrência e enviei a foto.", mine: false },
  { who: "Você · gestor", time: "14:38", text: "Entendido. Siga para a próxima parada; vamos reagendar essa entrega.", mine: true },
  { who: "Rafael · motorista", time: "14:40", text: "Ok, atualizado.", mine: false },
];

const periodExamples: Record<Exclude<PeriodKind, "custom">, {
  pickups: string; deliveries: string; delays: string; cancelled: string; service: string; onTime: string;
  pickupDetail: string; deliveryDetail: string; delayDetail: string; cancelledDetail: string; serviceDetail: string; onTimeDetail: string;
}> = {
  today: {
    pickups: "15 / 24", deliveries: "19 / 28", delays: "4", cancelled: "2", service: "7m 35s", onTime: "91%",
    pickupDetail: "9 aguardando conclusão", deliveryDetail: "9 aguardando conclusão", delayDetail: "2 entregas · 2 coletas",
    cancelledDetail: "justificativas registradas", serviceDetail: "média por parada concluída", onTimeDetail: "do que foi concluído",
  },
  month: {
    pickups: "312 / 356", deliveries: "428 / 493", delays: "38", cancelled: "21", service: "8m 12s", onTime: "88%",
    pickupDetail: "44 aguardando conclusão", deliveryDetail: "65 aguardando conclusão", delayDetail: "27 entregas · 11 coletas",
    cancelledDetail: "justificativas registradas", serviceDetail: "média por parada concluída", onTimeDetail: "do que foi concluído",
  },
  semester: {
    pickups: "1.748 / 1.962", deliveries: "2.318 / 2.701", delays: "204", cancelled: "137", service: "8m 04s", onTime: "90%",
    pickupDetail: "214 aguardando conclusão", deliveryDetail: "383 aguardando conclusão", delayDetail: "141 entregas · 63 coletas",
    cancelledDetail: "justificativas registradas", serviceDetail: "média por parada concluída", onTimeDetail: "do que foi concluído",
  },
  year: {
    pickups: "3.392 / 3.840", deliveries: "4.501 / 5.218", delays: "421", cancelled: "288", service: "8m 19s", onTime: "89%",
    pickupDetail: "448 aguardando conclusão", deliveryDetail: "717 aguardando conclusão", delayDetail: "290 entregas · 131 coletas",
    cancelledDetail: "justificativas registradas", serviceDetail: "média por parada concluída", onTimeDetail: "do que foi concluído",
  },
};

const indicatorLabels = [
  ["Coletas realizadas", "pickups", "cyan"],
  ["Entregas realizadas", "deliveries", "green"],
  ["Atrasadas", "delays", "amber"],
  ["Canceladas", "cancelled", "muted"],
  ["Tempo médio no ponto", "service", "cyan"],
  ["Pontualidade", "onTime", "green"],
] as const;

type OperationalException = {
  id: string; title: string; order: string; driver: string | null; detail: string;
  severity: "urgent" | "warning" | "info";
};

const operationalExceptions: OperationalException[] = [
  { id: "delay-2838", title: "Entrega atrasada", order: "#2838", driver: "Marcos Santos", detail: "Previsão 14:20 · 32 min de atraso", severity: "urgent" },
  { id: "gps-2844", title: "Coleta sem atualização", order: "#2844", driver: "João Pereira", detail: "Última posição recebida há 18 min", severity: "warning" },
  { id: "failed-2827", title: "Tentativa não concluída", order: "#2827", driver: "João Pereira", detail: "Motivo: destinatário ausente", severity: "warning" },
  { id: "proof-2840", title: "Comprovante pendente", order: "#2840", driver: "Rafael Oliveira", detail: "Entrega baixada sem foto anexada", severity: "warning" },
  { id: "offline-2846", title: "Ações aguardando sincronização", order: "#2846", driver: "Rafael Oliveira", detail: "Comprovante e GPS salvos no aparelho · aguardando conexão", severity: "warning" },
  { id: "cancelled-2819", title: "Parada cancelada", order: "#2819", driver: null, detail: "Endereço solicitado para correção", severity: "info" },
];

function OverviewScreen({
  indicatorItems, onOpenStop, onMessageDriver,
}: {
  indicatorItems: { label: string; value: string; detail: string; tone: string }[];
  onOpenStop: (order: string) => void;
  onMessageDriver: (driver: string) => void;
}) {
  const [filter, setFilter] = useState<"open" | "all" | "resolved">("open");
  const [resolved, setResolved] = useState<Record<string, boolean>>({});
  const [routeDriver, setRouteDriver] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const openCount = operationalExceptions.filter((item) => !resolved[item.id]).length;
  const visible = operationalExceptions.filter((item) =>
    filter === "all" || (filter === "resolved" ? resolved[item.id] : !resolved[item.id]),
  );

  return (
    <>
      <IndicatorSelector indicators={indicatorItems} />
      <section className={styles.splitGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div><p className={styles.eyebrow}>LOCALIZAÇÃO DOS MOTORISTAS</p><h2>Mapa operacional</h2></div>
            <span className={styles.updateTag}>Posições de demonstração</span>
          </div>
          <InteractiveMap />
          <div className={styles.driverList}>
            {drivers.map((driver) => (
              <div className={styles.driverRow} key={driver.name}>
                <span className={styles.driverDot + " " + styles[driver.tone]} />
                <div className={styles.driverIdentity}><strong>{driver.name}</strong><small>{driver.vehicle} · {driver.status}</small></div>
                <div className={styles.gpsInfo}><strong>{driver.gps}</strong><small>Precisão {driver.accuracy}</small></div>
              </div>
            ))}
          </div>
          <p className={styles.disclaimer}>Posições ilustrativas. A tela operacional deve mostrar horário e precisão recebidos do GPS e sinalizar posições antigas.</p>
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div><p className={styles.eyebrow}>CENTRAL DE OCORRÊNCIAS</p><h2>Precisa de atenção</h2></div>
            <span className={styles.alertCount} aria-label={`${openCount} ocorrências abertas`}>{openCount}</span>
          </div>
          <div className={styles.exceptionFilters} role="group" aria-label="Filtrar ocorrências">
            {([["open", "Abertas"], ["all", "Todas"], ["resolved", "Resolvidas"]] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value}
                className={filter === value ? styles.exceptionFilterActive : styles.exceptionFilter}
                onClick={() => setFilter(value)}>{label}{value === "open" ? ` · ${openCount}` : ""}</button>
            ))}
          </div>
          <div className={styles.exceptionList}>
            {visible.map((item) => (
              <article className={styles.exceptionCard} key={item.id}>
                <div className={styles.exceptionTopline}>
                  <span className={styles["severity_" + item.severity]}>{item.severity === "urgent" ? "Urgente" : item.severity === "warning" ? "Atenção" : "Informativa"}</span>
                  {resolved[item.id] ? <span className={styles.resolvedLabel}>Resolvida</span> : null}
                </div>
                <strong className={styles.exceptionTitle}>{item.title}</strong>
                <p>{item.order} · {item.driver || "Operação"}</p>
                <small>{item.detail}</small>
                <div className={styles.exceptionActions}>
                  <button type="button" onClick={() => onOpenStop(item.order)}>Abrir parada</button>
                  <button type="button" disabled={!item.driver} onClick={() => item.driver && onMessageDriver(item.driver)}>Conversar</button>
                  <button type="button" disabled={!item.driver} onClick={() => setRouteDriver(item.driver)}>Reordenar rota</button>
                  <button type="button" className={styles.resolveAction} onClick={() => setResolved((current) => ({ ...current, [item.id]: !current[item.id] }))}>
                    {resolved[item.id] ? "Reabrir" : "Resolver"}
                  </button>
                </div>
              </article>
            ))}
            {visible.length === 0 ? <p className={styles.emptyExceptions}>Nenhuma ocorrência neste filtro.</p> : null}
          </div>
          {notice ? <p className={styles.actionNotice} role="status">{notice}</p> : null}
        </article>
      </section>
      {routeDriver ? <RouteReorderDialog driver={routeDriver} onClose={() => setRouteDriver(null)} onConfirm={(sequence) => {
        setNotice(`Sequência demonstrativa de ${routeDriver}: ${sequence.map((stop) => stop.order).join(" → ")}.`);
        setRouteDriver(null);
      }} /> : null}
    </>
  );
}

function RouteReorderDialog({ driver, onClose, onConfirm }: { driver: string; onClose: () => void; onConfirm: (sequence: typeof tasks) => void }) {
  const [sequence, setSequence] = useState(() => tasks.filter((task) => task.driver === driver));
  const move = (index: number, direction: -1 | 1) => setSequence((current) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= current.length) return current;
    const next = [...current];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return next;
  });
  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={styles.routeDialog} role="dialog" aria-modal="true" aria-labelledby="route-dialog-title">
        <div className={styles.panelHeading}><div><p className={styles.eyebrow}>AJUSTE DE ROTA</p><h2 id="route-dialog-title">Reordenar paradas</h2></div><button type="button" className={styles.dialogClose} onClick={onClose} aria-label="Fechar">×</button></div>
        <p className={styles.dialogIntro}>Motorista: <strong>{driver}</strong>. Use as setas para ajustar a sequência.</p>
        <ol className={styles.routeStopList}>
          {sequence.map((stop, index) => (
            <li key={stop.order + stop.type + index}>
              <span className={styles.routePosition}>{index + 1}</span>
              <span className={styles.routeStopText}><strong>{stop.type} {stop.order}</strong><small>{stop.address}</small></span>
              <span className={styles.routeMoveActions}>
                <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Mover ${stop.order} para cima`}>↑</button>
                <button type="button" disabled={index === sequence.length - 1} onClick={() => move(index, 1)} aria-label={`Mover ${stop.order} para baixo`}>↓</button>
              </span>
            </li>
          ))}
        </ol>
        <p className={styles.disclaimer}>Esta prévia apenas demonstra a edição. Em produção, a confirmação registrará autor, horário e atualização enviada ao motorista.</p>
        <div className={styles.dialogActions}><button type="button" className={styles.dialogCancel} onClick={onClose}>Cancelar</button><button type="button" className={styles.dialogConfirm} onClick={() => onConfirm(sequence)}>Confirmar sequência</button></div>
      </section>
    </div>
  );
}

const historicalRoutes = [
  { id: "rafael-20261006", dateKey: "2026-10-06", driver: "Rafael Oliveira", vehicle: "Honda CG 160 · FGH-4J28", day: "06 out. 2026", distance: "31,8 km", duration: "4h 28min", stops: "12 de 14", points: [
    { time: "07:42", event: "Saída da base", place: "Base Campo Limpo", lat: -23.6302, lng: -46.7601, accuracy: 7, x: 70, y: 220 },
    { time: "08:06", event: "Coleta realizada", place: "Papelaria Central · parada 1", lat: -23.6254, lng: -46.7542, accuracy: 8, x: 190, y: 150 },
    { time: "09:14", event: "Entrega realizada", place: "Escola Novo Horizonte · parada 4", lat: -23.6185, lng: -46.7491, accuracy: 9, x: 340, y: 210 },
    { time: "10:32", event: "Entrega realizada", place: "Mercado Primavera · parada 8", lat: -23.6221, lng: -46.7398, accuracy: 11, x: 500, y: 105 },
    { time: "12:10", event: "Último registro GPS", place: "Estrada do Campo Limpo", lat: -23.6310, lng: -46.7480, accuracy: 8, x: 690, y: 175 },
  ] },
  { id: "marcos-20261005", dateKey: "2026-10-05", driver: "Marcos Santos", vehicle: "Honda CG 160 · JKT-9A12", day: "05 out. 2026", distance: "27,4 km", duration: "3h 52min", stops: "9 de 13", points: [
    { time: "08:02", event: "Saída da base", place: "Base Campo Limpo", lat: -23.6302, lng: -46.7601, accuracy: 9, x: 70, y: 220 },
    { time: "08:48", event: "Coleta realizada", place: "Distribuidora Escolar · parada 2", lat: -23.6352, lng: -46.7658, accuracy: 14, x: 190, y: 150 },
    { time: "10:22", event: "Entrega com atraso", place: "Centro Educacional Vida · parada 6", lat: -23.6181, lng: -46.7513, accuracy: 14, x: 340, y: 210 },
    { time: "11:54", event: "Último registro GPS", place: "Rua dos Pinheiros", lat: -23.6226, lng: -46.7402, accuracy: 12, x: 500, y: 105 },
  ] },
  { id: "joao-20261004", dateKey: "2026-10-04", driver: "João Pereira", vehicle: "Fiorino · RXP-2C51", day: "04 out. 2026", distance: "42,1 km", duration: "5h 06min", stops: "11 de 15", points: [
    { time: "07:30", event: "Saída da base", place: "Base Campo Limpo", lat: -23.6302, lng: -46.7601, accuracy: 10, x: 70, y: 220 },
    { time: "08:18", event: "Coleta realizada", place: "Armazém São Lucas · parada 1", lat: -23.6241, lng: -46.7570, accuracy: 11, x: 190, y: 150 },
    { time: "09:55", event: "Entrega realizada", place: "Loja Estação · parada 5", lat: -23.6198, lng: -46.7456, accuracy: 12, x: 340, y: 210 },
    { time: "12:36", event: "Último registro GPS", place: "Av. Carlos Lacerda", lat: -23.6266, lng: -46.7391, accuracy: 16, x: 500, y: 105 },
  ] },
] as const;

type RoutePoint = { time: string; event: string; place: string; lat: number; lng: number; accuracy: number };
type HistoricalRoute = { id: string; dateKey: string; day: string; driver: string; vehicle: string; distance: string; duration: string; stops: string; points: readonly RoutePoint[] };

function HistoryRouteMap({ route, activeIndex }: { route: HistoricalRoute; activeIndex: number }) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const fullRouteRef = useRef<LeafletPolyline | null>(null);
  const playedRouteRef = useRef<LeafletPolyline | null>(null);
  const markerRef = useRef<LeafletCircleMarker | null>(null);
  const [mapError, setMapError] = useState("");
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    let active = true;
    let map: LeafletMap | null = null;
    void import("leaflet").then((L) => {
      if (!active) return;
      const points = route.points;
      map = L.map(element, { zoomControl: true, scrollWheelZoom: true }).setView([points[0].lat, points[0].lng], 14);
      mapRef.current = map;
      L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).on("tileerror", () => { if (active) setMapError("Mapa base indisponível; coordenadas e histórico continuam visíveis abaixo."); }).addTo(map);
      const coordinates = points.map((point) => L.latLng(point.lat, point.lng));
      fullRouteRef.current = L.polyline(coordinates, { color: "#88a0b3", weight: 4, opacity: .62, dashArray: "7 7" }).addTo(map);
      playedRouteRef.current = L.polyline([], { color: "#00c2cb", weight: 5, opacity: .95 }).addTo(map);
      points.forEach((point, index) => {
        const color = /atraso|ocorrência|falha/i.test(point.event) ? "#e7a443" : /realizada|concluída/i.test(point.event) ? "#54c69a" : "#38dff0";
        const marker = L.circleMarker([point.lat, point.lng], { radius: index === 0 ? 8 : 6, color: "#eaf7ff", weight: 2, fillColor: color, fillOpacity: 1 }).addTo(map!);
        marker.bindTooltip(`${index + 1}. ${point.event} · ${point.time}`);
      });
      map.fitBounds(fullRouteRef.current.getBounds(), { padding: [24, 24] });
    }).catch(() => { if (active) setMapError("Não foi possível carregar o mapa. Os pontos GPS seguem disponíveis na lista."); });
    return () => {
      active = false;
      map?.off(); map?.remove(); mapRef.current = null; fullRouteRef.current = null; playedRouteRef.current = null; markerRef.current = null;
    };
  }, [route]);
  useEffect(() => {
    const map = mapRef.current;
    const line = playedRouteRef.current;
    if (!map || !line) return;
    void import("leaflet").then((L) => {
      const shown = route.points.slice(0, activeIndex + 1).map((point) => L.latLng(point.lat, point.lng));
      line.setLatLngs(shown);
      const current = shown.at(-1);
      if (current) {
        if (markerRef.current) markerRef.current.setLatLng(current);
        else markerRef.current = L.circleMarker(current, { radius: 10, color: "#fff", weight: 3, fillColor: "#00c2cb", fillOpacity: 1 }).addTo(map);
        map.panTo(current, { animate: true, duration: .35 });
      }
    });
  }, [route, activeIndex]);
  return <div className={styles.historyMapWrap}><div ref={elementRef} className={styles.historyMap} aria-label={`Mapa do trajeto de ${route.driver}`} />{mapError ? <p className={styles.mapError} role="status">{mapError}</p> : null}<div className={styles.historyMapLegend}><span><i className={styles.legendCompleted} />Concluída</span><span><i className={styles.legendIssue} />Atraso/ocorrência</span><span><i className={styles.legendGps} />Ponto GPS</span></div></div>;
}

function HistoryScreen() {
  const [routeId, setRouteId] = useState<string>(historicalRoutes[0].id);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const route = historicalRoutes.find((item) => item.id === routeId) as HistoricalRoute;
  const dateOptions = [...new Set(historicalRoutes.map((item) => item.dateKey))].sort();
  const currentPoint = route.points[activeIndex];
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setActiveIndex((current) => {
      if (current >= route.points.length - 1) { setPlaying(false); return current; }
      return current + 1;
    }), 1200);
    return () => window.clearInterval(timer);
  }, [playing, route.points.length]);
  function downloadCsv() {
    const rows = [["Data", "Hora", "Motorista", "Veículo", "Viagem", "Evento", "Local", "Latitude", "Longitude", "Precisão GPS (m)"], ...route.points.map((point, index) => [route.day, point.time, route.driver, route.vehicle, route.id, point.event, point.place, point.lat.toFixed(7), point.lng.toFixed(7), point.accuracy])];
    const csv = "\uFEFF" + rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `malhax-gps-${route.driver.toLowerCase().replaceAll(" ", "-")}-${route.dateKey}.csv`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className={styles.panel}>
    <div className={styles.panelHeading}><div><p className={styles.eyebrow}>TRAJETO REGISTRADO</p><h2>{route.driver} · {route.day}</h2><small>{route.vehicle}</small></div><button type="button" className={styles.exportButton} onClick={downloadCsv}>↓ Baixar pontos GPS em CSV</button></div>
    <div className={styles.historyControls}>
      <label>Motorista<select value={route.driver} onChange={(event) => { const next = historicalRoutes.find((item) => item.driver === event.target.value); if (next) { setRouteId(next.id); setActiveIndex(0); setPlaying(false); } }}><option value="Todos">Todos</option>{[...new Set(historicalRoutes.map((item) => item.driver))].map((name) => <option key={name}>{name}</option>)}</select></label>
      <label>Data<select value={route.dateKey} onChange={(event) => { const next = historicalRoutes.find((item) => item.dateKey === event.target.value); if (next) { setRouteId(next.id); setActiveIndex(0); setPlaying(false); } }}><option value="Todas">Todas</option>{dateOptions.map((date) => <option value={date} key={date}>{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR")}</option>)}</select></label>
      <label>Viagem<select value={routeId} onChange={(event) => { setRouteId(event.target.value); setActiveIndex(0); setPlaying(false); }}>{historicalRoutes.map((item) => <option value={item.id} key={item.id}>{item.driver} · {item.day}</option>)}</select></label>
      <div className={styles.historySummary}><span><strong>{route.distance}</strong><small>distância estimada</small></span><span><strong>{route.duration}</strong><small>tempo registrado</small></span><span><strong>{route.stops}</strong><small>paradas concluídas</small></span></div>
    </div>
    <div className={styles.gpsQuality}><span className={styles.gpsQualityDot} /><div><strong>Último ponto GPS · {route.points.at(-1)?.time}</strong><small>Precisão registrada ± {route.points.at(-1)?.accuracy} m · histórico demonstrativo</small></div><span className={styles.gpsQualityNote}>Localização histórica, não ao vivo</span></div>
    <div className={styles.historyGrid}>
      <div className={styles.historyMapColumn}><HistoryRouteMap route={route} activeIndex={activeIndex} />
        <div className={styles.playback}><button type="button" className={styles.playButton} onClick={() => setPlaying((value) => !value)}>{playing ? "Pausar" : activeIndex === route.points.length - 1 ? "Reproduzir novamente" : "Reproduzir trajeto"}</button><button type="button" className={styles.stepButton} disabled={activeIndex === 0} onClick={() => setActiveIndex((value) => Math.max(0, value - 1))} aria-label="Voltar ponto">‹</button><input aria-label="Linha do tempo do trajeto" type="range" min="0" max={route.points.length - 1} value={activeIndex} onChange={(event) => { setPlaying(false); setActiveIndex(Number(event.target.value)); }} /><button type="button" className={styles.stepButton} disabled={activeIndex === route.points.length - 1} onClick={() => setActiveIndex((value) => Math.min(route.points.length - 1, value + 1))} aria-label="Avançar ponto">›</button><span>{currentPoint.time} · ponto {activeIndex + 1}/{route.points.length}</span></div>
        <div className={styles.selectedGpsPoint}><strong>{currentPoint.event}</strong><span>{currentPoint.place}</span><small>Lat. {currentPoint.lat.toFixed(7)} · Long. {currentPoint.lng.toFixed(7)} · precisão ±{currentPoint.accuracy} m</small></div>
      </div>
      <div className={styles.historyTimeline}><h3>Paradas e pontos registrados</h3><ol>{route.points.map((point, index) => <li key={`${point.time}-${point.event}`} className={index === activeIndex ? styles.activeHistoryPoint : ""}><button type="button" onClick={() => { setPlaying(false); setActiveIndex(index); }}><time>{point.time}</time><div><strong>{point.event}</strong><span>{point.place}</span><small>{point.lat.toFixed(7)}, {point.lng.toFixed(7)} · precisão ±{point.accuracy} m</small></div></button></li>)}</ol></div>
    </div>
    <p className={styles.disclaimer}>Mapa de demonstração com coordenadas fictícias; os dados reais virão do GPS do motorista. O CSV inclui latitude, longitude, precisão, horário, parada e viagem.</p>
  </section>;
}
function MenuIcon({ name }: { name: TabKind }) {
  const shared = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...shared}>
      {name === "overview" ? <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></> : null}
      {name === "tasks" ? <><path d="M3 7h11v11H3z" /><path d="M14 11h4l3 3v4h-7z" /><circle cx="7.5" cy="19" r="1.8" /><circle cx="17.5" cy="19" r="1.8" /></> : null}
      {name === "drivers" ? <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.3a3.2 3.2 0 0 1 0 6.2M17 15a5 5 0 0 1 3.5 4.7" /></> : null}
      {name === "history" ? <><path d="M4.5 5.5v5h5" /><path d="M5.2 10.1a7.2 7.2 0 1 1-.1 4.2" /><path d="M12 8v4l2.7 1.6" /></> : null}
      {name === "analytics" ? <><path d="M4 20V11h4v9M10 20V5h4v15M16 20v-7h4v7" /><path d="M2.5 20.5h19" /></> : null}
      {name === "proofs" ? <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 5-4 3.5 3 3.5-5 4 6" /></> : null}
      {name === "messages" ? <><path d="M4 5.5h16v11H11l-5 3v-3H4z" /><path d="M8 10h8M8 13.5h5" /></> : null}
    </svg>
  );
}

function TasksScreen({ selectedOrder, onClearSelection }: {
  selectedOrder: string | null; onClearSelection: () => void;
}) {
  const [kind, setKind] = useState("Todas");
  const [driver, setDriver] = useState("Todos");
  const [status, setStatus] = useState("Todos");
  const [query, setQuery] = useState("");
  const [detailTask, setDetailTask] = useState(() => tasks.find((task) => task.order === selectedOrder) ?? null);
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const driverOptions = [...new Set(tasks.map((task) => task.driver).filter((name) => name !== "—"))];
  const filtered = tasks.filter((task) => {
    const searchable = `${task.order} ${task.client} ${task.address} ${task.driver}`.toLocaleLowerCase("pt-BR");
    const open = task.status.includes("Pendente") || task.status.includes("Atrasada");
    const completed = task.status === "Realizada";
    const exception = task.status === "Não realizada" || task.status === "Cancelada";
    return (!selectedOrder || task.order === selectedOrder)
      && (kind === "Todas" || task.type === kind)
      && (driver === "Todos" || task.driver === driver)
      && (status === "Todos" || (status === "Em aberto" && open) || (status === "Concluídas" && completed) || (status === "Não concluídas" && exception))
      && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div><p className={styles.eyebrow}>ACOMPANHAMENTO OPERACIONAL</p><h2>Coletas e entregas</h2><small className={styles.taskPeriod}>Paradas da operação · dados de demonstração</small></div>
        <div className={styles.subTabs} role="group" aria-label="Filtrar tipo de parada">
          {["Todas", "Coleta", "Entrega"].map((value) => (
            <button key={value} type="button" aria-pressed={kind === value} className={kind === value ? styles.subTabActive : styles.subTab} onClick={() => setKind(value)}>{value}</button>
          ))}
        </div>
      </div>
      <div className={styles.taskFilterGrid}>
        <label className={styles.taskSearch}>Buscar parada
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pedido, cliente ou endereço" />
        </label>
        <label>Motorista
          <select className={styles.filterSelect} value={driver} onChange={(event) => setDriver(event.target.value)}>
            <option>Todos</option>{driverOptions.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <label>Situação
          <select className={styles.filterSelect} value={status} onChange={(event) => setStatus(event.target.value)}>
            {["Todos", "Em aberto", "Concluídas", "Não concluídas"].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>
      {selectedOrder ? <div className={styles.selectedStopNotice} role="status"><span>Parada selecionada na ocorrência: <strong>{selectedOrder}</strong></span><button type="button" onClick={onClearSelection}>Mostrar todas</button></div> : null}
      <div className={styles.taskResultSummary} aria-live="polite">{filtered.length} {filtered.length === 1 ? "parada encontrada" : "paradas encontradas"}</div>
      <div className={styles.tableWrap}>
        <table className={styles.dataTable + " " + styles.taskTable}>
          <thead><tr><th>Pedido</th><th>Tipo</th><th>Cliente / endereço</th><th>Motorista</th><th>Previsão</th><th>Status</th><th>Ação</th></tr></thead>
          <tbody>{filtered.map((task, index) => (
            <tr key={task.order + task.type + index}>
              <td>{task.order}</td><td>{task.type}</td><td><strong>{task.client}</strong><br /><span className={styles.taskAddress}>{task.address}</span></td><td>{task.driver}</td><td>{task.time}</td>
              <td><span className={styles["status_" + task.tone]}>{task.status}</span></td>
              <td><button type="button" className={styles.taskDetailsButton} onClick={() => setDetailTask(task)}>Ver histórico</button></td>
            </tr>
          ))}</tbody>
        </table>
        {filtered.length === 0 ? <div className={styles.taskEmpty}>Nenhuma parada corresponde a esses filtros. Ajuste a busca ou selecione “Mostrar todas”.</div> : null}
      </div>
      <p className={styles.disclaimer}>A lista e os eventos são fictícios nesta prévia. Os filtros operacionais serão aplicados aos dados reais quando o painel estiver conectado ao backend.</p>
      {detailTask ? <TaskHistoryDialog task={detailTask} onClose={() => setDetailTask(null)} /> : null}
    </section>
  );
}

function TaskHistoryDialog({ task, onClose }: { task: (typeof tasks)[number]; onClose: () => void }) {
  const events = [
    { time: "07:42", title: "Parada criada", detail: "Pedido incluído na programação da operação.", tone: "cyan" },
    ...(task.driver !== "—" ? [{ time: "08:10", title: "Motorista atribuído", detail: `${task.driver} recebeu a parada na rota.`, tone: "cyan" }] : []),
    ...(task.driver !== "—" ? [{ time: "08:24", title: "Localização recebida", detail: "Latitude -23.626100 · Longitude -46.757400 · precisão ± 11 m.", tone: "cyan" }] : []),
    ...(task.status === "Realizada" ? [{ time: task.time, title: "Parada concluída", detail: "Baixa registrada pelo motorista.", tone: "green" }] : []),
    ...(task.status.includes("Atrasada") ? [{ time: task.time, title: "Previsão ultrapassada", detail: "A parada permanece em aberto; gestor pode reordenar a rota.", tone: "amber" }] : []),
    ...(task.status === "Não realizada" ? [{ time: task.time, title: "Tentativa não concluída", detail: "Motivo registrado: destinatário ausente.", tone: "amber" }] : []),
    ...(task.status === "Comprovante pendente" ? [{ time: task.time, title: "Comprovante pendente", detail: "A foto obrigatória ainda não foi anexada.", tone: "amber" }] : []),
    ...(task.status === "Cancelada" ? [{ time: "13:50", title: "Parada cancelada", detail: "Endereço solicitado para correção.", tone: "muted" }] : []),
    ...(task.status === "Pendente" ? [{ time: "Aguardando", title: "Parada ainda não iniciada", detail: "Nenhuma baixa foi recebida.", tone: "muted" }] : []),
  ];
  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={styles.taskDialog} role="dialog" aria-modal="true" aria-labelledby="task-dialog-title">
        <div className={styles.panelHeading}><div><p className={styles.eyebrow}>DETALHE DA PARADA</p><h2 id="task-dialog-title">Pedido {task.order} · {task.type}</h2></div><button type="button" className={styles.dialogClose} onClick={onClose} aria-label="Fechar histórico">×</button></div>
        <div className={styles.taskDetailSummary}>
          <div><span>Cliente</span><strong>{task.client}</strong></div><div><span>Endereço</span><strong>{task.address}</strong></div>
          <div><span>Motorista</span><strong>{task.driver}</strong></div><div><span>Previsão</span><strong>{task.time}</strong></div>
          <div><span>Status</span><strong>{task.status}</strong></div>
        </div>
        <h3 className={styles.timelineHeading}>Histórico de eventos</h3>
        <ol className={styles.eventTimeline}>
          {events.map((event, index) => (
            <li key={event.title + index}>
              <span className={styles["timelineDot_" + event.tone]} />
              <div><div className={styles.timelineEventTop}><strong>{event.title}</strong><time>{event.time}</time></div><p>{event.detail}</p></div>
            </li>
          ))}
        </ol>
        <p className={styles.disclaimer}>Eventos ilustrativos. O histórico real deverá ser imutável e registrar ator, horário, GPS e comprovantes.</p>
      </section>
    </div>
  );
}

const vehicleEconomics = [
  { category: "Moto", stops: "42", revenue: "R$ 4.200", costs: "R$ 1.850", contribution: "R$ 2.350" },
  { category: "Carro/utilitário", stops: "28", revenue: "R$ 5.600", costs: "R$ 3.900", contribution: "R$ 1.700" },
  { category: "Caminhão", stops: "12", revenue: "R$ 8.400", costs: "R$ 6.100", contribution: "R$ 2.300" },
];

function DriversScreen() {
  const [category, setCategory] = useState("Todos");
  const visible = drivers.filter((driver) => category === "Todos" || driver.category === category);
  return (
    <div className={styles.driverScreen}>
      <section className={styles.panel}>
        <div className={styles.driverPanelHeading}>
          <div className={styles.panelHeading}><div><p className={styles.eyebrow}>EQUIPE DE RUA</p><h2>Motoristas e veículos</h2></div></div>
          <div className={styles.driverTools}>
          <select className={styles.filterSelect} aria-label="Filtrar por categoria de veículo" value={category} onChange={(event) => setCategory(event.target.value)}>
            {["Todos", "Moto", "Carro/utilitário", "Caminhão"].map((item) => <option key={item}>{item}</option>)}
          </select>
          </div>
        </div>
        <div className={styles.driverCards}>
          {visible.map((driver) => (
            <article className={styles.driverCard} key={driver.name}>
              <div className={styles.driverCardTop}><span className={styles.driverDot + " " + styles[driver.tone]} /><span className={styles.driverCardStatus}>{driver.status}</span></div>
              <h3>{driver.name}</h3><p>{driver.category} · {driver.vehicle}</p>
              <div className={styles.driverCardStats}><span>Paradas realizadas<strong>{driver.completed}</strong></span><span>Último GPS<strong>{driver.gps}</strong></span><span>Precisão recebida<strong>{driver.accuracy}</strong></span></div>
            </article>
          ))}
          {visible.length === 0 ? <p className={styles.disclaimer}>Nenhum motorista nesta categoria.</p> : null}
        </div>
        <p className={styles.disclaimer}>Cadastro de demonstração. No cadastro real, a categoria do veículo será obrigatória para filtrar e comparar a operação.</p>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><p className={styles.eyebrow}>COMPARAÇÃO POR UTILITÁRIO</p><h2>Volume e resultado estimado</h2></div><span className={styles.demoBadge}>SIMULAÇÃO</span></div>
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead><tr><th>Categoria</th><th>Paradas/dia</th><th>Receita bruta</th><th>Custos estimados</th><th>Margem estimada</th></tr></thead>
            <tbody>{vehicleEconomics.map((item) => <tr key={item.category}><td>{item.category}</td><td>{item.stops}</td><td>{item.revenue}</td><td>{item.costs}</td><td className={styles.green}>{item.contribution}</td></tr>)}</tbody>
          </table>
        </div>
        <p className={styles.disclaimer}>Números fictícios para validar a tela. Para estimar o ganho real, precisaremos cadastrar por categoria os custos (combustível, manutenção e diária), capacidade, frete e repasse ao motorista. A comparação mostrará margem de contribuição, sem tratar estimativa como lucro contábil.</p>
      </section>
    </div>
  );
}

function AnalyticsScreen({ periodLabel, periodKind, customStart, customEnd }: {
  periodLabel: string; periodKind: PeriodKind; customStart: string; customEnd: string;
}) {
  const chosen = periodKind === "custom" ? periodExamples.month : periodExamples[periodKind];
  const summary = periodKind === "custom" ? periodExamples.month : periodExamples[periodKind];
  const count = (value: string) => Number(value.split("/")[0].trim().replaceAll(".", ""));
  const total = (value: string) => Number((value.split("/")[1] || "0").trim().replaceAll(".", ""));
  const completedPickups = count(summary.pickups);
  const plannedPickups = total(summary.pickups);
  const completedDeliveries = count(summary.deliveries);
  const plannedDeliveries = total(summary.deliveries);
  const completedStops = completedPickups + completedDeliveries;
  const plannedStops = plannedPickups + plannedDeliveries;
  const completionRate = plannedStops ? Math.round(completedStops / plannedStops * 100) : 0;
  const financial = {
    today: ["R$ 1.240", "R$ 720", "R$ 286", "R$ 234", "18,9%"],
    month: ["R$ 31.800", "R$ 18.900", "R$ 7.440", "R$ 5.460", "17,2%"],
    semester: ["R$ 184.300", "R$ 108.700", "R$ 42.600", "R$ 33.000", "17,9%"],
    year: ["R$ 386.900", "R$ 228.300", "R$ 89.500", "R$ 69.100", "17,9%"],
  }[periodKind === "custom" ? "month" : periodKind];
  const groups = [
    { title: "Volume e execução", items: [
      ["Paradas programadas", plannedStops.toLocaleString("pt-BR"), "Coletas e entregas"],
      ["Paradas concluídas", completedStops.toLocaleString("pt-BR"), `${completionRate}% do programado`],
      ["Coletas concluídas", summary.pickups, "Realizadas / programadas"],
      ["Entregas concluídas", summary.deliveries, "Realizadas / programadas"],
      ["Taxa de conclusão", `${completionRate}%`, "Paradas concluídas ÷ programadas"],
      ["Cancelamentos", summary.cancelled, "Total no período"],
    ] },
    { title: "Pontualidade e qualidade", items: [
      ["Pontualidade", summary.onTime, "Dentro da janela prevista"],
      ["Paradas atrasadas", summary.delays, "Coletas e entregas"],
      ["Atraso médio", periodKind === "today" ? "18 min" : periodKind === "month" ? "22 min" : "24 min", "Entre as paradas atrasadas"],
      ["Tempo médio no ponto", summary.service, "Por parada concluída"],
      ["Sucesso na 1ª tentativa", periodKind === "today" ? "96%" : periodKind === "month" ? "93%" : "92%", "Sem retorno ou reentrega"],
      ["Comprovantes completos", periodKind === "today" ? "98%" : "97%", "Foto, recebedor e localização"],
    ] },
    { title: "Produtividade e frota", items: [
      ["Motoristas ativos", periodKind === "today" ? "3" : periodKind === "month" ? "16" : periodKind === "semester" ? "29" : "48", "Com atividade no período"],
      ["Paradas por rota", periodKind === "today" ? "12,8" : "11,4", "Média por viagem"],
      ["Paradas por motorista/dia", periodKind === "today" ? "11,3" : "10,2", "Média da equipe ativa"],
      ["Distância média por rota", "38,4 km", "GPS / rota registrada"],
      ["Ocupação estimada da frota", periodKind === "today" ? "82%" : "79%", "Capacidade utilizada"],
      ["Precisão GPS média", "± 11 m", "Nas posições recebidas"],
    ] },
    { title: "Resultado financeiro estimado", items: [
      ["Frete bruto", financial[0], "Valores demonstrativos"],
      ["Repasse aos motoristas", financial[1], "Estimativa do período"],
      ["Custos operacionais", financial[2], "Combustível e operação"],
      ["Margem de contribuição", financial[3], "Após repasse e custos"],
      ["Margem sobre o frete", financial[4], "Margem ÷ frete bruto"],
      ["Custo por parada", periodKind === "today" ? "R$ 8,41" : "R$ 8,72", "Média estimada"],
    ] },
  ];
  const statusBars = [
    { label: "Concluídas", value: completedStops, className: "barGreen" },
    { label: "Pendentes", value: Math.max(plannedStops - completedStops - Number(summary.cancelled), 0), className: "barCyan" },
    { label: "Canceladas", value: Number(summary.cancelled), className: "barMuted" },
  ];
  const completionBars = [
    { label: "Coletas", completed: completedPickups, planned: plannedPickups, className: "barCyan" },
    { label: "Entregas", completed: completedDeliveries, planned: plannedDeliveries, className: "barGreen" },
  ];
  const maxStatus = Math.max(...statusBars.map((item) => item.value), 1);
  const csvRows = [
    ...groups.flatMap((group) => group.items.map(([label, value, detail]) => [group.title, label, value, detail])),
    ...statusBars.map((item) => ["Paradas por situação", item.label, item.value.toLocaleString("pt-BR"), ""]),
  ];
  const downloadCsv = () => {
    const escapeCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const rows = [
      ["MalhaX · Indicadores", "Período", periodLabel],
      ["Grupo", "Indicador", "Valor", "Detalhe"],
      ...csvRows,
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(escapeCell).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `malhax-indicadores-${periodLabel.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className={styles.analyticsGrid}>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><p className={styles.eyebrow}>ANÁLISE DO PERÍODO</p><h2>{periodLabel}</h2></div><button type="button" className={styles.exportButton} onClick={downloadCsv} aria-label={`Baixar indicadores de ${periodLabel} em CSV`}><span aria-hidden="true">↓</span> Baixar CSV</button></div>
        <p className={styles.analyticsIntro}>O arquivo reúne os indicadores exibidos, seus detalhes e a situação das paradas. Os dados desta prévia são fictícios.</p>
      </section>
      {groups.map((group) => (
        <section className={styles.panel} key={group.title}>
          <div className={styles.panelHeading}><div><p className={styles.eyebrow}>MALHAX · INDICADORES</p><h2>{group.title}</h2></div></div>
          <div className={styles.analysisKpis}>
            {group.items.map(([label, value, detail]) => (
              <article className={styles.analysisKpi} key={label}>
                <span>{label}</span><strong>{value}</strong><small>{detail}</small>
              </article>
            ))}
          </div>
        </section>
      ))}
      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><p className={styles.eyebrow}>REALIZAÇÃO</p><h2>Coletas e entregas concluídas</h2></div><span className={styles.demoBadge}>NO PERÍODO</span></div>
        <div className={styles.completionChart}>
          {completionBars.map((item) => {
            const rate = item.planned ? Math.round(item.completed / item.planned * 100) : 0;
            return (
              <div className={styles.completionRow} key={item.label}>
                <div className={styles.completionLabel}><strong>{item.label}</strong><span>{item.completed.toLocaleString("pt-BR")} de {item.planned.toLocaleString("pt-BR")} · {rate}%</span></div>
                <div className={styles.completionTrack} role="progressbar" aria-label={`${item.label} concluídas`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={rate}><i className={styles[item.className]} style={{ width: `${rate}%` }} /></div>
              </div>
            );
          })}
        </div>
        <p className={styles.disclaimer}>Concluídas em relação às programadas, conforme o tipo de parada.</p>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><p className={styles.eyebrow}>EXECUÇÃO</p><h2>Paradas por situação</h2></div><span className={styles.demoBadge}>NO PERÍODO</span></div>
        <div className={styles.barChart} role="img" aria-label={`Paradas por situação no período: ${statusBars.map((item) => `${item.label}: ${item.value}`).join(", ")}`}>
          {statusBars.map((item) => (
            <div className={styles.barColumn} key={item.label}>
              <span>{item.value.toLocaleString("pt-BR")}</span><i className={styles[item.className]} style={{ height: `${Math.max(item.value / maxStatus * 100, 3)}%` }} /><small>{item.label}</small>
            </div>
          ))}
        </div>
        <div className={styles.chartLegend}><span><i className={styles.barGreen} />Concluídas</span><span><i className={styles.barCyan} />Pendentes</span><span><i className={styles.barMuted} />Canceladas</span></div>
        <p className={styles.disclaimer}>Atrasos aparecem como indicador de qualidade e podem estar dentro das paradas pendentes.</p>
      </section>
      {periodKind === "custom" ? <p className={styles.disclaimer}>Intervalo selecionado: {customStart || "início"} até {customEnd || "fim"}. Nesta prévia, a base usa valores mensais fictícios.</p> : null}
    </div>
  );
}

function ProofsScreen() {
  return <section className={styles.panel}>
    <div className={styles.panelHeading}><div><p className={styles.eyebrow}>EVIDÊNCIAS DA ENTREGA</p><h2>Comprovantes recentes</h2></div><span className={styles.updateTag}>Canhoto + fachada</span></div>
    <div className={styles.proofList}>{proofs.map((proof) => <article className={styles.proofCard} key={proof.order}>
      <strong>Pedido {proof.order}</strong><small>{proof.driver} · {proof.time}</small><span className={styles.proofMeta}>Recebido por {proof.recipient} · GPS {proof.accuracy}</span>
      <div className={styles.proofEvidenceGrid}><div><div className={styles[proof.photo.split(" ")[0]] + " " + (proof.photo.includes("photoAlt") ? styles.photoAlt : proof.photo.includes("photoThird") ? styles.photoThird : "")}><span>CANHOTO</span><b>✓</b></div><small>Comprovante da entrega</small></div><div><div className={styles.facadePhoto + " " + (proof.photo.includes("photoAlt") ? styles.facadeAlt : proof.photo.includes("photoThird") ? styles.facadeThird : "")}><span>FACHADA DO LOCAL</span><b>✓</b></div><small>Frente do endereço de entrega</small></div></div>
    </article>)}</div>
    <p className={styles.disclaimer}>Imagens ilustrativas. No app do motorista, a foto da fachada será uma evidência obrigatória separada da foto do canhoto; as fotos reais devem ficar em bucket privado.</p>
  </section>;
}

function MessagesScreen({ initialDriver }: { initialDriver: string }) {
  const [driver, setDriver] = useState(initialDriver);
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    setSent((items) => [...items, message]); setDraft("");
  }
  return <section className={styles.panel}>
    <div className={styles.panelHeading}><div><p className={styles.eyebrow}>SUPORTE AO MOTORISTA</p><h2>Atendimento em conversas</h2><small>Escolha o motorista para abrir o canal de atendimento.</small></div><select className={styles.filterSelect} aria-label="Selecionar motorista" value={driver} onChange={(event) => { setDriver(event.target.value); setSent([]); }}>{drivers.map((item) => <option key={item.name}>{item.name}</option>)}</select></div>
    <div className={styles.supportLayout}><aside className={styles.supportDriverList}><strong>Motoristas</strong>{drivers.map((item) => <button key={item.name} type="button" className={driver === item.name ? styles.supportDriverActive : styles.supportDriver} onClick={() => { setDriver(item.name); setSent([]); }}><span className={styles.driverDot + " " + styles[item.tone]} /><span><b>{item.name}</b><small>{item.status} · GPS {item.gps}</small></span><i>›</i></button>)}</aside>
      <div className={styles.conversationPanel}><div className={styles.conversationHeader}><span className={styles.driverDot + " " + styles.cyan} /><strong>{driver}</strong><small>Atendimento demonstrativo</small><span className={styles.supportContact} title="O telefone real será conectado ao cadastro do motorista">Chat demonstrativo</span></div>
        <div className={styles.chatMessages}>{conversation.map((message, index) => <div className={message.mine ? styles.messageManager : styles.messageDriver} key={index}><small>{message.mine ? "Você · gestor" : `${driver} · motorista`} · {message.time}</small><p>{message.text}</p></div>)}{sent.map((message, index) => <div className={styles.messageManager} key={`sent-${index}`}><small>Você · gestor · agora</small><p>{message}</p></div>)}</div>
        <form className={styles.chatComposer} onSubmit={sendMessage}><input aria-label="Mensagem para o motorista" placeholder="Escreva uma mensagem para o motorista…" value={draft} onChange={(event) => setDraft(event.target.value)} /><button type="submit" disabled={!draft.trim()}>Enviar</button></form>
      </div></div>
    <p className={styles.disclaimer}>Prévia: o envio aparece localmente para demonstrar a conversa. Para atendimento real, conectar ao backend e usar telefone cadastrado do motorista; o link externo ficará indisponível enquanto os contatos de demonstração não forem substituídos.</p>
  </section>;
}

export function ControlTower() {
  const [tab, setTab] = useState<TabKind>("overview");
  const [selectedStopOrder, setSelectedStopOrder] = useState<string | null>(null);
  const [selectedMessageDriver, setSelectedMessageDriver] = useState(drivers[0].name);
  const [period, setPeriod] = useState<PeriodKind>("today");
  const [month, setMonth] = useState("2026-10");
  const [year, setYear] = useState("2026");
  const [semester, setSemester] = useState("1");
  const [customStart, setCustomStart] = useState("2026-10-01");
  const [customEnd, setCustomEnd] = useState("2026-10-31");

  const periodLabel = useMemo(() => {
    if (period === "today") return "Hoje · 06 out. 2026";
    if (period === "month") {
      const parsed = new Date(month + "-01T00:00:00Z");
      return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
    }
    if (period === "semester") return (semester === "1" ? "1º semestre" : "2º semestre") + " de " + year;
    if (period === "year") return "Ano de " + year;
    return (customStart || "Início") + " a " + (customEnd || "Fim");
  }, [period, month, year, semester, customStart, customEnd]);

  const periodSource = period === "custom" ? periodExamples.month : periodExamples[period];
  const indicatorItems = indicatorLabels.map(([label, key, tone]) => ({
    label,
    value: periodSource[key],
    detail: periodSource[key + "Detail" as keyof typeof periodSource] as string,
    tone,
  }));

  const screenTitles: Record<TabKind, { title: string; intro: string }> = {
    overview: { title: "Visão geral", intro: "Resumo operacional, mapa e exceções da equipe." },
    tasks: { title: "Coletas e entregas", intro: "Consulte as paradas e acompanhe o andamento da operação." },
    drivers: { title: "Motoristas", intro: "Acompanhe atividade, viagens e última localização recebida." },
    history: { title: "Histórico de rotas", intro: "Consulte o trajeto registrado por motorista e dia." },
    analytics: { title: "Indicadores", intro: "Compare volumes, tempos e pontualidade ao longo do período." },
    proofs: { title: "Comprovantes", intro: "Consulte evidências das entregas realizadas." },
    messages: { title: "Atendimento ao motorista", intro: "Conversas e solicitações de suporte da equipe de rua." },
  };

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/dev-preview/viagem" className={styles.brand} aria-label="MalhaX — ir para detalhe da viagem">
          <Image src="/malhax-symbol.svg" width={512} height={512} alt="" className={styles.brandSymbol} priority />
          <span className={styles.brandWords}><strong>Malha<span>X</span></strong><small>LOGÍSTICA E TECNOLOGIA</small></span>
        </Link>
        <div className={styles.topbarActions}>
          <span className={styles.demoBadge}>PRÉVIA · DADOS FICTÍCIOS</span>
          <form action={signOut}><button className={styles.signOutButton} type="submit">Sair</button></form>
        </div>
      </header>
      <div className={styles.content}>
        <div className={styles.heading}>
          <div><p className={styles.eyebrow}>OPERAÇÃO LOGÍSTICA</p><h1>{screenTitles[tab].title}</h1><p>{screenTitles[tab].intro}</p></div>
          <span className={styles.liveBadge}><i /> Painel demonstrativo</span>
        </div>
        {tab === "analytics" ? (
          <section className={styles.periodPanel} aria-label="Selecionar período dos indicadores">
            <div className={styles.periodHeading}><div><p className={styles.eyebrow}>PERÍODO</p><strong>{periodLabel}</strong></div><small>Use o período para filtrar os indicadores.</small></div>
            <div className={styles.periodControls}>
              <div className={styles.periodButtons} role="tablist" aria-label="Período de análise">
                {([["today", "Hoje"], ["month", "Mês"], ["semester", "Semestre"], ["year", "Ano"], ["custom", "Personalizado"]] as [PeriodKind, string][]).map(([value, label]) => (
                  <button key={value} type="button" role="tab" aria-selected={period === value} className={period === value ? styles.periodButtonActive : styles.periodButton} onClick={() => setPeriod(value)}>{label}</button>
                ))}
              </div>
              {period === "month" ? <input className={styles.periodInput} aria-label="Mês de análise" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /> : null}
              {period === "semester" || period === "year" ? <div className={styles.periodSelects}>{period === "semester" ? <select className={styles.periodInput} aria-label="Semestre" value={semester} onChange={(event) => setSemester(event.target.value)}><option value="1">1º semestre</option><option value="2">2º semestre</option></select> : null}<select className={styles.periodInput} aria-label="Ano de análise" value={year} onChange={(event) => setYear(event.target.value)}>{[2024, 2025, 2026, 2027].map((item) => <option value={item} key={item}>{item}</option>)}</select></div> : null}
              {period === "custom" ? <div className={styles.customRange}><label>De <input className={styles.periodInput} type="date" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} /></label><label>Até <input className={styles.periodInput} type="date" value={customEnd} min={customStart} onChange={(event) => setCustomEnd(event.target.value)} /></label></div> : null}
            </div>
            <small className={styles.periodNotice}>Valores desta prévia são fictícios; no sistema, o período filtrará os dados reais.</small>
          </section>
        ) : null}
        <nav className={styles.mainTabs} role="tablist" aria-label="Telas da central de controle">
          {tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} aria-controls={"screen-" + item.id} className={tab === item.id ? styles.mainTabActive : styles.mainTab} onClick={() => setTab(item.id)}><MenuIcon name={item.id} /><span>{item.label}</span></button>)}
        </nav>
        <div id={"screen-" + tab} role="tabpanel" className={styles.screenContent}>
          {tab === "overview" ? <OverviewScreen indicatorItems={indicatorItems} onOpenStop={(order) => { setSelectedStopOrder(order); setTab("tasks"); }} onMessageDriver={(driver) => { setSelectedMessageDriver(driver); setTab("messages"); }} /> : null}
          {tab === "tasks" ? <TasksScreen selectedOrder={selectedStopOrder} onClearSelection={() => setSelectedStopOrder(null)} /> : null}
          {tab === "drivers" ? <DriversScreen /> : null}
          {tab === "history" ? <HistoryScreen /> : null}
          {tab === "analytics" ? <AnalyticsScreen periodLabel={periodLabel} periodKind={period} customStart={customStart} customEnd={customEnd} /> : null}
          {tab === "proofs" ? <ProofsScreen /> : null}
          {tab === "messages" ? <MessagesScreen initialDriver={selectedMessageDriver} /> : null}
        </div>
        <footer className={styles.footer}>Prévia local. Indicadores e telas são interativos; conteúdo operacional ainda é demonstrativo.</footer>
      </div>
    </main>
  );
}



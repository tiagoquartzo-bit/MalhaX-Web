"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { IndicatorSelector } from "./indicator-selector";
import { InteractiveMap } from "./interactive-map";
import styles from "./control.module.css";

type PeriodKind = "today" | "month" | "semester" | "year" | "custom";
type TabKind = "overview" | "tasks" | "drivers" | "analytics" | "proofs" | "messages";

const tabs: { id: TabKind; label: string }[] = [
  { id: "overview", label: "Visão geral" },
  { id: "tasks", label: "Coletas e entregas" },
  { id: "drivers", label: "Motoristas" },
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

function MenuIcon({ name }: { name: TabKind }) {
  const shared = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...shared}>
      {name === "overview" ? <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></> : null}
      {name === "tasks" ? <><path d="M3 7h11v11H3z" /><path d="M14 11h4l3 3v4h-7z" /><circle cx="7.5" cy="19" r="1.8" /><circle cx="17.5" cy="19" r="1.8" /></> : null}
      {name === "drivers" ? <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.3a3.2 3.2 0 0 1 0 6.2M17 15a5 5 0 0 1 3.5 4.7" /></> : null}
      {name === "analytics" ? <><path d="M4 20V11h4v9M10 20V5h4v15M16 20v-7h4v7" /><path d="M2.5 20.5h19" /></> : null}
      {name === "proofs" ? <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 5-4 3.5 3 3.5-5 4 6" /></> : null}
      {name === "messages" ? <><path d="M4 5.5h16v11H11l-5 3v-3H4z" /><path d="M8 10h8M8 13.5h5" /></> : null}
    </svg>
  );
}

function TasksScreen({ selectedOrder, onClearSelection, periodLabel }: {
  selectedOrder: string | null; onClearSelection: () => void; periodLabel: string;
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
        <div><p className={styles.eyebrow}>ACOMPANHAMENTO OPERACIONAL</p><h2>Coletas e entregas</h2><small className={styles.taskPeriod}>Recorte selecionado: {periodLabel} · dados de demonstração</small></div>
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
      <p className={styles.disclaimer}>A lista e os eventos são fictícios nesta prévia. Os filtros por período serão aplicados sobre dados reais quando o painel estiver conectado ao backend.</p>
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
        <div className={styles.panelHeading}>
          <div><p className={styles.eyebrow}>EQUIPE DE RUA</p><h2>Motoristas e veículos</h2></div>
          <select className={styles.filterSelect} aria-label="Filtrar por categoria de veículo" value={category} onChange={(event) => setCategory(event.target.value)}>
            {["Todos", "Moto", "Carro/utilitário", "Caminhão"].map((item) => <option key={item}>{item}</option>)}
          </select>
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
  const monthlyTrend = [
    { month: "Jan", value: 48 }, { month: "Fev", value: 63 }, { month: "Mar", value: 58 },
    { month: "Abr", value: 76 }, { month: "Mai", value: 71 }, { month: "Jun", value: 89 },
  ];
  return (
    <div className={styles.analyticsGrid}>
      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><p className={styles.eyebrow}>ANÁLISE DO PERÍODO</p><h2>{periodLabel}</h2></div><span className={styles.demoBadge}>DADOS FICTÍCIOS</span></div>
        <p className={styles.analyticsIntro}>O período selecionado nos controles acima define o recorte destes indicadores. Use Hoje, Mês, Semestre, Ano ou Personalizado para comparar a operação.</p>
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
        <div className={styles.panelHeading}><div><p className={styles.eyebrow}>TENDÊNCIA</p><h2>Paradas concluídas por mês</h2></div></div>
        <div className={styles.barChart} role="img" aria-label="Gráfico ilustrativo de paradas concluídas por mês">
          {monthlyTrend.map((item) => (
            <div className={styles.barColumn} key={item.month}>
              <span>{item.value}%</span><i style={{ height: item.value + "%" }} /><small>{item.month}</small>
            </div>
          ))}
        </div>
        <p className={styles.disclaimer}>Tendência ilustrativa. Os dados reais dependerão do registro de horários planejados, status, GPS e financeiro.</p>
      </section>
      {periodKind === "custom" ? <p className={styles.disclaimer}>Intervalo selecionado: {customStart || "início"} até {customEnd || "fim"}. Nesta prévia, a base usa valores mensais fictícios.</p> : null}
    </div>
  );
}

function ProofsScreen() {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><p className={styles.eyebrow}>EVIDÊNCIAS</p><h2>Comprovantes recentes</h2></div><span className={styles.updateTag}>Fotos privadas</span></div>
      <div className={styles.proofList}>
        {proofs.map((proof) => (
          <article className={styles.proofCard} key={proof.order}>
            <div className={styles[proof.photo.split(" ")[0]] + " " + (proof.photo.includes("photoAlt") ? styles.photoAlt : proof.photo.includes("photoThird") ? styles.photoThird : "")}><span>CANHOTO</span><b>✓</b></div>
            <strong>Pedido {proof.order}</strong><small>{proof.driver} · {proof.time}</small>
            <span className={styles.proofMeta}>Recebido por {proof.recipient} · GPS {proof.accuracy}</span>
          </article>
        ))}
      </div>
      <p className={styles.disclaimer}>Fotos demonstrativas. As reais devem ser geradas pelo bucket privado com acesso temporário autorizado.</p>
    </section>
  );
}

function MessagesScreen({ initialDriver }: { initialDriver: string }) {
  const [driver, setDriver] = useState(initialDriver);
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div><p className={styles.eyebrow}>COMUNICAÇÃO COM A EQUIPE</p><h2>Conversas</h2></div>
        <select className={styles.filterSelect} value={driver} onChange={(event) => setDriver(event.target.value)}>
          {drivers.map((item) => <option key={item.name}>{item.name}</option>)}
        </select>
      </div>
      <div className={styles.conversationPanel}>
        <div className={styles.conversationHeader}><span className={styles.driverDot + " " + styles.cyan} /><strong>{driver}</strong><small>Conversa demonstrativa</small></div>
        <div className={styles.chatMessages}>
          {conversation.map((message, index) => (
            <div className={message.mine ? styles.messageManager : styles.messageDriver} key={index}>
              <small>{message.mine ? "Você · gestor" : `${driver} · motorista`} · {message.time}</small><p>{message.text}</p>
            </div>
          ))}
        </div>
        <form className={styles.chatComposer} onSubmit={(event) => event.preventDefault()}>
          <input aria-label="Mensagem" placeholder="Envio será habilitado após configurar o chat" disabled />
          <button type="button" disabled>Enviar</button>
        </form>
      </div>
      <p className={styles.disclaimer}>Mensagens ilustrativas; envio e atualização ainda não estão conectados ao backend.</p>
    </section>
  );
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
    tasks: { title: "Coletas e entregas", intro: "Consulte as paradas e seu andamento no período selecionado." },
    drivers: { title: "Motoristas", intro: "Acompanhe atividade, viagens e última localização recebida." },
    analytics: { title: "Indicadores", intro: "Compare volumes, tempos e pontualidade ao longo do período." },
    proofs: { title: "Comprovantes", intro: "Consulte evidências das entregas realizadas." },
    messages: { title: "Conversas", intro: "Acompanhe a comunicação operacional com os motoristas." },
  };

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/dev-preview/viagem" className={styles.brand} aria-label="MalhaX — ir para detalhe da viagem">
          <Image src="/malhax-symbol.svg" width={512} height={512} alt="" className={styles.brandSymbol} priority />
          <span className={styles.brandWords}><strong>Malha<span>X</span></strong><small>LOGÍSTICA E TECNOLOGIA</small></span>
        </Link>
        <span className={styles.demoBadge}>PRÉVIA · DADOS FICTÍCIOS</span>
      </header>
      <div className={styles.content}>
        <div className={styles.heading}>
          <div><p className={styles.eyebrow}>OPERAÇÃO LOGÍSTICA</p><h1>{screenTitles[tab].title}</h1><p>{screenTitles[tab].intro}</p></div>
          <span className={styles.liveBadge}><i /> Painel demonstrativo</span>
        </div>

        {tab !== "overview" ? (
        <section className={styles.periodPanel} aria-label="Selecionar período dos indicadores">
          <div className={styles.periodHeading}><div><p className={styles.eyebrow}>PERÍODO</p><strong>{periodLabel}</strong></div><small>Use o período para filtrar indicadores e consultas.</small></div>
          <div className={styles.periodControls}>
            <div className={styles.periodButtons} role="tablist" aria-label="Período de análise">
              {([
                ["today", "Hoje"], ["month", "Mês"], ["semester", "Semestre"], ["year", "Ano"], ["custom", "Personalizado"],
              ] as [PeriodKind, string][]).map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={period === value}
                  className={period === value ? styles.periodButtonActive : styles.periodButton}
                  onClick={() => setPeriod(value)}>{label}</button>
              ))}
            </div>
            {period === "month" ? <input className={styles.periodInput} aria-label="Mês de análise" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /> : null}
            {period === "semester" || period === "year" ? (
              <div className={styles.periodSelects}>
                {period === "semester" ? <select className={styles.periodInput} aria-label="Semestre" value={semester} onChange={(event) => setSemester(event.target.value)}><option value="1">1º semestre</option><option value="2">2º semestre</option></select> : null}
                <select className={styles.periodInput} aria-label="Ano de análise" value={year} onChange={(event) => setYear(event.target.value)}>
                  {[2024, 2025, 2026, 2027].map((item) => <option value={item} key={item}>{item}</option>)}
                </select>
              </div>
            ) : null}
            {period === "custom" ? (
              <div className={styles.customRange}>
                <label>De <input className={styles.periodInput} type="date" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} /></label>
                <label>Até <input className={styles.periodInput} type="date" value={customEnd} min={customStart} onChange={(event) => setCustomEnd(event.target.value)} /></label>
              </div>
            ) : null}
          </div>
          <small className={styles.periodNotice}>Valores desta prévia são fictícios; no sistema, o período filtrará os dados reais.</small>
        </section>
        ) : null}

        <nav className={styles.mainTabs} role="tablist" aria-label="Telas da central de controle">
          {tabs.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id}
              aria-controls={"screen-" + item.id}
              className={tab === item.id ? styles.mainTabActive : styles.mainTab}
              onClick={() => setTab(item.id)}><MenuIcon name={item.id} /><span>{item.label}</span></button>
          ))}
        </nav>

        <div id={"screen-" + tab} role="tabpanel" className={styles.screenContent}>
          {tab === "overview" ? <OverviewScreen indicatorItems={indicatorItems}
            onOpenStop={(order) => { setSelectedStopOrder(order); setTab("tasks"); }}
            onMessageDriver={(driver) => { setSelectedMessageDriver(driver); setTab("messages"); }} /> : null}
          {tab === "tasks" ? <TasksScreen selectedOrder={selectedStopOrder} onClearSelection={() => setSelectedStopOrder(null)} periodLabel={periodLabel} /> : null}
          {tab === "drivers" ? <DriversScreen /> : null}
          {tab === "analytics" ? <AnalyticsScreen periodLabel={periodLabel} periodKind={period} customStart={customStart} customEnd={customEnd} /> : null}
          {tab === "proofs" ? <ProofsScreen /> : null}
          {tab === "messages" ? <MessagesScreen initialDriver={selectedMessageDriver} /> : null}
        </div>
        <footer className={styles.footer}>Prévia local. Período e telas são interativos; conteúdo operacional ainda é demonstrativo.</footer>
      </div>
    </main>
  );
}


"use client";

import { useMemo, useState } from "react";
import styles from "./stop-board.module.css";

export type HistoryItem = {
  id: string; title: string; detail: string; at: string;
  latitude: number | null; longitude: number | null; accuracy: number | null;
};
export type ProofItem = {
  recipient: string | null; at: string; capturedAt: string; locationCapturedAt: string | null; latitude: number | null;
  longitude: number | null; accuracy: number | null; imageUrl: string | null;
  locationImageUrl: string | null; hasLocationPhoto: boolean; attemptNumber: number;
};
export type StopRow = {
  id: string; createdAt: string; orderNumber: number | null; reference: string | null;
  kind: string; status: string; address: string; tripNumber: number | null;
  driverName: string | null; sequence: number | null; executionStatus: string | null;
  attemptNumber: number | null; failureReason: string | null; occurrenceReasons: string[];
  history: HistoryItem[]; proofs: ProofItem[];
};

const labels: Record<string, string> = {
  pickup: "Coleta", delivery: "Entrega", pending_dispatch: "A despachar",
  assigned: "Atribuída", completed: "Concluída", exception: "Ocorrência",
  cancelled: "Cancelada", pending: "Pendente", arrived: "No local",
  in_progress: "Em andamento", failed: "Falhou", skipped: "Ignorada",
};
const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export function StopBoard({ rows }: { rows: StopRow[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [driver, setDriver] = useState("all");
  const [view, setView] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("");
  const statuses = useMemo(() => [...new Set(rows.map((row) => row.status))].sort(), [rows]);
  const drivers = useMemo(() => [...new Set(rows.map((row) => row.driverName).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);
  const occurrenceCount = rows.filter((row) => row.occurrenceReasons.length > 0).length;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((row) => {
      const matchesText = !normalized || [row.address, row.reference ?? "", row.orderNumber?.toString() ?? "", row.tripNumber?.toString() ?? ""].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalized));
      const matchesView = view === "all" || row.occurrenceReasons.length > 0;
      const matchesReason = !reasonFilter || row.occurrenceReasons.includes(reasonFilter);
      return matchesText && matchesView && matchesReason && (kind === "all" || row.kind === kind) && (status === "all" || row.status === status) && (driver === "all" || row.driverName === driver);
    });
  }, [rows, query, kind, status, driver, view, reasonFilter]);

  return <section className={styles.wrap}>
    <div className={styles.alertHeader}><div><strong>Central de ocorrências</strong><small>Itens que precisam de acompanhamento do gestor</small></div><button type="button" className={view === "occurrences" ? styles.selectedView : styles.alertButton} onClick={() => { setView(view === "occurrences" ? "all" : "occurrences"); setReasonFilter(""); }}>{view === "occurrences" ? "Ver todas as paradas" : `Ver ocorrências · ${occurrenceCount}`}</button></div>
    <div className={styles.alertGrid}>
      {["Sem despacho", "Falha registrada", "Previsão vencida", "Sem comprovante", "Foto da fachada ausente", "GPS ausente", "GPS impreciso"].map((reason) => <button type="button" key={reason} className={reasonFilter === reason ? styles.alertCardActive : styles.alertCard} onClick={() => { setView("occurrences"); setReasonFilter(reasonFilter === reason ? "" : reason); setQuery(""); }}><strong>{rows.filter((row) => row.occurrenceReasons.includes(reason)).length}</strong><span>{reason}</span></button>)}
    </div>
    <div className={styles.filters}>
      <label>Buscar<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pedido, referência, viagem ou endereço" /></label>
      <label>Tipo<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">Todos</option><option value="pickup">Coletas</option><option value="delivery">Entregas</option></select></label>
      <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option>{statuses.map((item) => <option key={item} value={item}>{labels[item] ?? item}</option>)}</select></label>
      <label>Motorista<select value={driver} onChange={(event) => setDriver(event.target.value)}><option value="all">Todos</option>{drivers.map((item) => <option key={item}>{item}</option>)}</select></label>
      <span className={styles.count}>{filtered.length} de {rows.length} paradas</span>
    </div>
    <div className={styles.tableScroll}><table className={styles.table}>
      <thead><tr><th>Pedido</th><th>Tipo</th><th>Endereço</th><th>Status</th><th>Viagem / tentativa</th><th>Histórico</th></tr></thead>
      <tbody>{filtered.map((row) => <tr key={row.id}>
        <td><strong>{row.orderNumber == null ? "—" : `#${row.orderNumber}`}</strong><small>{row.reference ?? "Sem referência"}</small></td>
        <td>{labels[row.kind] ?? row.kind}</td><td>{row.address}</td>
        <td><span className={styles.badge}>{labels[row.status] ?? row.status}</span>{row.occurrenceReasons.map((reason) => <small className={styles.reason} key={reason}>{reason}</small>)}{row.failureReason ? <small>{row.failureReason}</small> : null}</td>
        <td>{row.tripNumber == null ? "Sem despacho" : <>Viagem #{row.tripNumber}<small>{row.driverName ?? "Motorista não identificado"}</small><small>Parada {row.sequence ?? "—"} · tentativa {row.attemptNumber ?? 1}</small>{row.executionStatus ? <small>{labels[row.executionStatus] ?? row.executionStatus}</small> : null}</>}</td>
        <td><details className={styles.history}><summary>Linha do tempo ({row.history.length + row.proofs.length})</summary>
          {row.history.length === 0 && row.proofs.length === 0 ? <p>Sem eventos ou comprovantes registrados.</p> : null}
          {[...row.history.map((item) => ({ at: item.at, node: <><strong>{labels[item.title] ?? item.title}</strong><small>{item.detail || "Atualização de parada"}</small>{item.latitude != null && item.longitude != null ? <small>GPS {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}{item.accuracy != null ? ` · precisão ${Math.round(item.accuracy)} m` : ""}</small> : null}</> })), ...row.proofs.map((proof) => ({ at: proof.at, node: <><strong>Comprovante · tentativa {proof.attemptNumber}</strong><small>{proof.recipient ? `Recebido por ${proof.recipient}` : "Destinatário não informado"}</small><small>Comprovante capturado em {formatDate(proof.capturedAt)}</small>{proof.latitude != null && proof.longitude != null ? <><small>GPS {proof.latitude.toFixed(5)}, {proof.longitude.toFixed(5)}{proof.accuracy != null ? ` · precisão ${Math.round(proof.accuracy)} m` : ""}</small><small>GPS capturado em {proof.locationCapturedAt ? formatDate(proof.locationCapturedAt) : "horário não registrado"}</small></> : <small>Localização GPS indisponível no comprovante.</small>}{proof.imageUrl ? <a className={styles.proofLink} href={proof.imageUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><img className={styles.proofImage} src={proof.imageUrl} alt={`Foto da entrega${proof.recipient ? ` recebida por ${proof.recipient}` : ""}`} loading="lazy" /><span>Abrir foto da entrega ↗</span></a> : <small>Foto da entrega indisponível para esta conta ou expirada.</small>}{proof.locationImageUrl ? <a className={styles.proofLink} href={proof.locationImageUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><img className={styles.proofImage} src={proof.locationImageUrl} alt="Foto da fachada ou do local da entrega" loading="lazy" /><span>Abrir foto da fachada/local ↗</span></a> : <small>Foto da fachada não registrada neste comprovante.</small>}</> }))].sort((a, b) => b.at.localeCompare(a.at)).map((entry, index) => <div className={styles.event} key={`${entry.at}-${index}`}><time>{formatDate(entry.at)}</time>{entry.node}</div>)}
          {row.proofs.length > 0 ? <p className={styles.privateNote}>A foto usa um link temporário para respeitar o armazenamento privado.</p> : null}
        </details></td>
      </tr>)}
      {filtered.length === 0 ? <tr><td colSpan={6} className={styles.empty}>Nenhuma parada corresponde aos filtros.</td></tr> : null}</tbody>
    </table></div>
  </section>;
}

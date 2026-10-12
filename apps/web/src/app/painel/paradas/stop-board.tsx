"use client";

import { useMemo, useState } from "react";
import styles from "./stop-board.module.css";

export type HistoryItem = {
  id: string; title: string; detail: string; at: string;
  latitude: number | null; longitude: number | null; accuracy: number | null;
};
export type ProofItem = {
  recipient: string | null; at: string; latitude: number | null;
  longitude: number | null; accuracy: number | null;
};
export type StopRow = {
  id: string; orderNumber: number | null; reference: string | null;
  kind: string; status: string; address: string; tripNumber: number | null;
  sequence: number | null; executionStatus: string | null;
  attemptNumber: number | null; failureReason: string | null;
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
  const statuses = useMemo(() => [...new Set(rows.map((row) => row.status))].sort(), [rows]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((row) => {
      const matchesText = !normalized || [row.address, row.reference ?? "", row.orderNumber?.toString() ?? "", row.tripNumber?.toString() ?? ""].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalized));
      return matchesText && (kind === "all" || row.kind === kind) && (status === "all" || row.status === status);
    });
  }, [rows, query, kind, status]);

  return <section className={styles.wrap}>
    <div className={styles.filters}>
      <label>Buscar<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pedido, referência, viagem ou endereço" /></label>
      <label>Tipo<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">Todos</option><option value="pickup">Coletas</option><option value="delivery">Entregas</option></select></label>
      <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option>{statuses.map((item) => <option key={item} value={item}>{labels[item] ?? item}</option>)}</select></label>
      <span className={styles.count}>{filtered.length} de {rows.length} paradas</span>
    </div>
    <div className={styles.tableScroll}><table className={styles.table}>
      <thead><tr><th>Pedido</th><th>Tipo</th><th>Endereço</th><th>Status</th><th>Viagem / tentativa</th><th>Histórico</th></tr></thead>
      <tbody>{filtered.map((row) => <tr key={row.id}>
        <td><strong>{row.orderNumber == null ? "—" : `#${row.orderNumber}`}</strong><small>{row.reference ?? "Sem referência"}</small></td>
        <td>{labels[row.kind] ?? row.kind}</td><td>{row.address}</td>
        <td><span className={styles.badge}>{labels[row.status] ?? row.status}</span>{row.failureReason ? <small>{row.failureReason}</small> : null}</td>
        <td>{row.tripNumber == null ? "Sem despacho" : <>Viagem #{row.tripNumber}<small>Parada {row.sequence ?? "—"} · tentativa {row.attemptNumber ?? 1}</small>{row.executionStatus ? <small>{labels[row.executionStatus] ?? row.executionStatus}</small> : null}</>}</td>
        <td><details className={styles.history}><summary>Ver histórico ({row.history.length + row.proofs.length})</summary>
          {row.history.length === 0 && row.proofs.length === 0 ? <p>Sem eventos ou comprovantes registrados.</p> : null}
          {[...row.history.map((item) => ({ at: item.at, node: <><strong>{labels[item.title] ?? item.title}</strong><small>{item.detail || "Atualização de parada"}</small>{item.latitude != null && item.longitude != null ? <small>GPS {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}{item.accuracy != null ? ` · precisão ${Math.round(item.accuracy)} m` : ""}</small> : null}</> })), ...row.proofs.map((proof) => ({ at: proof.at, node: <><strong>Comprovante recebido</strong><small>{proof.recipient ? `Recebido por ${proof.recipient}` : "Destinatário não informado"}</small>{proof.latitude != null && proof.longitude != null ? <small>GPS {proof.latitude.toFixed(5)}, {proof.longitude.toFixed(5)}{proof.accuracy != null ? ` · precisão ${Math.round(proof.accuracy)} m` : ""}</small> : null}</> }))].sort((a, b) => b.at.localeCompare(a.at)).map((entry, index) => <div className={styles.event} key={`${entry.at}-${index}`}><time>{formatDate(entry.at)}</time>{entry.node}</div>)}
          {row.proofs.length > 0 ? <p className={styles.privateNote}>Comprovante registrado. A imagem permanece protegida no armazenamento privado.</p> : null}
        </details></td>
      </tr>)}
      {filtered.length === 0 ? <tr><td colSpan={6} className={styles.empty}>Nenhuma parada corresponde aos filtros.</td></tr> : null}</tbody>
    </table></div>
  </section>;
}

"use client";

import { useActionState, type FormEvent } from "react";
import { cancelarPedido, type CancelOrderState } from "./actions";
import styles from "../clientes/clients.module.css";

const initial: CancelOrderState = { error: null, success: null };

export function CancelOrderForm({ orderId, orderNumber }: { orderId: string; orderNumber: number }) {
  const [state, action, pending] = useActionState(cancelarPedido, initial);
  function confirmar(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Cancelar o pedido #${orderNumber}? As paradas sairão da fila de despacho.`)) event.preventDefault();
  }
  if (state.success) return <p className={styles.success}>{state.success}</p>;
  return (
    <details>
    <summary style={{ cursor: "pointer", color: "#ffb38f", fontSize: ".82rem", fontWeight: 700 }}>Cancelar pedido</summary>
    <form action={action} onSubmit={confirmar} style={{ display: "flex", gap: ".5rem", alignItems: "end", flexWrap: "wrap", marginTop: ".6rem" }}>
      <input type="hidden" name="order_id" value={orderId} />
      <label className={styles.field} style={{ minWidth: 220 }}><span>Motivo</span><input name="reason" required maxLength={500} placeholder="Ex.: cliente desistiu" /></label>
      <button type="submit" className={styles.submit} disabled={pending}>{pending ? "Cancelando…" : "Confirmar cancelamento"}</button>
      {state.error ? <p role="alert" className={styles.error}>{state.error}</p> : null}
    </form>
    </details>
  );
}

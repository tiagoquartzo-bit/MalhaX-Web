"use client";

import { useActionState, type FormEvent } from "react";
import { manageTripAction, type TripActionState } from "./actions";
import styles from "./trip.module.css";

const initial: TripActionState = { error: null, success: null };

function ActionForm({ tripId, action, label, needsReason, danger, confirmText, drivers }: {
  tripId: string; action: "pause" | "resume" | "cancel" | "reassign"; label: string; needsReason: boolean;
  danger?: boolean; confirmText?: string; drivers?: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(manageTripAction, initial);
  function confirmar(event: FormEvent<HTMLFormElement>) {
    if (confirmText && !window.confirm(confirmText)) event.preventDefault();
  }
  return (
    <form action={formAction} onSubmit={confirmar} className={styles.removeForm}>
      <input type="hidden" name="trip_id" value={tripId} />
      <input type="hidden" name="action" value={action} />
      {drivers ? (
        <label className={styles.field}>
          <span>Novo motorista</span>
          <select name="driver_id" required defaultValue="">
            <option value="" disabled>Selecione</option>
            {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
          </select>
        </label>
      ) : null}
      {needsReason ? (
        <label className={styles.field}>
          <span>Motivo</span>
          <input name="reason" required maxLength={500} placeholder="Obrigatório, fica na auditoria" />
        </label>
      ) : null}
      <button className={danger ? styles.dangerButton : styles.primaryButton} type="submit" disabled={pending}>
        {pending ? "Salvando…" : label}
      </button>
      {state.error ? <p className={styles.actionError} role="alert">{state.error}</p> : null}
      {state.success ? <p className={styles.actionSuccess} role="status">{state.success}</p> : null}
    </form>
  );
}

export function TripManagement({ tripId, status, started, drivers, currentDriverId }: {
  tripId: string; status: string; started: boolean; drivers: Array<{ id: string; name: string }>; currentDriverId: string;
}) {
  const canPause = status === "accepted" || status === "in_progress";
  const canResume = status === "paused";
  const canCancel = !started && ["assigned", "accepted", "paused", "in_progress"].includes(status);
  const canReassign = !started && ["assigned", "accepted", "paused"].includes(status);
  const otherDrivers = drivers.filter((driver) => driver.id !== currentDriverId);
  if (!canPause && !canResume && !canCancel && !canReassign) {
    return <p className={styles.inlineNotice}>Nenhuma ação disponível para a viagem neste estado.</p>;
  }
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {canPause ? <ActionForm tripId={tripId} action="pause" label="Pausar viagem" needsReason /> : null}
      {canResume ? <ActionForm tripId={tripId} action="resume" label="Retomar viagem" needsReason={false} /> : null}
      {canReassign ? (otherDrivers.length
        ? <ActionForm tripId={tripId} action="reassign" label="Reatribuir motorista" needsReason drivers={otherDrivers} />
        : <p className={styles.inlineNotice}>Não há outro motorista ativo para reatribuir.</p>) : null}
      {canCancel ? <ActionForm tripId={tripId} action="cancel" label="Cancelar viagem" needsReason danger confirmText="Cancelar esta viagem? As paradas voltarão para a fila de despacho." /> : null}
      {started && !canResume ? <p className={styles.inlineNotice}>A viagem já começou: cancelamento e reatribuição ficam bloqueados para preservar a custódia dos volumes.</p> : null}
    </div>
  );
}

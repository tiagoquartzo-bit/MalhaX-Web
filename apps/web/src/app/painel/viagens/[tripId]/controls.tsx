"use client";

import { useActionState, type FormEvent } from "react";
import { addTripStop, removeTripStop, reorderTripStops } from "./actions";
import type { TripActionState } from "./actions";
const initialTripActionState: TripActionState = { error: null, success: null };
import styles from "./trip.module.css";

type AvailableStop = {
  id: string; stop_type: string; address_label: string; address_line: string;
  city: string | null; order_number: number | null;
};
type TripStop = {
  id: string; sequence_number: number; stop_type: string; status: string;
  address_label: string; address_line: string; city: string | null;
};

function Feedback({ error, success }: { error: string | null; success: string | null }) {
  if (error) return <p className={styles.actionError} role="alert">{error}</p>;
  if (success) return <p className={styles.actionSuccess} role="status">{success}</p>;
  return null;
}

function AddStopForm({ tripId, tasks }: { tripId: string; tasks: AvailableStop[] }) {
  const [state, action, pending] = useActionState(addTripStop, initialTripActionState);
  return (
    <form action={action} className={styles.addForm}>
      <input type="hidden" name="trip_id" value={tripId} />
      <label className={styles.field}>
        <span>Tarefa disponível</span>
        <select name="order_stop_id" required defaultValue="" disabled={!tasks.length || pending}>
          <option value="" disabled>{tasks.length ? "Selecione uma coleta ou entrega" : "Nenhuma tarefa aguardando despacho"}</option>
          {tasks.map((task) => (
            <option value={task.id} key={task.id}>
              {(task.order_number ? "Pedido #" + task.order_number + " · " : "") +
                (task.stop_type === "pickup" ? "Coleta" : "Entrega") + " · " +
                task.address_label + " · " + task.address_line + (task.city ? " · " + task.city : "")}
            </option>
          ))}
        </select>
      </label>
      <button className={styles.primaryButton} type="submit" disabled={!tasks.length || pending}>
        {pending ? "Adicionando…" : "Adicionar parada"}
      </button>
      <Feedback {...state} />
    </form>
  );
}

function RemoveStopForm({ tripId, stopId }: { tripId: string; stopId: string }) {
  const [state, action, pending] = useActionState(removeTripStop, initialTripActionState);
  function confirmRemoval(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm("Retirar esta parada pendente da viagem? Ela voltará para a fila de tarefas.")) {
      event.preventDefault();
    }
  }
  return (
    <form action={action} onSubmit={confirmRemoval} className={styles.removeForm}>
      <input type="hidden" name="trip_id" value={tripId} />
      <input type="hidden" name="trip_stop_id" value={stopId} />
      <label className={styles.field}>
        <span>Motivo da retirada</span>
        <input name="reason" required maxLength={500} placeholder="Ex.: endereço incorreto" />
      </label>
      <button className={styles.dangerButton} type="submit" disabled={pending}>
        {pending ? "Salvando…" : "Retirar da viagem"}
      </button>
      <Feedback {...state} />
    </form>
  );
}

function ReorderForm({
  tripId, stop, orderedIds, canMoveUp, canMoveDown,
}: {
  tripId: string; stop: TripStop; orderedIds: string[];
  canMoveUp: boolean; canMoveDown: boolean;
}) {
  const [state, action, pending] = useActionState(reorderTripStops, initialTripActionState);
  return (
    <form action={action} className={styles.reorderForm}>
      <input type="hidden" name="trip_id" value={tripId} />
      <input type="hidden" name="moving_stop_id" value={stop.id} />
      <label className={styles.reasonField}>
        <span className={styles.visuallyHidden}>Motivo da reordenação</span>
        <input name="reason" required maxLength={500} placeholder="Motivo para alterar a rota" />
      </label>
      {orderedIds.map((id) => <input key={id} type="hidden" name="ordered_stop_ids" value={id} />)}
      <button className={styles.iconButton} type="submit" name="direction" value="up"
        aria-label={"Mover parada " + stop.sequence_number + " para cima"} disabled={!canMoveUp || pending}>↑</button>
      <button className={styles.iconButton} type="submit" name="direction" value="down"
        aria-label={"Mover parada " + stop.sequence_number + " para baixo"} disabled={!canMoveDown || pending}>↓</button>
      <Feedback {...state} />
    </form>
  );
}

export function TripStopControls({
  tripId, stops, availableTasks, canManage, canReorder,
}: {
  tripId: string; stops: TripStop[]; availableTasks: AvailableStop[];
  canManage: boolean; canReorder: boolean;
}) {
  if (!canManage) return null;
  const pendingStops = stops.filter((stop) => stop.status === "pending");
  const orderedIds = stops.map((stop) => stop.id);

  return (
    <div className={styles.controls}>
      <section className={styles.controlSection}>
        <div>
          <h3>Adicionar uma parada</h3>
          <p>Escolha uma tarefa cadastrada que ainda aguarda despacho.</p>
        </div>
        <AddStopForm tripId={tripId} tasks={availableTasks} />
      </section>
      {pendingStops.length ? (
        <section className={styles.controlSection}>
          <div>
            <h3>Paradas pendentes</h3>
            <p>Retirar devolve a tarefa à fila. Paradas iniciadas permanecem no histórico.</p>
          </div>
          <div className={styles.pendingList}>
            {pendingStops.map((stop) => (
              <div className={styles.pendingRow} key={stop.id}>
                <span>{stop.sequence_number}. {stop.stop_type === "pickup" ? "Coleta" : "Entrega"} — {stop.address_label}</span>
                <RemoveStopForm tripId={tripId} stopId={stop.id} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {canReorder ? (
        <section className={styles.controlSection}>
          <div>
            <h3>Reordenar rota</h3>
            <p>Disponível antes do início. A coleta precisa ficar antes da entrega dos volumes.</p>
          </div>
          <div className={styles.reorderList}>
            {stops.map((stop, index) => (
              <div className={styles.reorderRow} key={stop.id}>
                <span className={styles.sequenceBadge}>{index + 1}</span>
                <span className={styles.reorderAddress}>
                  {stop.stop_type === "pickup" ? "Coleta" : "Entrega"} · {stop.address_label}
                </span>
                <ReorderForm tripId={tripId} stop={stop} orderedIds={orderedIds}
                  canMoveUp={index > 0} canMoveDown={index < stops.length - 1} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}


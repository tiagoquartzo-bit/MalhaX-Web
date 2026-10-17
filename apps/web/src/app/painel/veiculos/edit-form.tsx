"use client";

import { useActionState } from "react";
import { atualizarVeiculo, type EditarVeiculoState } from "./actions";
import styles from "../clientes/clients.module.css";

const initial: EditarVeiculoState = { error: null, success: null };

type Vehicle = { id: string; make_model: string | null; capacity_kg: number | null; capacity_description: string | null; active: boolean };

export function EditarVeiculoForm({ vehicle }: { vehicle: Vehicle }) {
  const [state, action, pending] = useActionState(atualizarVeiculo, initial);
  return (
    <details style={{ flexBasis: "100%" }} open={vehicle.capacity_kg === null || undefined}>
      <summary className={styles.secondaryLink} style={{ cursor: "pointer" }}>{vehicle.capacity_kg === null ? "Informar capacidade (obrigatória para o despacho validar o peso)" : "Editar veículo"}</summary>
      <form action={action} className={styles.form} style={{ marginTop: ".75rem" }}>
        <input type="hidden" name="vehicle_id" value={vehicle.id} />
        <div className={styles.grid}>
          <label className={styles.field}><span>Capacidade (kg)</span><input name="capacity_kg" required inputMode="decimal" defaultValue={vehicle.capacity_kg ?? ""} /></label>
          <label className={styles.field}><span>Modelo</span><input name="make_model" maxLength={120} defaultValue={vehicle.make_model ?? ""} /></label>
        </div>
        <label className={styles.field}><span>Observação</span><input name="capacity_description" maxLength={160} defaultValue={vehicle.capacity_description ?? ""} /></label>
        <label className={styles.field} style={{ display: "flex", gap: ".5rem", alignItems: "center" }}><input type="checkbox" name="active" defaultChecked={vehicle.active} style={{ width: "auto", minHeight: 0 }} /> Veículo ativo (disponível no despacho)</label>
        <label className={styles.field}><span>Motivo da alteração</span><input name="reason" required maxLength={500} placeholder="Fica registrado na auditoria" /></label>
        {state.error ? <p role="alert" className={styles.error}>{state.error}</p> : null}
        {state.success ? <p role="status" className={styles.success}>{state.success}</p> : null}
        <button type="submit" className={styles.submit} disabled={pending}>{pending ? "Salvando…" : "Salvar alterações"}</button>
      </form>
    </details>
  );
}

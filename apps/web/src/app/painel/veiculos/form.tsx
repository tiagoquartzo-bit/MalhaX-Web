"use client";

import { useActionState } from "react";
import { criarVeiculo, type VeiculoState } from "./actions";
import styles from "../clientes/clients.module.css";

const initialState: VeiculoState = { error: null };

export function VeiculoForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(criarVeiculo, initialState);
  return <form action={action} className={styles.form}>
    <input type="hidden" name="request_id" value={requestId} />
    <label className={styles.field}><span>Placa</span><input name="plate" required maxLength={9} autoCapitalize="characters" autoComplete="off" placeholder="ABC-1234 ou ABC1D23" /></label>
    <label className={styles.field}><span>Categoria</span><select name="vehicle_type" required defaultValue=""><option value="" disabled>Selecione</option><option value="car">Carro</option><option value="motorcycle">Moto</option><option value="truck">Caminhão</option></select></label>
    <label className={styles.field}><span>Modelo <small>opcional</small></span><input name="make_model" maxLength={120} placeholder="Ex.: Fiorino, CG 160, VUC" /></label>
    <label className={styles.field}><span>Capacidade de carga (kg)</span><input name="capacity_kg" required inputMode="decimal" maxLength={10} placeholder="Ex.: 650" /><small>Usada no despacho para impedir carga acima do limite.</small></label>
    <label className={styles.field}><span>Observação <small>opcional</small></span><input name="capacity_description" maxLength={160} placeholder="Ex.: baú refrigerado" /></label>
    {state.error ? <p role="alert" className={styles.error}>{state.error}</p> : null}
    <button type="submit" className={styles.submit} disabled={pending}>{pending ? "Salvando…" : "Cadastrar veículo"}</button>
  </form>;
}

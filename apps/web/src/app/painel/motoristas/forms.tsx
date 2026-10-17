"use client";

import { useActionState } from "react";

import { alterarStatusMotorista, convidarMotorista, type MotoristaState } from "./actions";
import styles from "./drivers.module.css";

const inicial: MotoristaState = { error: null };

export function ConviteMotoristaForm() {
  const [state, formAction, pending] = useActionState(convidarMotorista, inicial);
  return (
    <form action={formAction} className={styles.form}>
      <label className={styles.field}><span>Nome e sobrenome</span><input name="full_name" required minLength={3} maxLength={120} autoComplete="name" /></label>
      <label className={styles.field}><span>E-mail para acesso</span><input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      <label className={styles.field}><span>Telefone <small>opcional</small></span><input name="phone" type="tel" maxLength={32} autoComplete="tel" /></label>
      <p className={styles.note}>O motorista receberá um convite para confirmar o e-mail e criar a própria senha. Se o endereço já tiver uma conta MalhaX, a tela orientará como resolver.</p>
      {state.error ? <p role="alert" className={styles.error}>{state.error}</p> : null}
      <button className={styles.primaryButton} type="submit" disabled={pending}>{pending ? "Enviando convite…" : "Convidar motorista"}</button>
    </form>
  );
}

export function DriverStatusForm({ driverId, options }: { driverId: string; options: Array<{ value: string; label: string }> }) {
  const [state, formAction, pending] = useActionState(alterarStatusMotorista, inicial);
  if (options.length === 0) return <span className={styles.muted}>Sem ações disponíveis</span>;
  return (
    <details>
    <summary style={{ cursor: "pointer", color: "#7fe5ee", fontSize: ".8rem", fontWeight: 700 }}>Alterar situação</summary>
    <form action={formAction} className={styles.statusForm} style={{ marginTop: ".5rem" }}>
      <input type="hidden" name="driver_id" value={driverId} />
      <select name="new_status" aria-label="Nova situação do motorista" defaultValue={options[0].value}>
        {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
      </select>
      <input name="reason" required minLength={5} maxLength={500} placeholder="Motivo obrigatório para auditoria" aria-label="Motivo da alteração" />
      {state.error ? <p role="alert" className={styles.error}>{state.error}</p> : null}
      <button className={styles.secondaryButton} type="submit" disabled={pending}>{pending ? "Salvando…" : "Registrar alteração"}</button>
    </form>
    </details>
  );
}

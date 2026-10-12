"use client";

import { useActionState } from "react";

import { criarCliente, type ClienteState } from "./actions";
import styles from "./clients.module.css";

const estadoInicial: ClienteState = { error: null };

export function ClienteForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(criarCliente, estadoInicial);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="request_id" value={requestId} />
      <label className={styles.field}>
        <span>Empresa / cliente</span>
        <input name="name" required maxLength={120} autoComplete="organization" placeholder="Nome da empresa" />
      </label>
      <label className={styles.field}>
        <span>Contato <small>opcional</small></span>
        <input name="contact_name" maxLength={120} autoComplete="name" placeholder="Nome de quem recebe os pedidos" />
      </label>
      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Telefone <small>opcional</small></span>
          <input name="phone" type="tel" inputMode="tel" maxLength={32} autoComplete="tel" placeholder="(11) 99999-9999" />
        </label>
        <label className={styles.field}>
          <span>E-mail <small>opcional</small></span>
          <input name="email" type="email" maxLength={254} autoComplete="email" placeholder="contato@empresa.com.br" />
        </label>
      </div>
      {state.error ? <p role="alert" className={styles.error}>{state.error}</p> : null}
      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? "Salvando…" : "Cadastrar cliente"}
      </button>
    </form>
  );
}

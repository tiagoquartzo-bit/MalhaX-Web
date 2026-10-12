"use client";

import { useActionState } from "react";

import { setInitialPassword, type PasswordState } from "./actions";

const initialState: PasswordState = { error: null };

export default function DefinirSenhaPage() {
  const [state, formAction, pending] = useActionState(setInitialPassword, initialState);
  return (
    <main style={{ maxWidth: 400, margin: "10vh auto", padding: 24 }}>
      <h1>Crie sua senha do MalhaX</h1>
      <p>Convite confirmado. Defina uma senha pessoal para acessar o aplicativo.</p>
      <form action={formAction} style={{ display: "grid", gap: 12 }}>
        <label>
          Senha (mínimo 12 caracteres)
          <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
        </label>
        <label>
          Confirme a senha
          <input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
        </label>
        {state.error ? <p role="alert">{state.error}</p> : null}
        <button type="submit" disabled={pending}>{pending ? "Salvando..." : "Criar senha"}</button>
      </form>
    </main>
  );
}

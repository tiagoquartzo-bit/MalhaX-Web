"use client";

import { useActionState, type FormEvent, type ReactNode } from "react";
import type { FinanceState } from "./actions";
import ui from "../ui.module.css";

const inicial: FinanceState = { error: null, success: null };

/** Formulário curto do financeiro: mostra o resultado logo abaixo do botão. */
export function FinanceForm({ action, children, label, tone = "primary", confirmText, inline = true }: {
  action: (state: FinanceState, formData: FormData) => Promise<FinanceState>;
  children?: ReactNode; label: string; tone?: "primary" | "ghost" | "danger"; confirmText?: string; inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, inicial);
  function confirmar(event: FormEvent<HTMLFormElement>) {
    if (confirmText && !window.confirm(confirmText)) event.preventDefault();
  }
  const classe = tone === "danger" ? ui.buttonDanger : tone === "ghost" ? ui.buttonGhost : ui.button;
  return <form action={formAction} onSubmit={confirmar} style={{ display: "grid", gap: 6 }}>
    <div className={inline ? ui.formRow : undefined} style={inline ? undefined : { display: "grid", gap: 8 }}>
      {children}
      <button type="submit" className={classe} disabled={pending}>{pending ? "Salvando…" : label}</button>
    </div>
    {state.error ? <small role="alert" style={{ color: "#ffb4b4" }}>{state.error}</small> : null}
    {state.success ? <small role="status" style={{ color: "#8fe6c3" }}>{state.success}</small> : null}
  </form>;
}

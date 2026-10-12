"use client";

import { useActionState } from "react";

import { criarPedido, type NovoPedidoState } from "./actions";

type Cliente = { id: string; name: string };

const estadoInicial: NovoPedidoState = { error: null };

export function NovoPedidoForm({ clientes }: { clientes: Cliente[] }) {
  const [state, formAction, pending] = useActionState(criarPedido, estadoInicial);

  return (
    <form action={formAction} style={{ display: "grid", gap: 12, maxWidth: 480 }}>
      <label>
        Cliente
        <select name="client_id" required defaultValue="" style={{ width: "100%" }}>
          <option value="" disabled>
            Selecione...
          </option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Referência externa (opcional)
        <input name="external_reference" type="text" maxLength={80} style={{ width: "100%" }} />
      </label>

      <fieldset style={{ display: "grid", gap: 8 }}>
        <legend>Volume</legend>
        <label>
          Descrição
          <input name="description" type="text" maxLength={200} style={{ width: "100%" }} />
        </label>
        <label>
          Quantidade
          <input name="quantity" type="number" min={1} step={1} defaultValue={1} required />
        </label>
        <label>
          Peso (kg, opcional)
          <input name="weight_kg" type="text" inputMode="decimal" />
        </label>
      </fieldset>

      <label>
        Instruções (opcional)
        <textarea name="instructions" rows={3} maxLength={1000} style={{ width: "100%" }} />
      </label>

      {state.error ? (
        <p role="alert" style={{ color: "crimson", margin: 0 }}>
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Criar pedido"}
      </button>
    </form>
  );
}

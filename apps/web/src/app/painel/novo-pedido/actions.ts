"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { mensagemDeErroRpc } from "../../../lib/rpc-errors";

export type NovoPedidoState = { error: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function textoOuNulo(valor: FormDataEntryValue | null): string | null {
  const texto = String(valor ?? "").trim();
  return texto === "" ? null : texto;
}

export async function criarPedido(
  _prev: NovoPedidoState,
  formData: FormData,
): Promise<NovoPedidoState> {
  const clienteId = String(formData.get("client_id") ?? "");
  const quantidade = Number(formData.get("quantity") ?? 1);
  const pesoTexto = textoOuNulo(formData.get("weight_kg"));
  const peso = pesoTexto === null ? null : Number(pesoTexto.replace(",", "."));

  if (!UUID.test(clienteId)) return { error: "Selecione o cliente." };
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    return { error: "A quantidade de volumes deve ser um inteiro maior que zero." };
  }
  if (peso !== null && (!Number.isFinite(peso) || peso < 0)) {
    return { error: "Peso inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_order", {
    p_client_id: clienteId,
    p_external_reference: textoOuNulo(formData.get("external_reference")),
    p_instructions: textoOuNulo(formData.get("instructions")),
    p_packages: [
      {
        description: textoOuNulo(formData.get("description")),
        quantity: quantidade,
        weight_kg: peso,
      },
    ],
  });

  if (error) return { error: mensagemDeErroRpc(error.message) };

  revalidatePath("/painel");
  redirect("/painel");
}

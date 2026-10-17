"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";

export type FinanceState = { error: string | null; success: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const MENSAGENS: Record<string, string> = {
  forbidden: "Seu perfil não tem acesso ao financeiro.",
  reason_required: "Informe o motivo — ele fica registrado na auditoria.",
  invalid_amount: "Informe um valor válido.",
  order_already_invoiced: "Este pedido já está em fatura emitida ou paga. Cancele a fatura antes de alterar o frete.",
  no_orders_to_invoice: "Não há pedidos concluídos e ainda não faturados neste período.",
  orders_without_freight: "Há pedidos sem valor de frete neste período. Informe o frete na aba Pedidos sem frete antes de gerar a fatura.",
  invalid_period: "Período inválido.",
  invalid_invoice_transition: "A fatura não permite esta ação no estado atual.",
  invalid_pay_rule: "Escolha diária ou valor por viagem e informe um valor maior que zero.",
  driver_pay_rule_missing: "Defina primeiro como este motorista é pago (diária ou por viagem).",
  nothing_to_pay: "Não há viagens concluídas nem ajustes pendentes neste período.",
  invalid_payout_transition: "O pagamento não permite esta ação no estado atual.",
  adjustment_already_in_payout: "Este ajuste já está em um fechamento. Cancele o fechamento para removê-lo.",
};

function mensagem(erro: string) {
  const codigo = erro.split(":")[0]?.trim() ?? "";
  return MENSAGENS[codigo] ?? "Não foi possível concluir. Atualize a página e tente novamente.";
}
function texto(formData: FormData, chave: string, max = 500) { return String(formData.get(chave) ?? "").trim().slice(0, max); }
function valor(formData: FormData, chave: string) {
  const bruto = texto(formData, chave, 20).replace(/\./g, "").replace(",", ".");
  return bruto === "" ? NaN : Number(bruto);
}
async function rpc(nome: string, args: Record<string, unknown>, sucesso: string): Promise<FinanceState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sua sessão expirou. Entre novamente.", success: null };
  const { error } = await supabase.rpc(nome, args);
  if (error) return { error: mensagem(error.message), success: null };
  revalidatePath("/painel/faturamento", "layout");
  return { error: null, success: sucesso };
}

export async function definirFrete(_p: FinanceState, formData: FormData): Promise<FinanceState> {
  const orderId = texto(formData, "order_id", 36);
  const frete = valor(formData, "freight_value");
  if (!UUID.test(orderId)) return { error: "Pedido inválido.", success: null };
  if (!Number.isFinite(frete) || frete < 0) return { error: "Informe o frete em reais, por exemplo 180,00.", success: null };
  return rpc("set_order_freight", { p_order_id: orderId, p_value: frete, p_reason: texto(formData, "reason") || "Frete negociado" }, "Frete salvo.");
}

export async function gerarFatura(_p: FinanceState, formData: FormData): Promise<FinanceState> {
  const clientId = texto(formData, "client_id", 36);
  const inicio = texto(formData, "inicio", 10);
  const fim = texto(formData, "fim", 10);
  const vencimento = texto(formData, "due_date", 10);
  if (!UUID.test(clientId) || !DATA.test(inicio) || !DATA.test(fim)) return { error: "Dados da fatura inválidos.", success: null };
  return rpc("create_client_invoice", { p_client_id: clientId, p_start: inicio, p_end: fim, p_due_date: DATA.test(vencimento) ? vencimento : null, p_notes: texto(formData, "notes") || null }, "Fatura gerada. Confira na aba Faturas.");
}

export async function alterarFatura(_p: FinanceState, formData: FormData): Promise<FinanceState> {
  const invoiceId = texto(formData, "invoice_id", 36);
  const status = texto(formData, "status", 20);
  if (!UUID.test(invoiceId) || !["issued", "paid", "cancelled"].includes(status)) return { error: "Ação inválida.", success: null };
  const ok = { issued: "Fatura marcada como emitida.", paid: "Recebimento registrado.", cancelled: "Fatura cancelada; os pedidos voltam para A faturar." }[status]!;
  return rpc("set_client_invoice_status", { p_invoice_id: invoiceId, p_status: status, p_reference: texto(formData, "reference") || null, p_reason: texto(formData, "reason") || null }, ok);
}

export async function definirPagamentoMotorista(_p: FinanceState, formData: FormData): Promise<FinanceState> {
  const driverId = texto(formData, "driver_id", 36);
  const modo = texto(formData, "pay_mode", 20);
  const quantia = valor(formData, "amount");
  if (!UUID.test(driverId) || !["daily", "per_trip"].includes(modo)) return { error: "Escolha diária ou valor por viagem.", success: null };
  if (!Number.isFinite(quantia) || quantia <= 0) return { error: "Informe o valor em reais.", success: null };
  return rpc("set_driver_pay", { p_driver_id: driverId, p_mode: modo, p_amount: quantia, p_reason: texto(formData, "reason") || "Regra de pagamento definida" }, "Regra de pagamento salva.");
}

export async function lancarAjuste(_p: FinanceState, formData: FormData): Promise<FinanceState> {
  const driverId = texto(formData, "driver_id", 36);
  const data = texto(formData, "reference_date", 10);
  const tipo = texto(formData, "kind", 10);
  const quantia = valor(formData, "amount");
  if (!UUID.test(driverId) || !DATA.test(data)) return { error: "Informe o motorista e a data.", success: null };
  if (!Number.isFinite(quantia) || quantia <= 0) return { error: "Informe o valor em reais.", success: null };
  return rpc("add_driver_pay_adjustment", { p_driver_id: driverId, p_reference_date: data, p_amount: tipo === "desconto" ? -quantia : quantia, p_reason: texto(formData, "reason") }, tipo === "desconto" ? "Desconto lançado." : "Adicional lançado.");
}

export async function removerAjuste(_p: FinanceState, formData: FormData): Promise<FinanceState> {
  const id = texto(formData, "adjustment_id", 36);
  if (!UUID.test(id)) return { error: "Ajuste inválido.", success: null };
  return rpc("remove_driver_pay_adjustment", { p_adjustment_id: id, p_reason: texto(formData, "reason") || "Lançado por engano" }, "Ajuste removido.");
}

export async function fecharPagamento(_p: FinanceState, formData: FormData): Promise<FinanceState> {
  const driverId = texto(formData, "driver_id", 36);
  const inicio = texto(formData, "inicio", 10);
  const fim = texto(formData, "fim", 10);
  if (!UUID.test(driverId) || !DATA.test(inicio) || !DATA.test(fim)) return { error: "Dados inválidos.", success: null };
  return rpc("create_driver_payout", { p_driver_id: driverId, p_start: inicio, p_end: fim }, "Pagamento fechado. Confira na aba Pagamentos.");
}

export async function alterarPagamento(_p: FinanceState, formData: FormData): Promise<FinanceState> {
  const id = texto(formData, "payout_id", 36);
  const status = texto(formData, "status", 20);
  if (!UUID.test(id) || !["paid", "cancelled"].includes(status)) return { error: "Ação inválida.", success: null };
  return rpc("set_driver_payout_status", { p_payout_id: id, p_status: status, p_reference: texto(formData, "reference") || null, p_reason: texto(formData, "reason") || null }, status === "paid" ? "Pagamento registrado como pago." : "Fechamento cancelado; as viagens voltam para A pagar.");
}

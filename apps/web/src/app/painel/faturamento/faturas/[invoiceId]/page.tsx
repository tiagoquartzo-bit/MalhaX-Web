import Link from "next/link";
import { notFound } from "next/navigation";

import { financeiroOuRedireciona } from "../../guard";
import { dataBR, reais } from "../../periodo";
import { PrintButton } from "../../print-button";
import ui from "../../../ui.module.css";

const STATUS: Record<string, string> = { open: "Aberta", issued: "Emitida", paid: "Recebida", cancelled: "Cancelada" };

export default async function FaturaPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const supabase = await financeiroOuRedireciona();
  const { data: fatura } = await supabase.from("client_invoices")
    .select("id, invoice_number, client_id, period_start, period_end, due_date, orders_count, total_amount, status, payment_reference, notes, issued_at, paid_at, cancelled_reason, created_at")
    .eq("id", invoiceId).maybeSingle();
  if (!fatura) notFound();
  const [{ data: cliente }, { data: itens }] = await Promise.all([
    supabase.from("clients").select("name, contact_name, phone, email").eq("id", fatura.client_id).maybeSingle(),
    supabase.from("client_invoice_items").select("order_id, amount, completed_at, active").eq("invoice_id", invoiceId),
  ]);
  const ids = (itens ?? []).map((item) => item.order_id);
  const { data: pedidos } = ids.length ? await supabase.from("orders").select("id, order_number, external_reference").in("id", ids) : { data: [] };
  const pedido = new Map((pedidos ?? []).map((p) => [p.id, p]));
  const linhas = [...(itens ?? [])].sort((a, b) => String(a.completed_at).localeCompare(String(b.completed_at)));

  return <main className={ui.page}>
    <header className={ui.header}>
      <div><p className={ui.eyebrow}><Link href="/painel/faturamento?aba=faturas">← Faturas</Link></p><h1>Fatura nº {fatura.invoice_number}</h1>
        <p>{cliente?.name} · {dataBR(fatura.period_start)} a {dataBR(fatura.period_end)} · <strong>{STATUS[fatura.status] ?? fatura.status}</strong></p></div>
      <div className={ui.actions}><PrintButton /></div>
    </header>
    <section className={ui.kpis}>
      <div className={ui.kpi}><span>Total</span><strong>{reais(fatura.total_amount)}</strong><small>{fatura.orders_count} pedido(s)</small></div>
      <div className={ui.kpi}><span>Vencimento</span><strong>{fatura.due_date ? dataBR(fatura.due_date) : "—"}</strong></div>
      <div className={ui.kpi}><span>Cliente</span><strong style={{ fontSize: "1rem" }}>{cliente?.name}</strong><small>{[cliente?.contact_name, cliente?.phone, cliente?.email].filter(Boolean).join(" · ") || "Sem contato"}</small></div>
      <div className={ui.kpi}><span>Pagamento</span><strong style={{ fontSize: "1rem" }}>{fatura.paid_at ? new Date(fatura.paid_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Pendente"}</strong><small>{fatura.payment_reference ?? fatura.cancelled_reason ?? ""}</small></div>
    </section>
    <div className={ui.tableWrap}><table className={ui.table}>
      <thead><tr><th>Pedido</th><th>Referência</th><th>Concluído em</th><th className={ui.num}>Frete</th></tr></thead>
      <tbody>{linhas.map((item) => { const p = pedido.get(item.order_id); return <tr key={item.order_id} style={item.active ? undefined : { opacity: .5 }}>
        <td><strong>#{p?.order_number ?? "—"}</strong></td>
        <td>{p?.external_reference ?? "—"}</td>
        <td>{item.completed_at ? new Date(item.completed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—"}</td>
        <td className={ui.num}>{reais(item.amount)}</td>
      </tr>; })}</tbody>
      <tfoot><tr><td colSpan={3}><strong>Total</strong></td><td className={ui.num}><strong>{reais(fatura.total_amount)}</strong></td></tr></tfoot>
    </table></div>
    {fatura.notes ? <p className={ui.notice}>{fatura.notes}</p> : null}
  </main>;
}

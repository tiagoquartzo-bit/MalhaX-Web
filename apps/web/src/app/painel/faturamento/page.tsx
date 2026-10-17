import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../lib/supabase/organization-roles";
import { FinanceForm } from "./finance-form";
import { alterarFatura, alterarPagamento, definirFrete, definirPagamentoMotorista, fecharPagamento, gerarFatura, lancarAjuste, removerAjuste } from "./actions";
import { dataBR, lerPeriodo, periodosRapidos, reais } from "./periodo";
import ui from "../ui.module.css";

type ClienteResumo = { client_id: string; client_name: string; completed_orders: number; freight_total: number; orders_without_freight: number; invoiced_orders: number; invoiced_amount: number; pending_orders: number; pending_amount: number };
type MotoristaResumo = { driver_id: string; driver_name: string; pay_mode: string | null; rate: number | null; trips_count: number; days_worked: number; base_amount: number; adjustments_amount: number; total_amount: number; open_payout_id: string | null };
type Fatura = { id: string; invoice_number: number; client_id: string; period_start: string; period_end: string; due_date: string | null; orders_count: number; total_amount: number; status: string; payment_reference: string | null };
type Pagamento = { id: string; driver_id: string; period_start: string; period_end: string; pay_mode: string; rate: number; trips_count: number; days_worked: number; base_amount: number; adjustments_amount: number; total_amount: number; status: string; payment_reference: string | null };
type Ajuste = { id: string; driver_id: string; reference_date: string; amount: number; reason: string; payout_id: string | null };

const ABAS = { clientes: "Clientes a faturar", "sem-frete": "Pedidos sem frete", faturas: "Faturas", motoristas: "Motoristas a pagar", pagamentos: "Pagamentos" } as const;
type Aba = keyof typeof ABAS;
const STATUS_FATURA: Record<string, [string, string]> = { open: ["Aberta", ""], issued: ["Emitida", "info"], paid: ["Recebida", "good"], cancelled: ["Cancelada", "bad"] };
const STATUS_PAGAMENTO: Record<string, [string, string]> = { open: ["A pagar", "warn"], paid: ["Pago", "good"], cancelled: ["Cancelado", "bad"] };
const MODO: Record<string, string> = { daily: "Diária", per_trip: "Por viagem" };

function Pill({ par }: { par: [string, string] }) {
  const cls = par[1] === "good" ? ui.pillGood : par[1] === "warn" ? ui.pillWarn : par[1] === "bad" ? ui.pillBad : par[1] === "info" ? ui.pillInfo : "";
  return <span className={`${ui.pill} ${cls}`}>{par[0]}</span>;
}

export default async function FaturamentoPage({ searchParams }: { searchParams: Promise<{ aba?: string; inicio?: string; fim?: string }> }) {
  const params = await searchParams;
  const aba: Aba = params.aba && params.aba in ABAS ? params.aba as Aba : "clientes";
  const periodo = lerPeriodo(params);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { roles } = await getCurrentOrganizationRoles(supabase, user.id);
  if (!roles.some((role) => ["admin", "manager", "finance"].includes(role))) redirect("/painel");

  const [clientesResult, motoristasResult] = await Promise.all([
    supabase.rpc("billing_overview", { p_start: periodo.inicio, p_end: periodo.fim }),
    supabase.rpc("driver_pay_overview", { p_start: periodo.inicio, p_end: periodo.fim }),
  ]);
  const clientes = (clientesResult.data ?? []) as ClienteResumo[];
  const motoristas = (motoristasResult.data ?? []) as MotoristaResumo[];
  const soma = <T,>(lista: T[], campo: (item: T) => number) => lista.reduce((total, item) => total + Number(campo(item) ?? 0), 0);
  const freteTotal = soma(clientes, (c) => c.freight_total);
  const aFaturar = soma(clientes, (c) => c.pending_amount);
  const semFrete = soma(clientes, (c) => c.orders_without_freight);
  const aPagar = soma(motoristas, (m) => m.total_amount);
  const semRegra = motoristas.filter((m) => !m.pay_mode && m.trips_count > 0).length;
  const qs = (extra: Record<string, string>) => "?" + new URLSearchParams({ aba, inicio: periodo.inicio, fim: periodo.fim, ...extra }).toString();

  // Dados específicos da aba
  let conteudo: React.ReactNode = null;
  if (aba === "clientes") {
    conteudo = clientes.length === 0 ? <p className={ui.empty}>Nenhum pedido concluído neste período.</p> : <div className={ui.tableWrap}><table className={ui.table}>
      <thead><tr><th>Cliente</th><th className={ui.num}>Concluídos</th><th className={ui.num}>Frete total</th><th className={ui.num}>Faturado</th><th className={ui.num}>A faturar</th><th>Gerar fatura</th></tr></thead>
      <tbody>{clientes.map((c) => <tr key={c.client_id}>
        <td><strong>{c.client_name}</strong>{c.orders_without_freight ? <small><Link href={qs({ aba: "sem-frete" })}>{c.orders_without_freight} pedido(s) sem frete →</Link></small> : null}</td>
        <td className={ui.num}>{c.completed_orders}</td>
        <td className={ui.num}>{reais(c.freight_total)}</td>
        <td className={ui.num}>{reais(c.invoiced_amount)}<small>{c.invoiced_orders} pedido(s)</small></td>
        <td className={ui.num}><strong>{reais(c.pending_amount)}</strong><small>{c.pending_orders} pedido(s)</small></td>
        <td>{c.pending_orders > 0 ? (c.orders_without_freight > 0 ? <small>Informe o frete dos pedidos pendentes primeiro.</small> :
          <FinanceForm action={gerarFatura} label="Gerar fatura">
            <input type="hidden" name="client_id" value={c.client_id} /><input type="hidden" name="inicio" value={periodo.inicio} /><input type="hidden" name="fim" value={periodo.fim} />
            <label className={ui.field}><span>Vencimento</span><input type="date" name="due_date" /></label>
          </FinanceForm>) : <small>Tudo faturado</small>}</td>
      </tr>)}</tbody>
    </table></div>;
  }

  if (aba === "sem-frete") {
    const { data: concluidos } = await supabase.from("orders").select("id, order_number, external_reference, clients(name)").eq("status", "completed").order("created_at", { ascending: false }).limit(500)
      .overrideTypes<Array<{ id: string; order_number: number; external_reference: string | null; clients: { name: string } | null }>, { merge: false }>();
    const ids = (concluidos ?? []).map((o) => o.id);
    const { data: finData } = ids.length ? await supabase.rpc("order_financials", { p_order_ids: ids }) : { data: [] };
    const fin = (finData ?? []) as Array<{ order_id: string; freight_value: number; completed_at: string | null; invoice_id: string | null }>;
    const porId = new Map((fin ?? []).map((f) => [f.order_id, f]));
    const dentro = (iso: string | null) => {
      if (!iso) return false;
      const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
      return dia >= periodo.inicio && dia <= periodo.fim;
    };
    const lista = (concluidos ?? []).filter((o) => { const f = porId.get(o.id); return f && !f.invoice_id && dentro(f.completed_at); });
    const pendentes = lista.filter((o) => Number(porId.get(o.id)?.freight_value ?? 0) === 0);
    const comFrete = lista.filter((o) => Number(porId.get(o.id)?.freight_value ?? 0) > 0);
    conteudo = <>
      <p className={ui.notice}>Pedidos concluídos no período que ainda não estão em fatura. Informe ou corrija o frete negociado; cada alteração fica registrada.</p>
      {lista.length === 0 ? <p className={ui.empty}>Nenhum pedido concluído aguardando faturamento.</p> : <div className={ui.tableWrap}><table className={ui.table}>
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Concluído</th><th>Frete</th></tr></thead>
        <tbody>{[...pendentes, ...comFrete].map((o) => { const f = porId.get(o.id)!; return <tr key={o.id}>
          <td><strong>#{o.order_number}</strong>{o.external_reference ? <small>{o.external_reference}</small> : null}</td>
          <td>{o.clients?.name ?? "—"}</td>
          <td>{f.completed_at ? new Date(f.completed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—"}</td>
          <td><FinanceForm action={definirFrete} label={Number(f.freight_value) > 0 ? "Atualizar" : "Salvar frete"} tone={Number(f.freight_value) > 0 ? "ghost" : "primary"}>
            <input type="hidden" name="order_id" value={o.id} />
            <label className={ui.field}><span>R$</span><input name="freight_value" inputMode="decimal" defaultValue={Number(f.freight_value) > 0 ? Number(f.freight_value).toFixed(2).replace(".", ",") : ""} placeholder="0,00" style={{ width: 110 }} /></label>
            {Number(f.freight_value) > 0 ? <label className={ui.field}><span>Motivo da alteração</span><input name="reason" placeholder="Ex.: pedágio" /></label> : null}
          </FinanceForm></td>
        </tr>; })}</tbody>
      </table></div>}
    </>;
  }

  if (aba === "faturas") {
    const { data: faturas } = await supabase.from("client_invoices").select("id, invoice_number, client_id, period_start, period_end, due_date, orders_count, total_amount, status, payment_reference").order("created_at", { ascending: false }).limit(200).overrideTypes<Fatura[], { merge: false }>();
    const { data: nomes } = await supabase.from("clients").select("id, name");
    const nome = new Map((nomes ?? []).map((c) => [c.id, c.name]));
    conteudo = (faturas ?? []).length === 0 ? <p className={ui.empty}>Nenhuma fatura gerada ainda. Gere pela aba Clientes a faturar.</p> : <div className={ui.tableWrap}><table className={ui.table}>
      <thead><tr><th>Fatura</th><th>Cliente</th><th>Período</th><th className={ui.num}>Valor</th><th>Situação</th><th>Ações</th></tr></thead>
      <tbody>{(faturas ?? []).map((f) => <tr key={f.id}>
        <td><strong><Link href={`/painel/faturamento/faturas/${f.id}`}>Nº {f.invoice_number}</Link></strong><small>{f.orders_count} pedido(s)</small></td>
        <td>{nome.get(f.client_id) ?? "—"}</td>
        <td>{dataBR(f.period_start)} a {dataBR(f.period_end)}{f.due_date ? <small>Vence {dataBR(f.due_date)}</small> : null}</td>
        <td className={ui.num}><strong>{reais(f.total_amount)}</strong></td>
        <td><Pill par={STATUS_FATURA[f.status] ?? [f.status, ""]} />{f.payment_reference ? <small>{f.payment_reference}</small> : null}</td>
        <td style={{ display: "grid", gap: 8 }}>
          {f.status === "open" ? <FinanceForm action={alterarFatura} label="Marcar emitida" tone="ghost"><input type="hidden" name="invoice_id" value={f.id} /><input type="hidden" name="status" value="issued" /></FinanceForm> : null}
          {f.status === "open" || f.status === "issued" ? <FinanceForm action={alterarFatura} label="Registrar recebimento"><input type="hidden" name="invoice_id" value={f.id} /><input type="hidden" name="status" value="paid" /><label className={ui.field}><span>Comprovante</span><input name="reference" placeholder="Ex.: boleto 8812" /></label></FinanceForm> : null}
          {f.status === "open" || f.status === "issued" ? <details><summary style={{ cursor: "pointer", color: "#ffb38f", fontSize: ".8rem" }}>Cancelar fatura</summary><FinanceForm action={alterarFatura} label="Cancelar" tone="danger" confirmText="Cancelar a fatura? Os pedidos voltam para A faturar."><input type="hidden" name="invoice_id" value={f.id} /><input type="hidden" name="status" value="cancelled" /><label className={ui.field}><span>Motivo</span><input name="reason" required /></label></FinanceForm></details> : null}
        </td>
      </tr>)}</tbody>
    </table></div>;
  }

  if (aba === "motoristas") {
    const { data: ajustes } = await supabase.from("driver_pay_adjustments").select("id, driver_id, reference_date, amount, reason, payout_id").is("payout_id", null).order("reference_date", { ascending: false }).overrideTypes<Ajuste[], { merge: false }>();
    conteudo = <>
      {semRegra ? <p className={ui.error}>{semRegra} motorista(s) com viagens no período ainda sem regra de pagamento. Defina a diária ou o valor por viagem abaixo.</p> : null}
      {motoristas.length === 0 ? <p className={ui.empty}>Nenhum motorista cadastrado.</p> : <div className={ui.tableWrap}><table className={ui.table}>
        <thead><tr><th>Motorista</th><th>Como é pago</th><th className={ui.num}>Viagens</th><th className={ui.num}>Dias</th><th className={ui.num}>Base</th><th className={ui.num}>Ajustes</th><th className={ui.num}>A pagar</th><th>Fechar</th></tr></thead>
        <tbody>{motoristas.map((m) => <tr key={m.driver_id}>
          <td><strong>{m.driver_name}</strong></td>
          <td>
            {m.pay_mode ? <>{MODO[m.pay_mode]} · {reais(m.rate)}</> : <span className={`${ui.pill} ${ui.pillWarn}`}>Sem regra</span>}
            <details><summary style={{ cursor: "pointer", color: "#7fe5ee", fontSize: ".78rem" }}>{m.pay_mode ? "Alterar" : "Definir"}</summary>
              <FinanceForm action={definirPagamentoMotorista} label="Salvar" inline={false}>
                <input type="hidden" name="driver_id" value={m.driver_id} />
                <label className={ui.field}><span>Modelo</span><select name="pay_mode" defaultValue={m.pay_mode ?? "daily"}><option value="daily">Diária (por dia com viagem concluída)</option><option value="per_trip">Valor por viagem concluída</option></select></label>
                <label className={ui.field}><span>Valor (R$)</span><input name="amount" inputMode="decimal" required defaultValue={m.rate ? Number(m.rate).toFixed(2).replace(".", ",") : ""} /></label>
                <label className={ui.field}><span>Motivo</span><input name="reason" placeholder="Ex.: contrato 2026" /></label>
              </FinanceForm>
            </details>
          </td>
          <td className={ui.num}>{m.trips_count}</td>
          <td className={ui.num}>{m.days_worked}</td>
          <td className={ui.num}>{reais(m.base_amount)}</td>
          <td className={ui.num}>{reais(m.adjustments_amount)}</td>
          <td className={ui.num}><strong>{reais(m.total_amount)}</strong></td>
          <td>{m.pay_mode && (m.trips_count > 0 || Number(m.adjustments_amount) !== 0) ? <FinanceForm action={fecharPagamento} label="Fechar pagamento" confirmText={`Fechar ${reais(m.total_amount)} para ${m.driver_name}?`}>
            <input type="hidden" name="driver_id" value={m.driver_id} /><input type="hidden" name="inicio" value={periodo.inicio} /><input type="hidden" name="fim" value={periodo.fim} />
          </FinanceForm> : <small>Nada a fechar</small>}</td>
        </tr>)}</tbody>
      </table></div>}
      <section className={ui.card} style={{ marginTop: 16 }}>
        <div className={ui.cardHeader}><h2>Adicionais e descontos</h2></div>
        <FinanceForm action={lancarAjuste} label="Lançar">
          <label className={ui.field}><span>Motorista</span><select name="driver_id" required defaultValue="">{[<option key="" value="" disabled>Selecione</option>, ...motoristas.map((m) => <option key={m.driver_id} value={m.driver_id}>{m.driver_name}</option>)]}</select></label>
          <label className={ui.field}><span>Tipo</span><select name="kind" defaultValue="adicional"><option value="adicional">Adicional (+)</option><option value="desconto">Desconto (−)</option></select></label>
          <label className={ui.field}><span>Valor (R$)</span><input name="amount" inputMode="decimal" required style={{ width: 110 }} /></label>
          <label className={ui.field}><span>Data</span><input type="date" name="reference_date" required defaultValue={periodo.fim} /></label>
          <label className={ui.field}><span>Motivo</span><input name="reason" required minLength={3} placeholder="Ex.: pedágio, avaria" /></label>
        </FinanceForm>
        {(ajustes ?? []).length ? <ul className={ui.list} style={{ marginTop: 12 }}>{(ajustes ?? []).map((a) => <li key={a.id} className={ui.row}>
          <span className={ui.rowMain}><strong>{motoristas.find((m) => m.driver_id === a.driver_id)?.driver_name ?? "Motorista"} · {Number(a.amount) > 0 ? "+" : ""}{reais(a.amount)}</strong><small>{dataBR(a.reference_date)} · {a.reason}</small></span>
          <FinanceForm action={removerAjuste} label="Remover" tone="ghost"><input type="hidden" name="adjustment_id" value={a.id} /></FinanceForm>
        </li>)}</ul> : <p className={ui.empty} style={{ marginTop: 12 }}>Nenhum ajuste pendente.</p>}
      </section>
    </>;
  }

  if (aba === "pagamentos") {
    const { data: pagamentos } = await supabase.from("driver_payouts").select("id, driver_id, period_start, period_end, pay_mode, rate, trips_count, days_worked, base_amount, adjustments_amount, total_amount, status, payment_reference").order("created_at", { ascending: false }).limit(200).overrideTypes<Pagamento[], { merge: false }>();
    const nome = new Map(motoristas.map((m) => [m.driver_id, m.driver_name]));
    conteudo = (pagamentos ?? []).length === 0 ? <p className={ui.empty}>Nenhum pagamento fechado ainda. Feche pela aba Motoristas a pagar.</p> : <div className={ui.tableWrap}><table className={ui.table}>
      <thead><tr><th>Motorista</th><th>Período</th><th>Cálculo</th><th className={ui.num}>Total</th><th>Situação</th><th>Ações</th></tr></thead>
      <tbody>{(pagamentos ?? []).map((p) => <tr key={p.id}>
        <td><strong><Link href={`/painel/faturamento/pagamentos/${p.id}`}>{nome.get(p.driver_id) ?? "Motorista"}</Link></strong></td>
        <td>{dataBR(p.period_start)} a {dataBR(p.period_end)}</td>
        <td>{MODO[p.pay_mode]} {reais(p.rate)} × {p.pay_mode === "daily" ? `${p.days_worked} dia(s)` : `${p.trips_count} viagem(ns)`}<small>Ajustes {reais(p.adjustments_amount)}</small></td>
        <td className={ui.num}><strong>{reais(p.total_amount)}</strong></td>
        <td><Pill par={STATUS_PAGAMENTO[p.status] ?? [p.status, ""]} />{p.payment_reference ? <small>{p.payment_reference}</small> : null}</td>
        <td style={{ display: "grid", gap: 8 }}>
          {p.status === "open" ? <FinanceForm action={alterarPagamento} label="Marcar como pago"><input type="hidden" name="payout_id" value={p.id} /><input type="hidden" name="status" value="paid" /><label className={ui.field}><span>Comprovante</span><input name="reference" placeholder="Ex.: PIX E2E…" /></label></FinanceForm> : null}
          {p.status === "open" ? <details><summary style={{ cursor: "pointer", color: "#ffb38f", fontSize: ".8rem" }}>Cancelar fechamento</summary><FinanceForm action={alterarPagamento} label="Cancelar" tone="danger"><input type="hidden" name="payout_id" value={p.id} /><input type="hidden" name="status" value="cancelled" /><label className={ui.field}><span>Motivo</span><input name="reason" required /></label></FinanceForm></details> : null}
        </td>
      </tr>)}</tbody>
    </table></div>;
  }

  return <main className={ui.page}>
    <header className={ui.header}>
      <div><p className={ui.eyebrow}>Gestão · Financeiro</p><h1>Faturamento</h1><p>Frete negociado por pedido para faturar os clientes e diária ou valor por viagem para pagar os motoristas. Período: <strong>{periodo.rotulo}</strong>.</p></div>
      <div className={ui.actions}><a className={ui.buttonGhost} href={`/painel/faturamento/exportar?inicio=${periodo.inicio}&fim=${periodo.fim}`}>Baixar CSV do período</a></div>
    </header>

    <form method="get" className={ui.formRow} style={{ marginBottom: 14 }}>
      <input type="hidden" name="aba" value={aba} />
      <label className={ui.field}><span>De</span><input type="date" name="inicio" defaultValue={periodo.inicio} /></label>
      <label className={ui.field}><span>Até</span><input type="date" name="fim" defaultValue={periodo.fim} /></label>
      <button className={ui.buttonGhost} type="submit">Aplicar</button>
      {periodosRapidos().map((p) => <Link key={p.chave} className={ui.tab} href={"?" + new URLSearchParams({ aba, inicio: p.inicio, fim: p.fim }).toString()}>{p.rotulo}</Link>)}
    </form>

    <section className={ui.kpis}>
      <div className={ui.kpi}><span>Frete dos pedidos concluídos</span><strong>{reais(freteTotal)}</strong><small>{soma(clientes, (c) => c.completed_orders)} pedido(s)</small></div>
      <Link href={qs({ aba: "clientes" })} className={`${ui.kpi} ${aFaturar ? ui.kpiAlert : ""}`}><span>A faturar</span><strong>{reais(aFaturar)}</strong><small>{semFrete ? `${semFrete} pedido(s) sem frete` : "Pronto para gerar faturas"}</small></Link>
      <Link href={qs({ aba: "motoristas" })} className={`${ui.kpi} ${aPagar ? ui.kpiAlert : ""}`}><span>A pagar aos motoristas</span><strong>{reais(aPagar)}</strong><small>Viagens ainda não fechadas</small></Link>
      <div className={`${ui.kpi} ${freteTotal - aPagar >= 0 ? ui.kpiGood : ui.kpiAlert}`}><span>Resultado estimado</span><strong>{reais(freteTotal - aPagar)}</strong><small>Frete − pagamentos em aberto</small></div>
    </section>

    {clientesResult.error || motoristasResult.error ? <p className={ui.error}>Não foi possível carregar o financeiro. Confira se a migration 034 foi aplicada no Supabase.</p> : null}

    <nav className={ui.tabs} aria-label="Seções do faturamento">
      {(Object.keys(ABAS) as Aba[]).map((chave) => <Link key={chave} href={qs({ aba: chave })} className={`${ui.tab} ${chave === aba ? ui.tabActive : ""}`} aria-current={chave === aba ? "page" : undefined}>
        {ABAS[chave]}{chave === "sem-frete" && semFrete ? ` · ${semFrete}` : ""}
      </Link>)}
    </nav>
    {conteudo}
  </main>;
}

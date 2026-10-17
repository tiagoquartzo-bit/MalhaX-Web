import Link from "next/link";
import { notFound } from "next/navigation";

import { financeiroOuRedireciona } from "../../guard";
import { dataBR, reais } from "../../periodo";
import { PrintButton } from "../../print-button";
import ui from "../../../ui.module.css";

const STATUS: Record<string, string> = { open: "A pagar", paid: "Pago", cancelled: "Cancelado" };
const MODO: Record<string, string> = { daily: "Diária", per_trip: "Por viagem" };

export default async function PagamentoPage({ params }: { params: Promise<{ payoutId: string }> }) {
  const { payoutId } = await params;
  const supabase = await financeiroOuRedireciona();
  const { data: p } = await supabase.from("driver_payouts")
    .select("id, driver_id, period_start, period_end, pay_mode, rate, trips_count, days_worked, base_amount, adjustments_amount, total_amount, status, payment_reference, paid_at, cancelled_reason")
    .eq("id", payoutId).maybeSingle();
  if (!p) notFound();
  const [{ data: motorista }, { data: viagens }, { data: ajustes }] = await Promise.all([
    supabase.from("drivers").select("full_name, phone").eq("id", p.driver_id).maybeSingle(),
    supabase.from("driver_payout_trips").select("trip_id, work_date, active").eq("payout_id", payoutId).order("work_date"),
    supabase.from("driver_pay_adjustments").select("id, reference_date, amount, reason").eq("payout_id", payoutId).order("reference_date"),
  ]);
  const ids = (viagens ?? []).map((v) => v.trip_id);
  const { data: trips } = ids.length ? await supabase.from("trips").select("id, trip_number").in("id", ids) : { data: [] };
  const numero = new Map((trips ?? []).map((t) => [t.id, t.trip_number]));

  return <main className={ui.page}>
    <header className={ui.header}>
      <div><p className={ui.eyebrow}><Link href="/painel/faturamento?aba=pagamentos">← Pagamentos</Link></p><h1>Pagamento · {motorista?.full_name ?? "Motorista"}</h1>
        <p>{dataBR(p.period_start)} a {dataBR(p.period_end)} · <strong>{STATUS[p.status] ?? p.status}</strong></p></div>
      <div className={ui.actions}><PrintButton /></div>
    </header>
    <section className={ui.kpis}>
      <div className={ui.kpi}><span>Regra</span><strong style={{ fontSize: "1.1rem" }}>{MODO[p.pay_mode]} · {reais(p.rate)}</strong></div>
      <div className={ui.kpi}><span>Base</span><strong>{reais(p.base_amount)}</strong><small>{p.pay_mode === "daily" ? `${p.days_worked} dia(s) trabalhado(s)` : `${p.trips_count} viagem(ns)`}</small></div>
      <div className={ui.kpi}><span>Ajustes</span><strong>{reais(p.adjustments_amount)}</strong></div>
      <div className={`${ui.kpi} ${ui.kpiGood}`}><span>Total</span><strong>{reais(p.total_amount)}</strong><small>{p.payment_reference ?? p.cancelled_reason ?? ""}</small></div>
    </section>
    <div className={ui.grid2}>
      <section className={ui.card}><div className={ui.cardHeader}><h2>Viagens ({(viagens ?? []).length})</h2></div>
        {(viagens ?? []).length ? <ul className={ui.list}>{(viagens ?? []).map((v) => <li key={v.trip_id} className={ui.row}>
          <span className={ui.rowMain}><strong><Link href={`/painel/viagens/${v.trip_id}`}>Viagem #{numero.get(v.trip_id) ?? "—"}</Link></strong><small>{dataBR(v.work_date)}</small></span>
        </li>)}</ul> : <p className={ui.empty}>Sem viagens.</p>}
      </section>
      <section className={ui.card}><div className={ui.cardHeader}><h2>Adicionais e descontos</h2></div>
        {(ajustes ?? []).length ? <ul className={ui.list}>{(ajustes ?? []).map((a) => <li key={a.id} className={ui.row}>
          <span className={ui.rowMain}><strong>{Number(a.amount) > 0 ? "+" : ""}{reais(a.amount)}</strong><small>{dataBR(a.reference_date)} · {a.reason}</small></span>
        </li>)}</ul> : <p className={ui.empty}>Nenhum ajuste.</p>}
      </section>
    </div>
  </main>;
}

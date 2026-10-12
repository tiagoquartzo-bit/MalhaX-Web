import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import styles from "./indicators.module.css";
import { IndicatorsDashboard, type IndicatorCard, type MonthData } from "./IndicatorsDashboard";

type Search = { period?: string; year?: string; semester?: string; month?: string };
const ROLES = ["admin", "manager", "dispatcher", "support", "finance"];
const dateBR = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

function dateRange(period: string, year: number, semester: number, month: number) {
  if (period === "year") return { start: `${year}-01-01T00:00:00-03:00`, end: `${year + 1}-01-01T00:00:00-03:00` };
  if (period === "semester") {
    const month = semester === 2 ? "07" : "01";
    const endMonth = semester === 2 ? "01" : "07";
    const endYear = semester === 2 ? year + 1 : year;
    return { start: `${year}-${month}-01T00:00:00-03:00`, end: `${endYear}-${endMonth}-01T00:00:00-03:00` };
  }
  return { start: `${year}-${String(month).padStart(2, "0")}-01T00:00:00-03:00`, end: month === 12 ? `${year + 1}-01-01T00:00:00-03:00` : `${year}-${String(month + 1).padStart(2, "0")}-01T00:00:00-03:00` };
}

export default async function IndicadoresPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const period = ["month", "semester", "year"].includes(params.period ?? "") ? params.period! : "month";
  const currentYear = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date()));
  const currentMonth = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", month: "2-digit" }).format(new Date()));
  const year = /^20\d{2}$/.test(params.year ?? "") ? Math.min(currentYear + 1, Math.max(2020, Number(params.year))) : currentYear;
  const semester = params.semester === "2" ? 2 : 1;
  const month = /^\d{1,2}$/.test(params.month ?? "") ? Math.min(12, Math.max(1, Number(params.month))) : currentMonth;
  const { start, end } = dateRange(period, year, semester, month);
  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roles, error: roleError } = await supabase.from("organization_member_roles").select("role").eq("user_id", user.id);
  if (roleError || !(roles ?? []).some(({ role }) => ROLES.includes(role))) redirect("/painel");

  const [orders, pickups, deliveries, completedTrips, failedStops, completedStops, cancelledOrders, overdueStops, activeDrivers] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", startIso).lt("created_at", endIso),
    supabase.from("trip_stops").select("id", { count: "exact", head: true }).eq("stop_type", "pickup").eq("status", "completed").gte("completed_at", startIso).lt("completed_at", endIso),
    supabase.from("trip_stops").select("id", { count: "exact", head: true }).eq("stop_type", "delivery").eq("status", "completed").gte("completed_at", startIso).lt("completed_at", endIso),
    supabase.from("trips").select("id", { count: "exact", head: true }).eq("status", "completed").gte("completed_at", startIso).lt("completed_at", endIso),
    supabase.from("stop_events").select("id", { count: "exact", head: true }).eq("to_status", "failed").gte("server_received_at", startIso).lt("server_received_at", endIso),
    supabase.from("trip_stops").select("stop_type, planned_at, arrived_at, completed_at").eq("status", "completed").not("completed_at", "is", null).gte("completed_at", startIso).lt("completed_at", endIso).order("completed_at").limit(10000),
    supabase.from("orders").select("created_at", { count: "exact" }).eq("status", "cancelled").gte("created_at", startIso).lt("created_at", endIso).limit(10000),
    supabase.from("trip_stops").select("id", { count: "exact", head: true }).in("status", ["pending", "arrived", "in_progress"]).not("planned_at", "is", null).lt("planned_at", new Date().toISOString()),
    supabase.from("drivers").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);
  const errors = [orders, pickups, deliveries, completedTrips, failedStops, completedStops, cancelledOrders, overdueStops, activeDrivers].filter((r) => r.error);
  const stops = completedStops.data ?? [];
  const lateDeliveries = stops.filter((stop) => stop.stop_type === "delivery" && stop.completed_at && stop.planned_at && new Date(stop.completed_at) > new Date(stop.planned_at));
  const eligibleDeliveries = stops.filter((stop) => stop.stop_type === "delivery" && stop.completed_at && stop.planned_at);
  const lateCount = lateDeliveries.length;
  const averageServiceMinutes = stops.filter((stop) => stop.arrived_at && stop.completed_at).map((stop) => (new Date(stop.completed_at!).valueOf() - new Date(stop.arrived_at!).valueOf()) / 60_000).filter((minutes) => minutes >= 0).reduce((sum, minutes, _, rows) => sum + minutes / rows.length, 0);
  const startMonth = period === "semester" ? (semester === 2 ? 6 : 0) : period === "year" ? 0 : month - 1;
  const slotCount = period === "year" ? 12 : period === "semester" ? 6 : 1;
  const monthSlots: MonthData[] = Array.from({ length: slotCount }, (_, index) => {
    const date = new Date(Date.UTC(year, startMonth + index, 1));
    return { label: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(date).replace(".", ""), pickups: 0, deliveries: 0, cancelled: 0, late: 0 };
  });
  const bucketIndex = (value: string) => { const index = new Date(value).getUTCMonth() - startMonth; return index >= 0 && index < slotCount ? index : -1; };
  for (const stop of stops) {
    const index = stop.completed_at ? bucketIndex(stop.completed_at) : -1;
    if (index < 0) continue;
    if (stop.stop_type === "pickup") monthSlots[index].pickups++;
    if (stop.stop_type === "delivery") {
      monthSlots[index].deliveries++;
      if (stop.planned_at && new Date(stop.completed_at!) > new Date(stop.planned_at)) monthSlots[index].late++;
    }
  }
  for (const order of cancelledOrders.data ?? []) { const index = bucketIndex(order.created_at); if (index >= 0) monthSlots[index].cancelled++; }
  const label = period === "year" ? `Ano ${year}` : period === "semester" ? `${semester}º semestre de ${year}` : new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
  const indicatorCards: IndicatorCard[] = [
    { id: "orders", title: "Pedidos criados", value: String(orders.count ?? 0), detail: "No intervalo selecionado" },
    { id: "pickups", title: "Coletas concluídas", value: String(pickups.count ?? 0), detail: "Paradas de coleta finalizadas" },
    { id: "deliveries", title: "Entregas concluídas", value: String(deliveries.count ?? 0), detail: "Paradas de entrega finalizadas" },
    { id: "trips", title: "Viagens concluídas", value: String(completedTrips.count ?? 0), detail: "Viagens encerradas" },
    { id: "failed", title: "Tentativas sem sucesso", value: String(failedStops.count ?? 0), detail: "Paradas com falha registrada" },
    { id: "late", title: "Entregas após previsão", value: String(lateCount), detail: "Somente paradas com horário previsto" },
    { id: "overdue", title: "Paradas vencidas agora", value: String(overdueStops.count ?? 0), detail: "Tarefas abertas com previsão ultrapassada" },
    { id: "drivers", title: "Motoristas ativos", value: String(activeDrivers.count ?? 0), detail: "Cadastro habilitado na empresa" },
    { id: "cancelled", title: "Pedidos cancelados", value: String(cancelledOrders.count ?? 0), detail: "Pedidos cancelados no período" },
    { id: "ontime", title: "Pontualidade de entrega", value: eligibleDeliveries.length ? `${Math.round((eligibleDeliveries.length - lateCount) / eligibleDeliveries.length * 100)}%` : "—", detail: "Entregas com horário previsto" },
    { id: "service", title: "Tempo médio no ponto", value: averageServiceMinutes ? `${Math.round(averageServiceMinutes)} min` : "—", detail: "Da chegada à conclusão da parada" },
  ];

  return <main className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>MalhaX · gestão</p><h1>Visão de controle</h1><p>Indicadores e atalhos para acompanhar a operação no painel de controle.</p></div><strong>{label}</strong></header>
    <nav className={styles.controlLinks} aria-label="Acesso rápido aos módulos"><Link href="/painel/ao-vivo"><span>⌖</span><strong>Acompanhamento ao vivo</strong><small>Posição e status dos motoristas</small></Link><Link href="/painel/historico-motoristas"><span>↗</span><strong>Histórico de rotas</strong><small>Trajetos e exportação para análise</small></Link><Link href="/painel/suporte"><span>◌</span><strong>Atendimento ao motorista</strong><small>Conversas e solicitações de suporte</small></Link><Link href="/painel/motoristas"><span>♙</span><strong>Gestão de motoristas</strong><small>Cadastro e situação da equipe</small></Link></nav>
    <nav className={styles.periodTabs} aria-label="Selecionar período"><Link aria-current={period === "month" ? "page" : undefined} className={period === "month" ? styles.periodActive : ""} href={`?period=month&year=${year}&month=${month}`}>Mês</Link><Link aria-current={period === "semester" ? "page" : undefined} className={period === "semester" ? styles.periodActive : ""} href={`?period=semester&year=${year}&semester=${semester}`}>Semestre</Link><Link aria-current={period === "year" ? "page" : undefined} className={period === "year" ? styles.periodActive : ""} href={`?period=year&year=${year}`}>Ano</Link></nav>
    <form method="get" className={styles.filters}>
      <input type="hidden" name="period" value={period} />
      <label>Ano<select name="year" defaultValue={String(year)}>{Array.from({ length: 5 }, (_, i) => currentYear + 1 - i).map((y) => <option key={y}>{y}</option>)}</select></label>
      {period === "month" ? <label>Mês<select name="month" defaultValue={String(month)}>{Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(Date.UTC(2020, m - 1, 15)))}</option>)}</select></label> : <input type="hidden" name="month" value={month} />}
      {period === "semester" ? <label>Semestre<select name="semester" defaultValue={String(semester)}><option value="1">1º semestre</option><option value="2">2º semestre</option></select></label> : <input type="hidden" name="semester" value={semester} />}
      <button type="submit">Atualizar período</button>
    </form>
    {errors.length ? <p role="alert" className={styles.error}>Alguns dados não puderam ser lidos. Verifique as permissões RLS; os valores com falha aparecem como zero.</p> : null}
    <IndicatorsDashboard cards={indicatorCards} monthly={monthSlots} periodLabel={label} />
    <p className={styles.note}>Atraso considera apenas parada de entrega com horário previsto e conclusão posterior. Paradas vencidas contam tarefas ainda abertas com previsão anterior ao horário atual. O período usa fuso de São Paulo; os indicadores não incluem pedidos cancelados como entregas.</p>
  </main>;
}




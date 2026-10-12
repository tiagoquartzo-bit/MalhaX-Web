"use client";

import { useMemo, useState } from "react";
import styles from "./indicators.module.css";

export type IndicatorCard = { id: string; title: string; value: string; detail: string };
export type MonthData = { label: string; pickups: number; deliveries: number; cancelled: number; late: number };

const metricLabels: Record<keyof Omit<MonthData, "label">, string> = {
  pickups: "Coletas concluídas", deliveries: "Entregas concluídas", cancelled: "Pedidos cancelados", late: "Entregas atrasadas",
};
const metricColors: Record<keyof Omit<MonthData, "label">, string> = { pickups: "#18a6b3", deliveries: "#20936d", cancelled: "#78869a", late: "#c07a18" };
const chartKeys = Object.keys(metricLabels) as Array<keyof Omit<MonthData, "label">>;

export function IndicatorsDashboard({ cards, monthly, periodLabel }: { cards: IndicatorCard[]; monthly: MonthData[]; periodLabel: string }) {
  const [selectedCards, setSelectedCards] = useState(() => new Set(cards.map((card) => card.id)));
  const [selectedSeries, setSelectedSeries] = useState(() => new Set(chartKeys));
  const visibleCards = useMemo(() => cards.filter((card) => selectedCards.has(card.id)), [cards, selectedCards]);
  const maxValue = Math.max(1, ...monthly.flatMap((month) => chartKeys.filter((key) => selectedSeries.has(key)).map((key) => month[key])));

  function downloadCsv() {
    const rows = [
      ["MalhaX · Indicadores", periodLabel],
      ["Indicador", "Valor", "Detalhe"],
      ...cards.map((card) => [card.title, card.value, card.detail]),
      [],
      ["Mês", ...chartKeys.filter((key) => selectedSeries.has(key)).map((key) => metricLabels[key])],
      ...monthly.map((month) => [month.label, ...chartKeys.filter((key) => selectedSeries.has(key)).map((key) => String(month[key]))]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `malhax-indicadores-${periodLabel.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <>
    <section className={styles.indicatorChooser} aria-label="Escolher indicadores visíveis">
      <div><strong>Indicadores exibidos</strong><small>Personalize os cartões desta visão; a exportação CSV inclui todos os indicadores.</small></div>
      <div className={styles.indicatorToggles}>{cards.map((card) => <label key={card.id}><input type="checkbox" checked={selectedCards.has(card.id)} onChange={() => setSelectedCards((current) => { const next = new Set(current); next.has(card.id) ? next.delete(card.id) : next.add(card.id); return next; })} />{card.title}</label>)}</div>
      <button type="button" className={styles.exportButton} onClick={downloadCsv}><span aria-hidden="true">↓</span> Baixar CSV</button>
    </section>
    <section className={styles.grid} aria-label="Indicadores do período">{visibleCards.map((card) => <article className={styles.card} key={card.id}><span>{card.title}</span><strong>{card.value}</strong><small>{card.detail}</small></article>)}</section>
    <section className={styles.chartPanel} aria-label="Gráfico mensal da operação">
      <div className={styles.chartHeader}><div><span className={styles.eyebrow}>EVOLUÇÃO DO PERÍODO</span><h2>Atividade mensal</h2><p>Paradas concluídas e pedidos cancelados por mês.</p></div><div className={styles.chartLegend}>{chartKeys.map((key) => <label key={key}><input type="checkbox" checked={selectedSeries.has(key)} onChange={() => setSelectedSeries((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; })} /><i style={{ background: metricColors[key] }} />{metricLabels[key]}</label>)}</div></div>
      {monthly.length ? <div className={styles.chart} role="img" aria-label={`Gráfico mensal de coletas, entregas, cancelamentos e atrasos para ${periodLabel}`}>
        {monthly.map((month) => <div className={styles.chartMonth} key={month.label}><div className={styles.chartBars}>{chartKeys.filter((key) => selectedSeries.has(key)).map((key) => <span key={key} title={`${metricLabels[key]}: ${month[key]}`} style={{ height: `${Math.max(month[key] ? 5 : 0, (month[key] / maxValue) * 100)}%`, background: metricColors[key] }} />)}</div><small>{month.label}</small></div>)}
      </div> : <p className={styles.chartEmpty}>Sem movimentos no período selecionado.</p>}
    </section>
  </>;
}

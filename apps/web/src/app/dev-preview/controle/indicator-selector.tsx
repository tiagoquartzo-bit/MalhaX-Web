"use client";

import { useMemo, useState } from "react";
import styles from "./control.module.css";

type Indicator = { label: string; value: string; detail: string; tone: string };

export function IndicatorSelector({ indicators }: { indicators: Indicator[] }) {
  const [selected, setSelected] = useState(() => new Set(indicators.map((item) => item.label)));
  const visible = useMemo(() => indicators.filter((item) => selected.has(item.label)), [indicators, selected]);

  function toggle(label: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function selectAll() {
    setSelected((current) =>
      current.size === indicators.length
        ? new Set()
        : new Set(indicators.map((item) => item.label)),
    );
  }

  return (
    <section className={styles.metricLayout} aria-label="Selecionar indicadores">
      <aside className={styles.indicatorMenu}>
        <div className={styles.menuHeading}>
          <div><span>PAINEL</span><strong>Indicadores</strong></div>
          <button type="button" onClick={selectAll}>{selected.size === indicators.length ? "Limpar" : "Todos"}</button>
        </div>
        <div className={styles.indicatorOptions}>
          {indicators.map((item) => (
            <label className={styles.indicatorOption} key={item.label}>
              <input type="checkbox" checked={selected.has(item.label)} onChange={() => toggle(item.label)} />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        <div className={styles.indicatorHelp}>Selecione os cartões que deseja acompanhar.</div>
      </aside>

      <div className={styles.metricContent}>
        <div className={styles.metricContext}>
          <span>{visible.length} indicador{visible.length === 1 ? "" : "es"} selecionado{visible.length === 1 ? "" : "s"}</span>
          <small>Hoje · todas as equipes · demonstração</small>
        </div>
        {visible.length ? (
          <div className={styles.kpiGrid}>
            {visible.map((item) => (
              <article className={styles.kpiCard} key={item.label}>
                <span className={styles.kpiLabel}>{item.label}</span>
                <strong className={styles[item.tone]}>{item.value}</strong>
                <small>{item.detail}</small>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.noMetrics}>Nenhum indicador selecionado. Escolha os campos no menu.</div>
        )}
      </div>
    </section>
  );
}

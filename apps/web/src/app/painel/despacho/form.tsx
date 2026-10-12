"use client";

import { useActionState, useState } from "react";

import { despacharViagem, type DespachoState } from "./actions";
import styles from "./dispatch.module.css";

type ParadaDisponivel = {
  id: string;
  order_number: number;
  stop_type: "pickup" | "delivery";
  address_label: string;
  address_line: string;
  district: string | null;
  city: string | null;
  created_at: string;
};
type Motorista = { id: string; name: string };
type Veiculo = { id: string; label: string };

const estadoInicial: DespachoState = { error: null };

export function DespachoForm({
  paradas,
  motoristas,
  veiculos,
  requestId,
}: {
  paradas: ParadaDisponivel[];
  motoristas: Motorista[];
  veiculos: Veiculo[];
  requestId: string;
}) {
  const [state, formAction, pending] = useActionState(despacharViagem, estadoInicial);
  const [sequencia, setSequencia] = useState<string[]>([]);
  const selecionadas = new Set(sequencia);

  function alternarParada(id: string, checked: boolean) {
    setSequencia((atual) => checked ? [...atual, id] : atual.filter((item) => item !== id));
  }

  function mover(indice: number, direcao: -1 | 1) {
    setSequencia((atual) => {
      const destino = indice + direcao;
      if (destino < 0 || destino >= atual.length) return atual;
      const nova = [...atual];
      [nova[indice], nova[destino]] = [nova[destino], nova[indice]];
      return nova;
    });
  }

  const porId = new Map(paradas.map((parada) => [parada.id, parada]));
  const paradasNaSequencia = sequencia.map((id) => porId.get(id)).filter((item): item is ParadaDisponivel => Boolean(item));
  const totalColetas = paradasNaSequencia.filter((item) => item.stop_type === "pickup").length;
  const totalEntregas = paradasNaSequencia.length - totalColetas;

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="order_stop_ids" value={JSON.stringify(sequencia)} />

      <section className={styles.card}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Etapa 1 · Seleção</p>
            <h2>Paradas disponíveis</h2>
          </div>
          <span className={styles.counter}>{paradas.length} aguardando</span>
        </div>
        <p className={styles.help}>Marque as coletas e entregas que entrarão nesta viagem. Você poderá ajustar a ordem no próximo quadro.</p>

        {paradas.length === 0 ? (
          <p className={styles.empty}>Nenhuma parada aguardando despacho. Cadastre um pedido para começar.</p>
        ) : (
          <div className={styles.availableList}>
            {paradas.map((parada) => (
              <label className={`${styles.availableItem} ${selecionadas.has(parada.id) ? styles.isSelected : ""}`} key={parada.id}>
                <input
                  type="checkbox"
                  checked={selecionadas.has(parada.id)}
                  onChange={(event) => alternarParada(parada.id, event.target.checked)}
                />
                <span className={`${styles.badge} ${parada.stop_type === "pickup" ? styles.pickup : styles.delivery}`}>
                  {parada.stop_type === "pickup" ? "Coleta" : "Entrega"}
                </span>
                <span className={styles.itemContent}>
                  <strong>{parada.address_label}</strong>
                  <span>Pedido #{parada.order_number} · {parada.address_line}</span>
                  {(parada.district || parada.city) ? <small>{[parada.district, parada.city].filter(Boolean).join(" · ")}</small> : null}
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Etapa 2 · Sequência</p>
            <h2>Ordem da rota</h2>
          </div>
          <span className={styles.counter}>{totalColetas} coletas · {totalEntregas} entregas</span>
        </div>
        {paradasNaSequencia.length === 0 ? (
          <p className={styles.empty}>Selecione ao menos uma parada acima.</p>
        ) : (
          <ol className={styles.sequence}>
            {paradasNaSequencia.map((parada, indice) => (
              <li className={styles.sequenceItem} key={parada.id}>
                <span className={styles.sequenceNumber}>{indice + 1}</span>
                <span className={`${styles.badge} ${parada.stop_type === "pickup" ? styles.pickup : styles.delivery}`}>
                  {parada.stop_type === "pickup" ? "Coleta" : "Entrega"}
                </span>
                <span className={styles.itemContent}>
                  <strong>{parada.address_label}</strong>
                  <span>Pedido #{parada.order_number} · {parada.address_line}</span>
                </span>
                <span className={styles.sequenceActions}>
                  <button type="button" aria-label={`Mover ${parada.address_label} para cima`} onClick={() => mover(indice, -1)} disabled={indice === 0}>↑</button>
                  <button type="button" aria-label={`Mover ${parada.address_label} para baixo`} onClick={() => mover(indice, 1)} disabled={indice === paradasNaSequencia.length - 1}>↓</button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Etapa 3 · Atribuição</p>
            <h2>Motorista e veículo</h2>
          </div>
        </div>
        <div className={styles.fields}>
          <label className={styles.field}>
            <span>Motorista</span>
            <select name="driver_id" defaultValue="" required>
              <option value="" disabled>Selecione o motorista</option>
              {motoristas.map((motorista) => <option key={motorista.id} value={motorista.id}>{motorista.name}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Veículo <small>opcional</small></span>
            <select name="vehicle_id" defaultValue="">
              <option value="">Sem veículo definido</option>
              {veiculos.map((veiculo) => <option key={veiculo.id} value={veiculo.id}>{veiculo.label}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Saída prevista <small>horário de Brasília</small></span>
            <input name="planned_start_at" type="datetime-local" required />
          </label>
        </div>
        {motoristas.length === 0 ? <p className={styles.warning}>Não há motorista ativo cadastrado. Ative um motorista para despachar.</p> : null}
      </section>

      {state.error ? <p role="alert" className={styles.error}>{state.error}</p> : null}
      <div className={styles.submitRow}>
        <p>O banco validará novamente se as paradas, motorista e veículo pertencem à empresa e estão disponíveis.</p>
        <button className={styles.submitButton} type="submit" disabled={pending || paradasNaSequencia.length === 0 || motoristas.length === 0}>
          {pending ? "Despachando…" : "Confirmar e despachar viagem"}
        </button>
      </div>
    </form>
  );
}

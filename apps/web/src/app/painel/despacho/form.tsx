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
  volumeCount: number;
  pesoTotalKg: number;
  pesoInformadoCount: number;
  latitude: number | null;
  longitude: number | null;
  volumes: Array<{ id: string; weightKg: number | null }>;
};
type Motorista = { id: string; name: string };
type Veiculo = { id: string; label: string; capacityKg: number | null };

const MINUTOS_POR_PARADA = 10;
const VELOCIDADE_MEDIA_KMH = 25;
const MINUTOS_ATE_PRIMEIRA = 20;

function distanciaKm(a: { latitude: number | null; longitude: number | null }, b: { latitude: number | null; longitude: number | null }) {
  if (a.latitude === null || a.longitude === null || b.latitude === null || b.longitude === null) return 5;
  const rad = (grau: number) => (grau * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  // Fator 1,3 aproxima o trajeto por ruas a partir da distância em linha reta.
  return 6371 * 2 * Math.asin(Math.sqrt(h)) * 1.3;
}

function paraLocal(data: Date) {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(data);
  const p = (tipo: string) => partes.find((item) => item.type === tipo)?.value ?? "00";
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}`;
}

function deLocal(valor: string) {
  // Interpreta "AAAA-MM-DDTHH:mm" como horário de Brasília (UTC-3, sem horário de verão).
  const data = new Date(`${valor}:00-03:00`);
  return Number.isNaN(data.valueOf()) ? null : data;
}

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
  const [saida, setSaida] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [previsoesEditadas, setPrevisoesEditadas] = useState<Record<string, string>>({});
  const selecionadas = new Set(sequencia);

  function alternarParada(id: string, checked: boolean) {
    setSequencia((atual) => {
      const selecionadasAgora = new Set(atual);
      if (checked) selecionadasAgora.add(id);
      else selecionadasAgora.delete(id);
      const ordenadas = [
        ...paradas.filter((parada) => parada.stop_type === "pickup" && selecionadasAgora.has(parada.id)),
        ...paradas.filter((parada) => parada.stop_type === "delivery" && selecionadasAgora.has(parada.id)),
      ];
      return ordenadas.map((parada) => parada.id);
    });
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

  function alternarPedido(orderNumber: number, marcar: boolean) {
    for (const parada of paradas.filter((item) => item.order_number === orderNumber)) alternarParada(parada.id, marcar);
  }
  const pedidosDisponiveis = [...new Set(paradas.map((parada) => parada.order_number))];

  const porId = new Map(paradas.map((parada) => [parada.id, parada]));
  const paradasNaSequencia = sequencia.map((id) => porId.get(id)).filter((item): item is ParadaDisponivel => Boolean(item));
  const totalColetas = paradasNaSequencia.filter((item) => item.stop_type === "pickup").length;
  const totalEntregas = paradasNaSequencia.length - totalColetas;

  const pesoPorVolume = new Map<string, number | null>();
  for (const parada of paradasNaSequencia) for (const volume of parada.volumes) pesoPorVolume.set(volume.id, volume.weightKg);
  const cargaKg = [...pesoPorVolume.values()].reduce<number>((total, peso) => total + (peso ?? 0), 0);
  const volumesSemPeso = [...pesoPorVolume.values()].filter((peso) => peso === null).length;
  const veiculo = veiculos.find((item) => item.id === veiculoId);
  const excedeCapacidade = Boolean(veiculo?.capacityKg && cargaKg > veiculo.capacityKg);
  const formatoKg = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

  const previsoes: string[] = [];
  const inicio = saida ? deLocal(saida) : null;
  let referencia = inicio;
  paradasNaSequencia.forEach((parada, indice) => {
    let estimada: Date | null = null;
    if (referencia) {
      const minutos = indice === 0 ? MINUTOS_ATE_PRIMEIRA : (distanciaKm(paradasNaSequencia[indice - 1], parada) / VELOCIDADE_MEDIA_KMH) * 60 + MINUTOS_POR_PARADA;
      estimada = new Date(referencia.valueOf() + Math.round(minutos) * 60_000);
    }
    const valor = previsoesEditadas[parada.id] ?? (estimada ? paraLocal(estimada) : "");
    previsoes.push(valor);
    referencia = deLocal(valor) ?? estimada;
  });
  const previsaoForaDeOrdem = previsoes.some((valor, indice) => {
    const atual = deLocal(valor);
    if (!atual) return false;
    if (inicio && atual < inicio) return true;
    const anterior = indice > 0 ? deLocal(previsoes[indice - 1]) : null;
    return Boolean(anterior && atual < anterior);
  });

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="order_stop_ids" value={JSON.stringify(sequencia)} />
      <input type="hidden" name="stop_planned_at" value={JSON.stringify(previsoes)} />

      <section className={styles.card}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Etapa 1 · Quem e quando</p>
            <h2>Motorista, veículo e saída</h2>
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
            <select name="vehicle_id" value={veiculoId} onChange={(event) => setVeiculoId(event.target.value)}>
              <option value="">Sem veículo definido</option>
              {veiculos.map((veiculo) => <option key={veiculo.id} value={veiculo.id}>{veiculo.label}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Saída prevista <small>horário de Brasília</small></span>
            <input name="planned_start_at" type="datetime-local" required value={saida} onChange={(event) => { setSaida(event.target.value); setPrevisoesEditadas({}); }} />
          </label>
        </div>
        {motoristas.length === 0 ? <p className={styles.warning}>Não há motorista ativo cadastrado. Ative um motorista para despachar.</p> : null}
      </section>

      <section className={styles.card}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Etapa 2 · Paradas</p>
            <h2>Paradas disponíveis</h2>
          </div>
          <span className={styles.counter}>{paradas.length} aguardando</span>
        </div>
        <p className={styles.help}>Marque as paradas que vão nesta viagem — ou o pedido inteiro de uma vez. Coletas entram antes das entregas automaticamente.</p>
        {pedidosDisponiveis.length > 1 || paradas.length > 1 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {pedidosDisponiveis.map((numero) => {
              const doPedido = paradas.filter((item) => item.order_number === numero);
              const todas = doPedido.every((item) => selecionadas.has(item.id));
              return <button type="button" key={numero} className={styles.orderChip} aria-pressed={todas} onClick={() => alternarPedido(numero, !todas)}>
                {todas ? "✓ " : "+ "}Pedido #{numero} · {doPedido.length} {doPedido.length === 1 ? "parada" : "paradas"}
              </button>;
            })}
          </div>
        ) : null}

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
                  <small>{parada.volumeCount} {parada.volumeCount === 1 ? "volume" : "volumes"} · {parada.pesoInformadoCount === parada.volumeCount ? `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(parada.pesoTotalKg)} kg` : "peso pendente"}</small>
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Etapa 3 · Ordem e previsões</p>
            <h2>Ordem da rota</h2>
          </div>
          <span className={styles.counter}>{totalColetas} {totalColetas === 1 ? "coleta" : "coletas"} · {totalEntregas} {totalEntregas === 1 ? "entrega" : "entregas"}</span>
        </div>
        <p className={styles.help}>A sequência acompanha os volumes do pedido. O sistema impede entregar um volume antes de coletá-lo. As previsões são estimadas pela distância entre as paradas ({VELOCIDADE_MEDIA_KMH} km/h e {MINUTOS_POR_PARADA} min de atendimento) e podem ser ajustadas.</p>
        {paradasNaSequencia.length > 0 ? <p className={excedeCapacidade ? styles.error : styles.help}>Carga da viagem: <strong>{formatoKg.format(cargaKg)} kg</strong>{volumesSemPeso ? ` · ${volumesSemPeso} volume(s) sem peso` : ""}{veiculo?.capacityKg ? ` · capacidade do veículo ${formatoKg.format(veiculo.capacityKg)} kg` : ""}{excedeCapacidade ? " — acima da capacidade. Escolha outro veículo ou retire paradas." : ""}</p> : null}
        {previsaoForaDeOrdem ? <p className={styles.error}>As previsões precisam estar em ordem e depois da saída.</p> : null}
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
                  <small>{parada.volumeCount} {parada.volumeCount === 1 ? "volume" : "volumes"} · {parada.pesoInformadoCount === parada.volumeCount ? `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(parada.pesoTotalKg)} kg` : "peso pendente"}</small>
                </span>
                <label className={styles.field} style={{ minWidth: 190 }}>
                  <span>Previsão de chegada</span>
                  <input
                    type="datetime-local"
                    value={previsoes[indice] ?? ""}
                    required
                    onChange={(event) => { const valor = event.target.value; setPrevisoesEditadas((atual) => ({ ...atual, [parada.id]: valor })); }}
                  />
                </label>
                <span className={styles.sequenceActions}>
                  <button type="button" aria-label={`Mover ${parada.address_label} para cima`} onClick={() => mover(indice, -1)} disabled={indice === 0}>↑</button>
                  <button type="button" aria-label={`Mover ${parada.address_label} para baixo`} onClick={() => mover(indice, 1)} disabled={indice === paradasNaSequencia.length - 1}>↓</button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>


      {state.error ? <p role="alert" className={styles.error}>{state.error}</p> : null}
      <div className={styles.submitRow}>
        <p>O banco validará novamente se as paradas, motorista e veículo pertencem à empresa e estão disponíveis.</p>
        <button className={styles.submitButton} type="submit" disabled={pending || paradasNaSequencia.length === 0 || motoristas.length === 0 || excedeCapacidade || previsaoForaDeOrdem || !saida}>
          {pending ? "Despachando…" : "Confirmar e despachar viagem"}
        </button>
      </div>
    </form>
  );
}

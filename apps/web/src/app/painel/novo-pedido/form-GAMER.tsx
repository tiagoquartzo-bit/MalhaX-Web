"use client";

import { useActionState, useState } from "react";

import { criarPedido, type NovoPedidoState } from "./actions-GAMER";
import styles from "./order-form.module.css";
import { CoordinatePicker } from "./coordinate-picker";

type Cliente = { id: string; name: string };
type Volume = { description: string; weight_kg: string };
type TipoParada = "pickup" | "delivery";
type Parada = {
  stop_type: TipoParada;
  address_label: string;
  address_line: string;
  address_extra: string;
  district: string;
  city: string;
  state: string;
  postal_code: string;
  contact_name: string;
  contact_phone: string;
  instructions: string;
  latitude: string;
  longitude: string;
  package_indexes: number[];
};

const estadoInicial: NovoPedidoState = { error: null };

function novaParada(stop_type: TipoParada): Parada {
  return {
    stop_type,
    address_label: "",
    address_line: "",
    address_extra: "",
    district: "",
    city: "",
    state: "",
    postal_code: "",
    contact_name: "",
    contact_phone: "",
    instructions: "",
    latitude: "",
    longitude: "",
    package_indexes: [],
  };
}

export function NovoPedidoForm({ clientes, requestId }: { clientes: Cliente[]; requestId: string }) {
  const [state, formAction, pending] = useActionState(criarPedido, estadoInicial);
  const [volumes, setVolumes] = useState<Volume[]>([{ description: "", weight_kg: "" }]);
  const [paradas, setParadas] = useState<Parada[]>([novaParada("pickup"), novaParada("delivery")]);

  function atualizarVolume(indice: number, campo: keyof Volume, valor: string) {
    setVolumes((atuais) => atuais.map((volume, i) => i === indice ? { ...volume, [campo]: valor } : volume));
  }

  function atualizarParada(indice: number, campo: keyof Parada, valor: string) {
    setParadas((atuais) => atuais.map((parada, i) => i === indice ? { ...parada, [campo]: valor } : parada));
  }

  function alternarVolume(indiceParada: number, indiceVolume: number, marcado: boolean) {
    const packageIndex = indiceVolume + 1;
    setParadas((atuais) => atuais.map((parada, i) => {
      if (i !== indiceParada) return parada;
      const package_indexes = marcado
        ? [...new Set([...parada.package_indexes, packageIndex])].sort((a, b) => a - b)
        : parada.package_indexes.filter((item) => item !== packageIndex);
      return { ...parada, package_indexes };
    }));
  }

  function removerVolume(indice: number) {
    setVolumes((atuais) => atuais.filter((_, i) => i !== indice));
    setParadas((atuais) => atuais.map((parada) => ({
      ...parada,
      package_indexes: parada.package_indexes
        .filter((item) => item !== indice + 1)
        .map((item) => item > indice + 1 ? item - 1 : item),
    })));
  }

  function removerParada(indice: number) {
    setParadas((atuais) => atuais.filter((_, i) => i !== indice));
  }

  const coletas = paradas.filter((parada) => parada.stop_type === "pickup").length;
  const entregas = paradas.length - coletas;
  const paradasSemCoordenadas = paradas.filter((parada) => !parada.latitude.trim() || !parada.longitude.trim()).length;

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="packages" value={JSON.stringify(volumes)} />
      <input type="hidden" name="order_stops" value={JSON.stringify(paradas)} />

      <section className={styles.card} aria-labelledby="pedido-heading">
        <div className={styles.cardHeading}>
          <div>
            <p className={styles.eyebrow}>Comercial</p>
            <h2 id="pedido-heading">Dados do pedido</h2>
          </div>
          <span className={styles.counter}>1 pedido</span>
        </div>

        <label className={styles.field}>
          <span>Cliente</span>
          <select name="client_id" required defaultValue="">
            <option value="" disabled>Selecione o cliente</option>
            {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.name}</option>)}
          </select>
        </label>

        <label className={styles.field}>
          <span>Referência do cliente <small>opcional</small></span>
          <input name="external_reference" type="text" maxLength={80} placeholder="Ex.: pedido 10482" />
        </label>

        <label className={styles.field}>
          <span>Instruções gerais <small>opcional</small></span>
          <textarea name="instructions" rows={3} maxLength={1000} placeholder="Informações para todas as paradas" />
        </label>
      </section>

      <section className={styles.card} aria-labelledby="volumes-heading">
        <div className={styles.cardHeading}>
          <div>
            <p className={styles.eyebrow}>Identificação física</p>
            <h2 id="volumes-heading">Volumes</h2>
          </div>
          <span className={styles.counter}>{volumes.length} {volumes.length === 1 ? "unidade" : "unidades"}</span>
        </div>
        <p className={styles.help}>Cada unidade recebe seu próprio código de produto ao salvar.</p>

        <div className={styles.list}>
          {volumes.map((volume, indice) => (
            <fieldset className={styles.volume} key={indice}>
              <legend>Volume {indice + 1}</legend>
              <label className={styles.field}>
                <span>Descrição <small>opcional</small></span>
                <input value={volume.description} onChange={(event) => atualizarVolume(indice, "description", event.target.value)} maxLength={200} placeholder="Ex.: caixa de material escolar" />
              </label>
              <label className={styles.field}>
                <span>Peso em kg <small>opcional</small></span>
                <input value={volume.weight_kg} onChange={(event) => atualizarVolume(indice, "weight_kg", event.target.value)} type="text" inputMode="decimal" maxLength={20} placeholder="0,00" />
              </label>
              <button type="button" className={styles.removeButton} onClick={() => removerVolume(indice)} disabled={volumes.length === 1}>Remover volume</button>
            </fieldset>
          ))}
        </div>
        <button type="button" className={styles.secondaryButton} onClick={() => setVolumes((atuais) => [...atuais, { description: "", weight_kg: "" }])}>+ Adicionar volume</button>
      </section>

      <section className={styles.card} aria-labelledby="stops-heading">
        <div className={styles.cardHeading}>
          <div>
            <p className={styles.eyebrow}>Roteirização</p>
            <h2 id="stops-heading">Coletas e entregas</h2>
          </div>
          <span className={styles.counter}>{coletas} coletas · {entregas} entregas</span>
        </div>
        <p className={styles.help}>As quantidades são independentes. Cada parada tem endereço próprio e pode ser adicionada ou removida.</p>
        {paradasSemCoordenadas > 0 ? (
          <p className={styles.mapNotice} role="status">
            <strong>{paradasSemCoordenadas} {paradasSemCoordenadas === 1 ? "parada sem coordenadas" : "paradas sem coordenadas"}.</strong>
            {" "}O pedido pode ser salvo, mas esses locais não terão marcador no mapa do motorista até você marcar o ponto.
          </p>
        ) : (
          <p className={styles.mapSuccess} role="status">Todas as paradas têm coordenadas para aparecer no mapa da rota.</p>
        )}

        <div className={styles.list}>
          {paradas.map((parada, indice) => (
            <fieldset className={styles.stop} key={indice}>
              <legend>
                <span className={parada.stop_type === "pickup" ? styles.pickup : styles.delivery}>
                  {parada.stop_type === "pickup" ? "Coleta" : "Entrega"} {paradas.slice(0, indice + 1).filter((item) => item.stop_type === parada.stop_type).length}
                </span>
              </legend>

              <label className={styles.field}>
                <span>Nome do local</span>
                <input value={parada.address_label} onChange={(event) => atualizarParada(indice, "address_label", event.target.value)} required maxLength={120} placeholder="Ex.: Escola / Cliente / Depósito" />
              </label>
              <label className={styles.field}>
                <span>Endereço</span>
                <input value={parada.address_line} onChange={(event) => atualizarParada(indice, "address_line", event.target.value)} required maxLength={240} placeholder="Rua, número e complemento principal" />
              </label>

              <div className={styles.grid}>
                <label className={styles.field}>
                  <span>Complemento <small>opcional</small></span>
                  <input value={parada.address_extra} onChange={(event) => atualizarParada(indice, "address_extra", event.target.value)} maxLength={120} />
                </label>
                <label className={styles.field}>
                  <span>Bairro <small>opcional</small></span>
                  <input value={parada.district} onChange={(event) => atualizarParada(indice, "district", event.target.value)} maxLength={100} />
                </label>
                <label className={styles.field}>
                  <span>Cidade <small>opcional</small></span>
                  <input value={parada.city} onChange={(event) => atualizarParada(indice, "city", event.target.value)} maxLength={100} />
                </label>
                <label className={styles.field}>
                  <span>UF <small>opcional</small></span>
                  <input value={parada.state} onChange={(event) => atualizarParada(indice, "state", event.target.value)} maxLength={2} />
                </label>
                <label className={styles.field}>
                  <span>CEP <small>opcional</small></span>
                  <input value={parada.postal_code} onChange={(event) => atualizarParada(indice, "postal_code", event.target.value)} maxLength={12} inputMode="numeric" />
                </label>
                <label className={styles.field}>
                  <span>Contato <small>opcional</small></span>
                  <input value={parada.contact_name} onChange={(event) => atualizarParada(indice, "contact_name", event.target.value)} maxLength={120} />
                </label>
                <label className={styles.field}>
                  <span>Telefone <small>opcional</small></span>
                  <input value={parada.contact_phone} onChange={(event) => atualizarParada(indice, "contact_phone", event.target.value)} maxLength={32} inputMode="tel" />
                </label>
              </div>

              <div>
                <p className={styles.coordinateHelp}>
                  Coordenadas do local{" "}
                  <span className={parada.latitude.trim() && parada.longitude.trim() ? styles.coordinateConfirmed : styles.coordinateMissing}>
                    {parada.latitude.trim() && parada.longitude.trim() ? "· ponto marcado" : "· falta marcar no mapa"}
                  </span>
                  <small>Marque o ponto conferido no mapa. O endereço digitado não é convertido automaticamente.</small>
                </p>
                <div className={styles.grid}>
                  <label className={styles.field}>
                    <span>Latitude</span>
                    <input value={parada.latitude} onChange={(event) => atualizarParada(indice, "latitude", event.target.value)} maxLength={24} inputMode="decimal" placeholder="Ex.: -23.626100" aria-label={`Latitude da parada ${indice + 1}`} />
                  </label>
                  <label className={styles.field}>
                    <span>Longitude</span>
                    <input value={parada.longitude} onChange={(event) => atualizarParada(indice, "longitude", event.target.value)} maxLength={24} inputMode="decimal" placeholder="Ex.: -46.757400" aria-label={`Longitude da parada ${indice + 1}`} />
                  </label>
                </div>
                <CoordinatePicker latitude={parada.latitude} longitude={parada.longitude} onSelect={(lat, lng) => setParadas((atuais) => atuais.map((item, i) => i === indice ? { ...item, latitude: lat, longitude: lng } : item))} />
                {parada.latitude.trim() && parada.longitude.trim() ? (
                  <a className={styles.coordinateLink} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${parada.latitude.trim()},${parada.longitude.trim()}`)}`} target="_blank" rel="noopener noreferrer">Conferir o ponto no Google Maps ↗</a>
                ) : null}
              </div>

              <fieldset className={styles.packageLinks}>
                <legend>Volumes desta parada</legend>
                <div className={styles.checkboxList}>
                  {volumes.map((volume, volumeIndice) => (
                    <label className={styles.checkbox} key={volumeIndice}>
                      <input
                        type="checkbox"
                        checked={parada.package_indexes.includes(volumeIndice + 1)}
                        onChange={(event) => alternarVolume(indice, volumeIndice, event.target.checked)}
                      />
                      <span>Volume {volumeIndice + 1}{volume.description ? ` · ${volume.description}` : ""}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className={styles.field}>
                <span>Instruções desta parada <small>opcional</small></span>
                <textarea value={parada.instructions} onChange={(event) => atualizarParada(indice, "instructions", event.target.value)} maxLength={500} rows={2} />
              </label>
              <button type="button" className={styles.removeButton} onClick={() => removerParada(indice)} disabled={paradas.length === 1}>Remover parada</button>
            </fieldset>
          ))}
        </div>

        <div className={styles.addActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => setParadas((atuais) => [...atuais, novaParada("pickup")])}>+ Adicionar coleta</button>
          <button type="button" className={styles.secondaryButton} onClick={() => setParadas((atuais) => [...atuais, novaParada("delivery")])}>+ Adicionar entrega</button>
        </div>
      </section>

      {state.error ? <p role="alert" className={styles.error}>{state.error}</p> : null}

      <div className={styles.submitRow}>
        <p>Os volumes e endereços serão gravados juntos em uma única operação.</p>
        <button type="submit" className={styles.submitButton} disabled={pending || clientes.length === 0}>
          {pending ? "Salvando pedido…" : "Criar pedido e gerar códigos"}
        </button>
      </div>
      {clientes.length === 0 ? <p role="status" className={styles.error}>Cadastre um cliente ativo antes de criar o pedido.</p> : null}
    </form>
  );
}




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
    const campoMudaEndereco = ["address_line", "address_extra", "district", "city", "state", "postal_code"].includes(campo);
    setParadas((atuais) => atuais.map((parada, i) => i === indice ? {
      ...parada,
      [campo]: valor,
      ...(campoMudaEndereco ? { latitude: "", longitude: "" } : {}),
    } : parada));
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
        <p className={styles.help}>Informe o peso de cada volume. O mesmo volume fica ligado às paradas de coleta e entrega e acompanha o motorista.</p>

        <div className={styles.list}>
          {volumes.map((volume, indice) => (
            <fieldset className={styles.volume} key={indice}>
              <legend>Volume {indice + 1}</legend>
              <label className={styles.field}>
                <span>Descrição <small>opcional</small></span>
                <input value={volume.description} onChange={(event) => atualizarVolume(indice, "description", event.target.value)} maxLength={200} placeholder="Ex.: caixa de material escolar" />
              </label>
              <label className={styles.field}>
                <span>Peso do volume em kg</span>
                <input value={volume.weight_kg} onChange={(event) => atualizarVolume(indice, "weight_kg", event.target.value)} type="text" inputMode="decimal" maxLength={20} placeholder="Ex.: 12,5" required aria-label={`Peso em quilogramas do volume ${indice + 1}`} />
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
        <p className={styles.help}>Informe rua, número, bairro, cidade e UF. Ao salvar, o sistema localiza cada endereço para posicionar as paradas no mapa. Se o resultado não for preciso, marque a entrada no mapa. Você não precisa digitar latitude ou longitude.</p>
        {paradasSemCoordenadas > 0 ? (
          <p className={styles.mapNotice} role="status">
            <strong>{paradasSemCoordenadas} {paradasSemCoordenadas === 1 ? "parada sem ponto no mapa" : "paradas sem ponto no mapa"}.</strong>
            {" "}Os endereços serão localizados automaticamente ao salvar. Se algum não for reconhecido com precisão, o sistema pedirá que você marque a entrada no mapa.
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
                  <span>Cidade</span>
                  <input value={parada.city} onChange={(event) => atualizarParada(indice, "city", event.target.value)} maxLength={100} placeholder="Ex.: São Paulo" required />
                </label>
                <label className={styles.field}>
                  <span>UF</span>
                  <input value={parada.state} onChange={(event) => atualizarParada(indice, "state", event.target.value.toUpperCase())} maxLength={2} placeholder="SP" required />
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
                  Localização da parada{" "}
                  <span className={parada.latitude.trim() && parada.longitude.trim() ? styles.coordinateConfirmed : styles.coordinateMissing}>
                    {parada.latitude.trim() && parada.longitude.trim() ? "· ponto conferido" : "· usando o endereço"}
                  </span>
                  <small>As coordenadas são buscadas pelo endereço ao salvar. O motorista verá o destino nesta ordem.</small>
                </p>
                <CoordinatePicker latitude={parada.latitude} longitude={parada.longitude} onSelect={(lat, lng) => setParadas((atuais) => atuais.map((item, i) => i === indice ? { ...item, latitude: lat, longitude: lng } : item))} />
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
          {pending ? "Salvando pedido…" : "Salvar pedido e continuar para o despacho"}
        </button>
      </div>
      {clientes.length === 0 ? <p role="status" className={styles.error}>Cadastre um cliente ativo antes de criar o pedido.</p> : null}
    </form>
  );
}




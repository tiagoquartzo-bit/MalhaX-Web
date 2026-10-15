"use client";

import { useActionState, useId, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "../../../lib/supabase/config";
import { criarPedido, type NovoPedidoState } from "./actions-GAMER";
import styles from "./order-form.module.css";
import { CoordinatePicker } from "./coordinate-picker";

type Cliente = { id: string; name: string };
type Volume = { description: string; weight_kg: string };
type TipoParada = "pickup" | "delivery";
type Parada = {
  id: string;
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
const UFS = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"],
  ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"],
  ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"],
  ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"],
  ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"],
  ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"],
] as const;

type AddressSuggestion = {
  id: string;
  label: string;
  address_label: string;
  address_line: string;
  district: string;
  city: string;
  state: string;
  postal_code: string;
  latitude: number;
  longitude: number;
};

function novaParada(stop_type: TipoParada, id: string): Parada {
  return {
    id,
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

function AddressSearch({ onSelect }: { onSelect: (suggestion: AddressSuggestion) => void }) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function buscarEndereco() {
    const term = query.trim();
    if (term.length < 5) {
      setMessage("Digite pelo menos 5 caracteres, incluindo rua e cidade.");
      return;
    }

    setPending(true);
    setMessage("");
    setSuggestions([]);
    try {
      const { url, anonKey } = getSupabaseConfig();
      const client = createBrowserClient(url, anonKey);
      const { data, error } = await client.functions.invoke("geocode-order-stops", {
        body: { suggestion_query: term },
      });
      const result = data as { suggestions?: AddressSuggestion[] } | null;
      if (error || !result || !Array.isArray(result.suggestions)) {
        setMessage("A busca não respondeu. Confira a conexão ou preencha o endereço abaixo.");
      } else if (result.suggestions.length === 0) {
        setMessage("Não encontramos opções. Complete o endereço abaixo ou marque o ponto no mapa.");
      } else {
        setSuggestions(result.suggestions);
        setMessage("Escolha o endereço correto. Depois você poderá conferir e ajustar o ponto no mapa.");
      }
    } catch {
      setMessage("A busca não respondeu. Confira a conexão ou preencha o endereço abaixo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.addressSearch}>
      <div className={styles.field}>
        <label htmlFor={inputId}>Encontre o endereço</label>
        <span className={styles.searchRow}>
          <input
            id={inputId}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSuggestions([]); }}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void buscarEndereco(); } }}
            maxLength={240}
            placeholder="Ex.: Rua das Flores, 120, São Paulo"
            autoComplete="street-address"
            aria-describedby={inputId + "-help"}
          />
          <button type="button" className={styles.secondaryButton} onClick={() => void buscarEndereco()} disabled={pending || query.trim().length < 5}>
            {pending ? "Buscando…" : "Buscar opções"}
          </button>
        </span>
        <small id={inputId + "-help"}>A busca envia o endereço ao serviço de mapas e preenche rua, bairro, cidade, estado e ponto no mapa.</small>
      </div>
      {message ? <p className={styles.searchMessage} role="status">{message}</p> : null}
      {suggestions.length ? (
        <ul className={styles.suggestionList} aria-label="Endereços encontrados">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button type="button" className={styles.suggestionButton} onClick={() => {
                onSelect(suggestion);
                setSuggestions([]);
                setMessage("Endereço selecionado. Confira os campos e o ponto no mapa.");
              }}>
                <strong>{suggestion.address_label}</strong>
                <span>{suggestion.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function NovoPedidoForm({ clientes, requestId }: { clientes: Cliente[]; requestId: string }) {
  const [state, formAction, pending] = useActionState(criarPedido, estadoInicial);
  const [etapa, setEtapa] = useState(1);
  const [sequenciaError, setSequenciaError] = useState("");
  const etapaPedidoRef = useRef<HTMLDivElement>(null);
  const etapaRotaRef = useRef<HTMLElement>(null);
  const [clientId, setClientId] = useState("");
  const [volumes, setVolumes] = useState<Volume[]>([{ description: "", weight_kg: "" }]);
  const [paradas, setParadas] = useState<Parada[]>([
    { ...novaParada("pickup", "coleta-inicial"), package_indexes: [1] },
    { ...novaParada("delivery", "entrega-inicial"), package_indexes: [1] },
  ]);

  function validarEtapa<T extends HTMLElement>(ref: { current: T | null }, proxima: number) {
    setSequenciaError("");
    if (etapa === 1) {
      const indiceSemPeso = volumes.findIndex((volume) => {
        const peso = Number(volume.weight_kg.replace(",", "."));
        return !Number.isFinite(peso) || peso <= 0;
      });
      if (indiceSemPeso >= 0) {
        const campoPeso = ref.current?.querySelectorAll<HTMLInputElement>('input[aria-label^="Peso em quilogramas do volume"]')[indiceSemPeso];
        if (campoPeso) {
          campoPeso.setCustomValidity("Informe um peso maior que zero para este volume.");
          campoPeso.reportValidity();
          return;
        }
      }
    }
    const controles = ref.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input:not([type=hidden]), select, textarea");
    if (controles) {
      for (const controle of controles) {
        if (!controle.disabled && !controle.checkValidity()) {
          controle.reportValidity();
          return;
        }
      }
    }
    if (etapa === 2) {
      for (let indice = 0; indice < volumes.length; indice += 1) {
        const packageIndex = indice + 1;
        const pickupIndex = paradas.findIndex((parada) => parada.stop_type === "pickup" && parada.package_indexes.includes(packageIndex));
        const deliveryIndex = paradas.findIndex((parada) => parada.stop_type === "delivery" && parada.package_indexes.includes(packageIndex));
        if (pickupIndex >= deliveryIndex || pickupIndex < 0 || deliveryIndex < 0) {
          setSequenciaError("A coleta de cada volume precisa aparecer antes da entrega na sequência. Use os botões para reorganizar as paradas.");
          return;
        }
      }
    }
    setEtapa(proxima);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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

  function atualizarVinculo(indiceVolume: number, tipo: TipoParada, indiceParada: number) {
    setSequenciaError("");
    const packageIndex = indiceVolume + 1;
    setParadas((atuais) => atuais.map((parada, indice) => {
      if (parada.stop_type !== tipo) return parada;
      const restantes = parada.package_indexes.filter((item) => item !== packageIndex);
      return indice === indiceParada
        ? { ...parada, package_indexes: [...restantes, packageIndex].sort((a, b) => a - b) }
        : { ...parada, package_indexes: restantes };
    }));
  }

  function adicionarVolume() {
    const packageIndex = volumes.length + 1;
    setVolumes((atuais) => [...atuais, { description: "", weight_kg: "" }]);
    let vinculouColeta = false;
    let vinculouEntrega = false;
    setParadas((atuais) => atuais.map((parada) => {
      if (parada.stop_type === "pickup" && !vinculouColeta) {
        vinculouColeta = true;
        return { ...parada, package_indexes: [...parada.package_indexes, packageIndex] };
      }
      if (parada.stop_type === "delivery" && !vinculouEntrega) {
        vinculouEntrega = true;
        return { ...parada, package_indexes: [...parada.package_indexes, packageIndex] };
      }
      return parada;
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
    const paradaRemovida = paradas[indice];
    if (!paradaRemovida) return;
    const restantes = paradas.filter((_, i) => i !== indice);
    const indiceSubstituta = restantes.findIndex((item) => item.stop_type === paradaRemovida.stop_type);
    if (indiceSubstituta < 0) return;
    setSequenciaError("");
    const idSubstituta = restantes[indiceSubstituta].id;
    setParadas(restantes.map((item) => item.id === idSubstituta
      ? { ...item, package_indexes: [...new Set([...item.package_indexes, ...paradaRemovida.package_indexes])].sort((a, b) => a - b) }
      : item));
  }

  function moverParada(indice: number, direcao: -1 | 1) {
    const destino = indice + direcao;
    if (destino < 0 || destino >= paradas.length) return;
    setSequenciaError("");
    setParadas((atuais) => {
      const proximas = [...atuais];
      [proximas[indice], proximas[destino]] = [proximas[destino], proximas[indice]];
      return proximas;
    });
  }

  function adicionarParada(tipo: TipoParada) {
    const parada = novaParada(tipo, crypto.randomUUID());
    setParadas((atuais) => [...atuais, parada]);
  }

  function selecionarEndereco(indice: number, sugestao: AddressSuggestion) {
    setParadas((atuais) => atuais.map((parada, i) => i === indice ? {
      ...parada,
      address_label: sugestao.address_label,
      address_line: sugestao.address_line,
      district: sugestao.district,
      city: sugestao.city,
      state: sugestao.state,
      postal_code: sugestao.postal_code,
      latitude: String(sugestao.latitude),
      longitude: String(sugestao.longitude),
    } : parada));
  }

  const coletas = paradas.filter((parada) => parada.stop_type === "pickup").length;
  const entregas = paradas.length - coletas;
  const paradasSemCoordenadas = paradas.filter((parada) => !parada.latitude.trim() || !parada.longitude.trim()).length;
  const pesoTotal = volumes.reduce((total, volume) => {
    const peso = Number(volume.weight_kg.replace(",", "."));
    return total + (Number.isFinite(peso) ? peso : 0);
  }, 0);

  return (
    <form
      action={formAction}
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        if (etapa === 1) {
          event.preventDefault();
          validarEtapa(etapaPedidoRef, 2);
        } else if (etapa === 2) {
          event.preventDefault();
          validarEtapa(etapaRotaRef, 3);
        }
      }}
    >
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="packages" value={JSON.stringify(volumes)} />
      <input type="hidden" name="order_stops" value={JSON.stringify(paradas)} />

      <nav className={styles.stepNav} aria-label="Etapas do pedido">
        {["Pedido e volumes", "Endereços e vínculos", "Conferência"].map((titulo, indice) => {
          const numero = indice + 1;
          return (
            <button
              type="button"
              key={titulo}
              className={[styles.stepItem, etapa === numero ? styles.stepActive : "", etapa > numero ? styles.stepDone : ""].filter(Boolean).join(" ")}
              aria-current={etapa === numero ? "step" : undefined}
              disabled={numero >= etapa}
              onClick={() => setEtapa(numero)}
            >
              <span className={styles.stepNumber}>{etapa > numero ? "✓" : numero}</span>
              <span>{titulo}</span>
            </button>
          );
        })}
        <span className={styles.stepCount}>Etapa {etapa} de 3</span>
      </nav>

      <div className={styles.stagePanel} hidden={etapa !== 1} ref={etapaPedidoRef}>
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
          <select name="client_id" required value={clientId} onChange={(event) => setClientId(event.target.value)}>
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
        <p className={styles.help}>Informe cada caixa, pacote ou item e seu peso. Na próxima etapa, você escolhe de onde cada volume sai e para onde vai.</p>

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
                <input value={volume.weight_kg} onChange={(event) => { event.currentTarget.setCustomValidity(""); atualizarVolume(indice, "weight_kg", event.target.value); }} type="text" inputMode="decimal" maxLength={20} placeholder="Ex.: 12,5" required aria-label={`Peso em quilogramas do volume ${indice + 1}`} />
              </label>
              <button type="button" className={styles.removeButton} onClick={() => removerVolume(indice)} disabled={volumes.length === 1}>Remover volume</button>
            </fieldset>
          ))}
        </div>
        <button type="button" className={styles.secondaryButton} onClick={adicionarVolume}>+ Adicionar volume</button>
        <div className={styles.stepActions}>
          <span>Depois, vamos cadastrar os endereços de coleta e entrega.</span>
          <button type="button" className={styles.submitButton} disabled={clientes.length === 0} onClick={() => validarEtapa(etapaPedidoRef, 2)}>
            Continuar para endereços <span aria-hidden="true">→</span>
          </button>
        </div>
        {clientes.length === 0 ? <p role="status" className={styles.error}>Cadastre um cliente ativo antes de criar um pedido.</p> : null}
      </section>
      </div>

      <section className={styles.card} hidden={etapa !== 2} ref={etapaRotaRef} aria-labelledby="stops-heading">
        <div className={styles.cardHeading}>
          <div>
            <p className={styles.eyebrow}>Roteirização</p>
            <h2 id="stops-heading">Coletas e entregas</h2>
          </div>
          <span className={styles.counter}>{coletas} coletas · {entregas} entregas</span>
        </div>
        <p className={styles.help}>Busque o endereço e selecione uma opção. O MalhaX preenche os campos e mostra o ponto no mapa; depois escolha qual coleta e entrega pertencem a cada volume.</p>
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
              <fieldset className={styles.stop} key={parada.id}>
              <legend>
                  <span className={styles.stopOrder}>Parada {indice + 1}</span>{" "}
                  <span className={parada.stop_type === "pickup" ? styles.pickup : styles.delivery}>
                  {parada.stop_type === "pickup" ? "Coleta" : "Entrega"} {paradas.slice(0, indice + 1).filter((item) => item.stop_type === parada.stop_type).length}
                </span>
              </legend>

              <AddressSearch onSelect={(sugestao) => selecionarEndereco(indice, sugestao)} />

              <label className={styles.field}>
                <span>Nome para reconhecer o local</span>
                <input value={parada.address_label} onChange={(event) => atualizarParada(indice, "address_label", event.target.value)} required maxLength={120} placeholder="Ex.: Escola / Cliente / Depósito" />
              </label>
              <label className={styles.field}>
                <span>Rua e número</span>
                <input value={parada.address_line} onChange={(event) => atualizarParada(indice, "address_line", event.target.value)} required maxLength={240} placeholder="Ex.: Rua das Flores, 120" autoComplete="street-address" />
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
                  <input value={parada.city} onChange={(event) => atualizarParada(indice, "city", event.target.value)} maxLength={100} placeholder="Preenchida ao escolher um endereço" required autoComplete="address-level2" />
                </label>
                <label className={styles.field}>
                  <span>Estado</span>
                  <select value={parada.state} onChange={(event) => atualizarParada(indice, "state", event.target.value)} required autoComplete="address-level1">
                    <option value="" disabled>Selecione a UF</option>
                    {UFS.map(([uf, estado]) => <option key={uf} value={uf}>{uf} · {estado}</option>)}
                  </select>
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

              <div className={styles.stopSequence}>
                <span>Ordem desta parada na viagem: <strong>{indice + 1}</strong></span>
                <div>
                  <button type="button" className={styles.moveButton} onClick={() => moverParada(indice, -1)} disabled={indice === 0}>↑ Mover para cima</button>
                  <button type="button" className={styles.moveButton} onClick={() => moverParada(indice, 1)} disabled={indice === paradas.length - 1}>↓ Mover para baixo</button>
                </div>
              </div>

              <label className={styles.field}>
                <span>Instruções desta parada <small>opcional</small></span>
                <textarea value={parada.instructions} onChange={(event) => atualizarParada(indice, "instructions", event.target.value)} maxLength={500} rows={2} />
              </label>
              <button type="button" className={styles.removeButton} onClick={() => removerParada(indice)} disabled={paradas.filter((item) => item.stop_type === parada.stop_type).length === 1}>Remover {parada.stop_type === "pickup" ? "coleta" : "entrega"}</button>
            </fieldset>
          ))}
        </div>

        <div className={styles.addActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => adicionarParada("pickup")}>+ Adicionar coleta</button>
          <button type="button" className={styles.secondaryButton} onClick={() => adicionarParada("delivery")}>+ Adicionar entrega</button>
        </div>

        <section className={styles.assignmentCard} aria-labelledby="assignment-heading">
          <div className={styles.cardHeading}>
            <div><p className={styles.eyebrow}>Vínculo dos volumes</p><h2 id="assignment-heading">De onde sai e para onde vai cada volume?</h2></div>
          </div>
          <p className={styles.help}>Escolha uma coleta e uma entrega para cada volume. O sistema sugere a primeira parada de cada tipo; você pode trocar.</p>
          <div className={styles.assignmentList}>
            {volumes.map((volume, volumeIndice) => {
              const packageIndex = volumeIndice + 1;
              const pickupIndex = paradas.findIndex((item) => item.stop_type === "pickup" && item.package_indexes.includes(packageIndex));
              const deliveryIndex = paradas.findIndex((item) => item.stop_type === "delivery" && item.package_indexes.includes(packageIndex));
              return (
                <div className={styles.assignmentItem} key={volumeIndice}>
                  <strong>Volume {packageIndex}{volume.description ? " · " + volume.description : ""}</strong>
                  <div className={styles.assignmentFields}>
                    <label className={styles.field}>
                      <span>Coletar em</span>
                      <select value={pickupIndex < 0 ? "" : String(pickupIndex)} required onChange={(event) => atualizarVinculo(volumeIndice, "pickup", Number(event.target.value))}>
                        <option value="" disabled>Selecione a coleta</option>
                        {paradas.map((item, i) => item.stop_type === "pickup" ? <option key={i} value={i}>{item.address_label || item.address_line || "Nova coleta " + (paradas.slice(0, i + 1).filter((stop) => stop.stop_type === "pickup").length)}</option> : null)}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Entregar em</span>
                      <select value={deliveryIndex < 0 ? "" : String(deliveryIndex)} required onChange={(event) => atualizarVinculo(volumeIndice, "delivery", Number(event.target.value))}>
                        <option value="" disabled>Selecione a entrega</option>
                        {paradas.map((item, i) => item.stop_type === "delivery" ? <option key={i} value={i}>{item.address_label || item.address_line || "Nova entrega " + (paradas.slice(0, i + 1).filter((stop) => stop.stop_type === "delivery").length)}</option> : null)}
                      </select>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {sequenciaError ? <p role="alert" className={styles.error}>{sequenciaError}</p> : null}

        <div className={styles.stepActions}>
          <button type="button" className={styles.backButton} onClick={() => { setEtapa(1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>← Voltar aos volumes</button>
          <button type="button" className={styles.submitButton} onClick={() => validarEtapa(etapaRotaRef, 3)}>Conferir pedido <span aria-hidden="true">→</span></button>
        </div>
      </section>

      <section className={styles.card} hidden={etapa !== 3} aria-labelledby="review-heading">
        <div className={styles.cardHeading}>
          <div><p className={styles.eyebrow}>Etapa 3 · Conferência</p><h2 id="review-heading">Confira antes de salvar</h2></div>
          <span className={styles.counter}>{volumes.length} {volumes.length === 1 ? "volume" : "volumes"} · {paradas.length} paradas</span>
        </div>
        <p className={styles.help}>Revise os dados e o caminho de cada volume. Depois de salvar, o pedido segue para o despacho.</p>
        <div className={styles.reviewGrid}>
          <section className={styles.reviewCard} aria-label="Resumo do pedido e dos volumes">
            <h3>Pedido</h3>
            <p className={styles.reviewClient}>{clientes.find((cliente) => cliente.id === clientId)?.name || "Cliente não selecionado"}</p>
            <h3>Volumes</h3>
            <ul className={styles.reviewList}>
              {volumes.map((volume, volumeIndice) => {
                const packageIndex = volumeIndice + 1;
                const coleta = paradas.find((parada) => parada.stop_type === "pickup" && parada.package_indexes.includes(packageIndex));
                const entrega = paradas.find((parada) => parada.stop_type === "delivery" && parada.package_indexes.includes(packageIndex));
                const peso = Number(volume.weight_kg.replace(",", "."));
                return (
                  <li key={volumeIndice}>
                    <strong>Volume {packageIndex}{volume.description ? " · " + volume.description : ""}</strong>
                    <span>{Number.isFinite(peso) ? peso.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"} kg</span>
                    <small>Coleta: {coleta?.address_label || coleta?.address_line || "Não definida"}</small>
                    <small>Entrega: {entrega?.address_label || entrega?.address_line || "Não definida"}</small>
                  </li>
                );
              })}
            </ul>
            <p className={styles.reviewTotal}>Peso total: {pesoTotal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg</p>
          </section>
          <section className={styles.reviewCard} aria-label="Sequência de paradas">
            <h3>Sequência de paradas</h3>
            <ol className={styles.reviewStops}>
              {paradas.map((parada, indice) => (
                <li key={indice}>
                  <span className={parada.stop_type === "pickup" ? styles.pickup : styles.delivery}>{indice + 1}</span>
                  <div>
                    <strong>{parada.stop_type === "pickup" ? "Coleta · " : "Entrega · "}{parada.address_label || "Local sem nome"}</strong>
                    <small>{parada.address_line}{parada.district ? " · " + parada.district : ""} · {parada.city}/{parada.state}</small>
                    <small>Volumes: {parada.package_indexes.map((packageIndex) => "Volume " + packageIndex).join(", ") || "Nenhum associado"}</small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {state.error ? <p role="alert" className={styles.error}>{state.error}</p> : null}
        <div className={styles.stepActions}>
          <button type="button" className={styles.backButton} onClick={() => { setEtapa(2); window.scrollTo({ top: 0, behavior: "smooth" }); }}>← Voltar aos endereços</button>
          <button type="submit" className={styles.submitButton} disabled={pending || clientes.length === 0}>
            {pending ? "Salvando pedido…" : "Salvar pedido e continuar para o despacho"}
          </button>
        </div>
        <p className={styles.submitNote}>A viagem ainda não começa aqui. Você poderá conferir e despachar na etapa seguinte.</p>
      </section>
    </form>
  );
}




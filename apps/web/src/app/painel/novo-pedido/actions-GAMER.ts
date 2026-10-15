"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { mensagemDeErroRpc } from "../../../lib/rpc-errors";
import { createClient } from "../../../lib/supabase/server";

export type NovoPedidoState = { error: string | null };

type VolumeForm = { description: string; weight_kg: string };
type ParadaForm = {
  stop_type: "pickup" | "delivery";
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
  latitude?: unknown;
  longitude?: unknown;
  package_indexes: number[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAPEIS_QUE_CRIAM_PEDIDO = new Set(["admin", "manager", "dispatcher"]);

function texto(valor: unknown, maximo: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : "";
}

function lerJson<T>(valor: FormDataEntryValue | null): T | null {
  if (typeof valor !== "string" || valor.length > 450_000) return null;
  try {
    return JSON.parse(valor) as T;
  } catch {
    return null;
  }
}

export async function criarPedido(
  _prev: NovoPedidoState,
  formData: FormData,
): Promise<NovoPedidoState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sua sessão expirou. Entre novamente." };

  const { data: papeis, error: erroPapeis } = await supabase
    .from("organization_member_roles")
    .select("role")
    .eq("user_id", user.id);
  if (erroPapeis || !papeis?.some(({ role }) => PAPEIS_QUE_CRIAM_PEDIDO.has(role))) {
    return { error: "Você não tem permissão para criar pedidos." };
  }

  const clientId = texto(formData.get("client_id"), 36);
  const requestId = texto(formData.get("request_id"), 36);
  const volumes = lerJson<VolumeForm[]>(formData.get("packages"));
  const paradas = lerJson<ParadaForm[]>(formData.get("order_stops"));
  const referencia = texto(formData.get("external_reference"), 80);
  const instrucoes = texto(formData.get("instructions"), 1000);

  if (!UUID.test(clientId)) return { error: "Selecione um cliente válido." };
  if (!UUID.test(requestId)) return { error: "Atualize a página e tente novamente." };
  if (!Array.isArray(volumes) || volumes.length === 0) {
    return { error: "Cadastre ao menos um volume." };
  }
  if (!Array.isArray(paradas) || paradas.length === 0) {
    return { error: "Adicione ao menos uma coleta ou entrega." };
  }

  const pacotes = [] as { description: string | null; weight_kg: number | null }[];
  for (const volume of volumes) {
    if (!volume || typeof volume !== "object") return { error: "Revise os volumes informados." };
    const description = texto(volume.description, 200);
    const pesoTexto = texto(volume.weight_kg, 20).replace(",", ".");
    const peso = pesoTexto === "" ? null : Number(pesoTexto);
    if (peso === null || !Number.isFinite(peso) || peso <= 0) {
      return { error: `Informe o peso em kg do volume ${pacotes.length + 1}.` };
    }
    pacotes.push({ description: description || null, weight_kg: peso });
  }

  const tarefas = [] as ParadaForm[];
  for (const parada of paradas) {
    if (!parada || typeof parada !== "object") return { error: "Revise os endereços informados." };
    if (parada.stop_type !== "pickup" && parada.stop_type !== "delivery") {
      return { error: "O tipo de parada é inválido." };
    }
    const addressLabel = texto(parada.address_label, 120);
    const addressLine = texto(parada.address_line, 240);
    const latitudeText = texto(parada.latitude, 24).replace(",", ".");
    const longitudeText = texto(parada.longitude, 24).replace(",", ".");
    const latitude = latitudeText ? Number(latitudeText) : null;
    const longitude = longitudeText ? Number(longitudeText) : null;
    if ((latitudeText === "") !== (longitudeText === "")) return { error: "Informe latitude e longitude juntas para a parada." };
    if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || longitude === null || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)) return { error: "Confira as coordenadas. Latitude deve estar entre -90 e 90 e longitude entre -180 e 180." };
    const packageIndexes = Array.isArray(parada.package_indexes)
      ? [...new Set(parada.package_indexes.filter(Number.isInteger))]
      : [];
    if (!addressLabel || !addressLine) return { error: "Informe a identificação e o endereço de cada parada." };
    if (packageIndexes.length === 0 || packageIndexes.some((index) => index < 1 || index > pacotes.length)) {
      return { error: "Associe ao menos um volume válido a cada parada." };
    }

    tarefas.push({
      stop_type: parada.stop_type,
      address_label: addressLabel,
      address_line: addressLine,
      address_extra: texto(parada.address_extra, 120),
      district: texto(parada.district, 100),
      city: texto(parada.city, 100),
      state: texto(parada.state, 2).toUpperCase(),
      postal_code: texto(parada.postal_code, 12),
      contact_name: texto(parada.contact_name, 120),
      contact_phone: texto(parada.contact_phone, 32),
      instructions: texto(parada.instructions, 500),
      latitude,
      longitude,
      package_indexes: packageIndexes,
    });
  }

  const volumeSemTarefa = pacotes.some((_, indice) =>
    !tarefas.some((parada) => parada.package_indexes.includes(indice + 1)),
  );
  if (volumeSemTarefa) return { error: "Associe cada volume a pelo menos uma coleta ou entrega." };

  for (let indice = 0; indice < pacotes.length; indice += 1) {
    const packageIndex = indice + 1;
    const pickupCount = tarefas.filter((parada) => parada.stop_type === "pickup" && parada.package_indexes.includes(packageIndex)).length;
    const deliveryCount = tarefas.filter((parada) => parada.stop_type === "delivery" && parada.package_indexes.includes(packageIndex)).length;
    if (pickupCount !== 1 || deliveryCount !== 1) {
      return { error: `Vincule o volume ${packageIndex} a exatamente uma coleta e uma entrega para montar a sequência da viagem.` };
    }
    const pickupPosition = tarefas.findIndex((parada) => parada.stop_type === "pickup" && parada.package_indexes.includes(packageIndex));
    const deliveryPosition = tarefas.findIndex((parada) => parada.stop_type === "delivery" && parada.package_indexes.includes(packageIndex));
    if (pickupPosition >= deliveryPosition) {
      return { error: `A coleta do volume ${packageIndex} precisa vir antes da entrega na sequência da viagem.` };
    }
  }

  const stopsToGeocode = tarefas
    .map((parada, index) => ({ parada, stop_index: index + 1 }))
    .filter(({ parada }) => parada.latitude === null && parada.longitude === null);

  if (stopsToGeocode.some(({ parada }) => !parada.city || !parada.state)) {
    return { error: "Para localizar a parada pelo endereço, informe cidade e UF. Você também pode marcar o ponto no mapa." };
  }

  if (stopsToGeocode.length > 0) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { error: "Sua sessão expirou. Entre novamente." };

    let data: { results?: unknown } | null = null;
    let geocodeError: unknown = null;
    try {
      const response = await supabase.functions.invoke("geocode-order-stops", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          stops: stopsToGeocode.map(({ parada, stop_index }) => ({
            stop_index,
            address_line: parada.address_line,
            address_extra: parada.address_extra,
            district: parada.district,
            city: parada.city,
            state: parada.state,
            postal_code: parada.postal_code,
          })),
        },
      });
      data = response.data;
      geocodeError = response.error;
    } catch {
      return { error: "Não foi possível localizar os endereços agora. Confira cidade e UF, ou marque o ponto de cada parada no mapa e tente novamente." };
    }

    if (geocodeError || !data || !Array.isArray(data.results)) {
      return { error: "Não foi possível localizar os endereços agora. Confira cidade e UF, ou marque o ponto de cada parada no mapa e tente novamente." };
    }

    const matches = new Map<number, { latitude: number; longitude: number }>();
    for (const result of data.results as Array<Record<string, unknown>>) {
      const index = Number(result.stop_index);
      const latitude = Number(result.latitude);
      const longitude = Number(result.longitude);
      if (result.status === "matched" && Number.isInteger(index) && Number.isFinite(latitude) && Number.isFinite(longitude)) {
        matches.set(index, { latitude, longitude });
      }
    }

    for (const { parada, stop_index } of stopsToGeocode) {
      const point = matches.get(stop_index);
      if (!point || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) {
        return { error: `Não localizei a parada ${stop_index} com precisão suficiente. Revise rua e número, bairro, cidade e UF, ou marque a entrada no mapa.` };
      }
      parada.latitude = point.latitude;
      parada.longitude = point.longitude;
    }
  }

  const { error } = await supabase.rpc("create_order_with_stops", {
    p_request_id: requestId,
    p_client_id: clientId,
    p_packages: pacotes,
    p_order_stops: tarefas,
    p_external_reference: referencia || null,
    p_instructions: instrucoes || null,
  });

  if (error) return { error: mensagemDeErroRpc(error.message) };

  revalidatePath("/painel");
  revalidatePath("/painel/paradas");
  revalidatePath("/painel/despacho");
  redirect("/painel/despacho");
}




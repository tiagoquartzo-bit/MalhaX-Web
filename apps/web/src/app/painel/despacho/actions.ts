"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { mensagemDeErroRpc } from "../../../lib/rpc-errors";
import { createClient } from "../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../lib/supabase/organization-roles";

export type DespachoState = { error: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAPEIS_QUE_DESPACHAM = new Set(["admin", "manager", "dispatcher"]);

function dataLocalDeSaoPauloParaIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const utcGuess = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const guessDate = new Date(utcGuess);
  if (
    guessDate.getUTCFullYear() !== Number(year) ||
    guessDate.getUTCMonth() !== Number(month) - 1 ||
    guessDate.getUTCDate() !== Number(day) ||
    guessDate.getUTCHours() !== Number(hour) ||
    guessDate.getUTCMinutes() !== Number(minute)
  ) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guessDate);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  const localAsUtc = Date.UTC(
    Number(part("year")), Number(part("month")) - 1, Number(part("day")),
    Number(part("hour")), Number(part("minute")),
  );
  const offset = localAsUtc - utcGuess;
  const result = new Date(utcGuess - offset);
  const roundTrip = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(result);
  const round = (type: string) => roundTrip.find((item) => item.type === type)?.value;
  if (`${round("year")}-${round("month")}-${round("day")}T${round("hour")}:${round("minute")}` !== value) return null;
  return result.toISOString();
}

export async function despacharViagem(
  _prev: DespachoState,
  formData: FormData,
): Promise<DespachoState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sua sessão expirou. Entre novamente." };

  const { roles: papeis, error: erroPapeis } = await getCurrentOrganizationRoles(supabase, user.id);
  if (erroPapeis || !papeis.some((role) => PAPEIS_QUE_DESPACHAM.has(role))) {
    return { error: "Você não tem permissão para despachar viagens." };
  }

  const requestId = String(formData.get("request_id") ?? "");
  const driverId = String(formData.get("driver_id") ?? "");
  const vehicleValue = String(formData.get("vehicle_id") ?? "");
  const plannedLocal = String(formData.get("planned_start_at") ?? "");
  const idsRaw = formData.get("order_stop_ids");
  if (!UUID.test(requestId)) return { error: "Atualize a página e tente novamente." };
  if (!UUID.test(driverId)) return { error: "Selecione um motorista ativo." };
  if (vehicleValue && !UUID.test(vehicleValue)) return { error: "Selecione um veículo válido." };
  if (typeof idsRaw !== "string" || idsRaw.length > 450_000) {
    return { error: "Selecione as paradas que farão parte da viagem." };
  }

  let stopIds: unknown;
  try {
    stopIds = JSON.parse(idsRaw);
  } catch {
    return { error: "A sequência de paradas está inválida." };
  }
  if (!Array.isArray(stopIds) || stopIds.length === 0 || !stopIds.every((id) => typeof id === "string" && UUID.test(id))) {
    return { error: "Adicione ao menos uma parada válida à viagem." };
  }
  if (new Set(stopIds).size !== stopIds.length) return { error: "A sequência contém uma parada repetida." };

  const { data: selectedStops, error: selectedStopsError } = await supabase
    .from("order_stops")
    .select("id, latitude, longitude")
    .in("id", stopIds);
  if (selectedStopsError || !selectedStops || selectedStops.length !== stopIds.length) {
    return { error: "As paradas mudaram ou não estão mais disponíveis. Atualize a página e tente novamente." };
  }
  if (selectedStops.some((stop) => stop.latitude === null || stop.longitude === null)) {
    return { error: "Uma ou mais paradas ainda não têm localização confirmada. Corrija o endereço antes de despachar." };
  }
  const { data: vinculosDosVolumes, error: erroDosVinculos } = await supabase
    .from("order_stop_packages")
    .select("order_stop_id, package_id, expected_action")
    .in("order_stop_id", stopIds);
  if (erroDosVinculos) return { error: "Não foi possível conferir os volumes ligados às paradas. Atualize e tente novamente." };
  const posicaoDaParada = new Map((stopIds as string[]).map((id, index) => [id, index]));
  const acoesPorVolume = new Map<string, { coletas: number[]; entregas: number[] }>();
  for (const vinculo of vinculosDosVolumes ?? []) {
    const posicao = posicaoDaParada.get(vinculo.order_stop_id);
    if (posicao === undefined) continue;
    const acoes = acoesPorVolume.get(vinculo.package_id) ?? { coletas: [], entregas: [] };
    if (vinculo.expected_action === "load") acoes.coletas.push(posicao);
    else acoes.entregas.push(posicao);
    acoesPorVolume.set(vinculo.package_id, acoes);
  }
  for (const acoes of acoesPorVolume.values()) {
    if (acoes.coletas.length && acoes.entregas.length && Math.min(...acoes.coletas) > Math.min(...acoes.entregas)) {
      return { error: "A sequência está invertida: coloque a coleta do volume antes da entrega correspondente." };
    }
  }

  const plannedAt = dataLocalDeSaoPauloParaIso(plannedLocal);
  if (!plannedAt) {
    return { error: "Informe um horário previsto válido." };
  }

  let previsoesLocais: unknown;
  try {
    previsoesLocais = JSON.parse(String(formData.get("stop_planned_at") ?? "[]"));
  } catch {
    return { error: "As previsões das paradas estão inválidas." };
  }
  if (!Array.isArray(previsoesLocais) || previsoesLocais.length !== stopIds.length) {
    return { error: "Informe a previsão de chegada de cada parada." };
  }
  const previsoes: string[] = [];
  for (const [indice, valor] of previsoesLocais.entries()) {
    const iso = typeof valor === "string" ? dataLocalDeSaoPauloParaIso(valor) : null;
    if (!iso) return { error: `Informe uma previsão válida para a parada ${indice + 1}.` };
    if (new Date(iso) < new Date(plannedAt)) return { error: `A previsão da parada ${indice + 1} é anterior à saída.` };
    if (previsoes.length && new Date(iso) < new Date(previsoes[previsoes.length - 1])) {
      return { error: `A previsão da parada ${indice + 1} é anterior à da parada ${indice}.` };
    }
    previsoes.push(iso);
  }

  const { data: tripId, error } = await supabase.rpc("dispatch_trip_from_order_stops", {
    p_request_id: requestId,
    p_driver_id: driverId,
    p_vehicle_id: vehicleValue || null,
    p_planned_start_at: plannedAt,
    p_order_stop_ids: stopIds,
    p_planned_at: previsoes,
  });

  if (error) return { error: mensagemDeErroRpc(error.message) };
  if (!tripId) return { error: "A viagem não foi criada. Atualize a página e tente novamente." };

  revalidatePath("/painel");
  revalidatePath("/painel/paradas");
  redirect(`/painel/viagens/${tripId}`);
}

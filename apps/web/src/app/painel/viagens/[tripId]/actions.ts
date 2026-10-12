"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../../lib/supabase/server";

export type TripActionState = { error: string | null; success: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDIT_ROLES = ["admin", "manager", "dispatcher"];

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function errorMessage(message: string) {
  if (message.includes("package_pickup_must_be_completed_first")) return "Conclua a coleta dos volumes antes de adicionar esta entrega.";
  if (message.includes("pickup_must_precede_delivery")) return "A coleta precisa ficar antes da entrega na sequência.";
  if (message.includes("only_pending_stops_can_be_removed")) return "Só é possível retirar uma parada que ainda não foi iniciada.";
  if (message.includes("trip_already_started")) return "A sequência só pode ser alterada antes do início da viagem.";
  if (message.includes("trip_not_editable")) return "Esta viagem não aceita alterações neste estado.";
  if (message.includes("order_stop_not_dispatchable")) return "Esta tarefa já foi atribuída ou não está mais disponível.";
  if (message.includes("ordered_stops_must_match_unstarted_trip")) return "A lista mudou. Atualize a página e tente novamente.";
  if (message.includes("trip_not_found") || message.includes("trip_stop_not_found")) return "A viagem ou parada não está mais disponível.";
  if (message.includes("schema cache")) return "Os controles ainda não estão disponíveis no Supabase local. Aplique a migration 013.";
  return "Não foi possível salvar a alteração. Atualize a viagem e tente novamente.";
}

async function authorizeTrip(tripId: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { error: "A prévia está sem conexão com o Supabase; nenhuma alteração foi gravada." as const };
  }
  if (!UUID.test(tripId)) return { error: "Identificador de viagem inválido." as const };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sua sessão expirou. Entre novamente." as const };

  const { data: roleRows, error: roleError } = await supabase
    .from("organization_member_roles")
    .select("role")
    .eq("user_id", user.id);
  if (roleError || !(roleRows ?? []).some((row) => EDIT_ROLES.includes(String(row.role)))) {
    return { error: "Seu perfil não pode editar paradas de viagem." as const };
  }

  const { data: trip, error: tripError } = await supabase
    .from("trips").select("id").eq("id", tripId).maybeSingle();
  if (tripError || !trip) return { error: "Viagem não encontrada ou sem acesso." as const };

  return { supabase, error: null };
}

export async function addTripStop(_previous: TripActionState, formData: FormData): Promise<TripActionState> {
  const tripId = text(formData.get("trip_id"));
  const orderStopId = text(formData.get("order_stop_id"));
  if (!UUID.test(orderStopId)) return { error: "Selecione uma tarefa válida.", success: null };

  const auth = await authorizeTrip(tripId);
  if (auth.error) return { error: auth.error, success: null };

  const { error } = await auth.supabase.rpc("add_order_stop_to_trip", {
    p_trip_id: tripId, p_order_stop_id: orderStopId,
  });
  if (error) return { error: errorMessage(error.message), success: null };

  revalidatePath("/painel/viagens/" + tripId);
  revalidatePath("/painel");
  return { error: null, success: "Parada adicionada à viagem." };
}

export async function removeTripStop(_previous: TripActionState, formData: FormData): Promise<TripActionState> {
  const tripId = text(formData.get("trip_id"));
  const tripStopId = text(formData.get("trip_stop_id"));
  const reason = text(formData.get("reason"));
  if (!UUID.test(tripStopId)) return { error: "Parada inválida.", success: null };
  if (!reason || reason.length > 500) return { error: "Informe o motivo da retirada (até 500 caracteres).", success: null };

  const auth = await authorizeTrip(tripId);
  if (auth.error) return { error: auth.error, success: null };

  const { error } = await auth.supabase.rpc("remove_pending_trip_stop", {
    p_trip_id: tripId, p_trip_stop_id: tripStopId, p_reason: reason,
  });
  if (error) return { error: errorMessage(error.message), success: null };

  revalidatePath("/painel/viagens/" + tripId);
  revalidatePath("/painel");
  return { error: null, success: "Parada retirada e devolvida à fila de tarefas." };
}

export async function reorderTripStops(_previous: TripActionState, formData: FormData): Promise<TripActionState> {
  const tripId = text(formData.get("trip_id"));
  const movingStopId = text(formData.get("moving_stop_id"));
  const direction = text(formData.get("direction"));
  const reason = text(formData.get("reason"));
  const orderedStopIds = formData.getAll("ordered_stop_ids").map((value) => String(value));

  if (!UUID.test(movingStopId) || orderedStopIds.some((id) => !UUID.test(id))) {
    return { error: "A sequência contém uma parada inválida.", success: null };
  }
  if (direction !== "up" && direction !== "down") return { error: "Movimento de sequência inválido.", success: null };
  if (!reason || reason.length > 500) return { error: "Informe o motivo da reordenação (até 500 caracteres).", success: null };

  const currentIndex = orderedStopIds.indexOf(movingStopId);
  const targetIndex = currentIndex + (direction === "up" ? -1 : 1);
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedStopIds.length) {
    return { error: "Esta parada já está no limite da sequência.", success: null };
  }
  [orderedStopIds[currentIndex], orderedStopIds[targetIndex]] = [orderedStopIds[targetIndex], orderedStopIds[currentIndex]];

  const auth = await authorizeTrip(tripId);
  if (auth.error) return { error: auth.error, success: null };

  const { error } = await auth.supabase.rpc("reorder_unstarted_trip_stops", {
    p_trip_id: tripId, p_ordered_stop_ids: orderedStopIds, p_reason: reason,
  });
  if (error) return { error: errorMessage(error.message), success: null };

  revalidatePath("/painel/viagens/" + tripId);
  revalidatePath("/painel");
  return { error: null, success: "Sequência da viagem atualizada." };
}





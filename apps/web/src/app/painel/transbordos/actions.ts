"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../lib/supabase/database.types";
import { createClient } from "../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../lib/supabase/organization-roles";

const uuid = /^[0-9a-f-]{36}$/i;

async function authorizedStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { roles } = await getCurrentOrganizationRoles(supabase, user.id);
  if (!roles.some((role) => ["admin", "manager", "dispatcher", "support"].includes(role))) return null;
  return supabase;
}

export async function requestCargoTransfer(formData: FormData): Promise<{ error?: string; success?: string }> {
  const sourceTripId = String(formData.get("sourceTripId") ?? "");
  const destinationTripId = String(formData.get("destinationTripId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const details = String(formData.get("details") ?? "").trim();
  const packageCodes = String(formData.get("packageCodes") ?? "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  if (!uuid.test(sourceTripId) || !uuid.test(destinationTripId) || sourceTripId === destinationTripId || packageCodes.length < 1 || packageCodes.length > 100 || details.length < 5) return { error: "Confira as viagens, os códigos de volume e os detalhes." };
  const supabase = await authorizedStaff();
  if (!supabase) return { error: "Seu usuário não tem acesso para solicitar transbordos." };
  const db = supabase as unknown as SupabaseClient<Database>;
  const { data: packages } = await db.from("packages").select("id, package_code").in("package_code", packageCodes);
  if (!packages || packages.length !== new Set(packageCodes).size) return { error: "Um ou mais códigos de volume não foram encontrados nesta empresa." };
  const result = await db.rpc("request_cargo_transfer", {
    p_source_trip_id: sourceTripId,
    p_destination_trip_id: destinationTripId,
    p_package_ids: packages.map((p: { id: string }) => p.id),
    p_reason: reason,
    p_details: details,
  });
  if (result.error) return { error: "A viagem, o volume ou o status não permite este transbordo. Confira os dados e tente novamente." };
  revalidatePath("/painel/transbordos");
  return { success: "Solicitação encaminhada para autorização do suporte." };
}

export async function approveCargoTransfer(transferId: string): Promise<{ token?: string; error?: string }> {
  if (!uuid.test(transferId)) return { error: "Solicitação inválida." };
  const supabase = await authorizedStaff();
  if (!supabase) return { error: "Apenas suporte, gestor ou administrador pode autorizar." };
  const db = supabase as unknown as SupabaseClient<Database>;
  const { data, error } = await db.rpc("approve_cargo_transfer", { p_transfer_id: transferId });
  if (error || typeof data !== "string") return { error: "Não foi possível autorizar. Atualize a lista e confira se o pedido ainda está pendente." };
  revalidatePath("/painel/transbordos");
  return { token: data };
}

export async function rejectCargoTransfer(formData: FormData): Promise<void> {
  const transferId = String(formData.get("transferId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!uuid.test(transferId) || note.length < 3) return;
  const supabase = await authorizedStaff();
  if (!supabase) return;
  const db = supabase as unknown as SupabaseClient<Database>;
  const { error } = await db.rpc("reject_cargo_transfer", { p_transfer_id: transferId, p_note: note });
  if (!error) revalidatePath("/painel/transbordos");
}





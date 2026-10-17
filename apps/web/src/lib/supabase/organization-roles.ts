import type { createClient } from "./server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function getCurrentOrganizationRoles(supabase: ServerSupabaseClient, userId: string) {
  const { data: organizationId, error: organizationError } = await supabase.rpc("current_organization_id");
  if (organizationError || typeof organizationId !== "string") {
    return { organizationId: null, roles: [] as string[], error: organizationError ?? new Error("organization_required") };
  }

  const { data, error } = await supabase
    .from("organization_member_roles")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  return { organizationId, roles: (data ?? []).map(({ role }) => String(role)), error };
}

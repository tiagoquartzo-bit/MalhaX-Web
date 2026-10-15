import type { createClient } from "../supabase/server";

export const BACKOFFICE_ROLES = ["admin", "manager", "dispatcher", "support", "finance"] as const;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type OrganizationAccess = {
  organizationId: string | null;
  roles: string[];
  loaded: boolean;
};

/** Loads roles only for the authenticated user's active organization. */
export async function getOrganizationAccess(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<OrganizationAccess> {
  const { data: organizationId, error: organizationError } = await supabase.rpc("current_organization_id");

  if (organizationError || typeof organizationId !== "string") {
    return { organizationId: null, roles: [], loaded: false };
  }

  const { data: roleRows, error: rolesError } = await supabase
    .from("organization_member_roles")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  if (rolesError) {
    return { organizationId, roles: [], loaded: false };
  }

  return {
    organizationId,
    roles: (roleRows ?? []).map(({ role }) => String(role)),
    loaded: true,
  };
}

export function hasBackofficeAccess(roles: string[]): boolean {
  return roles.some((role) => BACKOFFICE_ROLES.includes(role as (typeof BACKOFFICE_ROLES)[number]));
}

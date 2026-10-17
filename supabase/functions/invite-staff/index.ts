import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const INVITABLE_ROLES = new Set(["manager", "dispatcher", "support", "finance"]);

type StaffRole = "manager" | "dispatcher" | "support" | "finance";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });

  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json(401, { error: "not_authenticated" });

  let body: { email?: unknown; full_name?: unknown; phone?: unknown; role?: unknown };
  try { body = await request.json(); } catch { return json(400, { error: "invalid_json" }); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const role = typeof body.role === "string" ? body.role : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(400, { error: "invalid_email" });
  if (fullName.split(/\s+/).filter(Boolean).length < 2 || fullName.length > 120 || phone.length > 32) return json(400, { error: "invalid_staff_data" });
  if (!INVITABLE_ROLES.has(role)) return json(400, { error: "invalid_staff_role" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appUrl = Deno.env.get("MALHAX_APP_URL");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !appUrl) return json(503, { error: "invitation_service_not_configured" });

  const caller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: authData, error: authError } = await caller.auth.getUser(bearer);
  if (authError || !authData.user) return json(401, { error: "not_authenticated" });

  const { data: organizationId, error: orgError } = await caller.rpc("current_organization_id");
  if (orgError || typeof organizationId !== "string") return json(403, { error: "organization_required" });

  const { data: isAdmin, error: adminRoleError } = await caller.rpc("has_org_role", {
    _organization_id: organizationId,
    _roles: ["admin"],
  });
  const { data: isManager, error: managerRoleError } = await caller.rpc("has_org_role", {
    _organization_id: organizationId,
    _roles: ["manager"],
  });
  if (adminRoleError || managerRoleError || (isAdmin !== true && isManager !== true)) return json(403, { error: "forbidden" });
  if (isManager !== true && isAdmin !== true) return json(403, { error: "forbidden" });
  if (isAdmin !== true && role !== "dispatcher" && role !== "support") return json(403, { error: "role_escalation_denied" });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: organization, error: organizationError } = await admin.from("organizations")
    .select("id").eq("id", organizationId).eq("status", "active").single();
  if (organizationError || !organization) return json(503, { error: "organization_unavailable" });

  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, phone: phone || null },
    redirectTo: new URL("/auth/confirm", appUrl).toString(),
  });
  if (inviteError || !inviteData.user) return json(400, { error: "invite_not_sent" });

  const { error: provisionError } = await admin.rpc("provision_invited_staff", {
    p_organization_id: organization.id,
    p_user_id: inviteData.user.id,
    p_actor_user_id: authData.user.id,
    p_role: role as StaffRole,
  });
  if (provisionError) {
    console.error("staff_invite_provision_failed", { userId: inviteData.user.id, role, code: provisionError.code });
    const { error: rollbackError } = await admin.auth.admin.deleteUser(inviteData.user.id);
    if (rollbackError) {
      console.error("staff_invite_rollback_failed", { userId: inviteData.user.id, code: rollbackError.code });
      return json(500, { error: "invite_provisioning_failed" });
    }
    return json(500, { error: "invite_rolled_back" });
  }
  return json(202, { status: "invitation_sent", role });
});


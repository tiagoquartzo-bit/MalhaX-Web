import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authorization = request.headers.get("Authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json(401, { error: "not_authenticated" });

  let body: { email?: unknown; full_name?: unknown; phone?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json(400, { error: "invalid_email" });
  }
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  if (nameParts.length < 2 || fullName.length > 120 || phone.length > 32) {
    return json(400, { error: "invalid_driver_data" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appUrl = Deno.env.get("MALHAX_APP_URL");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !appUrl) {
    return json(503, { error: "invitation_service_not_configured" });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser(bearer);
  if (authError || !authData.user) return json(401, { error: "not_authenticated" });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: organizationId, error: organizationMembershipError } = await callerClient.rpc("current_organization_id");
  if (organizationMembershipError || typeof organizationId !== "string") {
    return json(403, { error: "organization_required" });
  }
  const { data: organization, error: organizationError } = await adminClient
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .eq("status", "active")
    .single();
  if (organizationError || !organization) return json(503, { error: "organization_unavailable" });

  const { data: canInvite, error: permissionError } = await callerClient.rpc("has_org_role", {
    _organization_id: organization.id,
    _roles: ["admin", "manager", "support"],
  });
  if (permissionError || canInvite !== true) return json(403, { error: "forbidden" });

  const redirectTo = new URL("/auth/confirm", appUrl).toString();
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, phone: phone || null },
    redirectTo,
  });
  if (inviteError || !inviteData.user) {
    const code = inviteError?.code?.toLowerCase() ?? "";
    const message = inviteError?.message?.toLowerCase() ?? "";
    if (
      code.includes("email_exists") ||
      code.includes("already_registered") ||
      code.includes("user_already_exists") ||
      message.includes("already registered") ||
      message.includes("already exists")
    ) {
      return json(409, { error: "existing_account" });
    }
    return json(400, { error: "invite_not_sent" });
  }

  const { data: driverId, error: provisionError } = await adminClient.rpc("provision_invited_driver", {
    p_organization_id: organization.id,
    p_user_id: inviteData.user.id,
    p_actor_user_id: authData.user.id,
  });
  if (provisionError || !driverId) {
    console.error("driver_invite_provision_failed", {
      userId: inviteData.user.id,
      code: provisionError?.code,
    });
    return json(500, { error: "invite_provisioning_failed" });
  }

  return json(202, { status: "invitation_sent", driver_id: driverId });
});


"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../lib/supabase/organization-roles";

export async function replySupportMessage(formData: FormData): Promise<void> {
  const threadId = String(formData.get("threadId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(threadId) || body.length < 1 || body.length > 2000) return;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { roles } = await getCurrentOrganizationRoles(supabase, user.id);
  if (!roles.some((role) => ["admin", "manager", "dispatcher", "support"].includes(role))) return;

  const { error } = await supabase.from("support_messages").insert({ thread_id: threadId, sender_user_id: user.id, body });
  if (!error) revalidatePath("/painel/suporte");
}

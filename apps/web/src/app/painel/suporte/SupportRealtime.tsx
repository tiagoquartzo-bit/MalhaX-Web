"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "../../../lib/supabase/config";

export function SupportRealtime() {
  const router = useRouter();
  useEffect(() => {
    const { url, anonKey } = getSupabaseConfig();
    const client = createBrowserClient(url, anonKey);
    const channel = client.channel("support-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, () => router.refresh())
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [router]);
  return null;
}

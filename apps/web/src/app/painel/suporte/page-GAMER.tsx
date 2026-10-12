import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { replySupportMessage } from "./actions";
import { SupportRealtime } from "./SupportRealtime";
import { DriverContact } from "../DriverContact";

type Thread = { id: string; subject: string; status: string; trip_id: string | null; updated_at: string; driver_id: string; drivers: { profiles: { full_name: string; phone: string | null } | null } | null };
type Message = { id: string; thread_id: string; sender_user_id: string; body: string; created_at: string; profiles: { full_name: string } | null };
const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default async function SupportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roleRows } = await supabase.from("organization_member_roles").select("role").eq("user_id", user.id);
  if (!(roleRows ?? []).some((row) => ["admin", "manager", "dispatcher", "support"].includes(row.role))) redirect("/painel");

  const { data: rows, error } = await supabase.from("support_threads")
    .select("id, subject, status, trip_id, updated_at, driver_id, drivers(profiles(full_name, phone))")
    .order("updated_at", { ascending: false }).limit(100).overrideTypes<Thread[], { merge: false }>();
  const threads = rows ?? [];
  const { data: messageRows } = threads.length ? await supabase.from("support_messages")
    .select("id, thread_id, sender_user_id, body, created_at, profiles(full_name)")
    .in("thread_id", threads.map((thread) => thread.id)).order("created_at")
    .overrideTypes<Message[], { merge: false }>() : { data: [] as Message[] };
  const messagesByThread = new Map<string, Message[]>();
  for (const message of messageRows ?? []) messagesByThread.set(message.thread_id, [...(messagesByThread.get(message.thread_id) ?? []), message]);

  return <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
    <SupportRealtime />
    <p><Link href="/painel">← Painel</Link></p>
    <header style={{ margin: "24px 0" }}><p style={{ color: "#00aeb8", fontWeight: 700 }}>MALHAX · SUPORTE</p><h1>Atendimentos dos motoristas</h1><p>Mensagens vinculadas às contas da mesma empresa. As respostas novas chegam em tempo real.</p></header>
    {error ? <p role="alert">Não foi possível carregar os atendimentos. Verifique as permissões do banco.</p> : null}
    {!threads.length && !error ? <p>Nenhum atendimento recebido.</p> : null}
    <section style={{ display: "grid", gap: 16 }}>
      {threads.map((thread) => <article key={thread.id} style={{ border: "1px solid #d7dde5", borderRadius: 12, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}><div><h2 style={{ margin: 0 }}>{thread.subject}</h2><p style={{ margin: "6px 0", color: "#526174" }}>{thread.drivers?.profiles?.full_name ?? "Motorista"} · {thread.trip_id ? <Link href={`/painel/viagens/${thread.trip_id}`}>Viagem vinculada</Link> : "Atendimento geral"}</p><DriverContact name={thread.drivers?.profiles?.full_name ?? "Motorista"} phone={thread.drivers?.profiles?.phone ?? null} /></div><span>{thread.status === "open" ? "Aberto" : "Encerrado"} · {fmt.format(new Date(thread.updated_at))}</span></div>
        <div style={{ display: "grid", gap: 8, margin: "16px 0" }}>{(messagesByThread.get(thread.id) ?? []).map((message) => <div key={message.id} style={{ padding: 12, background: message.sender_user_id === user.id ? "#eef8fa" : "#f4f6f9", borderRadius: 9 }}><strong>{message.profiles?.full_name ?? (message.sender_user_id === user.id ? "Equipe" : "Motorista")}</strong><small style={{ marginLeft: 10, color: "#68778b" }}>{fmt.format(new Date(message.created_at))}</small><p style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{message.body}</p></div>)}</div>
        {thread.status === "open" ? <form action={replySupportMessage} style={{ display: "flex", gap: 8 }}><input type="hidden" name="threadId" value={thread.id} /><textarea name="body" required maxLength={2000} placeholder="Responder ao motorista" style={{ flex: 1, minHeight: 66, padding: 10, borderRadius: 8, border: "1px solid #c7d0dc" }} /><button type="submit" style={{ padding: "0 18px", border: 0, borderRadius: 8, background: "#00c2cb", fontWeight: 700 }}>Responder</button></form> : null}
      </article>)}
    </section>
  </main>;
}

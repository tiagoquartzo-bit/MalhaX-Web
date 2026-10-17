import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { getCurrentOrganizationRoles } from "../../../lib/supabase/organization-roles";
import { replySupportMessage } from "./actions";
import { SupportRealtime } from "./SupportRealtime";
import { DriverContact } from "../DriverContact";
import styles from "./support.module.css";

type Thread = { id: string; subject: string; status: string; trip_id: string | null; updated_at: string; driver_id: string; drivers: { profiles: { full_name: string; phone: string | null } | null } | null };
type Message = { id: string; thread_id: string; sender_user_id: string; body: string; created_at: string; profiles: { full_name: string } | null };
const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default async function SupportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { roles } = await getCurrentOrganizationRoles(supabase, user.id);
  if (!roles.some((role) => ["admin", "manager", "dispatcher", "support"].includes(role))) redirect("/painel");

  const { data: rows, error } = await supabase.from("support_threads")
    .select("id, subject, status, trip_id, updated_at, driver_id, drivers!support_threads_driver_id_fkey(profiles!drivers_profile_id_fkey(full_name, phone))")
    .order("updated_at", { ascending: false }).limit(100).overrideTypes<Thread[], { merge: false }>();
  const threads = rows ?? [];
  const { data: messageRows } = threads.length ? await supabase.from("support_messages")
    .select("id, thread_id, sender_user_id, body, created_at, profiles(full_name)")
    .in("thread_id", threads.map((thread) => thread.id)).order("created_at")
    .overrideTypes<Message[], { merge: false }>() : { data: [] as Message[] };
  const messagesByThread = new Map<string, Message[]>();
  for (const message of messageRows ?? []) messagesByThread.set(message.thread_id, [...(messagesByThread.get(message.thread_id) ?? []), message]);

  return <main className={styles.page}>
    <SupportRealtime />
    <Link href="/painel" className={styles.backLink}>← Voltar à operação</Link>
    <header className={styles.heading}>
      <p className={styles.eyebrow}><span aria-hidden="true" /> MalhaX · Suporte</p>
      <h1>Atendimentos dos motoristas</h1>
      <p>Mensagens ligadas à operação. As respostas novas chegam em tempo real.</p>
    </header>
    {error ? <p role="alert" className={styles.error}>Não foi possível carregar os atendimentos. Verifique as permissões do banco.</p> : null}
    {!threads.length && !error ? <p className={styles.empty}>Nenhum atendimento recebido.</p> : null}
    <section className={styles.threadList} aria-label="Conversas com motoristas">
      {threads.map((thread) => <article key={thread.id} className={styles.thread}>
        <div className={styles.threadHeader}>
          <div className={styles.threadIdentity}>
            <h2>{thread.subject}</h2>
            <p className={styles.driverLine}>
              {thread.drivers?.profiles?.full_name ?? "Motorista"}
              <span aria-hidden="true">·</span>
              {thread.trip_id ? <Link href={`/painel/viagens/${thread.trip_id}`}>Viagem vinculada</Link> : "Atendimento geral"}
            </p>
            <DriverContact name={thread.drivers?.profiles?.full_name ?? "Motorista"} phone={thread.drivers?.profiles?.phone ?? null} />
          </div>
          <span className={thread.status === "open" ? styles.statusOpen : styles.statusClosed}>
            <span aria-hidden="true" />{thread.status === "open" ? "Aberto" : "Encerrado"} · {fmt.format(new Date(thread.updated_at))}
          </span>
        </div>
        <div className={styles.messages} aria-label="Mensagens da conversa">
          {(messagesByThread.get(thread.id) ?? []).map((message) => {
            const fromTeam = message.sender_user_id === user.id;
            return <div key={message.id} className={`${styles.message} ${fromTeam ? styles.messageFromTeam : styles.messageFromDriver}`}>
              <div className={styles.messageMeta}>
                <strong>{message.profiles?.full_name ?? (fromTeam ? "Equipe MalhaX" : "Motorista")}</strong>
                <time dateTime={message.created_at}>{fmt.format(new Date(message.created_at))}</time>
              </div>
              <p>{message.body}</p>
            </div>;
          })}
        </div>
        {thread.status === "open" ? <form action={replySupportMessage} className={styles.replyForm}>
          <input type="hidden" name="threadId" value={thread.id} />
          <textarea name="body" required maxLength={2000} placeholder="Responder ao motorista" aria-label="Responder ao motorista" />
          <button type="submit">Responder</button>
        </form> : null}
      </article>)}
    </section>
  </main>;
}

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";
import type { DriverTrip } from "../lib/driver-api";

type Thread = { id: string; subject: string; status: "open" | "closed"; trip_id: string | null; updated_at: string };
type Message = { id: string; body: string; sender_user_id: string; created_at: string };

export function SupportScreen({ trips, tripId, onBack }: { trips: DriverTrip[]; tripId: string | null; onBack: () => void }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [guided, setGuided] = useState(true);

  const helpTopics = [
    { label: "Entrega ou coleta", subject: "Ajuda com entrega ou coleta", prompt: "Preciso de ajuda com uma entrega ou coleta. " },
    { label: "Endereço ou destinatário", subject: "Problema com endereço ou destinatário", prompt: "Estou com um problema no endereço ou não encontrei o destinatário. " },
    { label: "Ocorrência na rota", subject: "Ocorrência durante a rota", prompt: "Preciso comunicar uma ocorrência durante a rota. " },
    { label: "App ou GPS", subject: "Ajuda com o aplicativo ou GPS", prompt: "Preciso de ajuda com o aplicativo ou com a localização GPS. " },
    { label: "Outro assunto", subject: "Atendimento ao motorista", prompt: "Preciso falar com a equipe de suporte. " },
  ];

  const refreshThreads = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setMyUserId(user?.id ?? null);
    const { data, error: queryError } = await supabase.from("support_threads")
      .select("id, subject, status, trip_id, updated_at").order("updated_at", { ascending: false });
    if (queryError) throw queryError;
    setThreads((data ?? []) as Thread[]);
  }, []);

  const refreshMessages = useCallback(async (threadId: string) => {
    const { data, error: queryError } = await supabase.from("support_messages")
      .select("id, body, sender_user_id, created_at").eq("thread_id", threadId).order("created_at");
    if (queryError) throw queryError;
    setMessages((data ?? []) as Message[]);
  }, []);

  useEffect(() => { void refreshThreads().catch(() => setError("Não foi possível carregar os atendimentos. Tente atualizar.")); }, [refreshThreads]);
  useEffect(() => { if (selected) void refreshMessages(selected.id).catch(() => setError("Não foi possível carregar as mensagens.")); }, [selected, refreshMessages]);
  useEffect(() => {
    if (!selected) return;
    const channel = supabase.channel(`driver-support-${selected.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `thread_id=eq.${selected.id}` }, () => {
        void refreshMessages(selected.id).catch(() => setError("A mensagem chegou, mas não foi possível atualizar a conversa."));
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [selected, refreshMessages]);

  async function createThread() {
    const cleanSubject = subject.trim(); const cleanBody = body.trim();
    if (cleanSubject.length < 3 || !cleanBody) { setError("Informe o assunto e explique como a equipe pode ajudar."); return; }
    setBusy(true); setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("open_driver_support_thread", { p_trip_id: tripId, p_subject: cleanSubject, p_body: cleanBody });
      if (rpcError) throw rpcError;
      setSubject(""); setBody("");
      await refreshThreads();
      const newThread = threads.find((thread) => thread.id === data) ?? { id: data, subject: cleanSubject, status: "open" as const, trip_id: tripId, updated_at: new Date().toISOString() };
      setSelected(newThread);
    } catch { setError("Não foi possível enviar. Verifique a conexão e tente novamente."); }
    finally { setBusy(false); }
  }

  async function sendReply() {
    const cleanBody = body.trim();
    if (!selected || !cleanBody || !myUserId) return;
    setBusy(true); setError(null);
    try {
      const { error: sendError } = await supabase.from("support_messages").insert({ thread_id: selected.id, sender_user_id: myUserId, body: cleanBody });
      if (sendError) throw sendError;
      setBody(""); await Promise.all([refreshMessages(selected.id), refreshThreads()]);
    } catch { setError("Não foi possível enviar a mensagem. Ela não foi registrada no servidor; tente novamente."); }
    finally { setBusy(false); }
  }

  return <View style={styles.page}>
    <View style={styles.header}><Pressable onPress={selected ? () => setSelected(null) : onBack} style={styles.back}><Text style={styles.backText}>‹ Voltar</Text></Pressable><Text style={styles.title}>Suporte da operação</Text><Text style={styles.subtitle}>Fale com a equipe. As mensagens ficam registradas nesta conta.</Text></View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {selected ? <>
      <View style={styles.threadTitle}><Text style={styles.threadHeading}>{selected.subject}</Text><Text style={styles.meta}>{selected.trip_id ? `Viagem vinculada · ${selected.trip_id.slice(0, 8)}` : "Atendimento geral"} · {selected.status === "open" ? "Aberto" : "Encerrado"}</Text></View>
      <ScrollView style={styles.messages} contentContainerStyle={styles.messageList}>
        {messages.map((message) => <View key={message.id} style={[styles.bubble, message.sender_user_id === myUserId ? styles.mine : styles.theirs]}><Text style={styles.messageText}>{message.body}</Text><Text style={styles.messageTime}>{new Date(message.created_at).toLocaleString("pt-BR")}</Text></View>)}
        {!messages.length ? <ActivityIndicator color="#38e1ff" /> : null}
      </ScrollView>
      {selected.status === "open" ? <View style={styles.composer}><TextInput multiline maxLength={2000} onChangeText={setBody} placeholder="Escreva sua mensagem…" placeholderTextColor="#75839a" style={styles.input} value={body} /><Pressable disabled={busy || !body.trim()} onPress={() => void sendReply()} style={styles.send}><Text style={styles.sendText}>{busy ? "Enviando…" : "Enviar"}</Text></Pressable></View> : <Text style={styles.closed}>Este atendimento foi encerrado. Abra um novo atendimento se precisar.</Text>}
    </> : <ScrollView contentContainerStyle={styles.content}>
      {guided ? <View style={styles.botCard}><View style={styles.botHeading}><View style={styles.botAvatar}><Text style={styles.botAvatarText}>M</Text></View><View style={{ flex: 1 }}><Text style={styles.botTitle}>Assistente MalhaX</Text><Text style={styles.botStatus}>Triagem rápida · suporte humano disponível</Text></View></View><Text style={styles.botIntro}>Olá! Selecione o assunto para abrir uma conversa com a equipe. Você poderá explicar o que aconteceu antes de enviar.</Text><View style={styles.topicList}>{helpTopics.map((topic) => <Pressable key={topic.label} accessibilityRole="button" onPress={() => { setSubject(topic.subject); setBody(topic.prompt); setGuided(false); setError(null); }} style={styles.topic}><Text style={styles.topicText}>{topic.label}</Text><Text style={styles.topicArrow}>›</Text></Pressable>)}</View></View> : <Pressable accessibilityRole="button" onPress={() => setGuided(true)} style={styles.backToTopics}><Text style={styles.backToTopicsText}>‹ Escolher outro assunto</Text></Pressable>}
      <Text style={styles.sectionTitle}>Novo atendimento</Text>
      <Text style={styles.label}>Assunto</Text><TextInput maxLength={120} onChangeText={setSubject} placeholder="Ex.: problema no endereço da parada" placeholderTextColor="#75839a" style={styles.input} value={subject} />
      <Text style={styles.label}>Mensagem</Text><TextInput multiline maxLength={2000} onChangeText={setBody} placeholder="Conte o que aconteceu e onde precisa de ajuda." placeholderTextColor="#75839a" style={[styles.input, styles.multiline]} value={body} />
      <Pressable disabled={busy} onPress={() => void createThread()} style={styles.send}><Text style={styles.sendText}>{busy ? "Enviando…" : "Enviar ao suporte"}</Text></Pressable>
      <Text style={styles.sectionTitle}>Meus atendimentos</Text>
      {!threads.length ? <Text style={styles.empty}>Nenhum atendimento aberto. Se precisar, escreva para a equipe acima.</Text> : threads.map((thread) => <Pressable key={thread.id} onPress={() => setSelected(thread)} style={styles.thread}><Text style={styles.threadHeading}>{thread.subject}</Text><Text style={styles.meta}>{thread.status === "open" ? "Aberto" : "Encerrado"} · atualizado {new Date(thread.updated_at).toLocaleString("pt-BR")}</Text></Pressable>)}
      <Text style={styles.meta}>{trips.length} viagem(ns) disponíveis na sua conta.</Text>
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: "#070e1a", paddingTop: 20 }, header: { paddingHorizontal: 20, paddingBottom: 14 }, back: { alignSelf: "flex-start", paddingVertical: 8 }, backText: { color: "#38e1ff", fontWeight: "700" }, title: { color: "#f5f8fc", fontSize: 24, fontWeight: "800" }, subtitle: { color: "#aab6c7", marginTop: 5, lineHeight: 20 }, content: { padding: 18, paddingBottom: 40 }, botCard: { padding: 14, borderRadius: 15, borderWidth: 1, borderColor: "#1d5260", backgroundColor: "#0c1d2b" }, botHeading: { flexDirection: "row", alignItems: "center", gap: 10 }, botAvatar: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#123e4a" }, botAvatarText: { color: "#38e1ff", fontWeight: "900" }, botTitle: { color: "#f5f8fc", fontSize: 14, fontWeight: "800" }, botStatus: { color: "#7fd7c2", fontSize: 11, marginTop: 3 }, botIntro: { color: "#aab6c7", fontSize: 12, lineHeight: 18, marginTop: 11 }, topicList: { gap: 7, marginTop: 12 }, topic: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#263c50", backgroundColor: "#101f30" }, topicText: { color: "#d9e3ee", fontSize: 12, fontWeight: "700" }, topicArrow: { color: "#38e1ff", fontSize: 20 }, backToTopics: { alignSelf: "flex-start", paddingVertical: 8 }, backToTopicsText: { color: "#38e1ff", fontSize: 12, fontWeight: "700" }, sectionTitle: { color: "#f5f8fc", fontSize: 17, fontWeight: "800", marginTop: 14, marginBottom: 10 }, label: { color: "#d8e1ed", marginTop: 12, marginBottom: 7, fontWeight: "700" }, input: { minHeight: 48, borderWidth: 1, borderColor: "#26364c", borderRadius: 11, backgroundColor: "#0d1929", color: "#f5f8fc", paddingHorizontal: 12, paddingVertical: 10 }, multiline: { minHeight: 100, textAlignVertical: "top" }, send: { minHeight: 46, backgroundColor: "#00c2cb", borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 12, paddingHorizontal: 16 }, sendText: { color: "#07101e", fontWeight: "800" }, thread: { padding: 14, backgroundColor: "#0d1929", borderWidth: 1, borderColor: "#24344a", borderRadius: 12, marginBottom: 9 }, threadTitle: { paddingHorizontal: 18, paddingBottom: 8 }, threadHeading: { color: "#f5f8fc", fontWeight: "800", fontSize: 15 }, meta: { color: "#8d9bb0", fontSize: 12, marginTop: 5 }, messages: { flex: 1 }, messageList: { padding: 16, gap: 10 }, bubble: { maxWidth: "88%", borderRadius: 13, padding: 12 }, mine: { alignSelf: "flex-end", backgroundColor: "#123647" }, theirs: { alignSelf: "flex-start", backgroundColor: "#172437" }, messageText: { color: "#f5f8fc", fontSize: 14, lineHeight: 20 }, messageTime: { color: "#91a0b3", fontSize: 10, marginTop: 6, textAlign: "right" }, composer: { padding: 12, borderTopWidth: 1, borderColor: "#24344a" }, error: { color: "#ffb4aa", paddingHorizontal: 18, paddingBottom: 8 }, empty: { color: "#aab6c7", lineHeight: 21, paddingVertical: 10 }, closed: { color: "#f4ce80", padding: 16 } });

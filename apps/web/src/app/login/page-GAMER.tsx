"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";

import { signIn, type LoginState } from "./actions";
import styles from "./login.module.css";

const initialState: LoginState = { error: null };

function LogisticsIllustration() {
  return (
    <figure className={styles.logisticsVisual}>
      <Image
        className={styles.logisticsImage}
        src="/malhax-logistica-estoque.png"
        width={1536}
        height={1024}
        alt="Equipe separando pedidos no estoque enquanto veículos aguardam a expedição para entrega."
        priority
      />
      <figcaption>ESTOQUE · EXPEDIÇÃO · ENTREGA</figcaption>
    </figure>
  );
}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const hasSupabaseConfig = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return (
    <main className={styles.loginPage}>
      <div className={styles.ambientGlow} aria-hidden="true" />
      <header className={styles.topbar}>
        <Link href="/login" className={styles.brand} aria-label="MalhaX, início">
          <Image src="/malhax-symbol.svg" width={52} height={52} alt="" priority />
          <span><strong>Malha<span>X</span></strong><small>LOGÍSTICA E TECNOLOGIA</small></span>
        </Link>
        <div className={styles.secureLabel}><span aria-hidden="true">◈</span> Acesso seguro à plataforma</div>
      </header>

      <div className={styles.loginLayout}>
        <section className={styles.brandPanel} aria-labelledby="welcome-title">
          <p className={styles.eyebrow}><span /> MALHAX · CENTRAL DE OPERAÇÕES</p>
          <h1 id="welcome-title">Sua operação,<br /><span>em uma só malha.</span></h1>
          <p className={styles.brandIntro}>Acompanhe coletas, entregas e motoristas com mais clareza em cada etapa do percurso.</p>
          <LogisticsIllustration />
        </section>

        <section className={styles.formPanel} aria-labelledby="login-title">
          <div className={styles.formHeading}>
            <span className={styles.formIcon} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.5 2.9 8.5 7 10 4.1-1.5 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg></span>
            <p className={styles.eyebrow}>BEM-VINDO DE VOLTA</p>
            <h2 id="login-title">Acesse sua conta</h2>
            <p>Entre com seu e-mail e senha para continuar.</p>
          </div>

          {!hasSupabaseConfig ? <div className={styles.configNotice} role="status"><strong>Ambiente ainda não configurado</strong><span>Configure a URL e a chave pública do Supabase em <code>apps/web/.env.local</code> para habilitar o acesso.</span></div> : null}

          <form action={formAction} className={styles.loginForm}>
            <label htmlFor="email">E-mail corporativo</label>
            <div className={styles.inputWrap}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg><input id="email" name="email" type="email" autoComplete="email" placeholder="voce@empresa.com.br" required /></div>

            <div className={styles.passwordLabel}><label htmlFor="password">Senha</label><span>Use sua senha cadastrada</span></div>
            <div className={styles.inputWrap}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Digite sua senha" required /><button className={styles.showPassword} type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? "Ocultar" : "Mostrar"}</button></div>

            {state.error ? <p className={styles.errorMessage} role="alert">{state.error}</p> : null}
            <button className={styles.submitButton} type="submit" disabled={pending || !hasSupabaseConfig}>{pending ? <><span className={styles.spinner} /> Validando acesso…</> : <>Entrar na plataforma <span aria-hidden="true">→</span></>}</button>
          </form>

          <div className={styles.formDivider}><span /> <small>ACESSO RESTRITO</small> <span /></div>
          <p className={styles.accessNote}>Gestores e equipe operacional acessam o Backoffice. Motoristas usam o app MalhaX. Se não conseguir entrar, peça ajuda ao administrador da empresa.</p>
        </section>
      </div>

      <footer className={styles.footer}><span>© 2026 MalhaX · Logística e tecnologia</span><span>Plataforma de acesso controlado</span></footer>
    </main>
  );
}


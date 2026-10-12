"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { approveCargoTransfer } from "./actions";
import styles from "./transbordos.module.css";

export function ApproveTransfer({ id }: { id: string }) {
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function approve() {
    setBusy(true); setError(null); setImage(null);
    try {
      const result = await approveCargoTransfer(id);
      if (!result.token) { setError(result.error ?? "Não foi possível gerar o QR."); return; }
      setImage(await QRCode.toDataURL(result.token, { errorCorrectionLevel: "M", margin: 2, width: 260, color: { dark: "#07101e", light: "#ffffff" } }));
    } catch { setError("Falha ao emitir o QR. Atualize a tela e tente novamente."); }
    finally { setBusy(false); }
  }
  return <div className={styles.approval}>
    {!image ? <button className={styles.primaryButton} type="button" disabled={busy} onClick={() => void approve()}>{busy ? "Gerando autorização…" : "Autorizar e gerar QR"}</button> : <div className={styles.qrPanel}>
      <img src={image} alt="QR temporário para transferência de custódia" width={220} height={220} />
      <strong>QR válido por 15 minutos e para uma única leitura</strong>
      <span>Peça ao motorista de destino para ler no MalhaX. O token fica apenas nesta tela.</span>
      <button type="button" className={styles.secondaryButton} onClick={() => setImage(null)}>Fechar QR</button>
    </div>}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </div>;
}

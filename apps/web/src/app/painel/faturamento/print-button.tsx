"use client";
import ui from "../ui.module.css";
export function PrintButton() {
  return <button type="button" className={ui.buttonGhost} onClick={() => window.print()}>Imprimir / salvar PDF</button>;
}

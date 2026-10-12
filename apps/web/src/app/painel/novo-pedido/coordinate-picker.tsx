"use client";

import { useEffect, useRef, useState } from "react";
import type { CircleMarker, Map as LeafletMap } from "leaflet";

import styles from "./coordinate-picker.module.css";

type Props = {
  latitude: string;
  longitude: string;
  onSelect: (latitude: string, longitude: string) => void;
};

const CAMPO_LIMPO: [number, number] = [-23.627, -46.757];

export function CoordinatePicker({ latitude, longitude, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<CircleMarker | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!open || !mapElement.current) return;
    let active = true;
    let map: LeafletMap | null = null;

    void import("leaflet").then((L) => {
      if (!active || !mapElement.current) return;
      const parsedLat = Number(latitude.replace(",", "."));
      const parsedLng = Number(longitude.replace(",", "."));
      const hasPoint = latitude.trim() !== "" && longitude.trim() !== "" &&
        Number.isFinite(parsedLat) && Number.isFinite(parsedLng) &&
        parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180;
      const center: [number, number] = hasPoint ? [parsedLat, parsedLng] : CAMPO_LIMPO;

      map = L.map(mapElement.current, { scrollWheelZoom: true }).setView(center, hasPoint ? 17 : 14);
      mapRef.current = map;
      L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).on("tileerror", () => {
        if (active) setMessage("O mapa base não carregou. Você ainda pode informar as coordenadas manualmente.");
      }).addTo(map);

      if (hasPoint) {
        markerRef.current = L.circleMarker(center, {
          radius: 9, color: "#ffffff", weight: 3, fillColor: "#00aeb7", fillOpacity: 1,
        }).addTo(map);
      }

      map.on("click", (event) => {
        const lat = event.latlng.lat;
        const lng = event.latlng.lng;
        if (markerRef.current) markerRef.current.setLatLng(event.latlng);
        else markerRef.current = L.circleMarker(event.latlng, {
          radius: 9, color: "#ffffff", weight: 3, fillColor: "#00aeb7", fillOpacity: 1,
        }).addTo(map!);
        onSelectRef.current(lat.toFixed(6), lng.toFixed(6));
        setMessage("Ponto marcado no mapa. Confira se o pin está na entrada correta.");
      });
      window.setTimeout(() => map?.invalidateSize(), 100);
    }).catch(() => {
      if (active) setMessage("Não foi possível carregar o mapa. Confira a conexão.");
    });

    return () => {
      active = false;
      map?.off();
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [open]);

  function locateDevice() {
    if (!navigator.geolocation) {
      setMessage("Este navegador não oferece localização. Marque o ponto no mapa ou informe as coordenadas.");
      return;
    }
    setLocating(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point: [number, number] = [position.coords.latitude, position.coords.longitude];
        mapRef.current?.flyTo(point, 17);
        setMessage("Mapa centralizado no aparelho · precisão ±" + Math.round(position.coords.accuracy) + " m. Marque a entrada correta no mapa para salvar o endereço.");
        setLocating(false);
      },
      () => {
        setMessage("Não foi possível obter a localização deste dispositivo. Marque o ponto no mapa ou informe as coordenadas.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }
  return (
    <div className={styles.picker}>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={() => { setOpen((value) => !value); setMessage(""); }}>
          {open ? "Fechar mapa" : latitude && longitude ? "Ajustar ponto no mapa" : "Marcar ponto no mapa"}
        </button>
        {open ? (
          <button type="button" className={styles.secondary} onClick={locateDevice} disabled={locating}>
            {locating ? "Localizando…" : "Centralizar no GPS deste dispositivo"}
          </button>
        ) : null}
      </div>
      {open ? <div ref={mapElement} className={styles.map} aria-label="Mapa para marcar o endereço da parada" /> : null}
      {open ? <p className={styles.hint}>Clique ou toque no mapa para posicionar o pin. O ponto do mapa é uma referência do endereço; não substitui o GPS capturado pelo motorista na entrega.</p> : null}
      {message ? <p className={styles.message} role="status">{message}</p> : null}
    </div>
  );
}
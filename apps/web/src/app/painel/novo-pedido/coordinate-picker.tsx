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
  const [message, setMessage] = useState("");
  const mapElement = useRef<HTMLDivElement>(null);
  const markerRef = useRef<CircleMarker | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!open || !mapRef.current) return;
    const parsedLat = Number(latitude.replace(",", "."));
    const parsedLng = Number(longitude.replace(",", "."));
    const hasPoint = latitude.trim() !== "" && longitude.trim() !== "" &&
      Number.isFinite(parsedLat) && Number.isFinite(parsedLng) &&
      parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180;
    const map = mapRef.current;
    if (!hasPoint) {
      markerRef.current?.remove();
      markerRef.current = null;
      map.setView(CAMPO_LIMPO, 14);
      return;
    }

    void import("leaflet").then((L) => {
      if (mapRef.current !== map) return;
      const point: [number, number] = [parsedLat, parsedLng];
      if (markerRef.current) markerRef.current.setLatLng(point);
      else markerRef.current = L.circleMarker(point, {
        radius: 9, color: "#ffffff", weight: 3, fillColor: "#00aeb7", fillOpacity: 1,
      }).addTo(map);
      map.setView(point, 17);
    });
  }, [open, latitude, longitude]);

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
      L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).on("tileerror", () => {
        if (active) setMessage("O mapa não carregou. O endereço continua salvo e pode ser usado para navegar.");
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
      markerRef.current = null;
    };
  }, [open]);

  return (
    <div className={styles.picker}>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={() => { setOpen((value) => !value); setMessage(""); }}>
          {open ? "Fechar mapa" : latitude && longitude ? "Ajustar ponto de entrega/coleta" : "Conferir ponto no mapa"}
        </button>
      </div>
      {open ? <div ref={mapElement} className={styles.map} aria-label="Mapa para marcar o endereço da parada" /> : null}
      {open ? <p className={styles.hint}>Toque no local correto apenas se o endereço precisar de ajuste. O motorista seguirá a ordem da viagem e o GPS dele será capturado pelo aparelho.</p> : null}
      {message ? <p className={styles.message} role="status">{message}</p> : null}
    </div>
  );
}

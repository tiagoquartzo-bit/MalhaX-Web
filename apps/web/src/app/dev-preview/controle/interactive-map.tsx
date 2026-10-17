"use client";

import { useEffect, useRef, useState } from "react";
import type { DivIcon, Map as LeafletMap, Marker as LeafletMarker } from "leaflet";

import styles from "./control.module.css";
import { addOpenFreeMapLayer } from "../../../lib/maps/openfreemap";

type DriverPoint = { name: string; vehicle: string; status: "route" | "delayed"; lat: number; lng: number };
type SelectedPoint = { lat: number; lng: number; source: "map" | "gps"; accuracy: number | null };

const drivers: DriverPoint[] = [
  { name: "Rafael Oliveira", vehicle: "FGH-4J28", status: "route", lat: -23.6261, lng: -46.7574 },
  { name: "Marcos Santos", vehicle: "JKT-9A12", status: "delayed", lat: -23.6354, lng: -46.7668 },
  { name: "João Pereira", vehicle: "RXP-2C51", status: "route", lat: -23.6188, lng: -46.7441 },
];

export function InteractiveMap() {
  const [selected, setSelected] = useState<SelectedPoint | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState("");
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const selectionMarkerRef = useRef<LeafletMarker | null>(null);
  const selectionIconRef = useRef<DivIcon | null>(null);

  useEffect(() => {
    const element = document.getElementById("malhax-interactive-map");
    if (!element) return;

    let active = true;
    let map: LeafletMap | null = null;

    void import("leaflet").then(async (L) => {
      if (!active) return;

      map = L.map(element, { zoomControl: true, scrollWheelZoom: true }).setView([-23.627, -46.757], 14);
      mapRef.current = map;

      try {
        await addOpenFreeMapLayer(map, () => {
          if (active) setMapError("O mapa base não respondeu. As coordenadas e os marcadores GPS continuam disponíveis.");
        }, () => active);
      } catch {
        if (active) setMapError("Não foi possível carregar o mapa. As coordenadas e os marcadores GPS continuam disponíveis.");
      }
      if (!active) return;

      selectionIconRef.current = L.divIcon({
        className: "",
        html: '<span class="' + styles.selectedMarker + '"></span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const driverIcon = (status: DriverPoint["status"]) =>
        L.divIcon({
          className: "",
          html: '<span class="' + styles.driverMarker + " " +
            (status === "delayed" ? styles.driverDelayed : styles.driverOnRoute) + '"></span>',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

      for (const driver of drivers) {
        const marker = L.marker([driver.lat, driver.lng], { icon: driverIcon(driver.status) }).addTo(map);
        const tooltip = document.createElement("span");
        tooltip.textContent = driver.name + " · " + driver.vehicle;
        marker.bindTooltip(tooltip);
      }

      map.on("click", (event) => {
        const point: SelectedPoint = {
          lat: event.latlng.lat, lng: event.latlng.lng, source: "map", accuracy: null,
        };
        setSelected(point);
        setCopyState("");
        if (selectionMarkerRef.current) selectionMarkerRef.current.setLatLng(event.latlng);
        else {
          selectionMarkerRef.current = L.marker(event.latlng, { icon: selectionIconRef.current! }).addTo(map!);
        }
      });
    }).catch(() => {
      if (active) setMapError("Não foi possível carregar o mapa. Confira a conexão e o provedor configurado.");
    });

    return () => {
      active = false;
      map?.off();
      map?.remove();
      mapRef.current = null;
      selectionMarkerRef.current = null;
      selectionIconRef.current = null;
    };
  }, []);

  function locateDevice() {
    if (!navigator.geolocation) {
      setMapError("Este navegador não oferece geolocalização.");
      return;
    }
    setLocating(true);
    setMapError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point: SelectedPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          source: "gps",
          accuracy: position.coords.accuracy,
        };
        setSelected(point);
        setCopyState("");
        setLocating(false);

        void import("leaflet").then((L) => {
          const map = mapRef.current;
          if (!map) return;
          const latlng = L.latLng(point.lat, point.lng);
          map.flyTo(latlng, 17);
          if (selectionMarkerRef.current) selectionMarkerRef.current.setLatLng(latlng);
          else if (selectionIconRef.current) {
            selectionMarkerRef.current = L.marker(latlng, { icon: selectionIconRef.current }).addTo(map);
          }
        });
      },
      () => {
        setMapError("Não foi possível obter a localização. Confira a permissão do navegador.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  async function copyCoordinates() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.lat.toFixed(6) + ", " + selected.lng.toFixed(6));
      setCopyState("Coordenadas copiadas.");
    } catch {
      setCopyState("Seu navegador bloqueou a cópia automática.");
    }
  }

  return (
    <div className={styles.mapFeature}>
      <div id="malhax-interactive-map" className={styles.leafletMap} aria-label="Mapa interativo; clique para selecionar coordenadas" />
      <div className={styles.mapActions}>
        <button className={styles.mapActionButton} type="button" onClick={locateDevice} disabled={locating}>
          {locating ? "Localizando…" : "Usar localização deste dispositivo"}
        </button>
        <span>Clique ou toque no mapa para marcar um ponto</span>
      </div>
      {selected ? (
        <div className={styles.coordinatePanel} role="status">
          <div>
            <strong>{selected.source === "gps" ? "Localização GPS do dispositivo" : "Ponto selecionado no mapa"}</strong>
            <span>Lat. {selected.lat.toFixed(6)} · Long. {selected.lng.toFixed(6)}</span>
            {selected.source === "gps"
              ? <small>Precisão informada pelo aparelho: ± {Math.round(selected.accuracy ?? 0)} m</small>
              : <small>Coordenada do ponto clicado; isso não é uma medição GPS.</small>}
          </div>
          <button className={styles.copyButton} type="button" onClick={copyCoordinates}>Copiar</button>
        </div>
      ) : (
        <div className={styles.coordinateEmpty}>Clique no mapa para ver latitude e longitude ou solicite a localização do dispositivo.</div>
      )}
      {copyState ? <p className={styles.mapFeedback} role="status">{copyState}</p> : null}
      {mapError ? <p className={styles.mapError} role="alert">{mapError}</p> : null}
    </div>
  );
}

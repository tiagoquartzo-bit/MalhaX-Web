import type { Map as LeafletMap } from "leaflet";

export const OPENFREEMAP_DARK_STYLE = "https://tiles.openfreemap.org/styles/dark";

/** Adds the free OpenFreeMap vector basemap to an existing Leaflet map. */
export async function addOpenFreeMapLayer(map: LeafletMap, onError?: () => void, isActive: () => boolean = () => true) {
  const [{ maplibreGL }, maplibre] = await Promise.all([
    import("@maplibre/maplibre-gl-leaflet"),
    import("maplibre-gl"),
  ]);

  if (!isActive()) return null;

  maplibre.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());

  const layer = maplibreGL({
    style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || OPENFREEMAP_DARK_STYLE,
    interactive: false,
  }).addTo(map);

  const maplibreMap = layer.getMaplibreMap();
  if (onError) {
    maplibreMap.on("error", (event) => {
      // Missing optional style images (such as wood-pattern) do not prevent
      // the basemap from rendering and should not be reported as a map outage.
      if (event.error && !/image .* could not be loaded/i.test(event.error.message)) onError();
    });
  }

  // Leaflet callers often fitBounds immediately after adding this layer. Wait
  // for MapLibre's first render so the camera update is not lost while the
  // vector style and its initial tiles are still being initialized.
  if (!maplibreMap.loaded()) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        maplibreMap.off("load", finish);
        resolve();
      };
      const timeout = window.setTimeout(finish, 12_000);
      maplibreMap.once("load", finish);
      if (maplibreMap.loaded()) finish();
    });
  }

  if (!isActive()) return null;
  return layer;
}

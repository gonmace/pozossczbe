// Remove jQuery imports
import "leaflet/dist/leaflet.css";
import "leaflet.locatecontrol/dist/L.Control.Locate.min.css";
import "../src/utils/leaflet.Control.Center.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet.control.layers.tree/L.Control.Layers.Tree.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import {
  Map as LeafletMap,
  tileLayer,
  Marker,
  control,
  FeatureGroup,
  Control,
  Polygon,
  Draw,
  LatLng,
  LatLngBounds,
  Layer,
  markerClusterGroup,
  LayerGroup,
  divIcon,
  polyline,
  Polyline,
} from "leaflet";
import "./utils/leaflet.Control.Center";
import { iconRed, locateOptions } from "./utils/ObjectLeaflet";
import "leaflet-control-custom";
import "./types/leaflet-control-custom.d.ts";
import "leaflet-draw";
import "leaflet.control.layers.tree";
import type {
  LeafletMouseEvent,
  LocationEvent,
  ErrorEvent,
  LeafletEvent,
  Path,
} from "leaflet";
import type { DataPrice, Poligonos } from "./types/types";
import { createToast, confirmDialog } from "./utils/toast";
import { fetchClients, refreshClients } from "./utils/getClients";
import { initClientesActivosModal, DatoCliente } from "./clientesActivosModal";
import { showClientesResultadosModal } from "./clientesResultadosModal";
import "leaflet.markercluster";
import "leaflet.markercluster.layersupport";
import { LocateControl } from "leaflet.locatecontrol";
import "./utils/leaflet.locate.css";
import { cotizando } from "./utils/cotizando.ts";
import {
  deleteTruckMarker,
  extractCoordinates,
  guardarBaseCamion,
  updateTruckMarkers,
} from "./utils/base&camion.ts";
import { modalPrecio } from "./utils/modalPrecio.ts";

import "./utils/SliderControl";
import { initializeSearchModal } from "./utils/findClients";
import { tableModal } from "./utils/tableModel";
import { cargarCamiones as cargarListaCamiones } from "./utils/camiones";
import { initEventosCamionModal } from "./eventosCamionModal";
import { initTrackingModal } from "./trackingModal";
import { findClientsInPolygon, parsePolygonCoordinates, fetchAllClients } from "./utils/findClientsInPolygon";
import "leaflet.awesome-markers/dist/leaflet.awesome-markers.css";
import "leaflet.awesome-markers";


// Inyectar CSS de animaciones y correcciones de controles en el DOM
(function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes prg-pulse {
      0%   { opacity: 0.65; }
      70%  { opacity: 0;    }
      100% { opacity: 0;    }
    }
    /* Slider pegado al borde superior del mapa */
    .leaflet-top.leaflet-right .slider { margin-top: 0 !important; }
    /* Limitar ancho del control de capas para no bloquear el mapa */
    .leaflet-control-layers {
      max-width: clamp(160px, 35vw, 220px);
    }
    .leaflet-control-layers-list {
      overflow-x: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 12px;
    }
    @media (max-width: 639px) {
      #div-dibujar,
      #div-zona-factor,
      #add-area,
      #navbar { display: none !important; }
    }
  `;
  document.head.appendChild(style);
})();

let marker: Marker;
let markerCamion: Marker;
let paths: Path[] = [];
let dataPrice: DataPrice;
const colorPath = ["#FF8444", "#286d31", "#3357FF", "#A633FF"];
const overlay = document.getElementById("overlay") as HTMLDivElement;

// Tracking de markers de clientes de la jornada (id → Marker)
const _clienteMarkers = new Map<number, Marker>();
let _clientesJornada: DatoCliente[] = [];

// Store truck markers with their IDs
const truckMarkers: Record<string, Marker> = {};

const colores = [
  "#B0B0B0",
  "#FF5733",
  "#286d31",
  "#3357FF",
  "#A633FF",
  "#FF8333",
  "#33FFD5",
  "#D5FF33",
  "#33A6FF",
  "#5733FF",
  "#787878",
  "#FF33A6",
];

const map = new LeafletMap("map", {
  center: [-17.784071, -63.180522],
  zoom: 12,
  maxZoom: 19,
  zoomControl: false,
});

const _modalActivos = initClientesActivosModal(map);
const _modalEventos = initEventosCamionModal(map);
const _modalTracking = initTrackingModal(map);

// Restore map view from localStorage if available
const savedView = localStorage.getItem("mapView");
if (savedView) {
  const { center, zoom } = JSON.parse(savedView);
  map.setView(center, zoom);
}

// Save map view to localStorage when it changes
map.on("moveend", () => {
  const center = map.getCenter();
  const zoom = map.getZoom();
  localStorage.setItem(
    "mapView",
    JSON.stringify({
      center: [center.lat, center.lng],
      zoom,
    })
  );
});

const osm = tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const esri = tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
  }
);

map.getContainer().style.cursor = "crosshair";

// Boton para ubicar el marcador en el mapa
const putMarker = document.getElementById("putMarker") as HTMLButtonElement;
putMarker.disabled = true;
const URLwhatsapp = document.getElementById("URLwhatsapp") as HTMLInputElement;
URLwhatsapp.addEventListener("input", (_e) => {
  URLwhatsapp.value.length >= 20
    ? (putMarker.disabled = false)
    : (putMarker.disabled = true);
});

const cotiza = control.custom({
  position: "bottomright",
  content: `<div class="ml-18 mb-9 sm:mb-1">
                <button id="cotiza" class="btn btn-secondary btn-sm sombra">
                  COTIZA
                </button>
              </div>`,
  events: {
    click: async () => {
      const btn = document.getElementById("cotiza") as HTMLButtonElement | null;
      if (!btn || btn.disabled) return;
      overlay.classList.remove("invisible");
      dataPrice = await cotizando(marker.getLatLng().lat, marker.getLatLng().lng, '/api/v1/contratar-admin/');
      overlay.classList.add("invisible");
      if (dataPrice.error) {
        createToast("cotiza", "map", dataPrice.error, "top", "error");
        return;
      }
      modalPrecio(dataPrice, colorPath, marker, map);
    },
  },
});
cotiza.addTo(map);


const botonCotiza = document.getElementById("cotiza") as HTMLButtonElement;
botonCotiza.disabled = true;

async function resolveAndPlaceMarker(mensaje: string) {
  let latitud: number = 0, longitud: number = 0;
  let encontrado = false;

  // 1. Cualquier URL de Google Maps → proxy local → microservicio
  if (!encontrado && (mensaje.includes("google.com/maps") || mensaje.includes("maps.app.goo.gl") || mensaje.includes("goo.gl/maps"))) {
    const res = await fetch("/api/v1/shortlink/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: mensaje.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.lat && data.lon) {
        latitud = data.lat;
        longitud = data.lon;
        encontrado = true;
      }
    }
  }

  // 2. Coordenadas directas: -17.77,-63.18
  if (!encontrado) {
    const match = mensaje.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if (match) {
      latitud = parseFloat(match[1]);
      longitud = parseFloat(match[2]);
      encontrado = true;
    }
  }

  if (!encontrado) {
    alert("No se encontraron coordenadas válidas.");
    return;
  }

  URLwhatsapp.value = "";

  if (marker) {
    map.removeLayer(marker);
  } else {
    botonCotiza.disabled = false;
  }

  map.flyTo([latitud, longitud], 16);
  marker = new Marker([latitud, longitud], { icon: iconRed }).addTo(map);
  putMarker.disabled = true;
}

putMarker.onclick = async () => {
  const mensaje = URLwhatsapp.value;
  putMarker.disabled = true;
  putMarker.innerHTML = '<span class="loading loading-spinner loading-xs"></span>';
  try {
    await resolveAndPlaceMarker(mensaje);
  } catch (err) {
    alert("Algo salió mal al intentar extraer las coordenadas.");
    console.error(err);
    URLwhatsapp.value = "";
  } finally {
    putMarker.disabled = false;
    putMarker.textContent = "UBICAR GMAPS";
  }
};

const BaseMarker = document.getElementById("BaseMarker") as HTMLButtonElement;
const GuardarBaseMarker = document.getElementById(
  "GuardarBaseMarker"
) as HTMLButtonElement;
let coordinates: [number, number] | null = null;
let baseMarkerMode = false;

function placeBaseMarker(latLng: LatLng) {
  coordinates = [latLng.lat, latLng.lng];
  if (markerCamion) {
    map.removeLayer(markerCamion);
  }
  const _nombre = (document.getElementById("nameCamion") as HTMLInputElement)?.value.trim() || "";
  markerCamion = new Marker(latLng, { icon: crearIconoBase(_nombre) }).addTo(map);
  markerCamion.bindTooltip(_nombre || '(sin nombre)', { permanent: false, direction: 'top' });
  GuardarBaseMarker.disabled = false;
}

function setBaseMarkerMode(active: boolean) {
  baseMarkerMode = active;
  if (active) {
    map.getContainer().style.cursor = "crosshair";
    BaseMarker.classList.add("btn-active");
  } else {
    map.getContainer().style.cursor = "";
    BaseMarker.classList.remove("btn-active");
  }
}

// Añadir base / camion al mapa
BaseMarker.addEventListener("click", () => {
  const coordinatesInput = document.getElementById(
    "coordinates"
  ) as HTMLInputElement;

  // Si hay coordenadas en el input, usarlas directamente
  if (coordinatesInput.value.trim()) {
    const parsed = extractCoordinates(coordinatesInput.value);
    if (parsed) {
      placeBaseMarker(new LatLng(parsed[0], parsed[1]));
      map.flyTo(new LatLng(parsed[0], parsed[1]), 13);
      setBaseMarkerMode(false);
      return;
    }
  }

  // Activar/desactivar modo selección en mapa
  setBaseMarkerMode(!baseMarkerMode);
  if (baseMarkerMode) {
    createToast("coordinates", "map", "Haz clic en el mapa para colocar la base", "top", "success");
  }
});

// Guardar base / camion en la DB
GuardarBaseMarker.disabled = true;

// Actualizar iniciales del marcador temporal al escribir el nombre
(document.getElementById('nameCamion') as HTMLInputElement)?.addEventListener('input', () => {
  if (markerCamion && coordinates) {
    const nombre = (document.getElementById('nameCamion') as HTMLInputElement).value.trim();
    markerCamion.setIcon(crearIconoBase(nombre));
    markerCamion.bindTooltip(nombre || '(sin nombre)', { permanent: false, direction: 'top' });
  }
});

GuardarBaseMarker.addEventListener("click", async () => {
  const nameInput = document.getElementById("nameCamion") as HTMLInputElement;
  const name = nameInput.value;
  if (name.length < 3) {
    createToast(
      "name",
      "map",
      "El nombre debe tener al menos 3 caracteres",
      "top",
      "error"
    );
    return;
  }
  try {
    if (coordinates) {
      await guardarBaseCamion(name, coordinates);
      createToast(
        "name",
        "map",
        "Base agregada exitosamente",
        "top",
        "success"
      );
      // Reset inputs and disable save button
      setTimeout(() => {
        location.reload();
      }, 2500);
    } else {
      createToast(
        "name",
        "map",
        "No se encontraron coordenadas para la base",
        "top",
        "error"
      );
    }
  } catch (error) {
    createToast(
      "name",
      "map",
      "Hubo un error al agregar la base",
      "top",
      "error"
    );
  }
});

// Manejar clicks en los botones locate-camion
document.querySelectorAll(".locate-camion").forEach((button) => {
  button.addEventListener("click", (e) => {
    const row = (e.currentTarget as HTMLElement).closest(".flex.items-center");
    if (row) {
      const coordsInput = row.querySelector(
        ".camion-coords"
      ) as HTMLInputElement;
      if (coordsInput && coordsInput.value) {
        try {
          const coords = JSON.parse(coordsInput.value) as [number, number];
          map.flyTo(coords, 13);
        } catch (error) {
          console.error("Error parsing coordinates:", error);
        }
      }
    }
  });
});

document.querySelectorAll(".checkbox-camion").forEach((checkbox) => {
  checkbox.addEventListener("change", async (e) => {
    const cb = e.target as HTMLInputElement;
    const camionId = cb.dataset.camionId || "";
    const checked = cb.checked;
    try {
      await updateTruckMarkers(camionId, checked);
      const marker = truckMarkers[camionId];
      if (marker) {
        if (checked) {
          marker.addTo(map);
        } else {
          map.removeLayer(marker);
        }
      }
    } catch (error) {
      createToast("camion", "map", "Hubo un error al actualizar la base", "top", "error");
      cb.checked = !checked; // revertir toggle si falla
    }
  });
});

document.querySelectorAll(".delete-camion").forEach((button) => {
  button.addEventListener("click", async (e) => {
    const row = (e.target as HTMLElement).closest(".flex.items-center");
    if (row) {
      const camionId = row.querySelector(".camion-id") as HTMLInputElement;
      const camionName = (row.querySelector("span.font-medium") as HTMLElement)?.textContent?.trim() || "esta base";

      if (camionId && camionId.value) {
        const confirmDelete = await confirmDialog(
          `¿Está seguro que desea eliminar "${camionName}"?`
        );

        if (confirmDelete) {
          try {
            await deleteTruckMarker(camionId.value);
            createToast(
              "camion",
              "map",
              "Camion eliminado exitosamente",
              "top",
              "success"
            );
            setTimeout(() => {
              location.reload();
            }, 2500);
          } catch (error) {
            createToast(
              "camion",
              "map",
              "Hubo un error al eliminar el camion",
              "top",
              "error"
            );
          }
        }
      }
    }
  });
});

// Funcion para ubicar el marcador en el mapa
let _popupJustClosedAt = 0;
map.on("popupclose", () => { _popupJustClosedAt = Date.now(); });
map.on("tooltipclose", () => { _popupJustClosedAt = Date.now(); });

function onMapClick(e: LeafletMouseEvent) {
  // Si se acaba de cerrar un popup/tooltip por este mismo click, no colocar marker
  if (Date.now() - _popupJustClosedAt < 100) return;
  // Obtener el elemento nav y el contenedor del slider
  const navElement = document.querySelector("nav");
  const sliderContainer = document.querySelector(".leaflet-top.leaflet-right");
  // Verificar si el clic ocurrió fuera del nav y del slider
  if (
    navElement &&
    !navElement.contains(e.originalEvent.target as Node) &&
    sliderContainer &&
    !sliderContainer.contains(e.originalEvent.target as Node)
  ) {
    // Si está activo el modo de selección de base, colocar marcador de base
    if (baseMarkerMode) {
      placeBaseMarker(e.latlng);
      setBaseMarkerMode(false);
      return;
    }

    if (marker) {
      map.removeLayer(marker);
    } else {
      botonCotiza.disabled = false;
    }
    marker = new Marker(e.latlng, {
      icon: iconRed,
    }).addTo(map);

    console.log(
      "Lat: " + e.latlng.lat.toFixed(6) + ", Lon: " + e.latlng.lng.toFixed(6)
    );

    // Remove existing paths when placing a new marker
    paths.forEach((path) => map.removeLayer(path));
    paths = [];
  }
}
map.on("click", onMapClick);

// Control de localización del dispositivo (solo escritorio)
const locateControl = new LocateControl(locateOptions);
if (window.innerWidth >= 640) {
  locateControl.addTo(map);
}

// Escucha el evento 'locationfound' para obtener lat y lon
map.on("locationfound", function (e: LocationEvent) {
  const lat = e.latlng.lat;
  const lon = e.latlng.lng;
  console.log("Lat: " + lat + ", Lon: " + lon);

  // Elimina el marcador anterior si existe
  if (marker) {
    map.removeLayer(marker);
  } else {
    botonCotiza.disabled = false;
  }
  // Añade un nuevo marcador en la ubicación encontrada
  marker = new Marker(e.latlng, {
    icon: iconRed,
  }).addTo(map);

  // Remove existing paths
  paths.forEach((path) => map.removeLayer(path));
  paths = [];
});

map.on("locationerror", function (e: ErrorEvent) {
  alert(e.message);
});

// Dibujar polígonos
var drawnItems = new FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new Control.Draw({
  edit: {
    featureGroup: drawnItems,
  },
  draw: {
    polygon: {
      allowIntersection: true, // No permitir intersecciones
      showArea: true, // Mostrar área del polígono
      drawError: {
        color: "#e1e100", // Color de error
        message: "<strong>¡Oh no!</strong> no puedes dibujar eso!", // Mensaje de error
      },
      shapeOptions: {
        color: "#4e6afc",
      },
    },
    polyline: false, // Desactiva la opción de Polyline
    rectangle: false, // Desactiva la opción de Rectangle
    circle: false, // Desactiva la opción de Circle
    marker: false, // Desactiva la opción de Marker
    circlemarker: false, // Desactiva la opción de CircleMarker
  },
});

if (window.innerWidth >= 640) {
  map.addControl(drawControl);
}

// Desactivar el click listener cuando comienza el dibujo
map.on(Draw.Event.DRAWSTART, function () {
  setBaseMarkerMode(false);
  map.off("click", onMapClick);
});

map.on(Draw.Event.CREATED, function (event: LeafletEvent) {
  const layer = event.layer;
  drawnItems.clearLayers();
  drawnItems.addLayer(layer);
  updateTextareaWithCoordinates(layer);

  // Volver a activar el click listener
  map.on("click", onMapClick);
});

// Actualizar el textarea con las coordenadas del polígono
function updateTextareaWithCoordinates(layer: Layer) {
  if (layer instanceof Polygon) {
    const coordinates = layer.getLatLngs();
    // Aplanar las coordenadas del polígono
    const flatCoordinates = (coordinates[0] as LatLng[]).map((latLng) => [
      Number(latLng.lat.toFixed(6)),
      Number(latLng.lng.toFixed(6)),
    ]);

    // Convertir las coordenadas a formato JSON
    const coordinatesJSON = JSON.stringify(flatCoordinates);

    // Obtener el textarea y establecer su valor
    const coordinatesInput = document.getElementById(
      "polygon-coordinates"
    ) as HTMLTextAreaElement;
    coordinatesInput.value = coordinatesJSON;
    createToast(
      "polygon-coordinates",
      "map",
      "Las coordenadas del polígono han sido capturadas.",
      "top",
      "success"
    );
  } else {
    createToast(
      "polygon-coordinates",
      "map",
      "El tipo de capa no es un polígono.",
      "top",
      "error"
    );
  }
}

// Dibujar pligonos
const drawCordinates = document.getElementById(
  "submit-coordinates"
) as HTMLButtonElement;
const findClientsButton = document.getElementById(
  "find-clients"
) as HTMLButtonElement;
const coordinatesInput = document.getElementById(
  "polygon-coordinates"
) as HTMLTextAreaElement | null;

// Enable/disable find clients button based on polygon coordinates
coordinatesInput?.addEventListener("input", () => {
  if (coordinatesInput && coordinatesInput.value.trim()) {
    const coordinates = parsePolygonCoordinates(coordinatesInput.value);
    findClientsButton.disabled = !coordinates;
  } else {
    findClientsButton.disabled = true;
  }
});

drawCordinates.addEventListener("click", () => {
  if (!coordinatesInput) {
    createToast(
      "coordenadas",
      "map",
      "El área de texto para las coordenadas no se encontró.",
      "top",
      "error"
    );
    return;
  }
  try {
    const coordinates = JSON.parse(coordinatesInput.value);
    if (
      Array.isArray(coordinates) &&
      coordinates.every((coord) => Array.isArray(coord) && coord.length === 2)
    ) {
      const latLngs = coordinates.map(
        (coord) => new LatLng(coord[0], coord[1])
      );
      const polygon = new Polygon(latLngs, { color: "blue" });
      drawnItems.addLayer(polygon);
      map.fitBounds(polygon.getBounds());
      findClientsButton.disabled = false;
    } else {
      createToast(
        "coordenadas",
        "map",
        "Formato de coordenadas inválido. Asegúrese de que las coordenadas estén en el formato correcto.",
        "top",
        "error"
      );
      findClientsButton.disabled = true;
    }
  } catch (error) {
    createToast(
      "coordenadas",
      "map",
      "Error al parsear las coordenadas. Asegúrese de que las coordenadas estén en el formato JSON correcto.",
      "top",
      "error"
    );
    findClientsButton.disabled = true;
  }
});

// Find clients in polygon
findClientsButton.addEventListener("click", async () => {
  if (!coordinatesInput || !coordinatesInput.value.trim()) {
    createToast(
      "clientes",
      "map",
      "No hay coordenadas de polígono para buscar clientes.",
      "top",
      "error"
    );
    return;
  }

  const coordinates = parsePolygonCoordinates(coordinatesInput.value);
  if (!coordinates) {
    createToast(
      "clientes",
      "map",
      "Formato de coordenadas inválido.",
      "top",
      "error"
    );
    return;
  }

  // Show loading state
  findClientsButton.disabled = true;
  findClientsButton.innerHTML = '<span class="loading loading-spinner loading-sm"></span>';

  try {
    // Fetch all clients from API
    const clients = await fetchAllClients();
    
    // Find clients in polygon
    const clientsInPolygon = findClientsInPolygon(clients, coordinates);

    if (clientsInPolygon.length >= 0) {
      showClientesResultadosModal(clientsInPolygon, map);

      createToast(
        "clientes",
        "map",
        `Se encontraron ${clientsInPolygon.length} clientes en el polígono.`,
        "top",
        "success"
      );
    }
  } catch (error) {
    console.error('Error fetching clients:', error);
    createToast(
      "clientes",
      "map",
      "Error al buscar clientes. Por favor, intente nuevamente.",
      "top",
      "error"
    );
  } finally {
    // Reset button state
    findClientsButton.disabled = false;
    findClientsButton.textContent = "Clientes";
  }
});

// Guardar zona en la base de datos
const savePolygon = document.getElementById("savePolygon") as HTMLFormElement;
savePolygon.addEventListener("submit", (event: SubmitEvent): boolean => {
  event.preventDefault();

  const form = event.target as HTMLFormElement;
  const factorInput = document.getElementById("factor") as HTMLInputElement;
  let factorValue = factorInput.value.replace(",", ".");

  if (isNaN(parseFloat(factorValue))) {
    createToast(
      "factor",
      "map",
      "Ingrese un valor numérico válido para el factor.",
      "top",
      "warning"
    );
    return false;
  }

  // Set the value back to the input in a valid format
  factorInput.value = factorValue;

  const formData = new FormData(form);

  fetch(form.action, {
    method: form.method,
    body: formData,
  })
    .then((response) => {
      if (response.ok) {
        createToast(
          "creaArea",
          "map",
          "Area agregada exitosamente",
          "top",
          "success"
        );
        setTimeout(() => {
          location.reload();
        }, 3000); // Retraso de 3 segundos
      } else {
        createToast(
          "creaArea",
          "map",
          "Hubo un error al agregar el área",
          "top",
          "error"
        );
      }
    })
    .catch((error) => {
      createToast(
        "creaArea",
        "map",
        "Hubo un error al agregar el área",
        "top",
        "error"
      );
    });

  return false;
});

async function fetchAreaFactor() {
  const areaFact = await fetch("/api/v1/areasfactor/")
    .then((r) => r.json())
    .then((data: Poligonos[]) => {
      return data;
    });
  return areaFact;
}

let polygonLayers: { label: string; layer: Polygon }[] = [];
let groupCot, groupEje;

let mcgLayerSupportGroup: any = null;
const CLUSTER_RADIUS_KEY = "mapa.clusterRadiusKm";
let clusterRadiusKm = (() => {
  const raw = localStorage.getItem(CLUSTER_RADIUS_KEY);
  const parsed = raw != null ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 20 ? parsed : 2;
})();
let clusterRadiusPixels = 0;

function kmToPixelsAtZoom(km: number, zoom: number, lat: number): number {
  // Web Mercator meters-per-pixel
  const metersPerPixel =
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  return (km * 1000) / metersPerPixel;
}

function recomputeClusterPixels() {
  clusterRadiusPixels = kmToPixelsAtZoom(
    clusterRadiusKm,
    map.getZoom(),
    map.getCenter().lat
  );
}

const clusterOptions: any = {
  spiderLegPolylineOptions: { weight: 0 },
  spiderfyOnMaxZoom: true,
  zoomToBoundsOnClick: false,
  removeOutsideVisibleBounds: true,
  showCoverageOnHover: true,
  disableClusteringAtZoom: 18,
  maxClusterRadius: () => clusterRadiusPixels,
  spiderfyDistanceMultiplier: 1,
  chunkedLoading: true,
  chunkInterval: 100,
  singleAddRemoveBufferDuration: 200,
};

function rebuildClusterGroup() {
  if (!mcgLayerSupportGroup) return;
  // MCG sólo construye el árbol si _topClusterLevel no existe. Para aplicar
  // un nuevo maxClusterRadius: clearLayers() resetea el árbol (sin tocar
  // _proxyLayerGroups del layerSupport), se muta la opción, y addLayers
  // re-inserta los markers → se re-clusterizan con el radio nuevo.
  const markers = mcgLayerSupportGroup.getLayers();
  mcgLayerSupportGroup.clearLayers();
  mcgLayerSupportGroup.options.maxClusterRadius = clusterOptions.maxClusterRadius;
  mcgLayerSupportGroup.addLayers(markers);
}

function addClusterRadiusControl() {
  const ctrl = control.custom({
    position: "topright",
    content: `
      <div class="mb-2 sm:mb-1" style="position:relative;">
        <button id="cluster-radius-btn" title="Radio cluster" class="btn btn-neutral btn-sm btn-square sombra">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sombra" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9"/>
            <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>
          </svg>
        </button>
        <div id="cluster-radius-panel" style="display:none;position:absolute;right:calc(100% + 6px);top:0;background:rgba(255,255,255,0.95);padding:6px 10px;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,0.3);align-items:center;gap:8px;font-size:12px;color:#333;white-space:nowrap;">
          <label for="cluster-radius-slider" style="white-space:nowrap;font-weight:500;">Radio: <span id="cluster-radius-val">${clusterRadiusKm}</span> km</label>
          <input id="cluster-radius-slider" type="range" min="0" max="20" step="1" value="${clusterRadiusKm}" style="width:140px;vertical-align:middle;" />
        </div>
      </div>
    `,
    classes: "",
  });
  ctrl.addTo(map);

  const btn = document.getElementById("cluster-radius-btn") as HTMLButtonElement | null;
  const panel = document.getElementById("cluster-radius-panel") as HTMLDivElement | null;
  const slider = document.getElementById("cluster-radius-slider") as HTMLInputElement | null;
  const valEl = document.getElementById("cluster-radius-val") as HTMLSpanElement | null;
  if (!btn || !panel || !slider || !valEl) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.style.display = panel.style.display === "flex" ? "none" : "flex";
  });

  // Cerrar al click fuera del panel
  document.addEventListener("click", (e) => {
    const target = e.target as Node;
    if (panel.style.display === "flex" && !panel.contains(target) && !btn.contains(target)) {
      panel.style.display = "none";
    }
  });

  let debounceId: number | undefined;
  slider.addEventListener("input", (e) => {
    const v = parseInt((e.target as HTMLInputElement).value, 10);
    clusterRadiusKm = v;
    valEl.textContent = String(v);
    localStorage.setItem(CLUSTER_RADIUS_KEY, String(v));
    recomputeClusterPixels();
    if (debounceId) clearTimeout(debounceId);
    debounceId = window.setTimeout(() => rebuildClusterGroup(), 80);
  });

  // Evitar que el mapa capture mousedown/wheel/dblclick del slider
  ["mousedown", "dblclick", "wheel", "touchstart"].forEach((ev) => {
    slider.addEventListener(ev, (e) => e.stopPropagation());
  });
}

async function initializeAreas() {
  try {
    const areaFact = await fetchAreaFactor();

    // Añadir todos los polígonos obtenidos desde la API al mapa
    areaFact.forEach((polygonData, index) => {
      const apiPolygonCoords = polygonData.polygon;
      const apiPolygonLatLngs = apiPolygonCoords.map(
        (coord) => new LatLng(coord[0], coord[1])
      );
      polygonLayers.push({
        label: `<span style="color: ${colores[index % colores.length]}">   ${
          polygonData.name
        } ${polygonData.factor}</span>`,
        layer: new Polygon(apiPolygonLatLngs, { color: colores[index] }),
      });
    });

    ({ groupEje, groupCot } = await fetchClients());

    recomputeClusterPixels();
    mcgLayerSupportGroup = markerClusterGroup.layerSupport(clusterOptions);
    mcgLayerSupportGroup.addTo(map);

    mcgLayerSupportGroup.checkIn(groupCot);
    mcgLayerSupportGroup.checkIn(groupEje);

    const LAYER_STATE_KEY = "mapa.layerState";
    const layerKeyMap = new Map<any, string>();
    polygonLayers.forEach((pl, i) => layerKeyMap.set(pl.layer, `poly-${i}`));
    groupEje.forEach((g: any, i: number) => layerKeyMap.set(g, `eje-${i}`));
    groupCot.forEach((g: any, i: number) => layerKeyMap.set(g, `cot-${i}`));

    let savedLayerState: Record<string, boolean> = {};
    try { savedLayerState = JSON.parse(localStorage.getItem(LAYER_STATE_KEY) || "{}"); } catch {}
    const hasSavedState = Object.keys(savedLayerState).length > 0;

    if (hasSavedState) {
      groupEje.forEach((g: any, i: number) => {
        if (savedLayerState[`eje-${i}`] !== false) g.addTo(map);
      });
      groupCot.forEach((g: any, i: number) => {
        if (savedLayerState[`cot-${i}`]) g.addTo(map);
      });
      polygonLayers.forEach((pl, i) => {
        if (savedLayerState[`poly-${i}`]) pl.layer.addTo(map);
      });
    } else {
      groupEje.forEach((g: any) => g.addTo(map));
    }

    var baseTree = {
      label: "<strong>Capas Base</strong>",
      collapsed: true,
      children: [
        { label: "OpenStreetMap", layer: osm },
        { label: "Esri World Imagery", layer: esri },
      ],
    };

    const esMobile = window.innerWidth < 640;

    var overlayTree = {
      label: "<strong> Zonas / Clientes</strong>",
      selectAllCheckbox: "Un/select all",
      children: [
        {
          label: " Factor por zona",
          selectAllCheckbox: true,
          collapsed: true,
          children: polygonLayers,
        },
        {
          label: " Ejecutados",
          selectAllCheckbox: "Un/select all",
          collapsed: true,
          children: [
            {
              label: `<div class="puntos bg-precio300">&zwnj;</div>...300`,
              layer: groupEje[0],
            },
            {
              label: `<div class="puntos bg-precio350">&zwnj;</div>\xa0\xa0\xa0350`,
              layer: groupEje[1],
            },
            {
              label: `<div class="puntos bg-precio400">&zwnj;</div>\xa0\xa0\xa0400`,
              layer: groupEje[2],
            },
            {
              label: `<div class="puntos bg-precio450">&zwnj;</div>\xa0\xa0\xa0450`,
              layer: groupEje[3],
            },
            {
              label: `<div class="puntos bg-precio500">&zwnj;</div>\xa0\xa0\xa0500`,
              layer: groupEje[4],
            },
            {
              label: `<div class="puntos bg-precio600">&zwnj;</div>\xa0\xa0\xa0600`,
              layer: groupEje[5],
            },
            {
              label: `<div class="puntos bg-precio700">&zwnj;</div>\xa0\xa0\xa0700`,
              layer: groupEje[6],
            },
            {
              label: `<div class="puntos bg-precio800">&zwnj;</div>\xa0\xa0\xa0800`,
              layer: groupEje[7],
            },
            {
              label: `<div class="puntos bg-precio900">&zwnj;</div>\xa0\xa0\xa0900`,
              layer: groupEje[8],
            },
            {
              label: `<div class="puntos bg-precio1000">&zwnj;</div>\xa01000...`,
              layer: groupEje[9],
            },
            {
              label: `<div class="puntos bg-precioNegro">&zwnj;</div>\xa0\xa0L.N`,
              layer: groupEje[10],
            },
          ],
        },
        {
          label: " Cotizados",
          selectAllCheckbox: "Un/select all",
          collapsed: true,
          children: [
            { label: "Administrador", layer: groupCot[0] },
            { label: "Cliente Confirma", layer: groupCot[1] },
            { label: "Cliente Cancela", layer: groupCot[2] },
          ],
        },
      ],
    };

    control.layers
      .tree(baseTree, overlayTree, {
        position: esMobile ? "topleft" : "bottomleft",
        collapsed: esMobile,
      })
      .addTo(map);

    map.on('overlayadd', (e: any) => {
      const key = layerKeyMap.get(e.layer);
      if (key) {
        const s = JSON.parse(localStorage.getItem(LAYER_STATE_KEY) || "{}");
        s[key] = true;
        localStorage.setItem(LAYER_STATE_KEY, JSON.stringify(s));
      }
    });
    map.on('overlayremove', (e: any) => {
      const key = layerKeyMap.get(e.layer);
      if (key) {
        const s = JSON.parse(localStorage.getItem(LAYER_STATE_KEY) || "{}");
        s[key] = false;
        localStorage.setItem(LAYER_STATE_KEY, JSON.stringify(s));
      }
    });

    // SLIDER
    const grupoEjecutados = groupEje.flatMap((group) => group.getLayers());
    const grupoCotizados = groupCot.flatMap((group) => group.getLayers());
    const allLayers = [...grupoEjecutados, ...grupoCotizados];

    let lg = new LayerGroup(allLayers);

    const sliderControl = control.sliderControl({
      position: "topright",
      layer: lg,
      timeAttribute: "time",
      isEpoch: false,
      startTimeIdx: 0,
      timeStrLength: 19,
      maxValue: -1,
      minValue: 0,
      showAllOnStart: true,
      alwaysShowDate: true,
      range: true,
    });

    map.addControl(sliderControl);
    sliderControl.startSlider();

    addClusterRadiusControl();
  } catch (error) {
    console.error("Error al obtener las áreas:", error);
  }

  const buscarCliente = control.custom({
    position: "topright",
    content: `<div class="mb-2 sm:mb-1">
  <button id="buscarCliente" class="btn btn-sm btn-square sombra" title="Buscar cliente"
      style="background:rgba(255,255,255,0.92);border:1px solid rgba(0,0,0,0.12);color:rgba(0,0,0,0.55);">
    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  </button>
</div>`,
    events: {
      click: () => {
        initializeSearchModal(map);
      },
    },
  });
  buscarCliente.addTo(map);

  const tableClientes = control.custom({
    position: "topright",
    content: `<div class="mb-2 sm:mb-1">
      <button id="tableClientes" class="btn btn-accent btn-sm btn-square sombra">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sombra" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>
    </div>`,
    events: {
      click: () => {
        tableModal(map);
      },
    },
  });
  tableClientes.addTo(map);

  // Control: Tracking (abre modal)
  const ctrlTracking = control.custom({
    position: "topright",
    content: `<div class="mb-2 sm:mb-1">
      <button id="ctrl-btn-tracking" title="Tracking por camión"
          class="btn btn-sm btn-square sombra"
          style="background:#1565C0;border:none;color:white;">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sombra" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M12 19h4.5a3.5 3.5 0 0 0 0-7h-8a3.5 3.5 0 0 1 0-7H12"/>
        </svg>
      </button>
    </div>`,
    events: {
      click: () => _modalTracking.open(),
    },
  });
  ctrlTracking.addTo(map);

  // Control: Clientes activos (abre modal)
  const ctrlClientesActivos = control.custom({
    position: "topright",
    content: `<div class="mb-2 sm:mb-1">
      <button id="ctrl-btn-clientes-activos" title="Clientes activos"
          class="btn btn-sm btn-square sombra"
          style="background:linear-gradient(to bottom,#2196F3 33%,#43A047 33%,#43A047 66%,#FF9800 66%);border:none;color:white;">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sombra" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </button>
    </div>`,
    events: {
      click: () => {
        const modal = document.getElementById("modal-clientes-activos") as HTMLDialogElement;
        // Siempre abrir expandido
        const content = document.getElementById("modalClientesActivosContent");
        const collapseBtn = document.getElementById("modalClientesActivosCollapseBtn");
        if (content) content.style.display = "";
        if (collapseBtn) collapseBtn.textContent = "▼";
        _modalActivos.render();
        modal?.show();
      },
    },
  });
  ctrlClientesActivos.addTo(map);

  // Control: Eventos camión (abre modal de tabla)
  const ctrlEventosCamion = control.custom({
    position: "topright",
    content: `<div class="mb-2 sm:mb-1">
      <button id="ctrl-btn-eventos-camion" title="Eventos camión"
          class="btn btn-warning btn-sm btn-square sombra">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sombra" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
        </svg>
      </button>
    </div>`,
    events: {
      click: () => _modalEventos.open(),
    },
  });
  ctrlEventosCamion.addTo(map);
}

// Inicializar las áreas cuando se carga el mapa
initializeAreas();
function loadTruckMarkers() {
  document.querySelectorAll(".camion-coords").forEach((coordsInput) => {
    if (coordsInput instanceof HTMLInputElement && coordsInput.value) {
      try {
        const coords = JSON.parse(coordsInput.value) as [number, number];
        const row = coordsInput.closest(".flex.items-center");
        if (row) {
          const checkbox = row.querySelector(
            ".checkbox-camion"
          ) as HTMLInputElement;
          const camionId = checkbox?.dataset.camionId;
          if (camionId) {
            const nombre = (row.querySelector('span.font-medium')?.textContent || '').trim();
            const marker = new Marker(coords, {
              icon: crearIconoBase(nombre),
            });
            marker.bindTooltip(nombre || '(sin nombre)', { permanent: false, direction: 'top' });
            if (checkbox.checked) {
              marker.addTo(map);
            }
            truckMarkers[camionId] = marker;
          }
        }
      } catch (error) {
        console.error("Error loading truck marker:", error);
      }
    }
  });
}

// Call loadTruckMarkers after map initialization
map.whenReady(() => {
  loadTruckMarkers();
  actualizarBotonesBase();
});

// ─── Camiones activos ─────────────────────────────────────────────────────

interface DatoCamion {
  id: number;
  operador: string;
  lat: number;
  lon: number;
  velocidad: number;
  direccion: number;
  activo: boolean;
  comentario: string;
  nivel_tanque: number | null;
  historial: [number, number][];
}

function nivelTanqueColor(n: number | null): string {
  if (n == null) return "#FFFFFF";
  if (n >= 0.99) return "#E53935";
  if (n >= 0.60) return "#FDD835";
  if (n >= 0.25) return "#43A047";
  return "#333333";
}

const capasCamion = new Map<number, { marker: Marker; polyline: Polyline }>();

function nivelTexto(nivel: number): string {
  if (nivel >= 0.99) return "Lleno";
  if (nivel >= 0.60) return "2/3";
  if (nivel >= 0.25) return "1/3";
  return "Vacío";
}


function crearIconoBase(nombre = ''): ReturnType<typeof divIcon> {
  const iniciales = nombre
    .split(' ')
    .filter((w: string) => w.length > 0)
    .map((w: string) => w[0].toUpperCase())
    .join('') || '?';
  const fs = iniciales.length > 2 ? 9 : 11;
  // scale(0.8) over the original 35x46 marker → effective 28x37
  // Shadow image included inline so it renders like standard Leaflet awesome-marker shadow
  return divIcon({
    className: '',
    html: `<div style="position:relative;width:35px;height:46px;">
      <img src="/static/maps/markers-shadow.png"
        style="position:absolute;top:38px;left:-2px;width:32px;height:14px;pointer-events:none;opacity:0.6;" />
      <div style="transform:scale(0.8);transform-origin:bottom center;width:35px;height:46px;position:absolute;top:0;left:0;">
        <div class="awesome-marker awesome-marker-icon-cadetblue" style="width:35px;height:46px;position:relative;">
          <span style="color:white;font-size:${fs}px;font-weight:700;display:block;text-align:center;line-height:38px;letter-spacing:0.5px;">${iniciales}</span>
        </div>
      </div>
    </div>`,
    iconSize: [35, 46],
    iconAnchor: [17, 46],
    popupAnchor: [1, -37],
    tooltipAnchor: [0, -37],
  });
}

function markerGloboHtml(iniciales: string): string {
  // El contenedor se escala 0.53, así que el font efectivo es fs * 0.53
  const fs = iniciales.length > 2 ? 16 : 20;
  return `<div class="awesome-marker awesome-marker-icon-cadetblue"
    style="transform:scale(0.53);transform-origin:bottom center;width:35px;height:46px;position:relative;flex-shrink:0;">
    <span style="color:white;font-size:${fs}px;font-weight:700;display:block;
      text-align:center;line-height:38px;letter-spacing:0.5px;">${iniciales}</span>
  </div>`;
}

/** Aplica el globo cadetblue al botón BaseMarker y a cada locate-camion */
function actualizarBotonesBase(): void {
  // Botón principal "Marcar en mapa"
  const baseBtn = document.getElementById('BaseMarker') as HTMLButtonElement | null;
  if (baseBtn) {
    baseBtn.className = '';
    baseBtn.style.cssText = 'background:rgba(255,255,255,0.92);border:1px solid rgba(0,0,0,0.12);border-radius:0.5rem;padding:0 0.75rem 0 0.25rem;width:100%;display:flex;align-items:flex-end;justify-content:center;gap:0.25rem;overflow:hidden;cursor:pointer;height:32px;margin-bottom:0.5rem;';
    baseBtn.innerHTML = markerGloboHtml('+') + `<span style="color:rgba(0,0,0,0.75);font-size:12px;font-weight:600;line-height:32px;white-space:nowrap;">Marcar en mapa</span>`;
  }

  // Botones de cada fila de base (nueva estructura div)
  document.querySelectorAll<HTMLButtonElement>('.locate-camion').forEach(btn => {
    const row = btn.closest('.flex.items-center');
    const nombre = (row?.querySelector('span.font-medium')?.textContent || '').trim();
    const iniciales = nombre
      .split(' ')
      .filter((w: string) => w.length > 0)
      .map((w: string) => w[0].toUpperCase())
      .join('') || '?';
    btn.className = '';
    btn.style.cssText = 'background:none;border:none;border-radius:4px;padding:0;width:24px;height:24px;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;cursor:pointer;flex-shrink:0;';
    btn.innerHTML = markerGloboHtml(iniciales);
  });
}




function crearIconoCamion(direccion: number, activo = true, velocidad = 0, nivelTanque: number | null = null): ReturnType<typeof divIcon> {
  const op = activo ? 1 : 0.4;
  const arrowColor = activo ? "#1565C0" : "#888";
  const velTexto = `${Math.round(velocidad)} km/h`;
  const bgTanque = `${nivelTanqueColor(nivelTanque)}80`;
  const html = `
    <div style="position:relative;width:44px;height:58px;opacity:${op};">
      <div style="position:absolute;top:0;left:0;width:44px;height:44px;">
        <div style="position:absolute;inset:0;transform:rotate(${direccion}deg);">
          <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);
            width:0;height:0;
            border-left:9px solid transparent;
            border-right:9px solid transparent;
            border-bottom:16px solid ${arrowColor};">
          </div>
        </div>
        <div style="position:absolute;top:10px;left:10px;width:24px;height:24px;
          border-radius:50%;background:${bgTanque};border:2px solid ${arrowColor};
          display:flex;align-items:center;justify-content:center;overflow:hidden;
          box-shadow:0 2px 4px rgba(0,0,0,0.3);">
          <img src="/static/icons/logo.svg"
            style="width:18px;height:11px;object-fit:contain;filter:brightness(0);"/>
        </div>
      </div>
      <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);
        background:${arrowColor};color:white;font-size:9px;font-weight:700;
        padding:1px 5px;border-radius:8px;white-space:nowrap;
        box-shadow:0 1px 3px rgba(0,0,0,0.3);">
        ${velTexto}
      </div>
    </div>`;
  return divIcon({
    className: "",
    html,
    iconSize: [44, 58],
    iconAnchor: [22, 29],
  });
}



async function cargarCamiones(enfocar = false) {
  try {
    const resp = await fetch("/maps/api/camiones-activos/");
    if (!resp.ok) return;
    const camiones: DatoCamion[] = await resp.json();

    // Remover camiones que ya no están activos
    for (const [id, capas] of capasCamion) {
      if (!camiones.find((c) => c.id === id)) {
        capas.marker.remove();
        capas.polyline.remove();
        capasCamion.delete(id);
      }
    }

    for (const c of camiones) {
      const estadoLabel = c.activo ? "🟢 Activo" : "🔴 Inactivo";
      let tanqueTxt: string;
      if (c.nivel_tanque == null) {
        tanqueTxt = "Tanque: —";
      } else {
        const pct = Math.round(c.nivel_tanque * 100);
        if (pct >= 100) tanqueTxt = "Tanque lleno";
        else if (pct <= 0) tanqueTxt = "Tanque vacío";
        else tanqueTxt = `Tanque: ${pct}%`;
      }
      const tanqueColor = nivelTanqueColor(c.nivel_tanque);
      const tooltipHtml = `
        <b>${c.operador}</b> ${estadoLabel}<br>
        🚐 ${c.velocidad.toFixed(0)} km/h · <span style="color:${tanqueColor};font-weight:700;">🛢️ ${tanqueTxt}</span>
        ${c.comentario ? `<br>📍 ${c.comentario}` : ""}
      `;

      if (capasCamion.has(c.id)) {
        const capas = capasCamion.get(c.id)!;
        capas.marker.setLatLng([c.lat, c.lon]);
        capas.marker.setIcon(crearIconoCamion(c.direccion, c.activo, c.velocidad, c.nivel_tanque));
        capas.marker.setTooltipContent(tooltipHtml);
        capas.polyline.setLatLngs(c.historial);
        capas.polyline.setStyle({ color: c.activo ? "#42A5F5" : "#9E9E9E", opacity: c.activo ? 0.7 : 0.35 });
      } else {
        const mk = new Marker([c.lat, c.lon], { icon: crearIconoCamion(c.direccion, c.activo, c.velocidad, c.nivel_tanque) })
          .addTo(map)
          .bindTooltip(tooltipHtml, { permanent: false, direction: "top", offset: [0, -28] });
        if (window.matchMedia('(hover: none)').matches) {
          mk.on('click', () => {
            if ((mk as any).isTooltipOpen && (mk as any).isTooltipOpen()) {
              mk.closeTooltip();
            } else {
              mk.openTooltip();
            }
          });
        }
        const pl = polyline(c.historial, {
          color: c.activo ? "#42A5F5" : "#9E9E9E",
          weight: 2,
          opacity: c.activo ? 0.7 : 0.35,
        }).addTo(map);
        capasCamion.set(c.id, { marker: mk, polyline: pl });
      }
    }

    // Si enfocar=true (llamada desde botón solicitar), centrar mapa en los camiones activos
    if (enfocar && camiones.length > 0) {
      if (camiones.length === 1) {
        map.flyTo([camiones[0].lat, camiones[0].lon], Math.max(map.getZoom(), 14), { duration: 1.2 });
      } else {
        const bounds = new LatLngBounds(camiones.map((c) => [c.lat, c.lon] as [number, number]));
        map.flyToBounds(bounds.pad(0.3), { duration: 1.2 });
      }
    }
  } catch (e) {
    console.error("[camiones]", e);
  }
}

// ─── Clientes de la jornada ────────────────────────────────────────────────


// Color de awesome-marker según status
const amColorPorStatus: Record<string, string> = {
  PRG: "blue",
  EJE: "green",
  CAN: "red",
  COT: "orange",
  WEB: "gray",
};

function crearIconoCliente(status: string, cost: number | null = null, sinChofer = false): ReturnType<typeof divIcon> {
  const amColor = amColorPorStatus[status] ?? "gray";
  const isPRG = status === "PRG";
  const pulseColor = isPRG && sinChofer ? "#dc2626" : "#2196F3";
  const precioHtml = cost
    ? `<span style="position:absolute;top:3px;left:0;right:0;line-height:33px;text-align:center;font-size:14px;font-weight:700;color:white;pointer-events:none;">${cost}</span>`
    : "";
  return divIcon({
    className: "",
    html: `<div style="position:relative;width:35px;height:46px;">
      ${isPRG ? `<span style="position:absolute;top:16px;left:-13px;width:60px;height:60px;border-radius:50%;border:2.5px solid ${pulseColor};animation:prg-pulse 1.8s ease-out infinite;pointer-events:none;"></span>` : ""}
      <img src="/static/maps/markers-shadow.png"
        style="position:absolute;top:38px;left:-2px;width:32px;height:14px;pointer-events:none;opacity:0.6;" />
      <div style="transform:scale(0.86);transform-origin:bottom center;width:35px;height:46px;position:absolute;top:0;left:0;">
        <div class="awesome-marker awesome-marker-icon-${amColor}" style="width:35px;height:46px;position:relative;">
          ${precioHtml}
        </div>
      </div>
    </div>`,
    iconSize: [35, 46],
    iconAnchor: [17, 46],
    popupAnchor: [1, -40],
    tooltipAnchor: [0, -40],
  });
}

async function cargarClientesJornada() {
  try {
    const resp = await fetch("/maps/api/clientes-jornada/");
    if (!resp.ok) return;
    const clientes: DatoCliente[] = await resp.json();
    _modalActivos.setClientes(clientes);
    _clientesJornada = clientes;
    _clienteMarkers.forEach(m => map.removeLayer(m));
    _clienteMarkers.clear();
    for (const c of clientes) {
      const m = _crearMarkerCliente(c);
      m.addTo(map);
      _clienteMarkers.set(c.id, m);
    }
    renderSidebarClientes(clientes);
  } catch (e) {
    console.error("[clientes-jornada]", e);
  }
}

const _WA_SVG_MARKER = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.52 3.48A11.93 11.93 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.16 1.6 5.97L0 24l6.18-1.62A11.93 11.93 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.21-1.25-6.22-3.48-8.52zm-8.52 18.4a9.89 9.89 0 0 1-5.04-1.38l-.36-.22-3.67.96.98-3.58-.23-.37A9.93 9.93 0 0 1 2.07 12c0-5.48 4.46-9.93 9.93-9.93 2.65 0 5.15 1.03 7.02 2.91A9.88 9.88 0 0 1 21.93 12c0 5.48-4.45 9.93-9.93 9.93zm5.44-7.44c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.94 1.17-.18.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.47-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.63-.93-2.23-.24-.58-.49-.5-.68-.51-.17 0-.37-.02-.57-.02s-.52.07-.8.37c-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.1 4.49.71.31 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z"/></svg>`;

function _makeClientePopupHtml(c: DatoCliente): string {
  const STATUS_LABEL: Record<string, string> = { PRG: "Programado", EJE: "Ejecutado", CAN: "Cancelado", COT: "Cotizado", WEB: "Web" };
  const waHtml = c.tel1
    ? `<a href="https://wa.me/${c.tel1.replace(/[^\d+]/g, "")}" target="_blank"
         style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;
                background:rgba(37,211,102,0.15);color:#25D366;border:1px solid rgba(37,211,102,0.35);
                font-size:13px;font-weight:500;text-decoration:none;">
         ${_WA_SVG_MARKER} ${c.tel1}
       </a>`
    : `<span style="font-size:11px;opacity:0.4;">Sin teléfono</span>`;
  const infoLines: string[] = [];
  if (c.hora_programada) {
    const dt = new Date(c.hora_programada);
    if (!isNaN(dt.getTime()))
      infoLines.push(`🕐 ${dt.toLocaleString("es-BO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}`);
  }
  if (c.status) infoLines.push(STATUS_LABEL[c.status] ?? c.status);
  if (c.cost) infoLines.push(`Bs. ${c.cost}`);
  if (c.address?.trim()) infoLines.push(c.address.trim());
  return `
    <div style="font-size:12px;white-space:nowrap;">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px;white-space:nowrap;">${c.name ?? "(sin nombre)"}</div>
      ${waHtml}
      ${infoLines.length ? `<div style="margin-top:6px;display:flex;flex-direction:column;gap:2px;opacity:0.75;">${infoLines.map(l => `<span>${l}</span>`).join("")}</div>` : ""}
    </div>`;
}

function _crearMarkerCliente(c: DatoCliente): Marker {
  const label = ({ EJE: "Ejecutado", CAN: "Cancelado", COT: "Cotizado", WEB: "Web" } as Record<string, string>)[c.status] ?? "";
  const precio = c.cost ? `Bs. ${c.cost}` : "";
  const comentario = c.address?.trim() || "";
  const hora = (() => {
    if (!c.hora_programada) return "";
    const dt = new Date(c.hora_programada);
    if (!isNaN(dt.getTime()))
      return dt.toLocaleString("es-BO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
    const parts = c.hora_programada.split(":");
    return parts.length >= 2 ? `${parts[0].padStart(2,"0")}:${parts[1].padStart(2,"0")}` : c.hora_programada;
  })();
  const lineas = [c.name ?? "(sin nombre)", hora ? `🕐 ${hora}` : "", label, precio, comentario].filter(Boolean).join("<br>");
  return new Marker([c.lat, c.lon], { icon: crearIconoCliente(c.status, c.cost, !c.camion) })
    .bindTooltip(lineas, { permanent: false, direction: "top" })
    .bindPopup(_makeClientePopupHtml(c), { maxWidth: 400, minWidth: 0 });
}

function renderSidebarClientes(clientes: DatoCliente[]) {
  const sidebarList = document.getElementById("sidebar-clientes-list");
  if (!sidebarList) return;
  if (clientes.length === 0) {
    sidebarList.innerHTML = `<p class="text-xs text-base-content/40 text-center py-2">Sin clientes hoy</p>`;
  } else {
    const STATUS_CLASS_SB: Record<string, string> = { PRG: "st-prg", EJE: "st-eje", CAN: "st-can", COT: "st-cot", WEB: "st-web" };
    const STATUS_ORDER_SB: Record<string, number> = { PRG: 0, EJE: 1, CAN: 2, COT: 3, WEB: 4 };
    const clientesOrdenados = [...clientes].sort((a, b) => {
      const d = (STATUS_ORDER_SB[a.status] ?? 9) - (STATUS_ORDER_SB[b.status] ?? 9);
      if (d !== 0) return d;
      if (a.status === "COT" || a.status === "WEB") {
        const da = a.created_at ?? "";
        const db = b.created_at ?? "";
        return db.localeCompare(da);
      }
      if (!a.hora_programada && !b.hora_programada) return 0;
      if (!a.hora_programada) return 1;
      if (!b.hora_programada) return -1;
      return a.hora_programada.localeCompare(b.hora_programada);
    });
    const fmtHoraSB = (raw: string | null): string => {
      if (!raw) return "";
      const dt = new Date(raw);
      if (!isNaN(dt.getTime()))
        return dt.toLocaleString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
      return raw;
    };
    const fmtHoraSolo = (raw: string | null): string => {
      if (!raw) return "";
      const dt = new Date(raw);
      if (!isNaN(dt.getTime()))
        return dt.toLocaleString("es-BO", { hour: "2-digit", minute: "2-digit", hour12: false });
      return "";
    };
    sidebarList.innerHTML = clientesOrdenados.map(c => {
      const stClass = STATUS_CLASS_SB[c.status] ?? "";
      const precio = c.cost ? `<span class="shrink-0 text-[10px] font-bold" style="color:#FFD54F;">Bs.${c.cost}</span>` : "";
      const cotFechaSB = (() => {
        if ((c.status !== "COT" && c.status !== "WEB") || !c.created_at) return "";
        const dt = new Date(c.created_at);
        if (isNaN(dt.getTime())) return "";
        return `<div>${dt.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit" })}</div><div>${dt.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", hour12: false })}</div>`;
      })();
      const horaStr = cotFechaSB || fmtHoraSolo(c.hora_programada);
      const horaFmt = cotFechaSB || fmtHoraSB(c.hora_programada);
      return `
      <div class="sidebar-cliente-row flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer hover:brightness-110 transition-all status-row ${stClass}"
           data-lat="${c.lat}" data-lon="${c.lon}">
        <div class="flex items-center gap-1 flex-1 min-w-0">
          ${c.camion_iniciales
            ? `<span class="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[8px] font-bold leading-none"
                     title="${c.camion_nombre ?? c.camion_iniciales}"
                     style="background:rgba(255,255,255,0.92);border:1.5px solid rgba(0,0,0,0.10);color:rgba(0,0,0,0.72);box-shadow:0 1px 3px rgba(0,0,0,0.25);">
                 ${c.camion_iniciales}
               </span>`
            : c.status === "PRG"
              ? `<span class="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black leading-none"
                         title="Sin chofer asignado"
                         style="background:#dc2626;color:#fff;border:1.5px solid #ef4444;${window.innerWidth >= 640 ? 'animation:chofer-alert 1.2s ease-in-out infinite;' : ''}">?</span>`
              : `<span class="w-5 h-5 shrink-0"></span>`}
          <span class="text-xs font-medium truncate">${c.name ?? "(sin nombre)"}</span>
        </div>
        <div class="shrink-0 w-10 text-center">
          ${cotFechaSB
            ? `<div style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.9);line-height:1.2;">${cotFechaSB}</div>`
            : horaStr
              ? `<button class="sb-clock-btn text-[9px] font-semibold opacity-70 hover:opacity-100 transition-opacity leading-none"
                         data-hora="${horaFmt}" onclick="event.stopPropagation()" style="background:none;border:none;cursor:pointer;color:inherit;padding:0;">
                     ${horaStr}
                   </button>`
              : ""}
        </div>
        <div class="flex items-center gap-1 shrink-0">
          ${precio}
          ${c.tel1
            ? `<a href="https://wa.me/${c.tel1.replace(/[^\d+]/g, "")}" target="_blank" rel="noopener"
                  class="shrink-0 flex items-center justify-center w-6 h-6 rounded-full transition-all hover:scale-110"
                  style="color:#25D366;background:rgba(37,211,102,0.18);box-shadow:0 0 0 1px rgba(37,211,102,0.35);" onclick="event.stopPropagation()" title="${c.tel1}">
                 <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20.52 3.48A11.93 11.93 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.16 1.6 5.97L0 24l6.18-1.62A11.93 11.93 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.21-1.25-6.22-3.48-8.52zm-8.52 18.4a9.89 9.89 0 0 1-5.04-1.38l-.36-.22-3.67.96.98-3.58-.23-.37A9.93 9.93 0 0 1 2.07 12c0-5.48 4.46-9.93 9.93-9.93 2.65 0 5.15 1.03 7.02 2.91A9.88 9.88 0 0 1 21.93 12c0 5.48-4.45 9.93-9.93 9.93zm5.44-7.44c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.94 1.17-.18.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.47-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.63-.93-2.23-.24-.58-.49-.5-.68-.51-.17 0-.37-.02-.57-.02s-.52.07-.8.37c-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.1 4.49.71.31 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z"/></svg>
               </a>`
            : ""}
        </div>
      </div>`;
    }).join("");

    sidebarList.querySelectorAll<HTMLElement>(".sidebar-cliente-row").forEach(el => {
      el.addEventListener("click", () => {
        map.flyTo([parseFloat(el.dataset.lat!), parseFloat(el.dataset.lon!)], 14);
      });
    });
    sidebarList.querySelectorAll<HTMLElement>(".sb-clock-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        document.getElementById("__sb-hora-tip")?.remove();
        const tip = document.createElement("div");
        tip.id = "__sb-hora-tip";
        tip.style.cssText = "position:fixed;z-index:99999;background:#1e293b;color:#e2e8f0;border:1px solid rgba(255,255,255,0.12);border-radius:0.5rem;padding:6px 10px;font-size:11px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.4);pointer-events:none;white-space:nowrap;";
        tip.textContent = btn.dataset.hora ?? "";
        document.body.appendChild(tip);
        const rect = btn.getBoundingClientRect();
        let left = rect.right + 8;
        const tw = tip.offsetWidth || 160;
        if (left + tw > window.innerWidth - 8) left = rect.left - tw - 8;
        tip.style.left = `${left}px`;
        tip.style.top  = `${rect.top + rect.height / 2 - (tip.offsetHeight || 28) / 2}px`;
        const close = () => { tip.remove(); document.removeEventListener("click", close, true); };
        setTimeout(() => document.addEventListener("click", close, true), 0);
      });
    });
  }
  const counts: Record<string, number> = { PRG: 0, EJE: 0, CAN: 0, COT: 0, WEB: 0 };
  for (const c of clientes) if (c.status in counts) counts[c.status]++;
  for (const [st, elId] of [["PRG","sidebar-count-prg"],["EJE","sidebar-count-eje"],["CAN","sidebar-count-can"],["COT","sidebar-count-cot"],["WEB","sidebar-count-web"]] as [string,string][]) {
    const el = document.getElementById(elId);
    if (el) { el.textContent = counts[st] > 0 ? `${counts[st]}` : ""; el.style.display = counts[st] > 0 ? "" : "none"; }
  }
}

// Escuchar cambios del modal para actualizar marker + sidebar sin re-fetch
document.addEventListener("jornadaClienteChanged", ((e: CustomEvent) => {
  const { id, status, camion, camion_iniciales, camion_nombre } = e.detail as {
    id: number; status: string; camion: number | null;
    camion_iniciales: string; camion_nombre: string;
  };
  const c = _clientesJornada.find(x => x.id === id);
  if (!c) return;
  c.status = status;
  c.camion = camion;
  c.camion_iniciales = camion_iniciales;
  c.camion_nombre = camion_nombre;
  // Actualizar marker en el mapa
  const m = _clienteMarkers.get(id);
  if (m) m.setIcon(crearIconoCliente(c.status, c.cost, !c.camion));
  // Re-render sidebar
  renderSidebarClientes(_clientesJornada);
}) as EventListener);

// Carga inicial
cargarCamiones();
cargarListaCamiones();   // Carga la lista de camiones para los selectores de asignación
cargarClientesJornada();

// SSE: actualizar camiones en tiempo real cuando llega un nuevo RegistroCamion
const _sse = new EventSource('/maps/api/camiones-sse/');
_sse.onmessage = () => { cargarCamiones(false); _modalEventos.refreshTrackingState(); };
_sse.addEventListener('clientes', () => {
  if ((window as any).refreshClientLayers) (window as any).refreshClientLayers();
});
_sse.onerror = () => {
  console.warn('[SSE] conexión perdida, usando polling');
  _sse.close();
  setInterval(cargarCamiones, 30_000);
  setInterval(() => { if ((window as any).refreshClientLayers) (window as any).refreshClientLayers(); }, 30_000);
};

// Exponer cargarCamiones globalmente para que el botón de solicitar ubicación
// pueda refrescar el mapa tras recibir la respuesta del teléfono.
(window as any).cargarCamiones = cargarCamiones;
(window as any).cargarClientesJornada = cargarClientesJornada;
(window as any).refreshClientLayers = async () => {
  cargarClientesJornada();
  // refreshClients limpia los grupos antes de volver a poblarlos — evita acumulación
  const updated = await refreshClients();
  groupCot = updated.groupCot;
  groupEje = updated.groupEje;
};

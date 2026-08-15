import { Map, tileLayer, Marker, control, Path } from "leaflet"; 
import "./utils/leaflet.Control.Center";
import { LocateControl } from "leaflet.locatecontrol";
import type {
  LeafletMouseEvent,
  LocationEvent,
  ErrorEvent
} from "leaflet";
import {
  iconRed,
  locateOptions,
} from "./utils/ObjectLeaflet";
import "leaflet-control-custom";
import "./types/leaflet-control-custom.d.ts";

import "leaflet/dist/leaflet.css";
import "../src/utils/leaflet.Control.Center.css";
import "leaflet.locatecontrol/dist/L.Control.Locate.min.css";
import "./utils/leaflet.locate.css";
import type { DataPrice } from "./types/types";
import { calcularCotizacion } from "./utils/cotizacionWeb.ts";
import { mensajeWapp } from "./utils/utils.ts";
import "../../main/src/whatsapp-bubble.ts";

declare global {
  interface Window {
    DATOS_GENERALES: {
      mensaje_cotizar: string;
      celular: string;
      mensaje_whatsapp: string;
      [key: string]: any;
    }
    ISAUTHENTICATED: boolean;
  }
}

const DATOS_GENERALES = window.DATOS_GENERALES;
const ISAUTHENTICATED = window.ISAUTHENTICATED;


let marker: Marker;
let paths: Path[] = [];
let dataPrice: DataPrice;
let precioFinal: number;
let codigoActual: string;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const modalPrecio = document.getElementById("precios") as HTMLDialogElement;
const parrafo = modalPrecio.querySelector("p") as HTMLParagraphElement;
const botonConfirmar = document.getElementById("confirmar") as HTMLButtonElement;
const botonDescuento = document.getElementById("preguntaDescuento") as HTMLButtonElement;
const modalPrecioClose = document.getElementById("modalPrecioClose") as HTMLButtonElement;
const modalPrecioCancelar = document.getElementById("cancelar") as HTMLButtonElement;

const map = new Map("map", {
  center: [-17.784071, -63.180522],
  zoom: 12,
  zoomControl: false,
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

// Crear un objeto que contiene las capas base
const baseMaps = {
  "Mapa": osm,
  "Satelital": esri,
};

map.getContainer().style.cursor = "crosshair";

control
.layers(baseMaps, {}, { position: "topleft", collapsed: false })
.addTo(map);

control
.custom({
  position: "bottomcenter",
  content: `<div>
            <button id="cotiza" class="btn btn-secondary btn-sm sm:btn-md btn-disabled sombra w-32">
            COTIZA
            </button>
          </div>`,
  classes: "pb-11 sm:pb-1",
  events: {
    click: contratar,
  },
})
.addTo(map);

const botonCotiza = document.getElementById("cotiza") as HTMLButtonElement;
let modalAbortController: AbortController | null = null;

function onMapClick(e: LeafletMouseEvent) {
    // Obtener el elemento nav
    const navElement = document.querySelector("nav");
    // Verificar si el clic ocurrió fuera del nav
    if (
      navElement &&
      !navElement.contains(e.originalEvent.target as Node)
    ) {
      if (marker) {
        map.removeLayer(marker);
      } else {
        botonCotiza.classList.remove("btn-disabled");
      }
      marker = new Marker(e.latlng, {
        icon: iconRed,
      }).addTo(map);
      console.log("Lat: " + e.latlng.lat.toFixed(6) + ", Lon: " + e.latlng.lng.toFixed(6));

      // Remove existing paths when placing a new marker
      paths.forEach(path => map.removeLayer(path));
      paths = [];
    }
  }
  map.on("click", onMapClick);

  // Control de localización locateOptions esta en el archivo UtilsLeaflet.astro
  const locateControl = new LocateControl(locateOptions);
  locateControl.addTo(map);

  // Tooltip animado para el botón de localización
  function mostrarTooltipLocalizacion() {
    // Esperar a que el control se renderice completamente
    setTimeout(() => {
      // Buscar el botón específico con las clases leaflet-bar-part leaflet-bar-part-single
      const locateButtonPart = document.querySelector('.leaflet-control-locate .leaflet-bar-part.leaflet-bar-part-single') as HTMLElement;
      const locateControl = document.querySelector('.leaflet-control-locate') as HTMLElement;
      
      if (!locateButtonPart || !locateControl) return;

      // Obtener la posición del botón relativa al contenedor del mapa
      const buttonRect = locateButtonPart.getBoundingClientRect();
      const mapContainer = map.getContainer();
      const mapRect = mapContainer.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const isMobile = viewportWidth < 640;

      // Crear el tooltip
      const tooltip = document.createElement('div');
      tooltip.id = 'tooltip-location-help';
      tooltip.className = 'z-[10001]';
      
      // Calcular posición: al lado derecho del botón
      // En móviles, ajustar para que no se salga del viewport
      let tooltipLeft = buttonRect.right - mapRect.left + 10;
      let tooltipTop = buttonRect.top - mapRect.top + (buttonRect.height / 2);
      let tooltipTransform = 'translateY(-50%)';
      let tooltipAnimation = 'tooltipMove 3s ease-in-out infinite, tooltipFadeOut 10s forwards';
      
      // Verificar si el tooltip cabe a la derecha, si no, ponerlo arriba o abajo en móviles
      const estimatedTooltipWidth = isMobile ? 200 : 280;
      const spaceRight = mapRect.right - buttonRect.right;
      
      // Si no hay espacio suficiente a la derecha en móviles, ajustar posición
      if (isMobile && spaceRight < estimatedTooltipWidth + 20) {
        tooltipLeft = buttonRect.left - mapRect.left - estimatedTooltipWidth - 20;
        // Si tampoco cabe a la izquierda, ponerlo centrado debajo del botón
        if (tooltipLeft < 10) {
          tooltipLeft = buttonRect.left - mapRect.left - (estimatedTooltipWidth / 2) + (buttonRect.width / 2);
          tooltipTop = buttonRect.bottom - mapRect.top + 10;
          tooltipTransform = 'translateX(-50%)';
          tooltipAnimation = 'tooltipMoveVertical 3s ease-in-out infinite, tooltipFadeOut 10s forwards';
        }
      }

      tooltip.style.cssText = `
        position: absolute;
        top: ${tooltipTop}px;
        left: ${tooltipLeft}px;
        transform: ${tooltipTransform};
        pointer-events: none;
        animation: ${tooltipAnimation};
        opacity: 1;
        z-index: 10001;
      `;

      // Crear el contenedor del tooltip con DaisyUI y flecha
      const tooltipContainer = document.createElement('div');
      tooltipContainer.className = 'tooltip-with-arrow bg-primary text-primary-content px-3 py-2 sm:px-4 sm:py-2 rounded-lg shadow-xl text-xs sm:text-sm font-medium border-2 border-primary-focus relative';
      
      // Determinar si mostrar la flecha (no mostrarla si está debajo del botón)
      const showArrow = tooltipTransform !== 'translateX(-50%)';
      
      tooltipContainer.innerHTML = `
        ${showArrow ? '<div class="tooltip-arrow absolute left-[-8px] sm:left-[-8px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-6 sm:border-t-8 border-t-transparent border-b-6 sm:border-b-8 border-b-transparent border-r-6 sm:border-r-8" style="border-right-color: var(--color-primary);"></div>' : ''}
        <div class="flex items-center gap-1 sm:gap-2 flex-wrap sm:flex-nowrap">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5 animate-pulse shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span class="text-xs sm:text-sm">¡Haz clic aquí para ubicarte en el mapa!</span>
        </div>
      `;
      tooltip.appendChild(tooltipContainer);

      // Agregar estilos de animación
      if (!document.getElementById('tooltip-location-styles')) {
        const style = document.createElement('style');
        style.id = 'tooltip-location-styles';
        style.textContent = `
          @keyframes tooltipMove {
            0%, 100% {
              transform: translateY(-50%) translateX(0);
            }
            25% {
              transform: translateY(-50%) translateX(-5px);
            }
            50% {
              transform: translateY(-50%) translateX(0);
            }
            75% {
              transform: translateY(-50%) translateX(5px);
            }
          }
          @keyframes tooltipMoveVertical {
            0%, 100% {
              transform: translateX(-50%) translateY(0);
            }
            25% {
              transform: translateX(-50%) translateY(-5px);
            }
            50% {
              transform: translateX(-50%) translateY(0);
            }
            75% {
              transform: translateX(-50%) translateY(5px);
            }
          }
          @keyframes tooltipFadeOut {
            0% {
              opacity: 1;
            }
            85% {
              opacity: 1;
            }
            100% {
              opacity: 0;
              visibility: hidden;
            }
          }
          #tooltip-location-help {
            max-width: 280px;
            width: max-content;
          }
          .tooltip-with-arrow {
            position: relative;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          .tooltip-arrow {
            display: block;
          }
          @media (max-width: 640px) {
            #tooltip-location-help {
              max-width: calc(100vw - 80px);
              min-width: 160px;
            }
            .tooltip-with-arrow {
              font-size: 0.75rem;
              padding: 0.5rem 0.75rem;
            }
            .tooltip-with-arrow span {
              line-height: 1.3;
            }
          }
          @media (max-width: 400px) {
            #tooltip-location-help {
              max-width: calc(100vw - 60px);
            }
            .tooltip-with-arrow {
              font-size: 0.7rem;
              padding: 0.4rem 0.6rem;
            }
          }
        `;
        document.head.appendChild(style);
      }

      // Función para actualizar la posición del tooltip
      const updateTooltipPosition = () => {
        const buttonRect = locateButtonPart.getBoundingClientRect();
        const mapRect = mapContainer.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const isMobile = viewportWidth < 640;
        
        let newTooltipLeft = buttonRect.right - mapRect.left + 10;
        const newTooltipTop = buttonRect.top - mapRect.top + (buttonRect.height / 2);
        
        const estimatedTooltipWidth = isMobile ? 200 : 280;
        const spaceRight = mapRect.right - buttonRect.right;
        
        // Si no hay espacio suficiente a la derecha en móviles, ajustar posición
        if (isMobile && spaceRight < estimatedTooltipWidth + 20) {
          newTooltipLeft = buttonRect.left - mapRect.left - estimatedTooltipWidth - 20;
          // Si tampoco cabe a la izquierda, ponerlo centrado debajo del botón
          if (newTooltipLeft < 10) {
            newTooltipLeft = buttonRect.left - mapRect.left - (estimatedTooltipWidth / 2) + (buttonRect.width / 2);
            tooltip.style.top = `${buttonRect.bottom - mapRect.top + 10}px`;
            tooltip.style.transform = 'translateX(-50%)';
            tooltip.style.animation = 'tooltipMoveVertical 3s ease-in-out infinite, tooltipFadeOut 10s forwards';
            // Ocultar flecha cuando está debajo (o cambiar su posición)
            const arrow = tooltip.querySelector('.tooltip-arrow') as HTMLElement;
            if (arrow) {
              arrow.style.display = 'none';
            }
          } else {
            tooltip.style.top = `${newTooltipTop}px`;
            tooltip.style.transform = 'translateY(-50%)';
            tooltip.style.animation = 'tooltipMove 3s ease-in-out infinite, tooltipFadeOut 10s forwards';
            const arrow = tooltip.querySelector('.tooltip-arrow') as HTMLElement;
            if (arrow) arrow.style.display = 'block';
          }
        } else {
          tooltip.style.top = `${newTooltipTop}px`;
          tooltip.style.transform = 'translateY(-50%)';
          tooltip.style.animation = 'tooltipMove 3s ease-in-out infinite, tooltipFadeOut 10s forwards';
          const arrow = tooltip.querySelector('.tooltip-arrow') as HTMLElement;
          if (arrow) arrow.style.display = 'block';
        }
        
        tooltip.style.left = `${newTooltipLeft}px`;
      };

      // Agregar el tooltip al contenedor del mapa
      mapContainer.style.position = 'relative';
      mapContainer.appendChild(tooltip);

      // Actualizar posición en resize
      const resizeHandler = () => {
        if (tooltip.parentNode) {
          updateTooltipPosition();
        }
      };
      window.addEventListener('resize', resizeHandler);

      // Remover el tooltip después de 10 segundos
      const removeTooltip = () => {
        window.removeEventListener('resize', resizeHandler);
        if (tooltip.parentNode) {
          tooltip.remove();
        }
      };
      
      setTimeout(removeTooltip, 10000);

      // También remover el tooltip si el usuario hace clic en el botón de localización
      locateButtonPart.addEventListener('click', () => {
        removeTooltip();
      }, { once: true });
    }, 800);
  }

  // Mostrar el tooltip cuando el mapa esté listo
  map.whenReady(() => {
    mostrarTooltipLocalizacion();
  });

  // Escucha el evento 'locationfound' para obtener lat y lon
  map.on("locationfound", function (e: LocationEvent) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    console.log("Lat: " + lat + ", Lon: " + lon);

    // Elimina el marcador anterior si existe
    if (marker) {
      map.removeLayer(marker);
    } else {
      botonCotiza.classList.remove("btn-disabled");
    }
    // Añade un nuevo marcador en la ubicación encontrada
    marker = new Marker(e.latlng, {
      icon: iconRed,
    }).addTo(map);

    // Remove existing paths
    paths.forEach(path => map.removeLayer(path));
    paths = [];

    // Hacer zoom a la ubicación encontrada
    map.flyTo(e.latlng, 19);
    
  });

  map.on("locationerror", function (e: ErrorEvent) {
    alert(e.message);
  });

  // Agrega boton de COTIZA que haga fetch al servidor de mapas y encontrar rutas y tiempos
  async function contratar() {
    overlay.classList.remove("invisible");
    // Cálculo + guardado de la cotización web: misma lógica compartida con
    // el widget del hero (utils/cotizacionWeb.ts). Solo guarda para
    // visitantes anónimos; Confirmar/Descuento/Cancelar no vuelven a tocar
    // esta fila.
    const marca = marker.getLatLng();
    const resultado = await calcularCotizacion(marca.lat, marca.lng, !ISAUTHENTICATED);
    dataPrice = resultado.dataPrice;
    overlay.classList.add("invisible");
    if (dataPrice.error) {
      parrafo.innerHTML = dataPrice.error;
      modalPrecio.showModal();
      return;
    }
    precioFinal = resultado.precio;
    codigoActual = resultado.codigo;

    const distIda = dataPrice.distances[dataPrice.origen] / 1000;
    const distRetorno = dataPrice.distance_saguapac[0] / 1000;

    // Tabla 1: distancias de todas las bases (tiempos ajustados por factor camión)
    const basesRows = dataPrice.origins.map((origen, i) => ({
      base: origen,
      'dist (km)': (dataPrice.distances[i] / 1000).toFixed(2),
      'tiempo ida ajustado (min)': Math.round(dataPrice.times[i] * dataPrice.factor_camion / 60),
      seleccionada: i === dataPrice.origen ? '✓' : '',
    }));
    console.table(basesRows);

    // Tabla 2: desglose del precio
    console.table([
      { concepto: 'Origen seleccionado',  valor: dataPrice.origins[dataPrice.origen] },
      { concepto: 'Dist. ida (km)',        valor: distIda.toFixed(2) },
      { concepto: 'Dist. retorno (km)',    valor: distRetorno.toFixed(2) },
      { concepto: 'Dist. SCZ (km)',        valor: dataPrice.distance_scz.toFixed(2) },
      { concepto: 'Tiempo ida ajustado (min)',     valor: Math.round(dataPrice.times[dataPrice.origen] * dataPrice.factor_camion / 60) },
      { concepto: 'Tiempo retorno Saguapac (min)', valor: Math.round(dataPrice.time_saguapac[0] * dataPrice.factor_camion * dataPrice.factor_cargado / 60) },
      { concepto: 'Tiempo trabajo (min)',          valor: dataPrice.tiempo_trabajo_min },
      { concepto: 'Tiempo real (min)',     valor: dataPrice.tiempo_real_min },
      { concepto: 'Tiempo cobro (min)',    valor: dataPrice.tiempo_cobro_min },
      { concepto: 'Costo combustible',    valor: `Bs. ${dataPrice.costo_combustible.toFixed(1)}` },
      { concepto: 'Mantenimiento',        valor: `Bs. ${dataPrice.detalle_otros.mantenimiento}` },
      { concepto: 'Saguapac planta',      valor: `Bs. ${dataPrice.detalle_otros.saguapac}` },
      { concepto: 'Retorno Saguapac',     valor: `Bs. ${dataPrice.detalle_otros.retorno_saguapac}` },
      { concepto: 'Utilidad',             valor: `Bs. ${dataPrice.utilidad.toFixed(1)}` },
      { concepto: 'Factor zona',          valor: dataPrice.factor_zona },
      { concepto: 'Factor global',        valor: dataPrice.factor_global },
      { concepto: 'Chofer',              valor: `Bs. ${dataPrice.chofer.toFixed(1)}` },
      { concepto: 'PRECIO FINAL',         valor: `Bs. ${precioFinal}` },
    ]);

    botonConfirmar.textContent = "Confirmar";
    if (dataPrice.distance_scz < dataPrice.distancia_maxima_cotizar && dataPrice.factor_zona == 0) {
      parrafo.innerHTML = `<b>Bs.${precioFinal}</b> ${DATOS_GENERALES.mensaje_cotizar} <span class=" italic">Precio referencial, sujeto a confirmación. Contáctanos para más detalles.</span>` ;
      botonConfirmar.textContent = "Contáctanos";
    } else {
      parrafo.innerHTML = `<b>Bs.${precioFinal}</b> ${DATOS_GENERALES.mensaje_cotizar}`;
    }
    if (dataPrice.distance_scz > dataPrice.distancia_maxima_cotizar) {
      parrafo.innerHTML = `La ubicación seleccionada excede la distancia máxima permitida por el sistema. Por favor, contáctanos para obtener una cotización personalizada.`;
      botonConfirmar.textContent = "Contáctanos";
    }
    modalPrecio.showModal();

    // Cancelar listeners de cotizaciones anteriores antes de agregar los nuevos
    if (modalAbortController) {
      modalAbortController.abort();
    }
    modalAbortController = new AbortController();
    const { signal } = modalAbortController;

    // Confirmar solo abre WhatsApp con el mismo código: no vuelve a tocar
    // la fila guardada al calcular el precio.
    botonConfirmar.addEventListener("click", () => {
      let codigo = codigoActual;
      let celular = DATOS_GENERALES.celular;
      let menLatLon = `Código de cotización: ${codigo}%0D%0A
      ¡Hola!, Requiero el servicio de limpieza en la siguiente ubicación:%0D%0A
      https://maps.google.com/maps?q=${marker.getLatLng().lat.toFixed(7)}%2C${marker.getLatLng().lng.toFixed(7)}&z=17&hl=es`;
      mensajeWapp(menLatLon, celular);
    }, { signal });

    // Consulta por descuento de zona: mismo código de cotización, mensaje distinto.
    // Tampoco vuelve a tocar la fila guardada al calcular el precio.
    botonDescuento.addEventListener("click", () => {
      let codigo = codigoActual;
      let celular = DATOS_GENERALES.celular;
      let menDescuento = `Código de cotización: ${codigo}%0D%0A
      ¡Hola!, quisiera consultar si hay algún descuento disponible para mi zona en el servicio de limpieza en la siguiente ubicación:%0D%0A
      https://maps.google.com/maps?q=${marker.getLatLng().lat.toFixed(7)}%2C${marker.getLatLng().lng.toFixed(7)}&z=17&hl=es`;
      mensajeWapp(menDescuento, celular);
    }, { signal });

    const botonesCancelar = [modalPrecioClose, modalPrecioCancelar];
    botonesCancelar.forEach((boton) => {
      boton.addEventListener("click", () => {
        modalPrecio.close();
        // No se reenvía nada: la cotización ya quedó guardada como "CLX" al
        // calcular el precio, y cancelar no cambia ese estado.
      }, { signal });
    });
    
  }

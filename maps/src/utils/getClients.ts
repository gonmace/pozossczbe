import {
  layerGroup,
  circleMarker,
  latLng,
  Marker,
  MarkerOptions,
  CircleMarkerOptions
} from "leaflet";
import type { CircleMarker, LayerGroup } from "leaflet";
import type { Clientes } from "../types/types";
import 'leaflet.markercluster';
import { getCamiones } from './camiones';

// Extend MarkerOptions and CircleMarkerOptions to include time
declare module 'leaflet' {
  interface MarkerOptions {
    time?: string;
  }
  interface CircleMarkerOptions {
    time?: string;
  }
}

// ── Tipo extendido (la API devuelve camion aunque no esté en Clientes base) ──
type ClienteEx = Clientes & {
  camion?: number | null;
  camion_iniciales?: string | null;
  camion_nombre?: string | null;
  activo?: boolean;
  precio_cotizado?: number | null;
};

// ── CSS de popup editable (se inyecta una sola vez) ──────────────────────────
(function injectPopupStyles() {
  if (document.getElementById('__popup-edit-styles')) return;
  const s = document.createElement('style');
  s.id = '__popup-edit-styles';
  s.textContent = `
    .status-popup .leaflet-popup-content-wrapper {
      background: transparent !important;
      box-shadow: none !important;
      padding: 0 !important;
      overflow: hidden !important;
      border-radius: 0.75rem !important;
    }
    .status-popup .leaflet-popup-content { margin: 0 !important; width: auto !important; }
    .status-popup .leaflet-popup-tip-container { display: none !important; }
    .status-popup .leaflet-popup-close-button { display: none !important; }
    @keyframes chofer-alert {
      0%   { border-color: #ef4444; transform: scale(1);    opacity: 1;   }
      50%  { border-color: #fca5a5; transform: scale(1.15); opacity: 0.6; }
      100% { border-color: #ef4444; transform: scale(1);    opacity: 1;   }
    }
  `;
  document.head.appendChild(s);
})();

const STATUS_CLASS_POP: Record<string, string> = {
  PRG: "st-prg", EJE: "st-eje", CAN: "st-can", COT: "st-cot", NEG: "st-neg",
};
const ST_ALL_POP = Object.values(STATUS_CLASS_POP);

const POPUP_WA = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20.52 3.48A11.93 11.93 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.16 1.6 5.97L0 24l6.18-1.62A11.93 11.93 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.21-1.25-6.22-3.48-8.52zm-8.52 18.4a9.89 9.89 0 0 1-5.04-1.38l-.36-.22-3.67.96.98-3.58-.23-.37A9.93 9.93 0 0 1 2.07 12c0-5.48 4.46-9.93 9.93-9.93 2.65 0 5.15 1.03 7.02 2.91A9.88 9.88 0 0 1 21.93 12c0 5.48-4.45 9.93-9.93 9.93zm5.44-7.44c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.94 1.17-.18.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.47-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.63-.93-2.23-.24-.58-.49-.5-.68-.51-.17 0-.37-.02-.57-.02s-.52.07-.8.37c-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.1 4.49.71.31 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z"/></svg>`;

function getCsrfGC(): string {
  return document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "";
}
async function patchClienteGC(id: number, data: Record<string, unknown>) {
  await fetch(`/api/v1/clientes/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfGC() },
    body: JSON.stringify(data),
  });
}

function makePopupHtml(cd: ClienteEx): string {
  const stClass = STATUS_CLASS_POP[cd.status] ?? '';
  const rawDate = cd.created_at as unknown as string;
  const fecha = new Date(rawDate);
  const fechaFmt = `${fecha.getDate().toString().padStart(2,'0')}/${(fecha.getMonth()+1).toString().padStart(2,'0')}/${fecha.getFullYear()}`;
  const precio = cd.cost ?? 0;
  const tel = cd.tel1?.toString() || '';
  const waLink = tel
    ? `<a href="https://wa.me/${tel.replace(/[^\d+]/g,'')}" target="_blank"
           class="inline-flex items-center gap-1" style="color:#374151;font-size:12px;"
           onclick="event.stopPropagation()">
         <span style="color:#25D366;flex-shrink:0;">${POPUP_WA}</span>${tel}
       </a>`
    : '';

  const comentario = (cd.address || '').trim();
  const comentarioHtml = comentario
    ? `<div class="status-sep" style="padding:3px 10px;color:#374151;font-size:11px;line-height:1.25;word-break:break-word;">${comentario}</div>`
    : '';

  return `
  <div class="status-card ${stClass} rounded-lg overflow-hidden"
       style="min-width:180px;font-size:12px;background:#ffffff;box-shadow:0 8px 20px rgba(0,0,0,0.25),0 0 0 1px rgba(0,0,0,0.08);">
    <div style="padding:4px 10px 2px;">
      <p class="font-bold truncate" style="color:#111827;font-size:13px;line-height:1.15;margin:0;">
        ${cd.name || '(sin nombre)'}
      </p>
      ${waLink ? `<div style="margin-top:1px;line-height:1.1;">${waLink}</div>` : ''}
    </div>
    <div class="flex items-center justify-between gap-2 status-sep" style="padding:3px 10px;">
      <div class="flex items-baseline gap-0.5">
        <span style="color:#b45309;font-size:10px;font-weight:600;">Bs.</span>
        <span style="color:#b45309;font-size:13px;font-weight:700;">${precio}</span>
      </div>
      <span style="color:#4b5563;font-size:11px;font-weight:500;">${fechaFmt}</span>
    </div>
    ${comentarioHtml}
  </div>`;
}

function wirePopup(popupEl: HTMLElement, cd: ClienteEx, marca: CircleMarker) {
  const refresh = () => {
    marca.setPopupContent(makePopupHtml(cd));
    const newEl = marca.getPopup()?.getElement();
    if (newEl) wirePopup(newEl, cd, marca);
  };

  // Click en el popup (fuera de links/inputs/selects/buttons) cierra el popup
  const card = popupEl.querySelector<HTMLElement>('.status-card');
  if (card) {
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('a, input, select, button, .popup-camion-btn, .popup-comment-txt')) return;
      marca.closePopup();
    });
  }

  // Status select
  const sel = popupEl.querySelector<HTMLSelectElement>('.popup-status-sel');
  if (sel) {
    sel.addEventListener('change', async () => {
      cd.status = sel.value;
      await patchClienteGC(cd.id, { status: cd.status });
      refresh();
    });
  }

  // Price input
  const costInp = popupEl.querySelector<HTMLInputElement>('.popup-cost-inp');
  if (costInp) {
    costInp.addEventListener('blur', async () => {
      const newCost = parseInt(costInp.value) || 0;
      cd.cost = newCost;
      await patchClienteGC(cd.id, { cost: newCost });
    });
    costInp.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') costInp.blur(); });
  }

  // Comment click-to-edit
  const commentTxt = popupEl.querySelector<HTMLElement>('.popup-comment-txt');
  if (commentTxt) {
    commentTxt.addEventListener('click', () => {
      const currentVal = cd.address ?? '';
      const inp = document.createElement('input');
      inp.type = 'text'; inp.value = currentVal; inp.maxLength = 200;
      inp.className = 'input input-xs flex-1 min-w-0 text-xs';
      commentTxt.replaceWith(inp);
      inp.focus();
      let saved = false;
      const save = async () => {
        if (saved) return; saved = true;
        cd.address = inp.value.trim();
        await patchClienteGC(cd.id, { address: cd.address });
        refresh();
      };
      inp.addEventListener('blur', save);
      inp.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') inp.blur();
        if (e.key === 'Escape') { saved = true; inp.replaceWith(commentTxt); }
      });
    });
  }

  // Camion picker
  const camionBtn = popupEl.querySelector<HTMLElement>('.popup-camion-btn');
  if (camionBtn) {
    camionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelector('.popup-camion-picker')?.remove();
      const camiones = getCamiones();
      if (!camiones.length) return;
      const picker = document.createElement('div');
      picker.className = 'popup-camion-picker';
      picker.style.cssText = `position:fixed;z-index:9999;background:var(--color-base-200,#1d2430);border:1px solid rgba(255,255,255,0.12);border-radius:0.5rem;box-shadow:0 8px 24px rgba(0,0,0,0.4);min-width:160px;padding:0.25rem 0;`;
      camiones.forEach(cam => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors';
        item.style.cssText = 'color:inherit;background:none;border:none;cursor:pointer;';
        const ch = cam.operador.trim()[0]?.toUpperCase() ?? '';
        const tr = cam.marca?.trim()[0]?.toUpperCase() ?? '';
        const inic = tr ? `${ch}-${tr}` : ch;
        item.textContent = `${inic}  ${cam.operador}${cam.id === cd.camion ? ' ✓' : ''}`;
        item.addEventListener('click', async () => {
          picker.remove();
          cd.camion = cam.id; cd.camion_iniciales = inic; cd.camion_nombre = cam.operador;
          await patchClienteGC(cd.id, { camion: cam.id });
          refresh();
        });
        picker.appendChild(item);
      });
      const noneItem = document.createElement('button');
      noneItem.type = 'button';
      noneItem.className = 'w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors';
      noneItem.style.cssText = 'color:rgba(255,255,255,0.4);background:none;border:none;cursor:pointer;border-top:1px solid rgba(255,255,255,0.08);margin-top:0.25rem;';
      noneItem.textContent = '— Sin asignar';
      noneItem.addEventListener('click', async () => {
        picker.remove();
        cd.camion = null; cd.camion_iniciales = null; cd.camion_nombre = undefined;
        await patchClienteGC(cd.id, { camion: null });
        refresh();
      });
      picker.appendChild(noneItem);
      document.body.appendChild(picker);
      const rect = camionBtn.getBoundingClientRect();
      const pw = picker.offsetWidth || 160;
      let left = rect.right - pw;
      if (left < 4) left = 4;
      picker.style.left = `${left}px`;
      picker.style.top = `${rect.bottom + 4}px`;
      const onOut = (ev: MouseEvent) => {
        if (!picker.contains(ev.target as Node)) { picker.remove(); document.removeEventListener('click', onOut, true); }
      };
      setTimeout(() => document.addEventListener('click', onOut, true), 0);
    });
  }
}

let p300: any = [],
  p350: any = [],
  p400: any = [],
  p450: any = [],
  p500: any = [],
  p600: any = [],
  p700: any = [],
  p800: any = [],
  p900: any = [],
  p1000: any = [],
  pNegro: any = [];

const colors = ['#ffff00', '#fba657', '#4ade80', '#52b551', '#ff0000', '#00ffff', '#50dbff', '#5eb9fc', '#6199ee', '#808080', 'black'];
const urlGet = '/api/v1/clientes/';

let group300 = layerGroup(),
  group350 = layerGroup(),
  group400 = layerGroup(),
  group450 = layerGroup(),
  group500 = layerGroup(),
  group600 = layerGroup(),
  group700 = layerGroup(),
  group800 = layerGroup(),
  group900 = layerGroup(),
  group1000 = layerGroup(),
  groupADM = layerGroup(),
  groupCLC = layerGroup(),
  groupCLX = layerGroup(),
  groupNegro = layerGroup();

let groupEje = [group300, group350, group400, group450, group500, group600, group700, group800, group900, group1000, groupNegro];
let groupCot = [groupADM, groupCLC, groupCLX];

var circleStyle = function (point: number): CircleMarkerOptions {
  return {
    fillColor: colors[point],
    radius: 8,
    stroke: true,
    color: "black",
    weight: 2,
    opacity: 1,
    fillOpacity: 1,
    // className: "marker",
  };
};

function formatearFecha(date: Date): string {
  const dia = date.getDate().toString().padStart(2, '0');
  const mes = (date.getMonth() + 1).toString().padStart(2, '0');
  const anio = date.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

export async function refreshClients() {
  groupEje.forEach(group => group.clearLayers());
  groupCot.forEach(group => group.clearLayers());
  p300 = []; p350 = []; p400 = []; p450 = []; p500 = [];
  p600 = []; p700 = []; p800 = []; p900 = []; p1000 = []; pNegro = [];
  return await fetchClients();
}

window.addEventListener('clientUpdated', refreshClients);

export async function fetchClients(): Promise<{ groupEje: LayerGroup[], groupCot: LayerGroup[] }> {
  const clientes: Clientes[] = await fetch(urlGet)
    .then(resp => resp.json())
    .then(data => {
      return data;
    }).catch(error => {
      console.error('Error:', error);
      throw error;
    })
  let color: number;
  let precio: number;
  let tel1: string;
  let marca: Marker | CircleMarker;
  let date: Date;

  clientes.forEach((e) => {
    // Calcular color base dividiendo el costo por 100
    color = e.cost / 100;
    // Asignación de color basado en el valor de 'color'
    if (color <= 3) {
      color = 0;
    } else if (color < 5) {
      color = Math.round(color * 2) / 2;  // Redondea a .5 más cercano
      color = color <= 3.5 ? 1 : color === 4 ? 2 : 3;
    } else if (color < 10) {
      color = Math.trunc(color) - 1;
    } else {
      color = 9;
    }
    switch (color) {
      case 0:
        p300.push([e.lat, e.lon, e.cost, e.status, e.user, e.tel1, e.name, e.created_at]);
        break;
      case 1:
        p350.push([e.lat, e.lon, e.cost, e.status, e.user, e.tel1, e.name, e.created_at]);
        break;
      case 2:
        p400.push([e.lat, e.lon, e.cost, e.status, e.user, e.tel1, e.name, e.created_at]);
        break;
      case 3:
        p450.push([e.lat, e.lon, e.cost, e.status, e.user, e.tel1, e.name, e.created_at]);
        break;
      case 4:
        p500.push([e.lat, e.lon, e.cost, e.status, e.user, e.tel1, e.name, e.created_at]);
        break;
      case 5:
        p600.push([e.lat, e.lon, e.cost, e.status, e.user, e.tel1, e.name, e.created_at]);
        break;
      case 6:
        p700.push([e.lat, e.lon, e.cost, e.status, e.user, e.tel1, e.name, e.created_at]);
        break;
      case 7:
        p800.push([e.lat, e.lon, e.cost, e.status, e.user, e.tel1, e.name, e.created_at]);
        break;
      case 8:
        p900.push([e.lat, e.lon, e.cost, e.status, e.user, e.tel1, e.name, e.created_at]);
        break;
      default:
        pNegro.push([e.lat, e.lon, e.cost, e.status, e.user, e.tel1, e.name, e.created_at]);
    }

    e.tel1 ? tel1 = e.tel1.toString() : tel1 = "ND"
    let date = convertirFechaISOaMasUno(e.created_at.toString());
    
    let markerOptions = {
      ...circleStyle(color),
      time: date
    };
    
    marca = circleMarker([e.lat, e.lon], markerOptions);
    // marca = new Marker([e.lat, e.lon], {time: date});

    const cd: ClienteEx = { ...(e as ClienteEx) };
    marca.bindPopup(makePopupHtml(cd), { className: 'status-popup', maxWidth: 290 });
    marca.on('popupopen', () => {
      const el = marca.getPopup()?.getElement();
      if (el) wirePopup(el, cd, marca as CircleMarker);
    });

    let parentGroup: LayerGroup | null = null;
    if (e.status == "COT" || e.status == "WEB") {
      if (e.user == "ADM") { parentGroup = groupADM; }
      else if (e.user == "CLC") { parentGroup = groupCLC; }
      else { parentGroup = groupCLX; }
    } else {
      parentGroup = e.status == "EJE" ? groupEje[color] : groupEje[10];
    }
    if (parentGroup) {
      marca.addTo(parentGroup);
      (marca as any)._parentGroup = parentGroup;
    }
  });
  return { groupEje, groupCot};
}

function convertirFechaISOaMasUno(isoString: string): string {
  const fechaUtc = new Date(isoString);

  const año = fechaUtc.getFullYear();
  const mes = (fechaUtc.getMonth() + 1).toString().padStart(2, "0");
  const dia = fechaUtc.getDate().toString().padStart(2, "0");

  return `${año}-${mes}-${dia}`;
}
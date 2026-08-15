import type { Map } from "leaflet";
import { buildCamionOptions, cargarCamiones, getCamiones, getCamionIniciales } from "./utils/camiones";
import dragModal from "./utils/dragModal";

export interface DatoCliente {
  id: number;
  name: string | null;
  lat: number;
  lon: number;
  status: string;
  tel1: string | null;
  cost: number | null;
  precio_cotizado: number | null;
  address: string | null;
  hora_programada: string | null;
  camion: number | null;
  camion_iniciales: string;
  camion_nombre: string;
  created_at?: string | null;
}

export const STATUS_BORDER: Record<string, string> = {
  PRG: "#2196F3", EJE: "#43A047", CAN: "#E53935", COT: "#FF9800", WEB: "#9E9E9E",
};

function getCsrf(): string {
  return document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "";
}

async function patchCliente(id: number, data: Record<string, unknown>) {
  await fetch(`/api/v1/clientes/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrf() },
    body: JSON.stringify(data),
  });
}

async function postReordenar(ordenIds: number[]) {
  await fetch(`/api/v1/clientes/reordenar/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrf() },
    body: JSON.stringify({ orden: ordenIds }),
  });
}

function fmtHora(raw: string | null): string {
  if (!raw) return "";
  const dt = new Date(raw);
  if (!isNaN(dt.getTime())) {
    return dt.toLocaleString("es-BO", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  }
  const parts = raw.split(":");
  if (parts.length >= 2) return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
  return raw;
}

const WA_ICON = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20.52 3.48A11.93 11.93 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.16 1.6 5.97L0 24l6.18-1.62A11.93 11.93 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.21-1.25-6.22-3.48-8.52zm-8.52 18.4a9.89 9.89 0 0 1-5.04-1.38l-.36-.22-3.67.96.98-3.58-.23-.37A9.93 9.93 0 0 1 2.07 12c0-5.48 4.46-9.93 9.93-9.93 2.65 0 5.15 1.03 7.02 2.91A9.88 9.88 0 0 1 21.93 12c0 5.48-4.45 9.93-9.93 9.93zm5.44-7.44c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.94 1.17-.18.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.47-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.63-.93-2.23-.24-.58-.49-.5-.68-.51-.17 0-.37-.02-.57-.02s-.52.07-.8.37c-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.1 4.49.71.31 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z"/></svg>`;

// Ocultar spinner del input number para que no coma ancho en vistas angostas
(function injectActivosStyles() {
  if (document.getElementById("__activos-no-spinner")) return;
  const s = document.createElement("style");
  s.id = "__activos-no-spinner";
  s.textContent = `
    .activo-cost-inp.no-spinner::-webkit-inner-spin-button,
    .activo-cost-inp.no-spinner::-webkit-outer-spin-button {
      -webkit-appearance: none; margin: 0;
    }
    .activo-cost-inp.no-spinner { -moz-appearance: textfield; }
  `;
  document.head.appendChild(s);
})();

const GRIP_ICON = `<svg class="activo-drag-handle shrink-0 cursor-grab active:cursor-grabbing" width="9" height="13" viewBox="0 0 9 13" fill="currentColor" style="opacity:0.3;" title="Arrastrar para reordenar">
  <circle cx="2" cy="1.5" r="1.5"/><circle cx="7" cy="1.5" r="1.5"/>
  <circle cx="2" cy="6.5" r="1.5"/><circle cx="7" cy="6.5" r="1.5"/>
  <circle cx="2" cy="11.5" r="1.5"/><circle cx="7" cy="11.5" r="1.5"/>
</svg>`;

export function initClientesActivosModal(map: Map) {
  let _clientes: DatoCliente[] = [];
  let _manualOrder: number[] | null = null;
  let _dragId: number | null = null;
  cargarCamiones(); // pre-carga para que el select sea instantáneo

  function render() {
    const list = document.getElementById("modal-activos-list");
    const countEl = document.getElementById("modal-activos-count");
    if (!list) return;

    let filtrados: DatoCliente[];
    if (_manualOrder) {
      const orderMap = new Map(_manualOrder.map((id, i) => [id, i]));
      filtrados = [..._clientes].sort((a, b) => {
        const ia = orderMap.has(a.id) ? orderMap.get(a.id)! : Infinity;
        const ib = orderMap.has(b.id) ? orderMap.get(b.id)! : Infinity;
        return ia - ib;
      });
    } else {
      const STATUS_ORDER: Record<string, number> = { PRG: 0, EJE: 1, CAN: 2, COT: 3, WEB: 4 };
      filtrados = [..._clientes].sort((a, b) => {
        const orderDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        if (orderDiff !== 0) return orderDiff;
        // COT / WEB: más reciente primero
        if (a.status === "COT" || a.status === "WEB") {
          const da = a.created_at ?? "";
          const db = b.created_at ?? "";
          return db.localeCompare(da);
        }
        // Otros: ordenar por hora programada (nulls al final)
        if (!a.hora_programada && !b.hora_programada) return 0;
        if (!a.hora_programada) return 1;
        if (!b.hora_programada) return -1;
        return a.hora_programada.localeCompare(b.hora_programada);
      });
    }

    if (countEl) countEl.textContent = filtrados.length.toString();

    // Contadores por estado
    const counts: Record<string, number> = { PRG: 0, EJE: 0, CAN: 0, COT: 0, WEB: 0 };
    for (const c of filtrados) if (c.status in counts) counts[c.status]++;
    for (const [st, id] of [["PRG","modal-activos-prg"],["EJE","modal-activos-eje"],["CAN","modal-activos-can"],["COT","modal-activos-cot"],["WEB","modal-activos-web"]] as [string,string][]) {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = counts[st] > 0 ? `${st} ${counts[st]}` : "";
        el.style.display = counts[st] > 0 ? "" : "none";
      }
    }

    const renderCard = (c: DatoCliente) => {
      const border = STATUS_BORDER[c.status] ?? "#9E9E9E";
      const hora = fmtHora(c.hora_programada);
      const waLink = c.tel1
        ? `<a href="https://wa.me/${c.tel1.replace(/[^\d+]/g, "")}" target="_blank"
              class="inline-flex items-center gap-1 text-xs"
              style="color:#25D366;" onclick="event.stopPropagation()">${WA_ICON} ${c.tel1}</a>`
        : `<span class="text-xs" style="color:rgba(255,255,255,0.2);">Sin tel.</span>`;
      const horaChip = (() => {
        if (!hora || !c.hora_programada) return "";
        const dt = new Date(c.hora_programada);
        if (isNaN(dt.getTime())) return "";
        const diffMin = (dt.getTime() - Date.now()) / 60000;
        let chipColor: string, chipBg: string, chipBorder: string, pulse = false;
        if (diffMin >= 120) {
          chipColor = "#43A047"; chipBg = "#43A04718"; chipBorder = "#43A04780";
        } else if (diffMin >= 60) {
          chipColor = "#FDD835"; chipBg = "#FDD83518"; chipBorder = "#FDD83580";
        } else {
          chipColor = "#E53935"; chipBg = "#E5393518"; chipBorder = "#E5393580";
          pulse = diffMin < 0; // parpadeo si ya pasó
        }
        const pulseStyle = pulse ? "animation:hora-pulse 1.2s ease-in-out infinite;" : "";
        return `<span class="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                     style="background:${chipBg};color:${chipColor};border:1px solid ${chipBorder};${pulseStyle}">
                 <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                 ${hora}
               </span>`;
      })();
      const cotFecha = (() => {
        if (c.status !== "COT" || !c.created_at) return "";
        const dt = new Date(c.created_at);
        if (isNaN(dt.getTime())) return "";
        return `<span class="text-[11px] font-normal shrink-0" style="color:rgba(255,255,255,0.9);">${dt.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit" })} - ${dt.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>`;
      })();
      const chofBadge = c.status === "COT"
        ? ""
        : c.camion_iniciales
          ? `<button class="activo-chofer-badge absolute -top-2.5 -right-2.5 z-10
                 w-7 h-7 rounded-full flex items-center justify-center
                 text-[9px] font-extrabold shadow-md cursor-pointer
                 border-2 hover:scale-110 transition-transform"
               style="background:#f0f4f8;color:#1a202c;border-color:${border};"
               data-id="${c.id}"
               title="Chofer: ${c.camion_nombre || c.camion_iniciales} — click para cambiar"
               >${c.camion_iniciales}</button>`
          : `<button class="activo-chofer-badge absolute -top-2.5 -right-2.5 z-10
                 w-7 h-7 rounded-full flex items-center justify-center text-sm font-black
                 shadow-md cursor-pointer border-2 hover:scale-110 transition-transform"
               style="background:${c.status === "PRG" ? "#dc2626" : "#fee2e2"};color:${c.status === "PRG" ? "#fff" : "#dc2626"};border-color:#fca5a5;${c.status === "PRG" && window.innerWidth >= 640 ? "animation:chofer-alert 1.2s ease-in-out infinite;" : ""}"
               data-id="${c.id}"
               title="Sin chofer — click para asignar">?</button>`;
      return `
      <div class="rounded-xl border transition-all duration-150 hover:brightness-110 relative break-inside-avoid mb-4"
           draggable="true" data-drag-id="${c.id}"
           style="background:${border}12;border:1px solid ${border}30;border-left:4px solid ${border};">
        ${chofBadge}
        <div class="px-3 pt-2 pb-1.5">
          <div class="flex items-center gap-1.5 mb-1.5">
            ${GRIP_ICON}
            <p class="flex-1 text-sm leading-snug truncate">${c.name ?? "(sin nombre)"}</p>
            ${cotFecha}
            ${horaChip}
          </div>
          <div class="flex items-center gap-1">
            <div class="flex-none">${waLink}</div>
            <div class="flex-1"></div>
            <div class="flex-none">
              <select class="select select-xs font-bold activo-status-sel"
                      data-id="${c.id}"
                      style="background:#000;border-color:${border}60;color:${border};">
                <option value="PRG" ${c.status === "PRG" ? "selected" : ""}>Programado</option>
                <option value="EJE" ${c.status === "EJE" ? "selected" : ""}>Ejecutado</option>
                <option value="COT" ${c.status === "COT" ? "selected" : ""}>Cotizado</option>
                <option value="CAN" ${c.status === "CAN" ? "selected" : ""}>Cancelado</option>
                <option value="WEB" ${c.status === "WEB" ? "selected" : ""}>Web</option>
              </select>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 px-3 py-2" style="border-top:1px solid ${border}20;">
          <span class="flex-1 text-xs line-clamp-1 min-w-0 cursor-text activo-comment-txt"
                data-id="${c.id}" title="Click para editar"
                style="color:rgba(255,255,255,0.5);">
            ${c.address || '<span class="italic" style="color:rgba(255,255,255,0.25);">Sin comentario</span>'}
          </span>
          <button class="btn btn-xs btn-ghost btn-square activo-fly-btn shrink-0"
                  data-lat="${c.lat}" data-lon="${c.lon}" title="Ver en mapa"
                  style="color:${border};opacity:0.7;">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
          </button>
          <div class="flex items-center gap-0.5 shrink-0 rounded-md px-1 py-0.5"
               style="background:#FFD54F18;border:1px solid #FFD54F50;">
            <span class="text-[10px] font-semibold" style="color:#FFD54F99;">Bs.</span>
            <input type="number" min="0" step="100"
              class="input input-xs w-16 shrink-0 text-right font-bold border-0 bg-transparent p-0 activo-cost-inp no-spinner"
              data-id="${c.id}" value="${c.cost ?? 0}"
              style="color:#FFD54F;outline:none;box-shadow:none;" />
          </div>
        </div>
      </div>`;
    };

    const col1 = document.getElementById("modal-activos-col-1");
    const col2 = document.getElementById("modal-activos-col-2");
    const esMobile = window.innerWidth < 640;
    if (esMobile) {
      if (col1) col1.innerHTML = filtrados.map(renderCard).join("");
      if (col2) col2.innerHTML = "";
    } else {
      const mitad = Math.ceil(filtrados.length / 2);
      if (col1) col1.innerHTML = filtrados.slice(0, mitad).map(renderCard).join("");
      if (col2) col2.innerHTML = filtrados.slice(mitad).map(renderCard).join("");
    }

    // Drag & drop reordering
    const allCards = list.querySelectorAll<HTMLElement>("[data-drag-id]");
    allCards.forEach(card => {
      card.addEventListener("dragstart", (e) => {
        _dragId = parseInt(card.dataset.dragId!);
        e.dataTransfer!.effectAllowed = "move";
        setTimeout(() => { card.style.opacity = "0.4"; }, 0);
      });
      card.addEventListener("dragend", () => {
        card.style.opacity = "";
        allCards.forEach(c => { c.style.boxShadow = ""; });
        _dragId = null;
      });
      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = "move";
        allCards.forEach(c => { c.style.boxShadow = ""; });
        const rect = card.getBoundingClientRect();
        const insertBefore = (e as DragEvent).clientY < rect.top + rect.height / 2;
        card.style.boxShadow = insertBefore
          ? "inset 0 3px 0 #38bdf8"
          : "inset 0 -3px 0 #38bdf8";
      });
      card.addEventListener("dragleave", (e) => {
        const rel = (e as DragEvent).relatedTarget as Node | null;
        if (rel && card.contains(rel)) return;
        card.style.boxShadow = "";
      });
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.style.boxShadow = "";
        if (_dragId === null) return;
        const targetId = parseInt(card.dataset.dragId!);
        if (_dragId === targetId) return;
        const currentOrder = _manualOrder ?? filtrados.map(c => c.id);
        const fromIdx = currentOrder.indexOf(_dragId);
        const toIdx = currentOrder.indexOf(targetId);
        if (fromIdx === -1 || toIdx === -1) return;
        const rect = card.getBoundingClientRect();
        const insertBefore = (e as DragEvent).clientY < rect.top + rect.height / 2;
        const newOrder = [...currentOrder];
        const [dragged] = newOrder.splice(fromIdx, 1);
        const newToIdx = newOrder.indexOf(targetId);
        newOrder.splice(insertBefore ? newToIdx : newToIdx + 1, 0, dragged);
        // Re-agrupar por estado para respetar el orden PRG → EJE → CAN → COT → WEB
        const STATUS_PRIORITY = ["PRG", "EJE", "CAN", "COT", "WEB"];
        const byStatus: Record<string, number[]> = { PRG: [], EJE: [], CAN: [], COT: [], WEB: [] };
        for (const id of newOrder) {
          const cl = _clientes.find(x => x.id === id);
          const st = cl?.status ?? "COT";
          (byStatus[st] ?? byStatus["COT"]).push(id);
        }
        const constrainedOrder = STATUS_PRIORITY.flatMap(st => byStatus[st]);
        _manualOrder = constrainedOrder;
        render();
        postReordenar(constrainedOrder);
      });
    });

    // Status change
    list.querySelectorAll<HTMLSelectElement>(".activo-status-sel").forEach(sel => {
      sel.addEventListener("change", async () => {
        const id = parseInt(sel.dataset.id!);
        const prevStatus = _clientes.find(x => x.id === id)?.status;
        const newStatus = sel.value;
        await patchCliente(id, { status: newStatus });
        const c = _clientes.find(x => x.id === id);
        if (c) c.status = newStatus;
        // Si hay orden manual, reajustar para que el cliente quede en su grupo correcto
        if (_manualOrder) {
          const STATUS_PRIORITY = ["PRG", "EJE", "CAN", "COT", "WEB"];
          const byStatus: Record<string, number[]> = { PRG: [], EJE: [], CAN: [], COT: [], WEB: [] };
          for (const oid of _manualOrder) {
            const cl = _clientes.find(x => x.id === oid);
            const st = cl?.status ?? "COT";
            (byStatus[st] ?? byStatus["COT"]).push(oid);
          }
          _manualOrder = STATUS_PRIORITY.flatMap(st => byStatus[st]);
        }
        document.dispatchEvent(new CustomEvent("jornadaClienteChanged", { detail: {
          id, status: newStatus,
          camion: c?.camion ?? null,
          camion_iniciales: c?.camion_iniciales ?? "",
          camion_nombre: c?.camion_nombre ?? "",
        }}));
        // Re-renderizar si el badge del chofer debe aparecer o desaparecer
        if (prevStatus === "COT" || newStatus === "COT") {
          render();
        } else {
          const border = STATUS_BORDER[newStatus] ?? "#9E9E9E";
          sel.style.background = "#000";
          sel.style.borderColor = border;
          sel.style.color = border;
          sel.closest<HTMLElement>("[style*='border-left']")!.style.borderLeftColor = border;
        }
      });
    });

    // Price change
    list.querySelectorAll<HTMLInputElement>(".activo-cost-inp").forEach(inp => {
      const save = async () => {
        const id = parseInt(inp.dataset.id!);
        const newCost = parseInt(inp.value) || 0;
        await patchCliente(id, { cost: newCost });
        const c = _clientes.find(x => x.id === id);
        if (c) c.cost = newCost;
      };
      inp.addEventListener("blur", save);
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    });

    // Comment click-to-edit
    list.querySelectorAll<HTMLElement>(".activo-comment-txt").forEach(span => {
      span.addEventListener("click", () => {
        const id = parseInt(span.dataset.id!);
        const c = _clientes.find(x => x.id === id);
        const currentVal = c?.address ?? "";
        const inp = document.createElement("input");
        inp.type = "text";
        inp.value = currentVal;
        inp.maxLength = 200;
        inp.className = "input input-xs min-w-0 text-xs";
        inp.style.cssText = "width:0;flex:1 1 0%;max-width:100%;";
        span.replaceWith(inp);
        inp.focus();
        let saved = false;
        const save = async () => {
          if (saved) return;
          saved = true;
          const newVal = inp.value.trim();
          if (c) c.address = newVal;
          await patchCliente(id, { address: newVal });
          render();
        };
        inp.addEventListener("blur", save);
        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter") inp.blur();
          if (e.key === "Escape") { saved = true; inp.value = currentVal; render(); }
        });
      });
    });

    // Fly-to: minimizar modal e ir al punto con zoom moderado
    list.querySelectorAll<HTMLElement>(".activo-fly-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const content = document.getElementById("modalClientesActivosContent");
        const collapseBtn = document.getElementById("modalClientesActivosCollapseBtn");
        if (content && content.style.display !== "none") {
          content.style.display = "none";
          if (collapseBtn) collapseBtn.textContent = "▲";
        }
        map.flyTo([parseFloat(btn.dataset.lat!), parseFloat(btn.dataset.lon!)], 14);
      });
    });

    // Chofer badge — editar asignación con dropdown personalizado
    list.querySelectorAll<HTMLElement>(".activo-chofer-badge").forEach(badge => {
      badge.addEventListener("click", async (e) => {
        e.stopPropagation();

        // Cerrar cualquier dropdown abierto
        document.querySelectorAll(".chofer-dropdown").forEach(d => d.remove());

        const id = parseInt(badge.dataset.id!);
        const c = _clientes.find(x => x.id === id);
        const camiones = await cargarCamiones();

        const dropdown = document.createElement("div");
        dropdown.className = "chofer-dropdown";
        dropdown.style.cssText = `
          position: absolute;
          top: 1.75rem;
          right: -0.25rem;
          z-index: 50;
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 0.5rem;
          min-width: 10rem;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
          overflow: hidden;
        `;

        const items: { id: number | null; label: string }[] = [
          { id: null, label: "— Sin asignar —" },
          ...camiones.map(cam => ({ id: cam.id, label: cam.operador })),
        ];

        dropdown.innerHTML = items.map(item => {
          const isSelected = item.id === (c?.camion ?? null);
          return `<div class="chofer-option px-3 py-2 text-xs cursor-pointer flex items-center gap-2"
                       style="color:${isSelected ? "#38bdf8" : "#e2e8f0"};background:${isSelected ? "#0f172a" : "transparent"};"
                       data-camion-id="${item.id ?? ""}">
            ${isSelected ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : `<span style="width:10px;display:inline-block;"></span>`}
            ${item.label}
          </div>`;
        }).join("");

        // Hover
        dropdown.querySelectorAll<HTMLElement>(".chofer-option").forEach(opt => {
          opt.addEventListener("mouseenter", () => {
            if (opt.style.background !== "rgb(15, 23, 42)") opt.style.background = "#1e3a5f";
          });
          opt.addEventListener("mouseleave", () => {
            const camId = opt.dataset.camionId;
            const isSelected = (camId === "" && c?.camion == null) || (camId && parseInt(camId) === c?.camion);
            opt.style.background = isSelected ? "#0f172a" : "transparent";
          });

          opt.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            dropdown.remove();
            const rawId = opt.dataset.camionId;
            const newCamionId = rawId ? parseInt(rawId) : null;
            if (c) c.camion = newCamionId;
            await patchCliente(id, { camion: newCamionId });
            const lista = getCamiones();
            const found = lista.find(x => x.id === newCamionId);
            if (c) {
              c.camion_iniciales = found ? getCamionIniciales(found.operador) : "";
              c.camion_nombre = found ? found.operador : "";
            }
            document.dispatchEvent(new CustomEvent("jornadaClienteChanged", { detail: {
              id,
              status: c?.status ?? "",
              camion: newCamionId,
              camion_iniciales: c?.camion_iniciales ?? "",
              camion_nombre: c?.camion_nombre ?? "",
            }}));
            render();
          });
        });

        badge.closest<HTMLElement>(".relative")?.appendChild(dropdown);

        // Cerrar al click fuera
        const closeHandler = (ev: MouseEvent) => {
          if (!dropdown.contains(ev.target as Node) && ev.target !== badge) {
            dropdown.remove();
            document.removeEventListener("click", closeHandler);
          }
        };
        setTimeout(() => document.addEventListener("click", closeHandler), 0);
      });
    });
  }

  // Drag
  dragModal("draggableClientesActivos", "modalClientesActivosHeader");

  // Colapsar
  const collapseBtn = document.getElementById("modalClientesActivosCollapseBtn");
  const content = document.getElementById("modalClientesActivosContent");
  if (collapseBtn && content) {
    collapseBtn.onclick = () => {
      const collapsed = content.style.display === "none";
      content.style.display = collapsed ? "" : "none";
      collapseBtn.textContent = collapsed ? "▼" : "▲";
    };
  }

  // Cerrar
  const closeBtn = document.getElementById("modalClientesActivosCloseBtn");
  if (closeBtn) {
    closeBtn.onclick = () => {
      (document.getElementById("modal-clientes-activos") as HTMLDialogElement)?.close();
    };
  }

  return {
    setClientes(clientes: DatoCliente[]) { _clientes = clientes; },
    render,
  };
}

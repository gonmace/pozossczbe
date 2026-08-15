/**
 * Card reutilizable de cliente.
 * Usa las clases CSS .status-card, .status-badge, .st-* definidas en styles.css.
 */

export const STATUS_CLASS: Record<string, string> = {
  PRG: "st-prg", EJE: "st-eje", CAN: "st-can", COT: "st-cot", NEG: "st-neg",
};

export const STATUS_LABEL: Record<string, string> = {
  PRG: "Programado", EJE: "Ejecutado", CAN: "Cancelado", COT: "Cotizado", NEG: "Negado",
};

const ST_ALL = Object.values(STATUS_CLASS);

export const WA_ICON = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M20.52 3.48A11.93 11.93 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.16 1.6 5.97L0 24l6.18-1.62A11.93 11.93 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.21-1.25-6.22-3.48-8.52zm-8.52 18.4a9.89 9.89 0 0 1-5.04-1.38l-.36-.22-3.67.96.98-3.58-.23-.37A9.93 9.93 0 0 1 2.07 12c0-5.48 4.46-9.93 9.93-9.93 2.65 0 5.15 1.03 7.02 2.91A9.88 9.88 0 0 1 21.93 12c0 5.48-4.45 9.93-9.93 9.93zm5.44-7.44c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.94 1.17-.18.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.47-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.63-.93-2.23-.24-.58-.49-.5-.68-.51-.17 0-.37-.02-.57-.02s-.52.07-.8.37c-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.1 4.49.71.31 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z"/></svg>`;

const fmtFecha = new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" });

export interface CardClient {
  id: number;
  name: string | null;
  tel1: string | null;
  tel2?: string | null;
  address: string | null;
  lat: number;
  lon: number;
  cost: number | null;
  status: string;
  created_at?: string | null;
  camion?: number | null;
  camion_iniciales?: string | null;
  camion_nombre?: string | null;
}

export interface CardOptions {
  /** Toda la card es clickable (fly-to al hacer clic en el cuerpo) */
  clickable?: boolean;
  /** Muestra el botón de localizar en mapa */
  showFlyTo?: boolean;
  /** Muestra el botón de editar */
  showEdit?: boolean;
  /** Muestra el botón de programar servicio (crea un nuevo Cliente en PRG) */
  showSchedule?: boolean;
  /** Muestra la fecha */
  showDate?: boolean;
  /** Clases extra para el div raíz */
  extraClass?: string;
}

/** Genera el HTML de una card de cliente. Usa event delegation — el caller
 *  debe escuchar clicks en el contenedor sobre [data-card-action]. */
export function renderClientCard(c: CardClient, opts: CardOptions = {}): string {
  const stClass = STATUS_CLASS[c.status] ?? "";
  const tel = [c.tel1, c.tel2].filter(Boolean).join(" · ");
  const waLink = c.tel1
    ? `<a href="https://wa.me/${c.tel1.replace(/[^\d+]/g, "")}" target="_blank"
           class="inline-flex items-center gap-1 text-xs" style="color:inherit;font-weight:400;"
           onclick="event.stopPropagation()">
         <span style="color:#25D366;flex-shrink:0;">${WA_ICON}</span>${tel}
       </a>`
    : "";
  const fecha = c.created_at ? fmtFecha.format(new Date(c.created_at)) : "";

  const scheduleBtn = opts.showSchedule
    ? `<button class="btn btn-xs btn-ghost btn-square"
               data-card-action="schedule" data-id="${c.id}" title="Programar servicio">
         <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
           <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M9.5 15l1.8 1.8L15 13"/>
         </svg>
       </button>`
    : "";

  const flyBtn = opts.showFlyTo !== false
    ? `<button class="btn btn-xs btn-ghost btn-square status-fly-btn"
               data-card-action="fly" data-id="${c.id}" title="Ver en mapa">
         <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
           <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
         </svg>
       </button>`
    : "";

  const editBtn = opts.showEdit
    ? `<button class="btn btn-xs btn-ghost btn-square"
               data-card-action="edit" data-id="${c.id}" title="Editar">
         <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
           <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5"/>
           <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
         </svg>
       </button>`
    : "";

  const camionAvatar = c.camion_iniciales
    ? `<span class="absolute -top-2.5 -right-2.5 w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold z-10"
             title="${c.camion_nombre || c.camion_iniciales}"
             style="background:rgba(255,255,255,0.95);border:1.5px solid rgba(0,0,0,0.08);color:rgba(0,0,0,0.75);box-shadow:0 0 0 2.5px var(--color-base-200,#1d2430);">
         ${c.camion_iniciales}
       </span>`
    : c.status === "PRG"
      ? `<span class="absolute -top-2.5 -right-2.5 w-7 h-7 rounded-full flex items-center justify-center text-sm font-black z-10"
               title="Sin chofer asignado"
               style="background:#dc2626;color:#fff;border:2px solid #ef4444;box-shadow:0 0 0 2px var(--color-base-200,#1d2430);${window.innerWidth >= 640 ? 'animation:chofer-alert 1.2s ease-in-out infinite;' : ''}">?</span>`
      : "";

  return `
  <div class="relative ${opts.extraClass ?? ""}">
    <div class="status-card ${stClass} rounded-xl overflow-hidden transition-all duration-150 hover:brightness-110 ${opts.clickable ? "cursor-pointer" : ""}"
         data-lat="${c.lat}" data-lon="${c.lon}" data-id="${c.id}" data-card-action="${opts.clickable ? "fly" : ""}">
      <div class="flex items-center gap-2 px-3 py-2.5">
        <div class="flex-1 min-w-0">
          <p class="font-bold text-sm leading-snug truncate">${c.name || "(sin nombre)"}</p>
          <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">${waLink}</div>
        </div>
        <span class="shrink-0 status-badge ${stClass} text-[10px] font-bold px-2 py-0.5 rounded-full">
          ${c.status}
        </span>
      </div>
      <div class="flex items-center gap-2 px-3 py-2 status-sep">
        <p class="flex-1 text-xs line-clamp-1 min-w-0" style="opacity:0.5;">
          ${c.address || '<span class="italic" style="opacity:0.4;">Sin dirección</span>'}
        </p>
        <div class="flex items-center gap-1.5 shrink-0">
          ${c.cost ? `<span class="text-xs font-bold px-1.5 py-0.5 rounded-md" style="background:rgba(255,213,79,0.1);border:1px solid rgba(255,213,79,0.35);color:#FFD54F;">Bs.${c.cost}</span>` : ""}
          ${fecha && opts.showDate !== false ? `<span class="text-[10px]" style="opacity:0.35;">${fecha}</span>` : ""}
          ${scheduleBtn}
          ${flyBtn}
          ${editBtn}
        </div>
      </div>
    </div>
    ${camionAvatar}
  </div>`;
}

/** Adjunta event delegation para los botones de la card sobre un contenedor.
 *  @param container  El elemento que contiene las cards.
 *  @param clientsMap Mapa id → CardClient.
 *  @param handlers   Callbacks para cada acción.
 */
export function attachCardListeners(
  container: HTMLElement,
  clientsMap: Map<number, CardClient>,
  handlers: { onFly?: (c: CardClient) => void; onEdit?: (c: CardClient) => void; onSchedule?: (c: CardClient) => void },
) {
  container.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-card-action]");
    if (!btn) return;
    const action = btn.dataset.cardAction;
    if (!action) return;
    const id = parseInt(btn.dataset.id ?? btn.closest<HTMLElement>("[data-id]")?.dataset.id ?? "");
    const client = clientsMap.get(id);
    if (!client) return;
    e.stopPropagation();
    if (action === "fly") handlers.onFly?.(client);
    else if (action === "edit") handlers.onEdit?.(client);
    else if (action === "schedule") handlers.onSchedule?.(client);
  });
}

/** Actualiza las clases de estado de un elemento (card o badge) */
export function applyStatusClass(el: HTMLElement, status: string) {
  el.classList.remove(...ST_ALL);
  el.classList.add(STATUS_CLASS[status] ?? "");
}

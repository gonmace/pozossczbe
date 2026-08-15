/**
 * Módulo de acceso a la lista de camiones.
 * Carga desde /api/v1/camiones/ y cachea en memoria para el tiempo de vida
 * de la página.
 */

export interface CamionInfo {
  id: number;
  operador: string;
  marca: string;   // El serializer ya devuelve este campo
}

let _camiones: CamionInfo[] = [];
let _cargando: Promise<CamionInfo[]> | null = null;

/** Devuelve las iniciales (hasta 2) de un nombre de operador. */
export function getCamionIniciales(operador: string): string {
  const words = operador.trim().split(/\s+/);
  return words.slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

/** Carga la lista de camiones desde la API (con cache). */
export async function cargarCamiones(): Promise<CamionInfo[]> {
  if (_camiones.length > 0) return _camiones;
  if (_cargando) return _cargando;
  _cargando = fetch("/api/v1/camiones/")
    .then(r => r.json() as Promise<CamionInfo[]>)
    .then(data => {
      _camiones = data;
      _cargando = null;
      return _camiones;
    })
    .catch(() => {
      _cargando = null;
      return [];
    });
  return _cargando;
}

/** Lista sincrónica (disponible después de cargarCamiones()). */
export function getCamiones(): CamionInfo[] {
  return _camiones;
}

/** Genera <option> elements para un <select> de camiones.
 *  Si no hay uno ya asignado (selectedId nulo) y solo existe un camión
 *  disponible, se preselecciona ese único camión en vez de "Sin asignar". */
export function buildCamionOptions(selectedId: number | null | undefined): string {
  const effectiveId = selectedId ?? (_camiones.length === 1 ? _camiones[0].id : null);
  const none = `<option value=""${effectiveId == null ? " selected" : ""}>— Sin asignar —</option>`;
  const opts = _camiones.map(c => {
    const sel = c.id === effectiveId ? " selected" : "";
    return `<option value="${c.id}"${sel}>${c.operador}</option>`;
  }).join("");
  return none + opts;
}

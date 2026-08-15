import type { Map } from 'leaflet';
import { createToast } from './toast';
import { renderClientCard, attachCardListeners, type CardClient } from './clientCard';
import { buildCamionOptions } from './camiones';

interface Client {
  id: number;
  name: string;
  tel1: string;
  tel2?: string | null;
  address: string;
  lat: number;
  lon: number;
  cost: number;
  cod?: string | null;
  status: string;
  user: string;
  service: string;
  created_at: string;
  camion?: number | null;
  camion_iniciales?: string | null;
}


function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getCookie(name: string): string {
  let cookieValue = '';
  for (const cookie of document.cookie.split(';')) {
    const c = cookie.trim();
    if (c.startsWith(name + '=')) {
      cookieValue = decodeURIComponent(c.substring(name.length + 1));
      break;
    }
  }
  return cookieValue;
}

async function editClient(client: Client): Promise<void> {
  const editModal = document.createElement('dialog');
  editModal.className = 'modal';
  editModal.innerHTML = `
    <div class="modal-box w-11/12 max-w-2xl bg-primary/20">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-lg">Editar cliente</h3>
        <button type="button" class="btn btn-sm btn-circle btn-ghost text-lg" onclick="this.closest('dialog').close()">✕</button>
      </div>
      <form id="editClientForm" class="flex flex-col gap-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="form-control">
            <label class="label"><span class="label-text">Nombre</span></label>
            <input type="text" id="editName" class="input input-bordered" value="${client.name || ''}" />
          </div>
          <div class="form-control">
            <label class="label"><span class="label-text">Teléfono</span></label>
            <input type="text" id="editPhone" class="input input-bordered" value="${client.tel1 || ''}" />
          </div>
          <div class="form-control sm:col-span-2">
            <label class="label"><span class="label-text">Dirección / Comentario</span></label>
            <input type="text" id="editAddress" class="input input-bordered" value="${client.address || ''}" />
          </div>
          <div class="form-control">
            <label class="label"><span class="label-text">Precio Bs.</span></label>
            <input type="number" id="editCost" class="input input-bordered" value="${client.cost || ''}" />
          </div>
          <div class="form-control">
            <label class="label"><span class="label-text">Estado</span></label>
            <select id="editStatus" class="select select-bordered">
              <option value="PRG" ${client.status === 'PRG' ? 'selected' : ''}>Programado</option>
              <option value="COT" ${client.status === 'COT' ? 'selected' : ''}>Cotizado</option>
              <option value="EJE" ${client.status === 'EJE' ? 'selected' : ''}>Ejecutado</option>
              <option value="CAN" ${client.status === 'CAN' ? 'selected' : ''}>Cancelado</option>
              <option value="NEG" ${client.status === 'NEG' ? 'selected' : ''}>L. negra</option>
            </select>
          </div>
          <div class="form-control sm:col-span-2">
            <label class="label"><span class="label-text">Chofer / Camión</span></label>
            <select id="editCamion" class="select select-bordered">
              ${buildCamionOptions(client.camion ?? null)}
            </select>
          </div>
        </div>
        <div class="flex gap-2 justify-end mt-2">
          <button type="button" class="btn btn-ghost" onclick="this.closest('dialog').close()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>
    </div>
    <form method="dialog" class="modal-backdrop"><button>Cerrar</button></form>
  `;

  document.body.appendChild(editModal);
  editModal.showModal();

  const form = editModal.querySelector('#editClientForm') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const camionVal = (document.getElementById('editCamion') as HTMLSelectElement).value;
    const updatedClient = {
      ...client,
      name: (document.getElementById('editName') as HTMLInputElement).value,
      tel1: (document.getElementById('editPhone') as HTMLInputElement).value.slice(0, 13),
      address: (document.getElementById('editAddress') as HTMLInputElement).value,
      cost: Number((document.getElementById('editCost') as HTMLInputElement).value),
      status: (document.getElementById('editStatus') as HTMLSelectElement).value,
      camion: camionVal ? Number(camionVal) : null,
      service: client.service || 'NOR',
      user: client.user || 'ADM',
    };

    try {
      const response = await fetch(`/api/v1/clientes/${client.id}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
        body: JSON.stringify(updatedClient),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      createToast('editClient', 'map', 'Cliente actualizado', 'top', 'success');
      setTimeout(() => {
        editModal.close();
        editModal.remove();
        const searchInput = document.getElementById('searchNameInput') as HTMLInputElement;
        if (searchInput) searchInput.dispatchEvent(new Event('input'));
      }, 500);
    } catch (error) {
      createToast('editClient', 'map', `Error: ${(error as Error).message}`, 'top', 'error');
    }
  });
}

/** Fecha/hora por defecto del formulario de programar: hoy a las 08:00, en formato
 *  local apto para <input type="datetime-local"> (sin conversión de zona horaria). */
function defaultFechaProgramada(): string {
  const d = new Date();
  d.setHours(8, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Programa un nuevo servicio para un cliente recurrente: crea un Cliente NUEVO
 *  (status PRG) copiando nombre/teléfono/ubicación del cliente encontrado, sin
 *  necesidad de volver a ubicarlo en el mapa ni retipear sus datos. */
async function scheduleService(client: Client): Promise<void> {
  const schedModal = document.createElement('dialog');
  schedModal.className = 'modal';
  schedModal.innerHTML = `
    <div class="modal-box w-11/12 max-w-2xl bg-primary/20">
      <div class="flex items-center justify-between mb-1">
        <h3 class="font-bold text-lg">Programar servicio</h3>
        <button type="button" class="btn btn-sm btn-circle btn-ghost text-lg" onclick="this.closest('dialog').close()">✕</button>
      </div>
      <p class="text-sm opacity-70 mb-4">${client.name || '(sin nombre)'}${client.tel1 ? ' · ' + client.tel1 : ''}</p>
      <form id="scheduleForm" class="flex flex-col gap-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="form-control">
            <label class="label"><span class="label-text">Fecha y hora</span></label>
            <input type="datetime-local" id="schedFecha" class="input input-bordered" value="${defaultFechaProgramada()}" />
          </div>
          <div class="form-control">
            <label class="label"><span class="label-text">Precio Bs.</span></label>
            <input type="number" id="schedCost" class="input input-bordered" value="${client.cost || ''}" />
          </div>
          <div class="form-control sm:col-span-2">
            <label class="label"><span class="label-text">Dirección / Comentario</span></label>
            <input type="text" id="schedAddress" class="input input-bordered" value="${client.address || ''}" />
          </div>
          <div class="form-control sm:col-span-2">
            <label class="label"><span class="label-text">Chofer / Camión</span></label>
            <select id="schedCamion" class="select select-bordered">
              ${buildCamionOptions(client.camion ?? null)}
            </select>
          </div>
        </div>
        <div class="flex gap-2 justify-end mt-2">
          <button type="button" class="btn btn-ghost" onclick="this.closest('dialog').close()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>
    </div>
    <form method="dialog" class="modal-backdrop"><button>Cerrar</button></form>
  `;

  document.body.appendChild(schedModal);
  schedModal.showModal();

  const form = schedModal.querySelector('#scheduleForm') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const camionVal = (document.getElementById('schedCamion') as HTMLSelectElement).value;
    const fechaVal   = (document.getElementById('schedFecha') as HTMLInputElement).value;
    const newService = {
      name: client.name,
      tel1: client.tel1,
      tel2: client.tel2 ?? '',
      lat: client.lat,
      lon: client.lon,
      address: (document.getElementById('schedAddress') as HTMLInputElement).value,
      cost: Number((document.getElementById('schedCost') as HTMLInputElement).value) || 0,
      cod: client.cod ?? '',
      service: client.service || 'NOR',
      user: 'ADM',
      status: 'PRG',
      activo: true,
      hora_programada: fechaVal ? new Date(fechaVal).toISOString() : null,
      camion: camionVal ? Number(camionVal) : null,
    };

    try {
      const response = await fetch('/api/v1/clientes/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
        body: JSON.stringify(newService),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      createToast('scheduleService', 'map', 'Servicio programado', 'top', 'success');
      setTimeout(() => {
        schedModal.close();
        schedModal.remove();
        const searchInput = document.getElementById('searchNameInput') as HTMLInputElement;
        if (searchInput) searchInput.dispatchEvent(new Event('input'));
        (window as any).refreshClientLayers?.();
      }, 500);
    } catch (error) {
      createToast('scheduleService', 'map', `Error: ${(error as Error).message}`, 'top', 'error');
    }
  });
}

// Mapa mutable id → cliente, repoblado en cada búsqueda. Se mantiene fuera de
// renderResults para que attachCardListeners se registre una única vez sobre
// el contenedor (ver initializeSearchModal) en lugar de acumular un listener
// por cada tecleo.
const _cardMap = new Map<number, CardClient>();

function renderResults(clients: Client[], container: HTMLElement) {
  if (clients.length === 0) {
    container.innerHTML = `<p class="text-sm text-base-content/50 text-center col-span-2 py-4">No se encontraron resultados</p>`;
    _cardMap.clear();
    return;
  }

  _cardMap.clear();
  container.innerHTML = clients.map(c => {
    _cardMap.set(c.id, c);
    return renderClientCard(c, { showFlyTo: true, showEdit: true, showSchedule: true });
  }).join("");
}

// El modal se reabre desde el mismo control sin recrear el DOM; esta bandera
// evita re-registrar los listeners de búsqueda/teclado en cada apertura.
let _initialized = false;

export function initializeSearchModal(map: Map): void {
  const modal = document.getElementById('searchClientModal') as HTMLDialogElement;
  if (!modal) { console.error('Modal element not found'); return; }

  const nameInput  = document.getElementById('searchNameInput') as HTMLInputElement;
  const phoneInput = document.getElementById('searchPhoneInput') as HTMLInputElement;
  const container  = document.getElementById('searchResultsBody') as HTMLElement;
  if (!nameInput || !phoneInput || !container) { console.error('Required elements not found'); return; }

  if (_initialized) {
    modal.showModal();
    nameInput.focus();
    return;
  }
  _initialized = true;

  let searchTimeout: ReturnType<typeof setTimeout>;

  const performSearch = async () => {
    const nameQuery  = normalizeText(nameInput.value.trim());
    const phoneQuery = phoneInput.value.trim();

    if (nameQuery.length < 2 && phoneQuery.length < 2) {
      container.innerHTML = `<p class="text-sm text-base-content/50 text-center col-span-2 py-4">Ingrese al menos 2 caracteres</p>`;
      _cardMap.clear();
      return;
    }

    try {
      const resp = await fetch('/api/v1/clientes/');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const clients = await resp.json() as Client[];

      const filtered = clients.filter(c => {
        const nameMatch  = nameQuery.length >= 2  ? normalizeText(c.name || '').toLowerCase().includes(nameQuery.toLowerCase()) : true;
        const phoneMatch = phoneQuery.length >= 2 ? (c.tel1 || '').includes(phoneQuery) : true;
        return nameMatch && phoneMatch;
      });

      renderResults(filtered, container);
    } catch (error) {
      container.innerHTML = `<p class="text-sm text-error text-center col-span-2 py-4">Error al buscar clientes</p>`;
      console.error(error);
    }
  };

  attachCardListeners(container, _cardMap, {
    onFly:      (c) => { map.flyTo([c.lat, c.lon], 16); modal.close(); },
    onEdit:     (c) => editClient(c as Client),
    onSchedule: (c) => scheduleService(c as Client),
  });

  [nameInput, phoneInput].forEach(input => {
    input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(performSearch, 300);
    });
  });

  modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.close(); });

  modal.showModal();
  nameInput.focus();
}

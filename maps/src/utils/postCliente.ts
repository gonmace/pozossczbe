import { Marker } from "leaflet";

const urlPost = "/api/v1/clientes/";

function getCsrfToken(): string {
  const name = 'csrftoken';
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const c = cookie.trim();
    if (c.startsWith(name + '=')) {
      return decodeURIComponent(c.substring(name.length + 1));
    }
  }
  return '';
}

// Guarda una cotización pública (status "WEB"). El servidor ignora la llamada
// si el usuario tiene sesión iniciada, así que solo se usa desde los flujos
// públicos (/cotiza/ y el hero). Solo se llama al calcular el precio
// ("Cotizar"): Confirmar y Pregunta por descuento solo abren WhatsApp y no
// vuelven a tocar la fila guardada.
export async function postCotizacionWeb(
  lat: number,
  lon: number,
  cost: number,
  user: "CLC" | "CLX",
  cod: string = "",
) {
  return fetch("/api/v1/cotizacion-web/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    body: JSON.stringify({
      lat: lat.toFixed(6),
      lon: lon.toFixed(6),
      cost,
      user,
      cod,
    }),
  });
}

export async function postData(
  name: string,
  phone: string,
  cost: number,
  marker: Marker,
  status: "COT" | "EJE" | "NEG" = "COT",
  user: "ADM" | "CLC" | "CLX" = "ADM",
  cod: string = "",
  precio_cotizado?: number,
) {
  const data: Record<string, unknown> = {
    name: name,
    tel1: phone,
    cost: cost,
    lat: marker.getLatLng().lat.toFixed(6),
    lon: marker.getLatLng().lng.toFixed(6),
    status: status,
    user: user,
    cod: cod,
    activo: true,
  };
  if (typeof precio_cotizado === "number" && precio_cotizado > 0) data.precio_cotizado = precio_cotizado;
  return fetch(urlPost, {
    method: "POST",
    body: JSON.stringify(data),
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
  })
    .then((res) => {
      if (!res.ok) {
        console.log(res);
        throw new Error(`${res.statusText} - Status: ${res.status}`);
      }
      return res.json();
    })
    .then((response) => {
      return response;
    })
    .catch((error) => {
      console.error("Error:", error);
      throw error; // Lanzar el error o manejarlo según tu caso de uso
    })
    .finally(() => {
      // Limpiar la data
      console.log("Data cleared after fetch.");
    });;

}

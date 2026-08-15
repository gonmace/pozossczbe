import { cotizando } from "./cotizando";
import { postCotizacionWeb } from "./postCliente";
import type { DataPrice } from "../types/types";

export interface CotizacionResultado {
  dataPrice: DataPrice;
  precio: number;
  esReferencial: boolean;
  codigo: string;
}

// Código de cotización: año+mes+día + dígitos del precio, usado como
// referencia en el mensaje de WhatsApp. Determinístico por precio+fecha.
export function generarCodigoCotizacion(precio: number): string {
  const now = new Date();
  const anio = now.getFullYear() % 100;
  const mes = String(now.getMonth() + 1).padStart(2, '0');
  const dia = String(now.getDate()).padStart(2, '0');
  const precioStr = precio.toString();
  const d1 = precioStr[0] || '0';
  const d2 = precioStr[1] || '0';
  const d3 = precioStr[2] || '0';
  const d4 = precioStr[3] || '';
  const final = precioStr.length === 4 ? d3 + d4 : d3;
  return `${anio}${d1}${mes}${d2}${dia}${final}`;
}

// Única lógica de cálculo de cotización pública, usada tanto por /cotiza/
// como por el widget del hero: llama a /api/v1/contratar/, redondea el
// precio, genera el código y, si corresponde, guarda la fila WEB (solo
// "Precio sistema"; "Precio final" queda vacío para que ventas lo complete
// si negocia un precio distinto).
export async function calcularCotizacion(
  lat: number,
  lon: number,
  guardar: boolean,
): Promise<CotizacionResultado> {
  const dataPrice = await cotizando(lat, lon);
  if (dataPrice.error) {
    return { dataPrice, precio: 0, esReferencial: false, codigo: '' };
  }

  const precio = Math.round(dataPrice.precio / 10) * 10;
  const codigo = generarCodigoCotizacion(precio);
  const esReferencial = dataPrice.factor_zona == 0;

  if (guardar) {
    postCotizacionWeb(lat, lon, precio, "CLX", codigo)
      .then(() => console.log("Cotizado - Cotización web guardada"))
      .catch((error) => console.error("No se pudo guardar la cotización web", error));
  }

  return { dataPrice, precio, esReferencial, codigo };
}

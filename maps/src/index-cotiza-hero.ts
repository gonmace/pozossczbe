// Expone la lógica de cálculo de cotización (utils/cotizacionWeb.ts) al
// widget del hero (templates/components/card_cotiza.html), que vive como
// <script> clásico inline en un template Django y no puede hacer `import`
// directamente. Mismo patrón que index-maps-admin.ts para cargarCamiones.
import { calcularCotizacion } from "./utils/cotizacionWeb.ts";

declare global {
  interface Window {
    calcularCotizacion: typeof calcularCotizacion;
  }
}

window.calcularCotizacion = calcularCotizacion;

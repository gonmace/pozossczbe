import { DataPrice } from "../types/types";

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

export const cotizando = async (lat: number, lon: number, url = '/api/v1/contratar/'): Promise<DataPrice> => {
    let data: DataPrice = {
        error: null,
        distances: [],
        times: [],
        origins: [],
        paths: [],
        distance_saguapac: [],
        time_saguapac: [],
        origin_saguapac: [],
        path_saguapac: [],
        costo_combustible: 0,
        costo_combustible_ida: 0,
        costo_combustible_retorno: 0,
        costo_combustible_trabajo: 0,
        costos_combustible_bases: [],
        utilidades_bases: [],
        chofer_bases: [],
        otros_bases: [],
        precios_bases: [],
        costo_otros: 0,
        detalle_otros: { mantenimiento: 0, saguapac: 0, retorno_saguapac: 0 },
        costo_adicional_retorno: 0,
        utilidad: 0,
        factor_zona: 0,
        factor_global: 1,
        chofer: 0,
        precio: 0,
        precio_sin_zona: 0,
        origen: 0,
        distance_scz: 0,
        distancia_maxima_cotizar: 60,
        tiempo_trabajo_min: 0,
        tiempo_real_min: 0,
        tiempo_cobro_min: 0,
        factor_camion: 1.25,
        factor_cargado: 1.05,
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken(),
            },
            body: JSON.stringify({
                lat: lat.toFixed(6),
                lon: lon.toFixed(6)
            })
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            data.error = body.error || `Error ${response.status}: servicio de rutas no disponible`;
            return data;
        }
        data = await response.json();

    } catch (error) {
        data.error = 'No se pudo conectar con el servidor. Intente nuevamente.';
    }
    return data;
}

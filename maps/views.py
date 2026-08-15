from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from main.utils import get_meta_for_slug, get_slug_from_request
from pozosscz.models import AreasFactor, BaseCamion, PreciosPozosSCZ, DatosGenerales
from flota.models import Camion, DispositivoFCM
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
import math
import re
import logging
import requests as http_requests

logger = logging.getLogger(__name__)
from typing import Tuple, List
from geopy.distance import geodesic
from .utils import calculate_route_metrics
from asgiref.sync import async_to_sync


# Service bases coordinates
SCZ_CENTER = (-17.783280,-63.182184)
SAGUAPAC_BASE = (-17.74620847, -63.12672898, "saguapac")
GARAJE_BASE = (-17.78595813, -63.12451243, "garaje")

BASES = [SAGUAPAC_BASE, GARAJE_BASE]


def get_base_origen():
    """Base única de origen: la configurada en Precios, o Saguapac por defecto."""
    p = PreciosPozosSCZ.objects.first()
    base = getattr(p, 'base_origen', None)
    if base is None or base.deleted:
        base = BaseCamion.objects.filter(deleted=False, name__icontains='saguapac').first()
    if base:
        return (base.coordinates[1], base.coordinates[0], base.name)
    return (SAGUAPAC_BASE[1], SAGUAPAC_BASE[0], SAGUAPAC_BASE[2])

# Waypoints for route calculations
WAYPOINT_URUBO = (-17.7498515, -63.2154661)
WAYPOINT_TORNO = (-17.988987, -63.389942)

# Waypoint polygons
URUBO_POLYGON = [
    [-17.7500354, -63.2116842],
    [-17.7605802, -63.2134437],
    [-17.7651984, -63.2171773],
    [-17.775824, -63.2275199],
    [-17.78555, -63.2306957],
    [-17.8055723, -63.2506942],
    [-17.8124366, -63.2602214],
    [-17.8142344, -63.2676887],
    [-17.8201178, -63.2780742],
    [-17.8323743, -63.2849407],
    [-17.8436495, -63.2885456],
    [-17.8580285, -63.2878589],
    [-17.865871, -63.2877731],
    [-17.8739583, -63.294897],
    [-17.8758371, -63.300476],
    [-17.8732231, -63.3045101],
    [-17.8715894, -63.323822],
    [-17.8794313, -63.3403015],
    [-17.9341522, -63.366394],
    [-17.9369286, -63.3813285],
    [-17.9462375, -63.3964347],
    [-17.9485238, -63.4295654],
    [-17.9150426, -63.4448432],
    [-17.864564, -63.4441566],
    [-17.7673236, -63.4529113],
    [-17.7078092, -63.442955]
]

TORNO_POLYGON = [
    [-17.935622, -63.3665657],
    [-17.9447677, -63.3907699],
    [-17.9509734, -63.4182357],
    [-17.949177, -63.4415817],
    [-17.8957677, -63.4937667],
    [-17.8764906, -63.5095596],
    [-17.8405448, -63.5112762],
    [-17.8572115, -63.540802],
    [-17.8974012, -63.5528182],
    [-17.9405215, -63.537712],
    [-18.0055088, -63.5109329],
    [-18.0126919, -63.4098243],
    [-18.0019172, -63.4052753],
    [-17.9975908, -63.4045457],
    [-17.9969582, -63.401885],
    [-17.9963051, -63.3994388],
    [-17.9933868, -63.3977222],
    [-17.9905092, -63.3931946],
    [-17.9887744, -63.3883452],
    [-17.9862233, -63.3850193],
    [-17.9829578, -63.3833456],
    [-17.9791208, -63.3828735],
    [-17.976243, -63.3808994],
    [-17.9744469, -63.3768653],
    [-17.972365, -63.37502],
    [-17.9706914, -63.3716297],
    [-17.9648129, -63.3717584],
    [-17.9604448, -63.37399],
    [-17.9518307, -63.3717584]
]

def cotiza(request):
    datos_generales = DatosGenerales.objects.first()
    if not datos_generales:
        datos_generales = DatosGenerales.objects.create()
    datos_dict = {
        'celular': datos_generales.celular,
        'mensaje_cotizar': datos_generales.mensaje_cotizar
    }
    celular = datos_generales.celular
    mensaje_whatsapp = datos_generales.mensaje_whatsapp
    slug = get_slug_from_request(request)
    meta = get_meta_for_slug(slug, request)
    return render(request, 'cotiza.html', 
                  {'datos_generales': datos_dict,
                   'celular': celular,
                   'mensaje_whatsapp': mensaje_whatsapp,
                   'meta': meta
                   })

@login_required
def mapa(request):
    datos_generales = DatosGenerales.objects.first()
    if not datos_generales:
        datos_generales = DatosGenerales.objects.create()
    basecamiones = BaseCamion.objects.filter(deleted=False)
    celular = datos_generales.celular
    mensaje_whatsapp = datos_generales.mensaje_whatsapp

    camiones = Camion.objects.select_related('usuario').filter(usuario__isnull=False)
    ids_con_dispositivo = set(
        DispositivoFCM.objects.filter(activo=True).values_list('usuario_id', flat=True)
    )

    return render(request, 'mapa.html', {
        'basecamiones': basecamiones,
        'celular': celular,
        'mensaje_whatsapp': mensaje_whatsapp,
        'camiones': camiones,
        'ids_con_dispositivo': ids_con_dispositivo,
    })

class ContratarAPIView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'cotiza'

    def is_point_in_polygon(self, lat: float, lon: float, polygon: List[List[float]]) -> bool:
        """Check if a point is inside a polygon using ray casting algorithm."""
        inside = False
        j = len(polygon) - 1
        
        for i in range(len(polygon)):
            if ((polygon[i][1] > lon) != (polygon[j][1] > lon) and
                (lat < (polygon[j][0] - polygon[i][0]) * (lon - polygon[i][1]) /
                 (polygon[j][1] - polygon[i][1]) + polygon[i][0])):
                inside = not inside
            j = i
            
        return inside

    def get_area_factors(self, lat: float, lon: float) -> List[float]:
        """Get all area factors that apply to the given location."""
        factors = []
        areas = AreasFactor.objects.all()
        
        for area in areas:
            if self.is_point_in_polygon(lat, lon, area.polygon):
                factors.append(area.factor)
                
        return factors

    def get_waypoint_for_location(self, lat: float, lon: float) -> Tuple[float, float]:
        """Determine which waypoint to use based on the location."""
        if self.is_point_in_polygon(lat, lon, URUBO_POLYGON):
            return WAYPOINT_URUBO
        elif self.is_point_in_polygon(lat, lon, TORNO_POLYGON):
            return WAYPOINT_TORNO
        return None

    def get_bases(self, basecamiones):
        """Origen único configurado en Precios (lon, lat, nombre)."""
        self._grupos = {'bases': 1, 'clientes': 0, 'camiones': 0}
        return [get_base_origen()]

    def post(self, request, *args, **kwargs):
        # Extract data from request
        try:
            lat = float(request.data.get('lat'))
            lon = float(request.data.get('lon'))
        except (TypeError, ValueError):
            return Response(
                {"error": "Invalid latitude or longitude values"},
                status=status.HTTP_400_BAD_REQUEST
            )

        distance_scz = geodesic(SCZ_CENTER, (lat, lon)).km
        # Get area factors
        factors = self.get_area_factors(lat, lon)
        # Calculate combined factor
        combined_factor = math.prod(factors) if factors else 0

        # Get waypoint if location is in special areas
        waypoint = self.get_waypoint_for_location(lat, lon)
        
        # Get basecamiones
        basecamiones = BaseCamion.objects.filter(deleted=False, available=True)
        # Se iniverte coordenadas para el OSRM

        bases = self.get_bases(basecamiones)

        # Calcular rutas al cliente con punto intermedio si es necesario.
        distances, times, origins, geometries = async_to_sync(calculate_route_metrics)(lat, lon, bases, waypoint)

        if not distances:
            return Response(
                {"error": "No se pudo calcular la ruta. El servicio de enrutamiento no está disponible."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        # Calcular ruta del cliente a SAGUAPAC
        distance_saguapac, time_saguapac, origin_saguapac, geometry_saguapac = async_to_sync(calculate_route_metrics)(
            SAGUAPAC_BASE[0], SAGUAPAC_BASE[1], [(lon, lat, "cliente")], waypoint)

        if not distance_saguapac:
            return Response(
                {"error": "No se pudo calcular la ruta de retorno a Saguapac."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        # Find shortest route — solo entre las bases fijas (no clientes ni camiones)
        n_bases = getattr(self, '_grupos', {}).get('bases', len(distances))
        dist_bases = distances[:n_bases] if n_bases else distances
        min_index = distances.index(min(dist_bases))

        p = PreciosPozosSCZ.objects.first()

        # Tiempos ajustados al camión (más lento que un auto)
        factor_camion  = p.factor_tiempo    # 1.25 → camión 25% más lento
        factor_cargado = p.factor_cargado   # 1.05 → 5% más lento en retorno cargado

        tiempo_ida_seg     = times[min_index] * factor_camion
        tiempo_retorno_seg = time_saguapac[0] * factor_camion * factor_cargado
        tiempo_trabajo_seg = p.tiempo_trabajo * 60

        tiempo_total = tiempo_ida_seg + tiempo_retorno_seg + tiempo_trabajo_seg
        tiempo_cobro = max(tiempo_total, p.tiempo_minimo_cobro * 60)

        # Si el tiempo mínimo se activa, el exceso se distribuye proporcionalmente al viaje
        tiempo_viaje_seg   = tiempo_ida_seg + tiempo_retorno_seg
        tiempo_trabajo_cobro = tiempo_trabajo_seg
        if tiempo_cobro > tiempo_total:
            tiempo_viaje_seg += tiempo_cobro - tiempo_total

        # Costo de combustible: viaje y trabajo con consumos distintos
        costo_combustible = (
            (tiempo_viaje_seg   / 3600) * p.consumo_viaje_hr   +
            (tiempo_trabajo_cobro / 3600) * p.consumo_trabajo_hr
        ) * p.precio_diesel
        costo_combustible_ida      = (tiempo_ida_seg     / 3600) * p.consumo_viaje_hr   * p.precio_diesel
        costo_combustible_retorno  = (tiempo_retorno_seg / 3600) * p.consumo_viaje_hr   * p.precio_diesel
        costo_combustible_trabajo  = (tiempo_trabajo_seg / 3600) * p.consumo_trabajo_hr * p.precio_diesel
        costo_mantenimiento = (p.costo_mantenimiento / 100) * costo_combustible
        costo_saguapac_panta = p.costo_saguapac_planta

        subtotal_costos = costo_combustible + costo_mantenimiento + costo_saguapac_panta

        dist_ida_km = distances[min_index] / 1000
        dist_sag_km = distance_saguapac[0] / 1000

        # Utilidad por km de retorno a Saguapac (todos los km)
        costo_adicional_km_retorno = dist_sag_km * p.costo_adicional_km_retorno

        # Utilidad: por km de ida + base fija, ajustada por zona
        utilidad_km_ida = p.utilidad_km * dist_ida_km
        factor          = combined_factor if combined_factor != 0 else 1
        utilidad_total  = (utilidad_km_ida + p.utilidad_base) * factor

        subtotal = (subtotal_costos + utilidad_total + costo_adicional_km_retorno) * p.factor_global

        # Precio sin factor de zona (para comparación)
        utilidad_sin_zona  = (utilidad_km_ida + p.utilidad_base) * 1
        subtotal_sin_zona  = (subtotal_costos + utilidad_sin_zona + costo_adicional_km_retorno) * p.factor_global

        # Chofer = % del precio final (no del subtotal)
        tasa_chofer     = p.personal_camion / 100
        precio          = subtotal / (1 - tasa_chofer)
        chofer          = precio - subtotal
        precio          = math.ceil(precio / 10) * 10
        precio_sin_zona = math.ceil(subtotal_sin_zona / (1 - tasa_chofer) / 10) * 10

        # Calcular precio completo para cada base (para comparación en el modal)
        costos_combustible_bases = []
        utilidades_bases = []
        chofer_bases = []
        otros_bases = []
        precios_bases = []

        for t_i, dist_i in zip(times, distances):
            t_ida_i     = t_i * factor_camion
            t_total_i   = t_ida_i + tiempo_retorno_seg + tiempo_trabajo_seg
            t_cobro_i   = max(t_total_i, p.tiempo_minimo_cobro * 60)
            t_viaje_i   = t_ida_i + tiempo_retorno_seg
            t_trabajo_i = tiempo_trabajo_seg
            if t_cobro_i > t_total_i:
                t_viaje_i += t_cobro_i - t_total_i
            comb_i     = ((t_viaje_i / 3600) * p.consumo_viaje_hr + (t_trabajo_i / 3600) * p.consumo_trabajo_hr) * p.precio_diesel
            mant_i     = (p.costo_mantenimiento / 100) * comb_i
            util_i     = (p.utilidad_km * (dist_i / 1000) + p.utilidad_base) * factor
            subtotal_i = (comb_i + mant_i + costo_saguapac_panta + util_i + costo_adicional_km_retorno) * p.factor_global
            precio_i   = math.ceil(subtotal_i / (1 - tasa_chofer) / 10) * 10
            chofer_i   = round(subtotal_i / (1 - tasa_chofer) * tasa_chofer, 1)
            mant_i_fact = round(mant_i * p.factor_global, 1)
            costos_combustible_bases.append(round(comb_i - costo_combustible_retorno - costo_combustible_trabajo, 1))
            utilidades_bases.append(round(util_i * p.factor_global, 1))
            chofer_bases.append(chofer_i)
            otros_bases.append(mant_i_fact)
            precios_bases.append(precio_i)

        logger.debug(
            "cotizacion lat=%s lon=%s dist_scz=%.2f factor_zona=%s combustible=%.2f precio=%.2f",
            lat, lon, distance_scz, combined_factor, costo_combustible, precio
        )

        return Response(
            {
                "distances": distances,
                "times": times,
                "origins": origins,
                "paths": geometries,
                "distance_saguapac": distance_saguapac,
                "time_saguapac": time_saguapac,
                "origin_saguapac": origin_saguapac,
                "path_saguapac": geometry_saguapac,

                "distance_scz": distance_scz,
                "distancia_maxima_cotizar": p.distancia_maxima_cotizar,
                "origen": min_index,
                "costo_combustible": costo_combustible,
                "costo_combustible_ida": round(costo_combustible_ida, 1),
                "costo_combustible_retorno": round(costo_combustible_retorno, 1),
                "costo_combustible_trabajo": round(costo_combustible_trabajo, 1),
                "costos_combustible_bases": costos_combustible_bases,
                "utilidades_bases": utilidades_bases,
                "chofer_bases": chofer_bases,
                "otros_bases": otros_bases,
                "precios_bases": precios_bases,
                "costo_otros": costo_mantenimiento + costo_saguapac_panta + costo_adicional_km_retorno,
                "detalle_otros": {
                    "mantenimiento": round(costo_mantenimiento, 1),
                    "saguapac": costo_saguapac_panta,
                    "retorno_saguapac": round(costo_adicional_km_retorno, 1),
                },
                "costo_adicional_retorno": costo_adicional_km_retorno,
                "utilidad": utilidad_total,
                "factor_zona": combined_factor,
                "tiempo_trabajo_min": round(tiempo_trabajo_seg / 60, 1),
                "tiempo_real_min": round(tiempo_total / 60, 1),
                "tiempo_cobro_min": round(tiempo_cobro / 60, 1),
                "factor_camion": factor_camion,
                "factor_cargado": factor_cargado,
                "factor_global": p.factor_global,
                "chofer": chofer,
                "precio": precio,
                "precio_sin_zona": precio_sin_zona,
                "grupos": getattr(self, '_grupos', None),
                "origins_status": getattr(self, '_origins_status', None),
            },
            status=status.HTTP_200_OK
        )


class ContratarAdminAPIView(ContratarAPIView):
    """Igual que ContratarAPIView pero agrega camiones activos como bases adicionales."""
    permission_classes = [IsAuthenticated]

    def get_bases(self, basecamiones):
        from django.db.models import Subquery, OuterRef
        from flota.models import RegistroCamion as EstadoCamionFlota
        from clientes.models import Cliente

        bases_fijas = [(base.coordinates[1], base.coordinates[0], base.name) for base in basecamiones]
        bases_fijas = bases_fijas or [get_base_origen()]

        # Clientes activos con coordenadas
        from django.db.models import Case, When, IntegerField
        status_order = Case(
            When(status='EJE', then=0),
            When(status='PRG', then=1),
            When(status='COT', then=2),
            When(status='CAN', then=3),
            default=4,
            output_field=IntegerField(),
        )
        clientes_activos = list(Cliente.objects.filter(
            activo=True, lat__isnull=False, lon__isnull=False
        ).exclude(status='WEB').annotate(status_order=status_order).order_by('status_order'))
        bases_clientes = [(c.lon, c.lat, c.name or c.tel1) for c in clientes_activos]

        # Camiones activos con tanque no lleno y con señal reciente (últimos 30 min)
        from datetime import timedelta
        umbral_inactivo = timezone.now() - timedelta(minutes=30)

        camiones_activos = Camion.objects.filter(
            activo=True, lat__isnull=False, lon__isnull=False,
            ultima_actualizacion__gte=umbral_inactivo,
        )

        bases_camiones = []
        for c in camiones_activos:
            bases_camiones.append((c.lon, c.lat, f'Camión {c.operador}'))

        self._grupos = {
            'bases': len(bases_fijas),
            'clientes': len(bases_clientes),
            'camiones': len(bases_camiones),
        }
        self._origins_status = (
            [None] * len(bases_fijas) +
            [c.status for c in clientes_activos] +
            [None] * len(bases_camiones)
        )
        return bases_fijas + bases_clientes + bases_camiones


class CotizacionWebAPIView(APIView):
    """Guarda una cotización hecha desde la web pública (status WEB).

    Cada cálculo de precio ("Cotizar") crea su propia fila. "Confirmar" y
    "Pregunta por descuento" solo abren WhatsApp con el mismo código: no
    vuelven a tocar esa fila. Solo guarda para visitantes anónimos: si hay
    sesión (admin cotizando desde /cotiza/ o el hero), responde sin crear
    nada.

    El monto calculado se guarda únicamente en "Precio sistema"
    (precio_cotizado); "Precio final" (cost) queda vacío para que ventas lo
    complete si negocia un precio distinto — mismo criterio que ya usa el
    flujo admin (P. Sistema readonly vs P. Final editable).
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'cotiza_web'

    def post(self, request):
        from clientes.models import Cliente
        from clientes.views import _bump_clientes_version

        if request.user.is_authenticated:
            return Response({'guardado': False, 'motivo': 'sesion'})

        try:
            lat = float(request.data.get('lat'))
            lon = float(request.data.get('lon'))
        except (TypeError, ValueError):
            return Response({'error': 'lat/lon inválidos'}, status=status.HTTP_400_BAD_REQUEST)
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return Response({'error': 'lat/lon fuera de rango'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            cost = int(request.data.get('cost') or 0)
        except (TypeError, ValueError):
            cost = 0
        cost = max(0, min(cost, 100000))

        user = request.data.get('user')
        if user not in ('CLC', 'CLX'):
            user = 'CLC'

        cod = str(request.data.get('cod') or '')[:10]

        cliente = Cliente.objects.create(
            name='pozosscz.com',
            tel1='',
            lat=lat, lon=lon,
            precio_cotizado=cost,
            status='WEB',
            user=user,
            cod=cod,
            activo=True,
        )
        _bump_clientes_version()
        return Response({'guardado': True, 'id': cliente.id}, status=status.HTTP_201_CREATED)


_ALLOWED_MAP_DOMAINS = {
    'maps.app.goo.gl', 'goo.gl', 'google.com', 'www.google.com', 'maps.google.com',
}

def resolve_maps_url(request):
    from urllib.parse import urlparse
    short_url = request.GET.get('url', '')
    if not short_url:
        return JsonResponse({'error': 'No URL'}, status=400)
    try:
        parsed = urlparse(short_url)
        if parsed.netloc not in _ALLOWED_MAP_DOMAINS:
            return JsonResponse({'error': 'Dominio no permitido'}, status=400)
        resp = http_requests.head(short_url, allow_redirects=True, timeout=5,
                                  headers={'User-Agent': 'Mozilla/5.0'})
        final_url = resp.url

        lat, lon = None, None

        m = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', final_url)
        if m:
            lat, lon = m.group(1), m.group(2)
        else:
            m = re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', final_url)
            if m:
                lat, lon = m.group(1), m.group(2)
            else:
                m = re.search(r'[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)', final_url)
                if m:
                    lat, lon = m.group(1), m.group(2)

        return JsonResponse({'final_url': final_url, 'lat': lat, 'lon': lon})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

from django.utils import timezone


class CamionesActivosMapaView(APIView):
    """Camiones con RegistroCamion hoy — posicion actual + trayectoria del dia."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Prefetch, OuterRef, Subquery, FloatField
        from flota.models import Camion, RegistroCamion, EventoCamion
        hoy = timezone.localtime(timezone.now()).date()

        registros_hoy_qs = RegistroCamion.objects.filter(
            registrado_at__date=hoy
        ).order_by('registrado_at')

        # Subquery: último nivel_tanque no-nulo por camión (evita N+1).
        ultimo_nivel_sq = (
            EventoCamion.objects
            .filter(camion=OuterRef('pk'), nivel_tanque__isnull=False)
            .order_by('-registrado_at')
            .values('nivel_tanque')[:1]
        )

        camiones = (
            Camion.objects
            .filter(estados__registrado_at__date=hoy)
            .distinct()
            .annotate(ultimo_nivel_tanque=Subquery(ultimo_nivel_sq, output_field=FloatField()))
            .prefetch_related(Prefetch(
                'estados',
                queryset=registros_hoy_qs,
                to_attr='registros_hoy',
            ))
        )

        data = []
        for c in camiones:
            registros = c.registros_hoy
            ultimo = registros[-1] if registros else None
            lat = ultimo.lat if ultimo else c.lat
            lon = ultimo.lon if ultimo else c.lon
            if lat is None:
                continue
            data.append({
                'id': c.id,
                'operador': c.operador,
                'lat': lat,
                'lon': lon,
                'velocidad': ultimo.velocidad if ultimo else 0,
                'direccion': ultimo.direccion if ultimo else 0,
                'activo': ultimo.activo if ultimo else False,
                'comentario': ultimo.comentario if ultimo else '',
                'nivel_tanque': c.ultimo_nivel_tanque,
                'historial': [[r.lat, r.lon] for r in registros],
            })
        return Response(data)


@login_required
def clientes_jornada_mapa(request):
    """Devuelve clientes con activo=True para el mapa admin."""
    from clientes.models import Cliente
    clientes = Cliente.objects.select_related('camion').filter(activo=True)
    data = []
    for c in clientes:
        iniciales = ""
        if c.camion and c.camion.operador:
            chofer = c.camion.operador.strip()[0].upper()
            camion = c.camion.marca.strip()[0].upper() if c.camion.marca else ""
            iniciales = f"{chofer}-{camion}" if camion else chofer
        data.append({
            'id': c.id,
            'name': c.name,
            'lat': c.lat,
            'lon': c.lon,
            'status': c.status,
            'tel1': c.tel1,
            'hora_programada': c.hora_programada.isoformat() if c.hora_programada else None,
            'cost': c.cost,
            'precio_cotizado': c.precio_cotizado,
            'address': c.address,
            'camion': c.camion_id,
            'camion_iniciales': iniciales,
            'camion_nombre': c.camion.operador if c.camion else '',
            'created_at': c.created_at.isoformat() if c.created_at else None,
        })
    return JsonResponse(data, safe=False)


@login_required
def tracking_camion_api(request):
    """Devuelve RegistroCamion agrupados por día y camión."""
    import datetime
    from collections import defaultdict
    from django.utils import timezone
    from flota.models import RegistroCamion, Camion

    dias = min(int(request.GET.get('dias', 7)), 90)
    camion_id = request.GET.get('camion')

    desde = timezone.now() - datetime.timedelta(days=dias)
    qs = RegistroCamion.objects.select_related('camion').filter(
        registrado_at__gte=desde
    )
    if camion_id:
        qs = qs.filter(camion_id=camion_id)

    tz_local = timezone.get_current_timezone()
    # Agrupar por (fecha, camion_id)
    grupos: dict = defaultdict(lambda: defaultdict(list))
    for r in qs.order_by('-registrado_at'):
        fecha = r.registrado_at.astimezone(tz_local).date().isoformat()
        grupos[fecha][r.camion_id].append({
            'id': r.id,
            'hora': r.registrado_at.astimezone(tz_local).strftime('%H:%M'),
            'lat': r.lat,
            'lon': r.lon,
            'velocidad': r.velocidad,
            'direccion': r.direccion,
            'activo': r.activo,
            'comentario': r.comentario,
        })

    # Nombres de camiones
    cam_ids = set()
    for por_camion in grupos.values():
        cam_ids.update(por_camion.keys())
    camiones_map = {c.id: c.operador for c in Camion.objects.filter(id__in=cam_ids)}

    result = []
    for fecha in sorted(grupos.keys(), reverse=True):
        por_camion = grupos[fecha]
        camiones_dia = []
        for cid in sorted(por_camion.keys(), key=lambda x: camiones_map.get(x, '')):
            camiones_dia.append({
                'camion_id': cid,
                'camion_nombre': camiones_map.get(cid, ''),
                'registros': len(por_camion[cid]),
                'puntos': por_camion[cid],
            })
        result.append({'fecha': fecha, 'camiones': camiones_dia})

    return JsonResponse(result, safe=False)


@login_required
def tracking_camion_delete(request):
    """Elimina todos los RegistroCamion de una fecha (y opcionalmente un camión)."""
    import json
    import datetime
    from django.utils import timezone
    from flota.models import RegistroCamion

    if request.method != 'DELETE':
        return JsonResponse({'error': 'Método no permitido'}, status=405)

    try:
        payload = json.loads(request.body or b'{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'JSON inválido'}, status=400)

    fecha_str = payload.get('fecha')
    if not fecha_str:
        return JsonResponse({'error': 'Campo fecha requerido (YYYY-MM-DD)'}, status=400)

    try:
        fecha = datetime.date.fromisoformat(fecha_str)
    except ValueError:
        return JsonResponse({'error': 'Formato de fecha inválido'}, status=400)

    tz_local = timezone.get_current_timezone()
    inicio = datetime.datetime.combine(fecha, datetime.time.min, tzinfo=tz_local)
    fin = datetime.datetime.combine(fecha, datetime.time.max, tzinfo=tz_local)

    qs = RegistroCamion.objects.filter(registrado_at__range=(inicio, fin))
    camion_id = payload.get('camion_id')
    if camion_id:
        qs = qs.filter(camion_id=camion_id)

    count = qs.count()
    qs.delete()
    return JsonResponse({'deleted': count, 'fecha': fecha_str})


@login_required
def eventos_camion_api(request):
    """Devuelve EventoCamion agrupados por día para el mapa admin."""
    import datetime
    from collections import defaultdict
    from django.utils import timezone
    from flota.models import EventoCamion

    dias = min(int(request.GET.get('dias', 30)), 365)
    camion_id = request.GET.get('camion')

    desde = timezone.now() - datetime.timedelta(days=dias)
    qs = EventoCamion.objects.select_related('camion', 'cliente').filter(
        registrado_at__gte=desde
    )
    if camion_id:
        qs = qs.filter(camion_id=camion_id)

    tz_local = timezone.get_current_timezone()
    grupos: dict = defaultdict(list)
    for ev in qs.order_by('-registrado_at'):
        fecha = ev.registrado_at.astimezone(tz_local).date().isoformat()
        grupos[fecha].append({
            'id': ev.id,
            'camion_id': ev.camion_id,
            'camion_nombre': ev.camion.operador if ev.camion else '',
            'camion_marca': ev.camion.marca if ev.camion else '',
            'cliente_id': ev.cliente_id,
            'cliente_nombre': ev.cliente.name if ev.cliente else None,
            'tipo': ev.tipo,
            'tipo_display': ev.get_tipo_display(),
            'lat': ev.lat,
            'lon': ev.lon,
            'comentario': ev.comentario,
            'nivel_tanque': ev.nivel_tanque,
            'monto': ev.monto,
            'factura': ev.factura,
            'qr': ev.qr,
            'registrado_at': ev.registrado_at.astimezone(tz_local).isoformat(),
        })

    result = [
        {'fecha': fecha, 'eventos': eventos}
        for fecha, eventos in sorted(grupos.items(), reverse=True)
    ]
    return JsonResponse(result, safe=False)


@login_required
def eventos_camion_qr_update(request, pk):
    """Actualiza el campo qr (bool) de un EventoCamion."""
    import json
    from flota.models import EventoCamion

    if request.method not in ('POST', 'PATCH'):
        return JsonResponse({'error': 'Método no permitido'}, status=405)

    try:
        payload = json.loads(request.body or b'{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'JSON inválido'}, status=400)

    if 'qr' not in payload or not isinstance(payload['qr'], bool):
        return JsonResponse({'error': 'Campo qr (bool) requerido'}, status=400)

    try:
        ev = EventoCamion.objects.get(pk=pk)
    except EventoCamion.DoesNotExist:
        return JsonResponse({'error': 'Evento no encontrado'}, status=404)

    ev.qr = payload['qr']
    ev.save(update_fields=['qr'])
    return JsonResponse({'id': ev.id, 'qr': ev.qr})


@login_required
def eventos_camion_factura_update(request, pk):
    """Actualiza el campo factura (int | null) de un EventoCamion."""
    import json
    from flota.models import EventoCamion

    if request.method not in ('POST', 'PATCH'):
        return JsonResponse({'error': 'Método no permitido'}, status=405)

    try:
        payload = json.loads(request.body or b'{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'JSON inválido'}, status=400)

    if 'factura' not in payload:
        return JsonResponse({'error': 'Campo factura requerido'}, status=400)

    valor = payload['factura']
    if valor is not None:
        try:
            valor = int(valor)
        except (TypeError, ValueError):
            return JsonResponse({'error': 'factura debe ser entero o null'}, status=400)

    try:
        ev = EventoCamion.objects.get(pk=pk)
    except EventoCamion.DoesNotExist:
        return JsonResponse({'error': 'Evento no encontrado'}, status=404)

    ev.factura = valor
    # Si se limpia a null y hay monto, save() recalcula automáticamente
    ev.save(update_fields=['factura'])
    return JsonResponse({'id': ev.id, 'factura': ev.factura})


@login_required
def eventos_camion_delete(request, pk):
    """Elimina un EventoCamion."""
    from flota.models import EventoCamion

    if request.method != 'DELETE':
        return JsonResponse({'error': 'Método no permitido'}, status=405)

    try:
        ev = EventoCamion.objects.get(pk=pk)
    except EventoCamion.DoesNotExist:
        return JsonResponse({'error': 'Evento no encontrado'}, status=404)

    ev.delete()
    return JsonResponse({'id': pk, 'deleted': True})




@login_required
def eventos_camion_monto_update(request, pk):
    """Actualiza el campo monto (int | null) de un EventoCamion."""
    import json
    from flota.models import EventoCamion

    if request.method not in ('POST', 'PATCH'):
        return JsonResponse({'error': 'Método no permitido'}, status=405)

    try:
        payload = json.loads(request.body or b'{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'JSON inválido'}, status=400)

    if 'monto' not in payload:
        return JsonResponse({'error': 'Campo monto requerido'}, status=400)

    valor = payload['monto']
    if valor is not None:
        try:
            valor = int(valor)
        except (TypeError, ValueError):
            return JsonResponse({'error': 'monto debe ser entero o null'}, status=400)

    try:
        ev = EventoCamion.objects.get(pk=pk)
    except EventoCamion.DoesNotExist:
        return JsonResponse({'error': 'Evento no encontrado'}, status=404)

    ev.monto = valor
    ev.save(update_fields=['monto'])
    return JsonResponse({'id': ev.id, 'monto': ev.monto})


@login_required
def camion_tracking_toggle(request, pk):
    """Consulta o actualiza tracking_activo y/o intervalo_tracking de un Camion."""
    import json
    from flota.models import Camion

    if request.method == 'GET':
        try:
            cam = Camion.objects.get(pk=pk)
        except Camion.DoesNotExist:
            return JsonResponse({'error': 'Camión no encontrado'}, status=404)
        return JsonResponse({
            'id': cam.id,
            'tracking_activo': cam.tracking_activo,
            'intervalo_tracking': cam.intervalo_tracking,
        })

    if request.method not in ('POST', 'PATCH'):
        return JsonResponse({'error': 'Método no permitido'}, status=405)

    try:
        payload = json.loads(request.body or b'{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'JSON inválido'}, status=400)

    try:
        cam = Camion.objects.get(pk=pk)
    except Camion.DoesNotExist:
        return JsonResponse({'error': 'Camión no encontrado'}, status=404)

    fields = []
    if 'tracking_activo' in payload and isinstance(payload['tracking_activo'], bool):
        cam.tracking_activo = payload['tracking_activo']
        fields.append('tracking_activo')
    if 'intervalo_tracking' in payload:
        try:
            val = max(10, int(payload['intervalo_tracking']))
        except (TypeError, ValueError):
            return JsonResponse({'error': 'intervalo_tracking debe ser entero >= 10'}, status=400)
        cam.intervalo_tracking = val
        fields.append('intervalo_tracking')

    if not fields:
        return JsonResponse({'error': 'Enviar tracking_activo (bool) o intervalo_tracking (int)'}, status=400)

    cam.save(update_fields=fields)
    return JsonResponse({
        'id': cam.id,
        'tracking_activo': cam.tracking_activo,
        'intervalo_tracking': cam.intervalo_tracking,
    })


import time as _time
from django.http import StreamingHttpResponse
from django.core.cache import cache as _cache


@login_required
def camiones_sse(request):
    def stream():
        last_cam = _cache.get('camiones_version', 0)
        last_cli = _cache.get('clientes_version', 0)
        yield 'data: init\n\n'
        ticks = 0
        while True:
            _time.sleep(2)
            cur_cam = _cache.get('camiones_version', 0)
            cur_cli = _cache.get('clientes_version', 0)
            if cur_cam != last_cam:
                last_cam = cur_cam
                yield 'data: ' + str(cur_cam) + '\n\n'
            if cur_cli != last_cli:
                last_cli = cur_cli
                yield 'event: clientes\ndata: ' + str(cur_cli) + '\n\n'
            if cur_cam == last_cam and cur_cli == last_cli:
                ticks += 1
                if ticks >= 8:
                    ticks = 0
                    yield ': ping\n\n'
            else:
                ticks = 0

    resp = StreamingHttpResponse(stream(), content_type='text/event-stream')
    resp['Cache-Control'] = 'no-cache'
    resp['X-Accel-Buffering'] = 'no'
    return resp

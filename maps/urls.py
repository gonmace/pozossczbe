from django.urls import path
from . import views
from .views import CamionesActivosMapaView

urlpatterns = [
    path('cotiza/', views.cotiza, name='cotiza'),
    path('api/v1/contratar/', views.ContratarAPIView.as_view(), name='contratar-api'),
    path('api/v1/contratar-admin/', views.ContratarAdminAPIView.as_view(), name='contratar-admin-api'),
    path('api/v1/cotizacion-web/', views.CotizacionWebAPIView.as_view(), name='cotizacion-web'),
    path('mapa/', views.mapa, name='mapa'),
    path('api/resolve-maps/', views.resolve_maps_url, name='resolve_maps_url'),
    path('maps/api/camiones-activos/', CamionesActivosMapaView.as_view(), name='camiones-activos'),
    path('maps/api/clientes-jornada/', views.clientes_jornada_mapa, name='clientes-jornada'),
    path('maps/api/camiones-sse/', views.camiones_sse, name='camiones-sse'),
    path('maps/api/eventos-camion/', views.eventos_camion_api, name='eventos-camion'),
    path('maps/api/eventos-camion/<int:pk>/qr/', views.eventos_camion_qr_update, name='eventos-camion-qr'),
    path('maps/api/eventos-camion/<int:pk>/factura/', views.eventos_camion_factura_update, name='eventos-camion-factura'),
    path('maps/api/eventos-camion/<int:pk>/monto/', views.eventos_camion_monto_update, name='eventos-camion-monto'),
    path('maps/api/eventos-camion/<int:pk>/', views.eventos_camion_delete, name='eventos-camion-delete'),
    path('maps/api/camion/<int:pk>/tracking/', views.camion_tracking_toggle, name='camion-tracking-toggle'),
    path('maps/api/tracking-camion/', views.tracking_camion_api, name='tracking-camion'),
    path('maps/api/tracking-camion/delete/', views.tracking_camion_delete, name='tracking-camion-delete'),
]

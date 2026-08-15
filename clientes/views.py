import threading

from django.core.cache import cache
from django.db.models import F
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Cliente
from .serializers import ClienteSerializer
from pozosscz.servicios_fcm import enviar_actualizacion_proyectos, enviar_asignacion_cliente


def _bump_clientes_version():
    try:
        cache.incr('clientes_version')
    except ValueError:
        cache.set('clientes_version', 1, timeout=None)


def _notificar_en_background(usuario_id=None):
    hilo = threading.Thread(
        target=enviar_actualizacion_proyectos,
        kwargs={'usuario_id': usuario_id},
        daemon=True,
    )
    hilo.start()


def _notificar_asignacion_en_background(instance):
    usuario_id = _usuario_id_de_instancia(instance)
    if not usuario_id:
        return
    hilo = threading.Thread(
        target=enviar_asignacion_cliente,
        kwargs={
            'usuario_id': usuario_id,
            'nombre_cliente': instance.name or '',
            'direccion': instance.address or '',
        },
        daemon=True,
    )
    hilo.start()


def _usuario_id_de_instancia(instance):
    """Devuelve el usuario_id del camión asignado al cliente, o None si no tiene."""
    if instance.camion_id and instance.camion and instance.camion.usuario_id:
        return instance.camion.usuario_id
    return None


class ClienteViewSet(viewsets.ModelViewSet):
    queryset = Cliente.objects.select_related('camion__usuario').order_by('-created_at')
    serializer_class = ClienteSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    @action(detail=False, methods=['get'], url_path='programados')
    def programados(self, request):
        camion_id = request.query_params.get('camion_id')
        try:
            es_admin = request.user.perfil.rol == 'ADM'
        except Exception:
            es_admin = False

        if es_admin and camion_id:
            clientes = Cliente.objects.select_related('camion__usuario').filter(
                activo=True,
                camion_id=camion_id,
            ).order_by(F('orden').asc(nulls_last=True), 'created_at')
        else:
            clientes = Cliente.objects.select_related('camion__usuario').filter(
                activo=True,
                camion__usuario=request.user,
            ).order_by(F('orden').asc(nulls_last=True), 'created_at')

        serializer = ClienteSerializer(clientes, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='reordenar')
    def reordenar(self, request):
        """Actualiza el campo `orden` de una lista de clientes en bulk.

        Body: {"orden": [id1, id2, id3, ...]}  — los IDs en el orden deseado.
        """
        ids = request.data.get('orden', [])
        if not isinstance(ids, list):
            return Response({'error': 'Se esperaba {"orden": [id, ...]}'}, status=400)
        for posicion, cliente_id in enumerate(ids):
            Cliente.objects.filter(pk=cliente_id).update(orden=posicion)
        # Notificar a todos los choferes afectados para que refresquen su lista
        usuarios_afectados = set(
            Cliente.objects.select_related('camion__usuario')
            .filter(pk__in=ids, camion__usuario__isnull=False)
            .values_list('camion__usuario_id', flat=True)
        )
        for usuario_id in usuarios_afectados:
            _notificar_en_background(usuario_id)
        return Response({'ok': True})

    def perform_create(self, serializer):
        instance = serializer.save()
        _bump_clientes_version()
        if instance.status == 'PRG' and instance.camion_id:
            _notificar_asignacion_en_background(instance)
        else:
            _notificar_en_background(_usuario_id_de_instancia(instance))

    def perform_update(self, serializer):
        # Capturar estado anterior antes de guardar
        old = self.get_object()
        old_status = old.status
        old_camion_id = old.camion_id

        instance = serializer.save()

        # Detectar nueva asignación PRG: status pasó a PRG o se asignó camión estando en PRG
        nueva_asignacion_prg = (
            instance.status == 'PRG'
            and instance.camion_id
            and (old_status != 'PRG' or old_camion_id != instance.camion_id)
        )

        _bump_clientes_version()

        if nueva_asignacion_prg:
            _notificar_asignacion_en_background(instance)
        else:
            _notificar_en_background(_usuario_id_de_instancia(instance))

    def perform_destroy(self, instance):
        instance.delete()
        _bump_clientes_version()
        _notificar_en_background()

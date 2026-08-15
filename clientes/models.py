from django.db import models

ESTADO_CLIENTE_CHOICES = [
    ('COT', 'Cotizado'),
    ('PRG', 'Programado'),
    ('EJE', 'Ejecutado'),
    ('CAN', 'Cancelado'),
    ('NEG', 'L.negra'),
    ('WEB', 'Web'),
]
TIPO_SERVICIO_CHOICES = [
    ('NOR', 'Normal'),
    ('FLE', 'Flete'),
    ('RRP', 'RRPP'),
    ('FBA', 'FB Ads'),
    ('ORG', 'Orgánico'),
    ('GOA', 'Google Ads'),
    ('COM', 'Combo'),
    ('MKP', 'Market Place'),
    ('OTR', 'Otro'),
]

USUARIO_CHOICES = [
    ('ADM', 'Administrador'),
    ('CLC', 'Cliente Confirma'),
    ('CLX', 'Cliente Cancela'),
]


class Cliente(models.Model):
    tel1 = models.CharField("telefono 1", max_length=20, null=True, blank=True)
    tel2 = models.CharField("telefono 2", max_length=20, blank=True)
    name = models.CharField("nombre", max_length=51, blank=True, null=True)
    address = models.TextField("direccion - comentario", max_length=255, blank=True)
    cod = models.CharField("codigo", max_length=10, blank=True, null=True)
    cost = models.IntegerField("precio final", default=0)
    precio_cotizado = models.IntegerField(
        "Precio sistema",
        default=0,
        help_text="Precio calculado por el sistema al momento de cotizar"
    )
    service = models.CharField(
        "servicio", max_length=10, choices=TIPO_SERVICIO_CHOICES, default='NOR'
    )
    lat = models.FloatField("latitud", max_length=10)
    lon = models.FloatField("longitud", max_length=10)
    status = models.CharField(
        "estado", max_length=3, choices=ESTADO_CLIENTE_CHOICES, default='COT'
    )
    user = models.CharField(
        "usuario", max_length=10, choices=USUARIO_CHOICES, default='ADM'
    )
    motivo_cancelado = models.TextField("motivo cancelación", blank=True, default='')
    created_at = models.DateTimeField("creado", auto_now_add=True)
    updated_at = models.DateTimeField("actualizado", auto_now=True)
    activo = models.BooleanField("Activo", default=False)
    hora_programada = models.DateTimeField("fecha y hora programada", null=True, blank=True)
    camion = models.ForeignKey(
        'flota.Camion',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='clientes',
        verbose_name='Camión asignado',
    )
    orden = models.IntegerField("orden jornada", null=True, blank=True, default=None)
    # created_at = models.DateTimeField("creado", blank=True, null=True)

    class Meta:
        verbose_name = "Cliente"
        verbose_name_plural = "Clientes"
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['created_at']),
            models.Index(fields=['service']),
            # Consultas del mapa admin — clientes_jornada_mapa
            models.Index(fields=['activo', 'camion'], name='cliente_activo_camion_idx'),
            models.Index(fields=['camion', 'orden'], name='cliente_camion_orden_idx'),
        ]

    def __str__(self):
        return self.tel1 if self.tel1 else '--------'

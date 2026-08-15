from django.db import models
from solo.models import SingletonModel
from datetime import datetime


class DatosGenerales(SingletonModel):
    HERO_VARIANT_CHOICES = [
        ('A', 'A — Rediseño (card de cotización)'),
        ('D', 'D — Banner animado (versión anterior)'),
    ]

    celular = models.CharField(
        "Teléfono Celular", max_length=12, default="+59176644033"
    )

    hero_variant = models.CharField(
        "Variante del inicio (hero)",
        max_length=1,
        choices=HERO_VARIANT_CHOICES,
        default='A',
        help_text="Versión del hero de la página de inicio que ve el público."
    )

    hero_imagen = models.ImageField(
        "Imagen del hero (inicio)",
        upload_to='home/',
        blank=True,
        null=True,
        help_text="Imagen del servicio que se muestra arriba del título en el inicio. "
                  "Si se deja vacío, se usa la imagen por defecto."
    )
    hero_imagen_alt = models.CharField(
        "Texto alternativo de la imagen del hero",
        max_length=255,
        default="Camión de limpieza de pozos sépticos en Santa Cruz",
        help_text="Descripción de la imagen para accesibilidad y SEO."
    )

    correo = models.EmailField(
        "Correo Electrónico", max_length=100, default="info@pozosscz.com"
    )
    mensaje_whatsapp = models.TextField(
        "Mensaje para Whatsapp",
        default="""¡Hola!, Requiero el servicio de limpieza en la siguiente ubicación: """
    )
    mensaje_cotizar = models.TextField(
        "Mensaje para Cotizar",
        default="Precio del servicio de limpieza del pozo y cámara séptica para vivienda."
    )

    def __str__(self):
        return "Datos Generales"

    class Meta:
        verbose_name = "Datos Generales"
        verbose_name_plural = "Datos Generales"
        


class PreciosPozosSCZ(SingletonModel):
    base_origen = models.ForeignKey(
        'BaseCamion',
        verbose_name="Base de origen",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
        limit_choices_to={'deleted': False},
        help_text="Base única desde donde parte el camión al cotizar. Si está vacía se usa Saguapac.",
    )

    precio_diesel = models.FloatField(
        "Precio Diesel (Bs)",
        default=3.76,
        help_text="Precio del diesel en Bs/L"
    )

    consumo_viaje_hr = models.FloatField(
        "Consumo viaje (L/Hr)",
        default=10,
        help_text="Consumo de diesel durante el viaje (sin bomba activa) en L/Hr"
    )
    consumo_trabajo_hr = models.FloatField(
        "Consumo trabajo (L/Hr)",
        default=16,
        help_text="Consumo de diesel durante el trabajo en sitio (bomba activa) en L/Hr"
    )
    tiempo_trabajo = models.FloatField(
        "Tiempo de trabajo (min)",
        default=30,
        help_text="Tiempo de trabajo en min"
    )
    personal_camion = models.IntegerField(
        "Personal %",
        default=15,
        help_text="% del precio final para el operador"
    )

    factor_tiempo = models.FloatField(
        "Factor velocidad camión vs auto",
        default=1.25,
        help_text="El camión tarda este factor más que un auto (ej: 1.25 = 25% más lento)"
    )
    factor_cargado = models.FloatField(
        "Factor retorno cargado",
        default=1.05,
        help_text="Factor adicional de tiempo cuando el camión va cargado en retorno (ej: 1.05 = 5% más lento)"
    )
    tiempo_minimo_cobro = models.FloatField(
        "Tiempo mínimo de cobro (min)",
        default=90,
        help_text="Tiempo mínimo facturable en minutos, aunque el servicio sea más corto"
    )
    costo_saguapac_planta = models.IntegerField(
        "Costo Saguapac Panta",
        default=30,
        help_text="Costo de Saguapac Tratamiento planta en Bs."
    )
    costo_mantenimiento = models.IntegerField(
        "Costo Mantenimiento %",
        default=20,
        help_text="Costo de mantenimiento en Bs."
    )
    
    utilidad_km = models.FloatField(
        "Utilidad recorrido de ida (Bs/Km)",
        default=5,
        help_text="Utilidad en Bs/Km por el recorrido de ida a la ubicación del cliente"
    )

    utilidad_base = models.IntegerField(
        "Utilidad base (Bs)",
        default=160,
        help_text="Utilidad base en Bs."
    )

    costo_adicional_km_retorno = models.FloatField(
        "Utilidad retorno a Saguapac (Bs/Km)",
        default=1,
        help_text="Utilidad en Bs/Km por el recorrido de retorno a Saguapac"
    )
    distancia_maxima_cotizar = models.IntegerField(
        "Distancia máxima para cotizar (Km)",
        default=60,
        help_text="Distancia máxima para cotizar en Km. linea recta desde centro de SCZ."
    )
    factor_global = models.FloatField(
        "Factor precio final",
        default=1,
        help_text="Factor global por defecto 1."
    )

    def __str__(self):
        return "Precios Pozos SCZ"

    class Meta:
        verbose_name = "Precios Pozos SCZ"


class AreasFactor(models.Model):
    name = models.CharField("Nombre área", max_length=50)
    factor = models.FloatField("Factor", default=1)
    polygon = models.JSONField()
    is_main = models.BooleanField("Principal", default=False)
    my_order = models.PositiveIntegerField(
        default=0,
        blank=False,
        null=False,
    )

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.is_main:
            # Ensure no other record is marked as main
            AreasFactor.objects.exclude(pk=self.pk).update(is_main=False)
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['my_order']
        verbose_name = "Área y Factor"
        verbose_name_plural = "Áreas y Factores"
        indexes = [
            models.Index(fields=['is_main']),
        ]


class PerfilUsuario(models.Model):
    ROL_ADMINISTRADOR = 'ADM'
    ROL_OPERADOR = 'OPR'
    ROLES = [
        (ROL_ADMINISTRADOR, 'Administrador'),
        (ROL_OPERADOR, 'Operador'),
    ]

    user = models.OneToOneField(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='perfil',
        verbose_name='Usuario',
    )
    rol = models.CharField(
        'Rol',
        max_length=3,
        choices=ROLES,
        default=ROL_OPERADOR,
    )

    def __str__(self):
        return f'{self.user.username} — {self.get_rol_display()}'

    class Meta:
        verbose_name = 'Perfil de Usuario'
        verbose_name_plural = 'Perfiles de Usuario'


def default_img_alt():
    return datetime.now().strftime('%d-%m-%Y')

class BaseCamion(models.Model):
    name = models.CharField("Nombre", max_length=50)
    coordinates = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    available = models.BooleanField(default=True)
    deleted = models.BooleanField(default=False)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Base de Camión"
        verbose_name_plural = "Bases de Camiones"
        indexes = [
            models.Index(fields=['available', 'deleted']),
        ]



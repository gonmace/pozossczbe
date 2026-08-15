from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import User

from solo.admin import SingletonModelAdmin
from pozosscz.models import (
    BaseCamion,
    PreciosPozosSCZ,
    DatosGenerales,
    AreasFactor,
    PerfilUsuario,
)
from adminsortable2.admin import SortableAdminMixin


class PerfilUsuarioInline(admin.StackedInline):
    model = PerfilUsuario
    can_delete = False
    verbose_name = 'Perfil'
    verbose_name_plural = 'Perfil'


class UserConPerfilAdmin(UserAdmin):
    inlines = [PerfilUsuarioInline]
    list_display = ('username', 'email', 'first_name', 'last_name', 'get_rol', 'is_active')
    list_filter = []

    @admin.display(description='Rol')
    def get_rol(self, obj):
        perfil = getattr(obj, 'perfil', None)
        return perfil.get_rol_display() if perfil else '—'


admin.site.unregister(User)
admin.site.register(User, UserConPerfilAdmin)


class AreasFactorAdmin(SortableAdminMixin, admin.ModelAdmin):
    list_display = ['my_order', 'name', 'factor', 'is_main']
    list_editable = ('factor', 'is_main')

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if obj.is_main:
            AreasFactor.objects.exclude(pk=obj.pk).update(is_main=False)

admin.site.register(AreasFactor, AreasFactorAdmin)
admin.site.register(DatosGenerales, SingletonModelAdmin)


@admin.register(BaseCamion)
class BaseCamionAdmin(admin.ModelAdmin):
    list_display = ('name', 'available', 'deleted', 'coordinates', 'created_at', 'updated_at')
    list_editable = ('available', 'deleted')


@admin.register(PreciosPozosSCZ)
class PreciosPozosSCZAdmin(SingletonModelAdmin):
    list_display = ('base_origen', 'precio_diesel', 'consumo_viaje_hr', 'consumo_trabajo_hr', 'tiempo_trabajo', 'personal_camion', 'factor_tiempo', 'factor_cargado', 'tiempo_minimo_cobro', 'costo_saguapac_planta', 'costo_mantenimiento', 'utilidad_km', 'utilidad_base')
    list_display_links = ('precio_diesel',)
    list_editable = ('consumo_viaje_hr', 'consumo_trabajo_hr', 'tiempo_trabajo', 'personal_camion', 'factor_tiempo', 'factor_cargado', 'tiempo_minimo_cobro', 'costo_saguapac_planta', 'costo_mantenimiento', 'utilidad_km', 'utilidad_base')

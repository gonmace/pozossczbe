from django.urls import include, path
from rest_framework import routers
from pozosscz.views import (
    # CustomAuthToken,
    PreciosPozosSCZViewSet,
    # AlcanceViewSet,
    BannerViewSet,
    # AQuienViewSet,
    AreasFactorViewSet
)
from . import views

router = routers.DefaultRouter()

# router.register(r'alcance', AlcanceViewSet, 'alcance')
router.register(r'banner', BannerViewSet, 'banner')
# router.register(r'aquien', AQuienViewSet, 'aquien')
router.register(r'precios', PreciosPozosSCZViewSet, 'precios')
router.register(r'areasfactor', AreasFactorViewSet, 'areasfactor')

urlpatterns = [
    path('api/v1/', include(router.urls)),
    path('', views.hello_world, name='hello_world'),
    # path('api/login/', CustomAuthToken.as_view(), name='api_login'),
]

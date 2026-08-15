from decouple import config
from pathlib import Path
import os

# Build paths inside the project like this: BASE_DIR / 'subdir'.
# Convertir BASE_DIR a string para evitar problemas con Path objects
BASE_DIR_PATH = Path(__file__).resolve().parent.parent
BASE_DIR = str(BASE_DIR_PATH)

# Aplicar parche para convertir Path objects a strings en templates
# Esto corrige el error TypeError cuando Django intenta hacer join() con Path objects
try:
    from . import path_fix
except ImportError:
    pass

SECRET_KEY = config('DJANGO_SECRET_KEY')  # Sin default: falla al arrancar si no está en .env

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.sitemaps',

    'adminsortable2',
    'solo',
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'import_export',
    'tailwind',
    'theme',
    'crispy_forms',
    'crispy_tailwind',
    'meta',
    
    'main',
    'pozosscz',
    'clientes',
    'maps',
    'flota',
]

CRISPY_ALLOWED_TEMPLATE_PACKS = "tailwind"
CRISPY_TEMPLATE_PACK = "tailwind"

TAILWIND_APP_NAME = 'theme'

TAILWIND_CSS_PATH = 'css/tailwind.css'

MIDDLEWARE = [
    # CORS debe ir antes que CommonMiddleware / SessionMiddleware para que
    # los preflight OPTIONS sean respondidos antes de auth/CSRF.
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

# Asegurar que TEMPLATES DIRS sea una lista de strings explícitos
TEMPLATE_DIRS = [os.path.join(BASE_DIR, 'templates')]
# Forzar conversión a string para evitar problemas con Path objects
TEMPLATE_DIRS = [str(d) for d in TEMPLATE_DIRS]

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        "DIRS": TEMPLATE_DIRS,
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'main.context_processors.menu_data',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# https://docs.djangoproject.com/en/5.1/ref/settings/#auth-password-validators
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "UserAttributeSimilarityValidator"
        ),
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "MinimumLengthValidator"
        ),
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "CommonPasswordValidator"
        ),
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "NumericPasswordValidator"
        ),
    },
]

# Internationalization
# https://docs.djangoproject.com/en/5.1/topics/i18n/

LANGUAGE_CODE = 'es'

TIME_ZONE = 'America/La_Paz'

USE_I18N = True

USE_TZ = True

DATETIME_INPUT_FORMATS = [
    '%d/%m/%Y %H:%M',
    '%d/%m/%Y %H:%M:%S',
    '%Y-%m-%d %H:%M:%S',
    '%Y-%m-%d %H:%M',
]


# https://docs.djangoproject.com/en/5.1/howto/static-files/

STATIC_URL = '/static/'
# Asegurar que todos los paths sean strings explícitos
STATIC_ROOT = str(os.path.join(BASE_DIR, 'staticfiles'))

STATICFILES_DIRS = [
    str(os.path.join(BASE_DIR, 'static')),
]

MEDIA_URL = '/media/'
MEDIA_ROOT = str(os.path.join(BASE_DIR, 'media'))

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

LOGIN_URL = '/login/'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework.authentication.TokenAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '30/minute',
        'user': '300/minute',
        'login': '10/minute',
        'cotiza': '20/minute',
        'cotiza_web': '10/minute',
    },
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    # Deshabilitar formato suffix para evitar conflictos con múltiples routers
    'URL_FORMAT_OVERRIDE': None,
}

DEFAULT_META = {
    "TITLE": "Limpieza de Pozos Ciegos y Sépticos en Santa Cruz | PozosSCZ",
    "DESCRIPTION": "Desagote de pozos ciegos y sépticos en Santa Cruz, Bolivia. Precio al instante sin sorpresas. Servicio rápido para hogares, empresas y condominios.",
    "KEYWORDS": [
        "limpieza de pozos sépticos Santa Cruz",
        "succión de pozos sépticos Santa Cruz",
        "limpieza pozo séptico Bolivia",
        "servicio sanitario Santa Cruz",
        "destranque cámara séptica",
        "pozos sépticos Santa Cruz de la Sierra",
        "limpieza pozos Bolivia",
        "empresa limpieza pozos SCZ",
    ],
    "IMAGE": "/static/img/default-og.jpg",
    "USE_OG": True,
    "USE_TWITTER": False,
    "USE_FACEBOOK": True,
    "EXTRA_PROPS": {
        'viewport': 'width=device-width, initial-scale=1.0, minimum-scale=1.0'
    },
}

META_SITE_DOMAIN = config('SITE_DOMAIN', default='pozosscz.com')
META_SITE_PROTOCOL = config('SITE_PROTOCOL', default='https')
META_USE_OG_PROPERTIES = True

# Versión de la app Android (expuesta por /api/v1/app-version/)
APP_MIN_VERSION = config('APP_MIN_VERSION', default='1.0.0')
APP_LATEST_VERSION = config('APP_LATEST_VERSION', default='1.0.0')
APP_FORCE_UPGRADE = config('APP_FORCE_UPGRADE', default=False, cast=bool)

# Permitir más campos en formularios del admin (list_editable con muchos registros)
DATA_UPLOAD_MAX_NUMBER_FIELDS = 5000
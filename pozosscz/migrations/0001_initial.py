# Generated by Django 5.1.1 on 2024-09-11 04:02

import pozosscz.models
import pozosscz.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='AreasFactor',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=50, verbose_name='Nombre área')),
                ('factor', models.FloatField(default=1, verbose_name='Factor')),
                ('polygon', models.JSONField()),
                ('my_order', models.PositiveIntegerField(default=0)),
            ],
            options={
                'ordering': ['my_order'],
            },
        ),
        migrations.CreateModel(
            name='Banner',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('svg', models.FileField(blank=True, help_text='svg 1200x600', null=True, upload_to='banner/', validators=[pozosscz.validators.validate_file_extension])),
                ('img', models.FileField(help_text='svg 1200x600', upload_to='banner/', validators=[pozosscz.validators.validate_file_extension])),
                ('img_alt', models.CharField(blank=True, default=pozosscz.models.default_img_alt, max_length=50, verbose_name='alt')),
                ('displayWebp', models.BooleanField(default=True, verbose_name='Mostrar Webp')),
                ('displayBanner', models.BooleanField(default=False, verbose_name='Mostrar Banner')),
            ],
            options={
                'verbose_name': 'Banner',
                'verbose_name_plural': 'Banner',
                'ordering': ['displayBanner'],
            },
        ),
        migrations.CreateModel(
            name='DatosGenerales',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('celular', models.CharField(default='+59171011118', max_length=12, verbose_name='Teléfono Celular')),
                ('mensaje_cotizar', models.TextField(default='¡Hola!, Requiero el servicio de limpieza\n         en la siguiente ubicación: ', verbose_name='Cotizar')),
            ],
            options={
                'verbose_name': 'Datos Generales',
            },
        ),
        migrations.CreateModel(
            name='PreciosPozosSCZ',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('p_km', models.FloatField(default=7, help_text='Considerar solo de ida', verbose_name='Precio km (Bs)')),
                ('p_base', models.IntegerField(default=250, help_text='Tarifa minima servicio', verbose_name='Precio minimo base (Bs)')),
                ('p_tiempo', models.FloatField(default=5, help_text='Considerar el tiempo en llegar al lugar', verbose_name='Precio tiempo (Bs)')),
                ('p_factor', models.FloatField(default=1, help_text='Factor precio', verbose_name='Factor de precio')),
            ],
            options={
                'verbose_name': 'Precios Pozos SCZ',
            },
        ),
    ]

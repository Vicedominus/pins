from django.apps import AppConfig


class PinsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'pins'

    def ready(self):
        from . import signals

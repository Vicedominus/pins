from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.db.models import F
from .models import Confirmation, Pin

@receiver(post_save, sender=Confirmation)
def inc_conf_count(sender, instance, created, **kwargs):
    if created:
        Pin.objects.filter(id=instance.pin_id).update(confirmations_count=F("confirmations_count") + 1)

@receiver(post_delete, sender=Confirmation)
def dec_conf_count(sender, instance, **kwargs):
    Pin.objects.filter(id=instance.pin_id).update(confirmations_count=F("confirmations_count") - 1)

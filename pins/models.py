from django.db import models
from django.conf import settings

class Pin(models.Model):
    title = models.CharField(max_length=120, blank=True, default="")
    description = models.TextField(blank=True)

    # Ubicación
    lat = models.FloatField()
    lng = models.FloatField()

    # Evidencia / metadatos
    images = models.JSONField(default=list, blank=True)  # URLs (evitar PII)
    is_public = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="pins"
    )

    # Confirmaciones y estado
    confirmations_count = models.PositiveIntegerField(default=0, db_index=True)
    STATUS_CHOICES = (
        ("active", "Active"),
        ("pending", "Pending review"),
        ("disputed", "Disputed"),
        ("removed", "Removed"),
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title or f"Pin #{self.pk}"

    @property
    def color_code(self):
        c = self.confirmations_count
        if c <= 0:
            return "gray"
        if c == 1:
            return "blue"
        if c == 2:
            return "yellow"
        if 3 <= c <= 5:
            return "orange"
        return "red"


class Confirmation(models.Model):
    pin = models.ForeignKey(Pin, on_delete=models.CASCADE, related_name="confirmations")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="pin_confirmations")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = (("pin", "user"),)  # 1 confirmación por usuario
        indexes = [models.Index(fields=["pin", "user"])]

    def __str__(self):
        return f"Confirm pin {self.pin_id} by {self.user_id}"

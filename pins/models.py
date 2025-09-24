from django.db import models

# Create your models here.
from django.db import models

class Pin(models.Model):
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=60, db_index=True, blank=True)
    lat = models.FloatField()   # -90..90
    lng = models.FloatField()   # -180..180
    tags = models.JSONField(default=list, blank=True)
    rating = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)  # 0..5.0
    images = models.JSONField(default=list, blank=True)  # URLs
    is_public = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

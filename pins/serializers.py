from rest_framework import serializers
from .models import Pin

class PinSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pin
        fields = ("id","title","description","category","lat","lng","tags","rating","images","is_public","created_at")

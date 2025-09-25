from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Pin, Confirmation


class UserPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username"]


class PinSerializer(serializers.ModelSerializer):
    confirmations_count = serializers.IntegerField(read_only=True)
    user_confirmed = serializers.SerializerMethodField()
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)

    # siempre calculamos color aquí
    color = serializers.SerializerMethodField()
    # (opcional, si lo estás usando)
    confirmed_by = serializers.SerializerMethodField()

    class Meta:
        model = Pin
        fields = [
            "id",
            "title",
            "description",
            "images",
            "lat",
            "lng",
            "status",
            "is_public",
            "created_at",
            "created_by",
            "confirmations_count",
            "color",              # <- importante
            "user_confirmed",
            "confirmed_by",       # <- opcional
        ]

    # ---- helpers ----
    def _count_confirmations(self, obj):
        # usa el campo si existe; si no, cuenta la relación
        count = getattr(obj, "confirmations_count", None)
        if count is None:
            count = obj.confirmations.count()
        return int(count or 0)

    def get_color(self, obj):
        c = self._count_confirmations(obj)
        # Si querés que 0 confirmaciones sea AZUL, cambia 'gray' por 'blue'
        if c <= 0:
            return "gray"
        if c == 1:
            return "blue"
        if c == 2:
            return "yellow"
        if c <= 5:
            return "orange"
        return "red"

    def get_user_confirmed(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return False
        return obj.confirmations.filter(user=request.user).exists()

    def get_confirmed_by(self, obj):
        # opcional: devuelve la lista de usuarios que confirmaron (solo para logueados)
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return []
        qs = obj.confirmations.select_related("user").all()
        return [{"id": c.user_id, "username": c.user.username} for c in qs]

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            validated_data["created_by"] = request.user
        return super().create(validated_data)

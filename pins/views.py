from rest_framework import viewsets, permissions, filters
from .models import Pin
from .serializers import PinSerializer

class PinViewSet(viewsets.ModelViewSet):
    serializer_class = PinSerializer
    permission_classes = [permissions.AllowAny]  # MVP: abierto (solo dev)
    filter_backends = [filters.SearchFilter]
    search_fields = ["title","description","category","tags"]

    def get_queryset(self):
        qs = Pin.objects.filter(is_public=True)

        # bbox = west,south,east,north
        bbox = self.request.query_params.get("in_bbox")
        if bbox:
            try:
                west, south, east, north = map(float, bbox.split(","))
                qs = qs.filter(
                    lng__gte=west, lng__lte=east,
                    lat__gte=south, lat__lte=north
                )
            except Exception:
                pass

        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category__iexact=category)

        min_rating = self.request.query_params.get("min_rating")
        if min_rating:
            try:
                qs = qs.filter(rating__gte=float(min_rating))
            except Exception:
                pass

        return qs

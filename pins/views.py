# pins/views.py
from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth.models import User
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator


from .models import Pin, Confirmation
from .serializers import PinSerializer

from django.db.models import Q


class PinViewSet(viewsets.ModelViewSet):
    serializer_class = PinSerializer
    permission_classes = [permissions.AllowAny]
    filter_backends = [filters.SearchFilter]
    search_fields = ["title", "description"]

    def get_queryset(self):
        """
        Invitado:         solo ACTIVES públicos
        Usuario logueado: ACTIVES públicos OR sus propios (cualquier status)
        """
        base = (
            Pin.objects.all()
            .select_related("created_by")
            .prefetch_related("confirmations__user")
        )

        user = self.request.user
        if user.is_authenticated:
            qs = base.filter(
                Q(is_public=True, status__iexact="active") |
                Q(created_by=user)  # ve sus propios pending
            )
        else:
            qs = base.filter(is_public=True, status__iexact="active")

        # bbox opcional
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

        # filtro extra por status (no permite filtrar otros "pending" ajenos)
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status__iexact=status_param)

        return qs

    def perform_create(self, serializer):
        """
        Todo pin nuevo queda 'pending' y no público. Solo lo ve su creador.
        """
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(
            created_by=user,
            status="pending",
            is_public=False,
        )

    @action(detail=True, methods=["post", "delete"], permission_classes=[permissions.IsAuthenticated])
    def confirm(self, request, pk=None):
        """
        POST   /api/pins/{id}/confirm/  -> confirmar (no propio)
        DELETE /api/pins/{id}/confirm/  -> quitar confirmación
        *OJO*: El queryset ya evita acceder a pines ajenos que no sean activos.
        """
        pin = self.get_object()

        if request.method.lower() == "post":
            if pin.created_by_id == request.user.id:
                return Response({"detail": "No puedes confirmar tu propio pin."},
                                status=status.HTTP_400_BAD_REQUEST)
            Confirmation.objects.get_or_create(pin=pin, user=request.user)
        else:
            Confirmation.objects.filter(pin=pin, user=request.user).delete()

        pin.refresh_from_db()
        serializer = self.get_serializer(pin, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)
@method_decorator(csrf_exempt, name="dispatch")
class RegisterView(APIView):
    authentication_classes = []               # <- evita SessionAuthentication (y su CSRF)
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""
        if not username or not password:
            return Response({"detail": "username y password requeridos"}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username__iexact=username).exists():
            return Response({"detail": "username ya existe"}, status=status.HTTP_400_BAD_REQUEST)
        u = User.objects.create_user(username=username, password=password)
        return Response({"id": u.id, "username": u.username}, status=status.HTTP_201_CREATED)

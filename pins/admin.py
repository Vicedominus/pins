from django.contrib import admin
from django.utils.html import format_html
from django.db.models import Count
from .models import Pin, Confirmation

class ConfirmationInline(admin.TabularInline):
    model = Confirmation
    fk_name = "pin"
    extra = 0
    can_delete = True
    # Si tu modelo Confirmation NO tiene created_at, quítalo de fields/readonly_fields
    fields = ("user", "created_at")
    readonly_fields = ("user", "created_at")
    raw_id_fields = ("user",)

    def has_add_permission(self, request, obj=None):
        # Solo visualizar/eliminar (no crear confirmaciones manualmente)
        return False


@admin.register(Pin)
class PinAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "status",
        "is_public",
        "created_by",
        "created_at",
        "confirmations_count_display",
        "color_badge",
        "confirmed_by_list",   # 👈 NUEVA COLUMNA
    )
    list_filter = ("status", "is_public")
    search_fields = ("title", "description", "created_by__username", "id")
    list_select_related = ("created_by",)
    autocomplete_fields = ("created_by",)
    inlines = [ConfirmationInline]

    actions = ["approve_pins"]

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related("created_by")
            .annotate(_confcount=Count("confirmations", distinct=True))
            .prefetch_related("confirmations__user")   # 👈 evita N+1 para confirmed_by_list
        )

    def confirmations_count_display(self, obj):
        count = getattr(obj, "confirmations_count", None)
        if count is None:
            count = getattr(obj, "_confcount", 0)
        return count
    confirmations_count_display.short_description = "Confirmaciones"
    confirmations_count_display.admin_order_field = "_confcount"

    def _color_from_count(self, count):
        if count <= 0:
            return "gray"  # pon "blue" si preferís 0=azul
        if count == 1:
            return "blue"
        if count == 2:
            return "yellow"
        if count <= 5:
            return "orange"
        return "red"

    def color_badge(self, obj):
        count = self.confirmations_count_display(obj)
        color_name = self._color_from_count(count)
        hex_map = {
            "blue": "#1976d2",
            "yellow": "#fbc02d",
            "orange": "#fb8c00",
            "red": "#e53935",
            "gray": "#9e9e9e",
        }
        return format_html(
            '<span title="{}" style="display:inline-block;width:12px;height:12px;border-radius:50%;background:{}"></span>',
            color_name,
            hex_map.get(color_name, "#9e9e9e"),
        )
    color_badge.short_description = "Color"

    def confirmed_by_list(self, obj):
        """
        Muestra hasta 5 usernames de quienes confirmaron el pin, y un +N si hay más.
        """
        # Si tenés created_at en Confirmation, podés ordenar por fecha:
        qs = obj.confirmations.select_related("user").all()  # .order_by("-created_at")
        names = [c.user.username for c in qs[:5]]
        extra = qs.count() - len(names)
        label = ", ".join(names) if names else "—"
        if extra > 0:
            label += f" (+{extra})"
        return label
    confirmed_by_list.short_description = "Confirmado por"

    @admin.action(description="Aprobar y publicar pines seleccionados")
    def approve_pins(self, request, queryset):
        updated = queryset.update(status="active", is_public=True)
        self.message_user(request, f"{updated} pines aprobados y publicados.")


@admin.register(Confirmation)
class ConfirmationAdmin(admin.ModelAdmin):
    list_display = ("id", "pin", "user", "created_at")
    list_filter = ("created_at",)
    search_fields = ("pin__title", "user__username", "pin__id")
    list_select_related = ("pin", "user")
    raw_id_fields = ("pin", "user")
    date_hierarchy = "created_at"

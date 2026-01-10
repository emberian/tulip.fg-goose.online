from typing import Any

from django.db import models
from django.db.models import CASCADE
from django.utils.timezone import now as timezone_now
from typing_extensions import override


class UserPersona(models.Model):
    """User-owned character identities for roleplay.

    Unlike bot-controlled puppets (stream-scoped), personas are personal
    and portable - they belong to a user and can be used anywhere.
    """

    MAX_NAME_LENGTH = 100
    MAX_BIO_LENGTH = 500
    MAX_PERSONAS_PER_USER = 20

    user = models.ForeignKey(
        "zerver.UserProfile",
        on_delete=CASCADE,
        related_name="personas",
    )
    name = models.CharField(max_length=MAX_NAME_LENGTH)
    avatar_url = models.URLField(max_length=500, null=True, blank=True)
    # Hex color format: #RGB or #RRGGBB
    color = models.CharField(max_length=10, null=True, blank=True, default=None)
    bio = models.TextField(max_length=MAX_BIO_LENGTH, blank=True, default="")
    # Soft delete - personas with past messages should be deactivated, not deleted
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone_now)

    class Meta:
        unique_together = ("user", "name")
        ordering = ["-created_at"]

    @override
    def __str__(self) -> str:
        return f"{self.name} ({self.user.delivery_email})"

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "avatar_url": self.avatar_url,
            "color": self.color,
            "bio": self.bio,
            "is_active": self.is_active,
            "date_created": int(self.created_at.timestamp()),
        }

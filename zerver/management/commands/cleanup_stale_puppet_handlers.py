from argparse import ArgumentParser
from typing import Any

from django.core.management.base import CommandError
from typing_extensions import override

from zerver.actions.stream_puppets import cleanup_stale_handlers
from zerver.lib.management import ZulipBaseCommand


class Command(ZulipBaseCommand):
    help = """Remove stale 'recent' puppet handlers whose time window has expired.

    For 'open' puppets, handlers are considered stale when their last_used
    timestamp is older than the puppet's recent_handler_window_hours.

    Claimed handlers are never cleaned up - they persist until explicitly removed.

    This command should be run periodically (e.g., daily) to prevent
    accumulation of stale handler records."""

    @override
    def add_arguments(self, parser: ArgumentParser) -> None:
        parser.add_argument(
            "-f",
            "--for-real",
            action="store_true",
            help="Actually delete the stale handlers. Without this flag, "
            "only counts how many would be deleted.",
        )

    @override
    def handle(self, *args: Any, **options: Any) -> None:
        dry_run = not options["for_real"]

        stale_count = cleanup_stale_handlers(dry_run=dry_run)

        if stale_count == 0:
            print("No stale puppet handlers found.")
            return

        if dry_run:
            print(f"Found {stale_count} stale puppet handlers.")
            print()
            raise CommandError("This was a dry run. Pass -f to actually delete.")
        else:
            print(f"Deleted {stale_count} stale puppet handlers.")

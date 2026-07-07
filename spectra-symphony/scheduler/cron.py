"""
Spectra Scheduler — drives the orchestrator on a cron schedule.
Uses APScheduler for local/embedded scheduling.
Designed to integrate with Base44 automation triggers as well.
"""

import asyncio
import os
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from orchestrator.orchestrator import Orchestrator
from integrations.linear_client import LinearClient
from integrations.github_client import GitHubClient
from integrations.whatsapp_client import WhatsAppClient


def build_orchestrator() -> Orchestrator:
    return Orchestrator(
        linear_client=LinearClient(),
        github_client=GitHubClient(),
        whatsapp_client=WhatsAppClient(),
        max_parallel_runs=int(os.environ.get("MAX_PARALLEL_RUNS", "5")),
    )


async def run_once(orchestrator: Orchestrator):
    """Single poll-and-run cycle. Can be triggered by Base44 automation or cron."""
    await orchestrator.poll_and_run()


def start_scheduler(poll_interval_minutes: int = 5):
    """Start the APScheduler loop for continuous polling."""
    orchestrator = build_orchestrator()
    scheduler = AsyncIOScheduler()

    scheduler.add_job(
        run_once,
        trigger=IntervalTrigger(minutes=poll_interval_minutes),
        args=[orchestrator],
        id="spectra_poll",
        name="Spectra Linear Poller",
        replace_existing=True,
    )

    scheduler.start()
    print(f"[Spectra] Scheduler started — polling every {poll_interval_minutes} minutes")

    try:
        asyncio.get_event_loop().run_forever()
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()
        print("[Spectra] Scheduler stopped")


if __name__ == "__main__":
    start_scheduler(
        poll_interval_minutes=int(os.environ.get("POLL_INTERVAL_MINUTES", "5"))
    )

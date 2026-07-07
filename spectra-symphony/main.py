"""
Spectra Symphony — main entry point.

Usage:
  python main.py                    # Start the scheduler (continuous mode)
  python main.py --once             # Run one poll cycle and exit
  python main.py --approve <id>     # Approve a sprint by approval ID
  python main.py --reject <id> "<feedback>"  # Reject a sprint with feedback
"""

import asyncio
import sys
from scheduler.cron import build_orchestrator, start_scheduler, run_once


async def main():
    args = sys.argv[1:]

    if not args:
        # Continuous scheduler mode
        start_scheduler()

    elif args[0] == "--once":
        orchestrator = build_orchestrator()
        await run_once(orchestrator)
        print("[Spectra] Single poll cycle complete.")

    elif args[0] == "--approve" and len(args) >= 2:
        orchestrator = build_orchestrator()
        await orchestrator.handle_approval(args[1], "APPROVE")
        print(f"[Spectra] Sprint {args[1]} approved.")

    elif args[0] == "--reject" and len(args) >= 3:
        orchestrator = build_orchestrator()
        await orchestrator.handle_approval(args[1], "REJECT", args[2])
        print(f"[Spectra] Sprint {args[1]} rejected with feedback.")

    else:
        print(__doc__)


if __name__ == "__main__":
    asyncio.run(main())

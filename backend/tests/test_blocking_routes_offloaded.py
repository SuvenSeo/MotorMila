"""Routes doing blocking I/O must not be ``async def`` (they would stall the
single uvicorn worker's event loop); FastAPI threadpools plain ``def`` routes."""

import inspect
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints import billing, calculators
from app.routers import payhere, play_billing


def test_blocking_handlers_are_sync():
    for fn in (
        play_billing.play_rtdn,
        billing.billing_webhook,
        payhere.payhere_notify,
        calculators.get_macro_context,
    ):
        assert not inspect.iscoroutinefunction(fn), fn.__qualname__


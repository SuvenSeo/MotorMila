import warnings

import pytest


@pytest.fixture(scope="session", autouse=True)
def _filter_known_test_warnings() -> None:
    warnings.filterwarnings(
        "ignore",
        message="Using `httpx` with `starlette.testclient` is deprecated.*",
        category=DeprecationWarning,
    )
    warnings.filterwarnings(
        "ignore",
        message="datetime.datetime.utcnow\\(\\) is deprecated.*",
        category=DeprecationWarning,
    )
    warnings.filterwarnings(
        "ignore",
        message="Support for class-based `config` is deprecated.*",
        category=DeprecationWarning,
    )


@pytest.fixture(autouse=True)
def _isolate_stats_memory_cache() -> None:
    """Clear the process-local stats cache around every test.

    The stats endpoints keep a module-level TTL cache (app.utils.memory_cache);
    without per-test clearing, a payload from one test's database would leak
    into the next test's assertions.
    """
    from app.utils import memory_cache

    memory_cache.clear()
    yield
    memory_cache.clear()


@pytest.fixture(autouse=True)
def _open_app_access_for_unit_tests(monkeypatch: pytest.MonkeyPatch) -> None:
    """Product APIs stay open in unit tests unless a test opts into the gate.

    Production defaults APP_ACCESS_ENFORCED=true; tests that need the gate
    should setenv("APP_ACCESS_ENFORCED", "true") themselves.
    """
    monkeypatch.setenv("APP_ACCESS_ENFORCED", "false")


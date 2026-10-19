import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.services.rate_limit import RateLimiter, _client_key


class DummyRequest:
    def __init__(self, headers: dict[str, str], host: str = "10.0.0.9"):
        self.headers = headers
        self.client = type("Client", (), {"host": host})()


class _MockState:
    pass


class DummyRequestWithState:
    """DummyRequest that exposes a .state object so RateLimiter can store headers."""

    def __init__(self, headers: dict[str, str], host: str = "10.0.0.1"):
        self.headers = headers
        self.client = type("Client", (), {"host": host})()
        self.state = _MockState()


def test_client_key_uses_rightmost_forwarded_hop():
    request = DummyRequest(
        headers={
            "x-forwarded-for": "6.6.6.6, 172.16.0.1, 203.0.113.7",
            "user-agent": "pytest-agent",
        }
    )

    assert _client_key(request) == "203.0.113.7"


def test_client_key_ignores_client_forged_leftmost_entry():
    # A caller rotating the leftmost XFF value must not rotate limiter keys.
    forged_a = DummyRequest(headers={"x-forwarded-for": "1.1.1.1, 203.0.113.7", "user-agent": "ua"})
    forged_b = DummyRequest(headers={"x-forwarded-for": "2.2.2.2, 203.0.113.7", "user-agent": "ua"})

    assert _client_key(forged_a) == _client_key(forged_b)


def test_client_key_ignores_user_agent_rotation():
    """UA rotation must not multiply limiter buckets."""
    a = DummyRequest(headers={"user-agent": "ua-1"}, host="192.0.2.10")
    b = DummyRequest(headers={"user-agent": "ua-2"}, host="192.0.2.10")
    assert _client_key(a) == _client_key(b)


def test_client_key_falls_back_to_socket_host_without_header():
    request = DummyRequest(headers={"user-agent": "ua"}, host="192.0.2.4")

    assert _client_key(request) == "192.0.2.4"


def test_rate_limiter_blocks_user_agent_rotation():
    limiter = RateLimiter(max_requests=2, window_seconds=60)

    for ua in ("ua-1", "ua-2"):
        limiter(DummyRequest(headers={"user-agent": ua}, host="198.51.100.9"), now=1000)

    try:
        limiter(DummyRequest(headers={"user-agent": "ua-3"}, host="198.51.100.9"), now=1001)
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 429
    else:
        raise AssertionError("UA rotation should not bypass the limiter")


def test_rate_limiter_blocks_spoofed_header_rotation():
    limiter = RateLimiter(max_requests=2, window_seconds=60)

    for spoofed in ("9.9.9.1", "9.9.9.2"):
        limiter(
            DummyRequest(headers={"x-forwarded-for": f"{spoofed}, 203.0.113.7", "user-agent": "ua"}),
            now=1000,
        )

    try:
        limiter(
            DummyRequest(headers={"x-forwarded-for": "9.9.9.3, 203.0.113.7", "user-agent": "ua"}),
            now=1001,
        )
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 429
    else:
        raise AssertionError("spoofed XFF rotation should not bypass the limiter")


def test_rate_limiter_supports_custom_key_function():
    limiter = RateLimiter(
        max_requests=2,
        window_seconds=60,
        key_func=lambda request: str(request.headers.get("x-api-key") or "missing"),
    )
    request = DummyRequest(headers={"x-api-key": "k1", "user-agent": "ua"})

    limiter(request, now=1000)
    limiter(request, now=1001)

    try:
        limiter(request, now=1002)
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 429
    else:
        raise AssertionError("custom key function should drive limiter buckets")


def test_rate_limiter_429_includes_rate_limit_headers():
    limiter = RateLimiter(max_requests=1, window_seconds=30)
    request = DummyRequest(headers={"user-agent": "ua"}, host="1.2.3.4")

    limiter(request, now=1000.0)

    try:
        limiter(request, now=1001.0)
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 429
        headers = getattr(exc, "headers", {}) or {}
        assert "Retry-After" in headers
        assert "RateLimit-Limit" in headers
        assert headers["RateLimit-Limit"] == "1"
        assert "RateLimit-Remaining" in headers
        assert headers["RateLimit-Remaining"] == "0"
        assert "RateLimit-Reset" in headers
        assert int(headers["RateLimit-Reset"]) == int(1000.0 + 30)
        assert int(headers["Retry-After"]) >= 1
    else:
        raise AssertionError("second request should be rate-limited")


def test_rate_limiter_sets_state_headers_on_allowed_request():
    limiter = RateLimiter(max_requests=5, window_seconds=60)
    request = DummyRequestWithState(headers={"user-agent": "ua"}, host="1.2.3.5")

    limiter(request, now=2000.0)

    assert hasattr(request.state, "ratelimit_headers")
    rl = request.state.ratelimit_headers
    assert rl["RateLimit-Limit"] == "5"
    assert rl["RateLimit-Remaining"] == "4"
    assert int(rl["RateLimit-Reset"]) == int(2000.0 + 60)


def test_rate_limiter_remaining_decrements_each_request():
    limiter = RateLimiter(max_requests=3, window_seconds=60)
    req1 = DummyRequestWithState(headers={"user-agent": "ua"}, host="1.2.3.6")
    req2 = DummyRequestWithState(headers={"user-agent": "ua"}, host="1.2.3.6")

    limiter(req1, now=3000.0)
    limiter(req2, now=3001.0)

    assert req1.state.ratelimit_headers["RateLimit-Remaining"] == "2"
    assert req2.state.ratelimit_headers["RateLimit-Remaining"] == "1"


def test_rate_limiter_skips_state_headers_for_requests_without_state():
    limiter = RateLimiter(max_requests=10, window_seconds=60)
    request = DummyRequest(headers={"user-agent": "ua"}, host="1.2.3.7")

    limiter(request, now=4000.0)

    assert not hasattr(request, "state")

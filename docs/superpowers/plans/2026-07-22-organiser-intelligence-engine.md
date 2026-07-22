# Organiser Intelligence Engine (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python pipeline that reads two public Victorian event sources, identifies which ticketing platform each organiser sells through, ranks them, and writes a prospect list into the existing outreach tracker without ever collecting an email address.

**Architecture:** Seven single-responsibility modules behind one rule: `collect.py` is the only module that touches the network, so everything downstream is tested offline against committed golden fixtures. Three legal rails (no address harvesting, no competitor queries, robots honoured with fail-closed on a bot challenge) live in `guards.py` and fail the run rather than warn.

**Tech Stack:** Python 3.11, requests, beautifulsoup4 + lxml, rapidfuzz, pandas + pyarrow, openpyxl, PyYAML, pytest, ruff, mypy.

**Spec:** `docs/superpowers/specs/2026-07-22-organiser-intelligence-engine-design.md` in `eventlinqs-app`, committed on branch `docs/organiser-intelligence-engine-spec` (`0c20c9a`). Read it before Task 1.

**Repo:** All paths below are relative to `C:/Users/61416/OneDrive/Desktop/EventLinqs/eventlinqs-organiser-engine`, a NEW sibling repo. Nothing in this plan touches `eventlinqs-app` except the tracker file it writes, at the absolute path given in Task 10.

**One structural addition to the spec's tree:** `src/models.py` holds the shared `EventRecord` and `OrganiserRecord` dataclasses. The spec's tree omitted it; putting the shared types in one place avoids a circular import between `parse`, `resolve`, `score` and `export`.

## Global Constraints

- Python 3.11. The repo targets `py311` in ruff and mypy config.
- User agent on every request, exactly: `EventLinqsResearchBot/1.0 (+mailto:lawaladams9@gmail.com)`
- Rate limit: no more than **1 request per 2 seconds per host**.
- The **only** email regex in the entire codebase lives in `src/guards.py`. A test enforces this. Adding a second one anywhere is a build failure.
- `parse.py` never reads a contact-email field, even where trivially available.
- The address guard never scans `data/raw/`, never scans human-owned tracker columns, and scans `verification_queue.xlsx` only at engine write time.
- robots.txt: 404 or 410 means allowed. 5xx, timeout, or a bot challenge means **fail closed** (treat as disallowed) and route the source to the manual queue.
- Never issue a request to any ticketing platform domain. `collect.fetch()` raises instead.
- Fuzzy merge thresholds: auto-merge above **92**, queue between **82 and 92**, never merge below **82**.
- Score components: Activity 25, Recency 18, Live on sale 15, Niche 14, Audience 12, Switchability 9, Corridor 7. Tiers: A 70+, B 50 to 69, C 30 to 49, D below 30.
- **Audience reach is a hard-coded constant 4 in v1** (no follower data, no sell-out data on either source). Max achievable v1 score is 92.
- No tracker column is ever both engine-owned and human-owned.
- Australian English in all copy and comments. No em-dashes, no en-dashes, no exclamation marks in any user-facing string.

---

## File Structure

| File | Responsibility |
|---|---|
| `pyproject.toml` | deps, ruff, mypy, pytest config |
| `src/models.py` | `EventRecord`, `OrganiserRecord` dataclasses, provenance validation |
| `src/guards.py` | the three rails: address detector, competitor blocklist, robots policy |
| `src/collect.py` | the only network module: rate limit, cache, provenance sidecars |
| `src/platform_detect.py` | URL to platform and bucket. Pure string work |
| `src/parse.py` | cached bytes to `EventRecord`, one parser per source |
| `src/resolve.py` | events to organisers: normalise, match, venue-anchor |
| `src/score.py` | score components and tier |
| `src/export.py` | tracker write: backup, atomic replace, column partition |
| `src/verify_queue.py` | the human check list |
| `run.py` | pipeline entry point and acceptance gate report |
| `config/*.yaml` | sources, platforms, geography, niches |
| `fixtures/` | committed golden pages for offline parser tests |

---

### Task 1: Repo scaffold and tooling

**Files:**
- Create: `pyproject.toml`, `.gitignore`, `README.md`, `src/__init__.py`, `tests/__init__.py`, `tests/test_scaffold.py`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `pytest` / `ruff` / `mypy` toolchain that every later task relies on.

- [ ] **Step 1: Create the repo and directory tree**

```bash
cd "C:/Users/61416/OneDrive/Desktop/EventLinqs"
mkdir -p eventlinqs-organiser-engine
cd eventlinqs-organiser-engine
git init
mkdir -p src config/selectors data/raw fixtures logs tests backups
touch src/__init__.py tests/__init__.py
```

- [ ] **Step 2: Write `pyproject.toml`**

```toml
[project]
name = "eventlinqs-organiser-engine"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "requests>=2.32",
    "beautifulsoup4>=4.12",
    "lxml>=5.2",
    "rapidfuzz>=3.9",
    "pandas>=2.2",
    "pyarrow>=16.0",
    "openpyxl>=3.1",
    "PyYAML>=6.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.2", "ruff>=0.5", "mypy>=1.10", "types-requests", "types-PyYAML"]

[tool.ruff]
target-version = "py311"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]

[tool.mypy]
python_version = "3.11"
strict = true
ignore_missing_imports = true

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 3: Write `.gitignore`**

```gitignore
__pycache__/
*.py[cod]
.venv/
venv/
data/raw/
data/*.parquet
logs/*.log
backups/
.mypy_cache/
.ruff_cache/
.pytest_cache/
```

Note: `data/raw/` is gitignored deliberately. Cached pages can contain published contact
addresses (the Geelong case), so they must never enter version control.

- [ ] **Step 4: Write the scaffold test**

```python
# tests/test_scaffold.py
import sys


def test_python_is_311_or_newer() -> None:
    assert sys.version_info >= (3, 11)


def test_src_package_importable() -> None:
    import src

    assert src is not None
```

- [ ] **Step 5: Install and run**

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install --upgrade pip
.venv/Scripts/python.exe -m pip install -e ".[dev]"
.venv/Scripts/python.exe -m pytest -v
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold organiser intelligence engine repo"
```

---

### Task 2: The address rail

**Files:**
- Create: `src/guards.py`, `tests/test_guards_addresses.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class GuardViolation(Exception)`
  - `EMAIL_PATTERN: re.Pattern[str]` (the single permitted email regex in the codebase)
  - `find_addresses(text: str) -> list[str]`
  - `assert_no_addresses(path: Path) -> None` raises `GuardViolation`
  - `SCAN_EXCLUDED_DIRS: frozenset[str]` = `{"data/raw", "backups"}`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_guards_addresses.py
from pathlib import Path

import pytest

from src.guards import GuardViolation, assert_no_addresses, find_addresses


def test_finds_a_plain_address() -> None:
    assert find_addresses("contact maria@example.com today") == ["maria@example.com"]


def test_finds_nothing_in_clean_text() -> None:
    assert find_addresses("Ran 9 events across 4 venues. Selling through Oztix.") == []


def test_ignores_an_at_sign_that_is_a_social_handle() -> None:
    assert find_addresses("@basementcomedy runs Thursdays") == []


def test_assert_no_addresses_passes_on_clean_file(tmp_path: Path) -> None:
    f = tmp_path / "out.csv"
    f.write_text("organiser,platform\nThe Basement,Oztix\n", encoding="utf-8")
    assert_no_addresses(f)


def test_assert_no_addresses_raises_on_dirty_file(tmp_path: Path) -> None:
    f = tmp_path / "out.csv"
    f.write_text("organiser,contact\nThe Basement,sam@basement.com.au\n", encoding="utf-8")
    with pytest.raises(GuardViolation) as exc:
        assert_no_addresses(f)
    assert "sam@basement.com.au" in str(exc.value)


def test_only_one_email_regex_exists_in_the_codebase() -> None:
    """The safety rail. A second email pattern anywhere in src/ is a build failure."""
    src_dir = Path(__file__).resolve().parents[1] / "src"
    offenders: list[str] = []
    for py in src_dir.rglob("*.py"):
        if py.name == "guards.py":
            continue
        text = py.read_text(encoding="utf-8")
        if "@" in text and any(tok in text for tok in ("re.compile", "re.findall", "re.search")):
            if "[A-Za-z0-9" in text or r"\S+@\S+" in text:
                offenders.append(str(py))
    assert offenders == [], f"email-shaped regex found outside guards.py: {offenders}"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_guards_addresses.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.guards'`

- [ ] **Step 3: Write the implementation**

```python
# src/guards.py
"""The three rails from the build brief, as hard failures.

Rail 1: no address harvesting. Rail 2: no competitor queries. Rail 3: robots honoured.

This module holds the ONLY email regex in the codebase. See
tests/test_guards_addresses.py::test_only_one_email_regex_exists_in_the_codebase.
"""

from __future__ import annotations

import re
from pathlib import Path

EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

SCAN_EXCLUDED_DIRS = frozenset({"data/raw", "backups"})


class GuardViolation(Exception):
    """Raised when a rail is breached. Always aborts the run."""


def find_addresses(text: str) -> list[str]:
    return EMAIL_PATTERN.findall(text)


def assert_no_addresses(path: Path) -> None:
    """Abort if an engine-written output contains an email address.

    Never call this on data/raw/ (a verbatim cache of public pages that may
    legitimately contain published addresses) or on the verification queue after
    a human has begun filling it. See assert_no_addresses_in_outputs.
    """
    if path.suffix.lower() in {".xlsx", ".xlsm"}:
        text = _extract_workbook_text(path)
    else:
        text = path.read_text(encoding="utf-8", errors="replace")
    hits = find_addresses(text)
    if hits:
        raise GuardViolation(
            f"Rail 1 breached: {len(hits)} email address(es) in engine output {path}: "
            f"{sorted(set(hits))[:5]}"
        )


def _extract_workbook_text(path: Path) -> str:
    from openpyxl import load_workbook

    wb = load_workbook(path, read_only=True, data_only=True)
    parts: list[str] = []
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            parts.extend(str(c) for c in row if c is not None)
    wb.close()
    return "\n".join(parts)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_guards_addresses.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/guards.py tests/test_guards_addresses.py
git commit -m "feat(guards): rail 1, no address harvesting, enforced by test"
```

---

### Task 3: The competitor blocklist and robots policy

**Files:**
- Modify: `src/guards.py`
- Create: `tests/test_guards_fetch_policy.py`

**Interfaces:**
- Consumes: `GuardViolation` from Task 2.
- Produces:
  - `BLOCKED_TICKETING_DOMAINS: frozenset[str]`
  - `is_blocked_domain(url: str) -> bool`
  - `assert_fetch_allowed(url: str) -> None`
  - `class RobotsDecision(StrEnum)` with members `ALLOWED`, `SKIPPED_ROBOTS`, `SKIPPED_BLOCKED`
  - `decide_robots(status_code: int | None, body: str | None, path: str, user_agent: str) -> RobotsDecision`
  - `looks_like_bot_challenge(body: str | None) -> bool`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_guards_fetch_policy.py
import pytest

from src.guards import (
    GuardViolation,
    RobotsDecision,
    assert_fetch_allowed,
    decide_robots,
    is_blocked_domain,
    looks_like_bot_challenge,
)

UA = "EventLinqsResearchBot/1.0 (+mailto:lawaladams9@gmail.com)"


def test_competitor_domains_are_blocked() -> None:
    assert is_blocked_domain("https://www.eventbrite.com.au/e/12345")
    assert is_blocked_domain("https://events.humanitix.com/some-gig")
    assert is_blocked_domain("https://www.oztix.com.au/outlet/event/abc")


def test_ordinary_domains_are_not_blocked() -> None:
    assert not is_blocked_domain("https://beat.com.au/gig-guide/")
    assert not is_blocked_domain("https://www.geelongcity.vic.gov.au/whats-happening/events")


def test_assert_fetch_allowed_raises_on_a_competitor() -> None:
    with pytest.raises(GuardViolation) as exc:
        assert_fetch_allowed("https://www.humanitix.com/anything")
    assert "Rail 2" in str(exc.value)


def test_robots_404_means_allowed() -> None:
    # The Geelong case. RFC 9309: an absent robots.txt means no restrictions.
    assert decide_robots(404, None, "/whats-happening/events", UA) is RobotsDecision.ALLOWED


def test_robots_410_means_allowed() -> None:
    assert decide_robots(410, None, "/events", UA) is RobotsDecision.ALLOWED


def test_robots_500_fails_closed() -> None:
    assert decide_robots(500, None, "/events", UA) is RobotsDecision.SKIPPED_BLOCKED


def test_timeout_fails_closed() -> None:
    assert decide_robots(None, None, "/events", UA) is RobotsDecision.SKIPPED_BLOCKED


def test_bot_challenge_fails_closed() -> None:
    # The Visit Victoria case: a Cloudflare challenge served in place of robots.txt.
    body = '<html><head><title>Just a moment...</title></head><body>'
    body += '<script>window._cf_chl_opt = {};</script></body></html>'
    assert decide_robots(200, body, "/events", UA) is RobotsDecision.SKIPPED_BLOCKED
    assert looks_like_bot_challenge(body)


def test_disallowed_path_is_skipped() -> None:
    body = "User-agent: *\nDisallow: /search/\nDisallow: /api/\n"
    assert decide_robots(200, body, "/search/gigs", UA) is RobotsDecision.SKIPPED_ROBOTS


def test_allowed_path_passes() -> None:
    body = "User-agent: *\nDisallow: /wp-admin/\n"
    assert decide_robots(200, body, "/gig-guide/", UA) is RobotsDecision.ALLOWED
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_guards_fetch_policy.py -v`
Expected: FAIL with `ImportError: cannot import name 'RobotsDecision'`

- [ ] **Step 3: Append the implementation to `src/guards.py`**

```python
# appended to src/guards.py

from enum import StrEnum
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

BLOCKED_TICKETING_DOMAINS = frozenset(
    {
        "eventbrite.com",
        "eventbrite.com.au",
        "humanitix.com",
        "events.humanitix.com",
        "trybooking.com",
        "oztix.com.au",
        "localtix.com.au",
        "moshtix.com.au",
        "ticketek.com.au",
        "ticketmaster.com.au",
        "megatix.com.au",
        "stickytickets.com.au",
        "tickettailor.com",
    }
)

_CHALLENGE_MARKERS = ("_cf_chl_opt", "cf-challenge", "just a moment", "enable javascript and cookies")


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def is_blocked_domain(url: str) -> bool:
    host = _host(url)
    return any(host == d or host.endswith("." + d) for d in BLOCKED_TICKETING_DOMAINS)


def assert_fetch_allowed(url: str) -> None:
    """Rail 2. A ticketing platform must never receive a request from this engine."""
    if is_blocked_domain(url):
        raise GuardViolation(
            f"Rail 2 breached: refusing to query a ticketing platform: {_host(url)}. "
            "Platform identification reads the outbound link only, it never fetches it."
        )


class RobotsDecision(StrEnum):
    ALLOWED = "ALLOWED"
    SKIPPED_ROBOTS = "SKIPPED_ROBOTS"
    SKIPPED_BLOCKED = "SKIPPED_BLOCKED"


def looks_like_bot_challenge(body: str | None) -> bool:
    if not body:
        return False
    lowered = body.lower()
    return any(marker in lowered for marker in _CHALLENGE_MARKERS)


def decide_robots(
    status_code: int | None, body: str | None, path: str, user_agent: str
) -> RobotsDecision:
    """Rail 3.

    404/410 -> allowed (RFC 9309: absent robots.txt means no restrictions).
    5xx, timeout (status_code None), or a bot challenge -> fail closed.
    """
    if status_code in (404, 410):
        return RobotsDecision.ALLOWED
    if status_code is None or status_code >= 500:
        return RobotsDecision.SKIPPED_BLOCKED
    if looks_like_bot_challenge(body):
        return RobotsDecision.SKIPPED_BLOCKED
    if status_code != 200 or body is None:
        return RobotsDecision.SKIPPED_BLOCKED

    parser = RobotFileParser()
    parser.parse(body.splitlines())
    return RobotsDecision.ALLOWED if parser.can_fetch(user_agent, path) else RobotsDecision.SKIPPED_ROBOTS
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_guards_fetch_policy.py -v`
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add src/guards.py tests/test_guards_fetch_policy.py
git commit -m "feat(guards): rails 2 and 3, competitor blocklist and fail-closed robots"
```

---

### Task 4: The fetch layer

**Files:**
- Create: `src/collect.py`, `tests/test_collect.py`

**Interfaces:**
- Consumes: `assert_fetch_allowed`, `decide_robots`, `RobotsDecision`, `GuardViolation` from Tasks 2 and 3.
- Produces:
  - `USER_AGENT: str`
  - `@dataclass(frozen=True) class CachedPage` with fields `url: str`, `body: str`, `status_code: int`, `retrieved_at: datetime`, `from_cache: bool`
  - `class Collector` with `__init__(self, cache_dir: Path, refresh: bool = False, min_interval_s: float = 2.0, session: Any | None = None)`, `fetch(self, url: str) -> CachedPage | None`, `resolve_one_hop(self, url: str) -> str`, and attribute `skipped: list[tuple[str, str]]`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_collect.py
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest

from src.collect import USER_AGENT, Collector
from src.guards import GuardViolation


class FakeResponse:
    def __init__(self, status_code: int, text: str, headers: dict[str, str] | None = None):
        self.status_code = status_code
        self.text = text
        self.headers = headers or {}


class FakeSession:
    """Records every request so tests can assert on politeness and rail 2."""

    def __init__(self, routes: dict[str, FakeResponse]):
        self.routes = routes
        self.calls: list[str] = []

    def get(self, url: str, headers: dict[str, str], timeout: int, allow_redirects: bool = True) -> Any:
        self.calls.append(url)
        assert headers["User-Agent"] == USER_AGENT
        if url not in self.routes:
            return FakeResponse(404, "not found")
        return self.routes[url]


def _session_allowing(page_url: str, body: str) -> FakeSession:
    host_root = "/".join(page_url.split("/")[:3])
    return FakeSession(
        {
            f"{host_root}/robots.txt": FakeResponse(200, "User-agent: *\nDisallow: /wp-admin/\n"),
            page_url: FakeResponse(200, body),
        }
    )


def test_fetch_returns_a_page_with_provenance(tmp_path: Path) -> None:
    url = "https://beat.com.au/gig-guide/"
    c = Collector(cache_dir=tmp_path, session=_session_allowing(url, "<html>gigs</html>"))
    page = c.fetch(url)
    assert page is not None
    assert page.body == "<html>gigs</html>"
    assert page.url == url
    assert isinstance(page.retrieved_at, datetime)
    assert page.from_cache is False


def test_second_fetch_hits_cache_not_network(tmp_path: Path) -> None:
    url = "https://beat.com.au/gig-guide/"
    session = _session_allowing(url, "<html>gigs</html>")
    c = Collector(cache_dir=tmp_path, session=session)
    c.fetch(url)
    calls_after_first = len(session.calls)
    page2 = c.fetch(url)
    assert page2 is not None
    assert page2.from_cache is True
    assert len(session.calls) == calls_after_first


def test_refresh_bypasses_cache(tmp_path: Path) -> None:
    url = "https://beat.com.au/gig-guide/"
    session = _session_allowing(url, "<html>gigs</html>")
    Collector(cache_dir=tmp_path, session=session).fetch(url)
    session2 = _session_allowing(url, "<html>fresh</html>")
    page = Collector(cache_dir=tmp_path, refresh=True, session=session2).fetch(url)
    assert page is not None
    assert page.body == "<html>fresh</html>"


def test_fetching_a_competitor_raises(tmp_path: Path) -> None:
    c = Collector(cache_dir=tmp_path, session=FakeSession({}))
    with pytest.raises(GuardViolation):
        c.fetch("https://www.humanitix.com/some-event")


def test_disallowed_path_returns_none_and_is_logged(tmp_path: Path) -> None:
    url = "https://www.gigbill.com/search/gigs"
    session = FakeSession(
        {
            "https://www.gigbill.com/robots.txt": FakeResponse(200, "User-agent: *\nDisallow: /search/\n"),
            url: FakeResponse(200, "<html>should never be fetched</html>"),
        }
    )
    c = Collector(cache_dir=tmp_path, session=session)
    assert c.fetch(url) is None
    assert c.skipped == [(url, "SKIPPED_ROBOTS")]
    assert url not in session.calls


def test_bot_challenge_on_robots_blocks_the_host(tmp_path: Path) -> None:
    url = "https://www.visitvictoria.com/events"
    session = FakeSession(
        {
            "https://www.visitvictoria.com/robots.txt": FakeResponse(
                200, "<html><title>Just a moment...</title>window._cf_chl_opt</html>"
            ),
            url: FakeResponse(200, "<html>events</html>"),
        }
    )
    c = Collector(cache_dir=tmp_path, session=session)
    assert c.fetch(url) is None
    assert c.skipped == [(url, "SKIPPED_BLOCKED")]


def test_absent_robots_means_allowed(tmp_path: Path) -> None:
    # The Geelong case.
    url = "https://www.geelongcity.vic.gov.au/whats-happening/events"
    session = FakeSession(
        {
            "https://www.geelongcity.vic.gov.au/robots.txt": FakeResponse(404, "not found"),
            url: FakeResponse(200, "<html>council events</html>"),
        }
    )
    page = Collector(cache_dir=tmp_path, session=session).fetch(url)
    assert page is not None
    assert page.body == "<html>council events</html>"


def test_robots_fetched_once_per_host_but_decided_per_path(tmp_path: Path) -> None:
    """One host can allow one path and disallow another, so caching a DECISION
    rather than the robots body would wrongly block the allowed path."""
    session = FakeSession(
        {
            "https://www.gigbill.com/robots.txt": FakeResponse(200, "User-agent: *\nDisallow: /search/\n"),
            "https://www.gigbill.com/gigs": FakeResponse(200, "<html>gigs</html>"),
            "https://www.gigbill.com/search/x": FakeResponse(200, "<html>never</html>"),
        }
    )
    c = Collector(cache_dir=tmp_path, session=session)
    assert c.fetch("https://www.gigbill.com/gigs") is not None
    assert c.fetch("https://www.gigbill.com/search/x") is None
    assert session.calls.count("https://www.gigbill.com/robots.txt") == 1


def test_resolve_one_hop_reads_location_without_following(tmp_path: Path) -> None:
    short = "https://bit.ly/abc123"
    session = FakeSession(
        {
            "https://bit.ly/robots.txt": FakeResponse(200, "User-agent: *\n"),
            short: FakeResponse(301, "", {"Location": "https://www.humanitix.com/real-event"}),
        }
    )
    c = Collector(cache_dir=tmp_path, session=session)
    resolved = c.resolve_one_hop(short)
    assert resolved == "https://www.humanitix.com/real-event"
    # Rail 2: the competitor URL is read from the header, never requested.
    assert "https://www.humanitix.com/real-event" not in session.calls
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_collect.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.collect'`

- [ ] **Step 3: Write the implementation**

```python
# src/collect.py
"""The ONLY module in this engine that touches the network.

Every other module works on cached bytes, which is what makes the pipeline
testable offline and keeps the three rails enforceable in one place.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

from src.guards import RobotsDecision, assert_fetch_allowed, decide_robots

USER_AGENT = "EventLinqsResearchBot/1.0 (+mailto:lawaladams9@gmail.com)"
TIMEOUT_S = 30


@dataclass(frozen=True)
class CachedPage:
    url: str
    body: str
    status_code: int
    retrieved_at: datetime
    from_cache: bool


class Collector:
    def __init__(
        self,
        cache_dir: Path,
        refresh: bool = False,
        min_interval_s: float = 2.0,
        session: Any | None = None,
    ) -> None:
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.refresh = refresh
        self.min_interval_s = min_interval_s
        self.session = session or requests.Session()
        self.skipped: list[tuple[str, str]] = []
        self._last_request_at: dict[str, float] = {}
        # Per host, fetched once per run: the robots body, or a host-wide block.
        self._robots_body: dict[str, str | None] = {}
        self._robots_status: dict[str, int | None] = {}

    # -- politeness -------------------------------------------------------

    def _host(self, url: str) -> str:
        return (urlparse(url).hostname or "").lower()

    def _wait_turn(self, host: str) -> None:
        last = self._last_request_at.get(host)
        if last is not None:
            elapsed = time.monotonic() - last
            if elapsed < self.min_interval_s:
                time.sleep(self.min_interval_s - elapsed)
        self._last_request_at[host] = time.monotonic()

    def _raw_get(self, url: str, allow_redirects: bool = True) -> Any:
        self._wait_turn(self._host(url))
        return self.session.get(
            url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT_S, allow_redirects=allow_redirects
        )

    # -- robots -----------------------------------------------------------

    def _robots_body_for(self, host: str, scheme: str) -> tuple[int | None, str | None]:
        try:
            resp = self._raw_get(f"{scheme}://{host}/robots.txt")
        except requests.RequestException:
            return None, None
        return resp.status_code, resp.text

    def _robots_allows(self, url: str) -> RobotsDecision:
        """Fetch robots.txt once per host, then decide per path.

        Caching the raw (status, body) rather than a decision keeps this honest:
        one host can legitimately allow one path and disallow another, so a
        cached decision would be wrong for the second path on the same host.
        """
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()

        if host not in self._robots_status:
            status, body = self._robots_body_for(host, parsed.scheme or "https")
            self._robots_status[host] = status
            self._robots_body[host] = body

        return decide_robots(
            self._robots_status[host], self._robots_body[host], parsed.path or "/", USER_AGENT
        )

    # -- cache ------------------------------------------------------------

    def _cache_paths(self, url: str) -> tuple[Path, Path]:
        host = self._host(url)
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
        host_dir = self.cache_dir / host
        host_dir.mkdir(parents=True, exist_ok=True)
        return host_dir / f"{digest}.html", host_dir / f"{digest}.json"

    def _read_cache(self, url: str) -> CachedPage | None:
        body_path, meta_path = self._cache_paths(url)
        if not (body_path.exists() and meta_path.exists()):
            return None
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        return CachedPage(
            url=meta["url"],
            body=body_path.read_text(encoding="utf-8", errors="replace"),
            status_code=meta["status_code"],
            retrieved_at=datetime.fromisoformat(meta["retrieved_at"]),
            from_cache=True,
        )

    def _write_cache(self, page: CachedPage) -> None:
        body_path, meta_path = self._cache_paths(page.url)
        body_path.write_text(page.body, encoding="utf-8")
        meta_path.write_text(
            json.dumps(
                {
                    "url": page.url,
                    "status_code": page.status_code,
                    "retrieved_at": page.retrieved_at.isoformat(),
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    # -- public API -------------------------------------------------------

    def fetch(self, url: str) -> CachedPage | None:
        """Return the page, or None if a rail skipped it. Raises on rail 2."""
        assert_fetch_allowed(url)

        if not self.refresh:
            cached = self._read_cache(url)
            if cached is not None:
                return cached

        decision = self._robots_allows(url)
        if decision is not RobotsDecision.ALLOWED:
            self.skipped.append((url, str(decision)))
            return None

        try:
            resp = self._raw_get(url)
        except requests.RequestException:
            self.skipped.append((url, "FETCH_ERROR"))
            return None

        page = CachedPage(
            url=url,
            body=resp.text,
            status_code=resp.status_code,
            retrieved_at=datetime.now(UTC),
            from_cache=False,
        )
        self._write_cache(page)
        return page

    def resolve_one_hop(self, url: str) -> str:
        """Unwrap a link shortener by READING the Location header, one hop maximum.

        Rail 2: the target is never requested, so a shortener pointing at a
        ticketing platform is resolved without a byte reaching that platform.
        """
        assert_fetch_allowed(url)
        try:
            resp = self._raw_get(url, allow_redirects=False)
        except requests.RequestException:
            return url
        location = resp.headers.get("Location")
        return location if location else url
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_collect.py -v`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/collect.py tests/test_collect.py
git commit -m "feat(collect): polite cached fetch layer, sole network module"
```

---

### Task 5: Platform detection

**Files:**
- Create: `src/platform_detect.py`, `config/platforms.yaml`, `tests/test_platform_detect.py`

**Interfaces:**
- Consumes: nothing (pure string work, no network).
- Produces:
  - `class Bucket(StrEnum)` with `COMPETITOR`, `GREENFIELD`, `SELF_HOSTED`, `UNKNOWN`
  - `@dataclass(frozen=True) class PlatformResult` with `platform: str`, `bucket: Bucket`
  - `load_platform_map(path: Path) -> dict[str, str]`
  - `detect_platform(ticket_url: str | None, platform_map: dict[str, str], source_host: str | None = None) -> PlatformResult`
  - `domain_frequency_report(urls: Iterable[str | None]) -> list[tuple[str, int]]`

- [ ] **Step 1: Write `config/platforms.yaml`**

Ordered by the measured Victorian frequency from the spec, not by the brief's seed order.

```yaml
# Ticket-link domain -> platform name.
# Order reflects the measured Victorian mix (Beat gig guide, 2026-07-22):
# Oztix 24, Humanitix 18, TryBooking 10, Moshtix 4, Eventbrite 3, Ticketek 1.
# Locked decision 17: correct this map against the domain frequency report
# before slice 1 is called done.
oztix.com.au: Oztix
humanitix.com: Humanitix
events.humanitix.com: Humanitix
trybooking.com: TryBooking
moshtix.com.au: Moshtix
eventbrite.com: Eventbrite
eventbrite.com.au: Eventbrite
ticketek.com.au: Ticketek
ticketmaster.com.au: Ticketmaster
localtix.com.au: Localtix
megatix.com.au: Megatix
stickytickets.com.au: Sticky Tickets
tickettailor.com: Ticket Tailor
```

- [ ] **Step 2: Write the failing tests**

```python
# tests/test_platform_detect.py
from pathlib import Path

from src.platform_detect import Bucket, detect_platform, domain_frequency_report, load_platform_map

MAP = load_platform_map(Path(__file__).resolve().parents[1] / "config" / "platforms.yaml")


def test_known_platform_is_a_competitor() -> None:
    r = detect_platform("https://www.oztix.com.au/outlet/event/abc", MAP)
    assert r.platform == "Oztix"
    assert r.bucket is Bucket.COMPETITOR


def test_subdomain_of_a_known_platform_resolves() -> None:
    r = detect_platform("https://tickets.oztix.com.au/outlet/event/abc", MAP)
    assert r.platform == "Oztix"


def test_no_link_is_greenfield() -> None:
    r = detect_platform(None, MAP)
    assert r.bucket is Bucket.GREENFIELD
    assert r.platform == "None"


def test_facebook_event_is_greenfield() -> None:
    assert detect_platform("https://www.facebook.com/events/123", MAP).bucket is Bucket.GREENFIELD


def test_instagram_link_is_greenfield() -> None:
    assert detect_platform("https://www.instagram.com/p/abc/", MAP).bucket is Bucket.GREENFIELD


def test_google_form_is_greenfield() -> None:
    assert detect_platform("https://docs.google.com/forms/d/e/x/viewform", MAP).bucket is Bucket.GREENFIELD


def test_own_site_is_self_hosted() -> None:
    r = detect_platform("https://2026.rising.melbourne/program/ncm-x-pseudo-stigmergy", MAP)
    assert r.bucket is Bucket.SELF_HOSTED
    assert r.platform == "rising.melbourne"


def test_link_back_to_the_listing_source_is_unknown() -> None:
    r = detect_platform("https://beat.com.au/some-gig/", MAP, source_host="beat.com.au")
    assert r.bucket is Bucket.UNKNOWN


def test_malformed_url_is_unknown() -> None:
    assert detect_platform("not a url", MAP).bucket is Bucket.UNKNOWN


def test_domain_frequency_report_counts_and_sorts() -> None:
    urls = [
        "https://www.oztix.com.au/a",
        "https://www.oztix.com.au/b",
        "https://events.humanitix.com/c",
        None,
    ]
    assert domain_frequency_report(urls) == [("oztix.com.au", 2), ("events.humanitix.com", 1)]
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_platform_detect.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.platform_detect'`

- [ ] **Step 4: Write the implementation**

```python
# src/platform_detect.py
"""Resolve an outbound ticket link to a platform. Pure string work, no network.

Rail 2: this module never fetches anything. We observe where a public listing
points; we do not read a competitor's database.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from urllib.parse import urlparse

import yaml


class Bucket(StrEnum):
    COMPETITOR = "COMPETITOR"
    GREENFIELD = "GREENFIELD"
    SELF_HOSTED = "SELF_HOSTED"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True)
class PlatformResult:
    platform: str
    bucket: Bucket


GREENFIELD_HOSTS = frozenset(
    {
        "facebook.com",
        "fb.me",
        "fb.com",
        "instagram.com",
        "docs.google.com",
        "forms.gle",
        "linktr.ee",
    }
)


def load_platform_map(path: Path) -> dict[str, str]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return {str(k).lower(): str(v) for k, v in data.items()}


def _host(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.hostname:
        return ""
    return parsed.hostname.lower().removeprefix("www.")


def _matches(host: str, domain: str) -> bool:
    return host == domain or host.endswith("." + domain)


def detect_platform(
    ticket_url: str | None, platform_map: dict[str, str], source_host: str | None = None
) -> PlatformResult:
    if not ticket_url:
        return PlatformResult("None", Bucket.GREENFIELD)

    host = _host(ticket_url)
    if not host:
        return PlatformResult("Unknown", Bucket.UNKNOWN)

    for domain, name in platform_map.items():
        if _matches(host, domain):
            return PlatformResult(name, Bucket.COMPETITOR)

    for domain in GREENFIELD_HOSTS:
        if _matches(host, domain):
            return PlatformResult("Social or form", Bucket.GREENFIELD)

    if source_host and _matches(host, source_host.lower().removeprefix("www.")):
        # The link points back at the listing site, so it tells us nothing.
        return PlatformResult("Unknown", Bucket.UNKNOWN)

    return PlatformResult(host, Bucket.SELF_HOSTED)


def domain_frequency_report(urls: Iterable[str | None]) -> list[tuple[str, int]]:
    """Locked decision 17: the real market tells us what platforms.yaml should be."""
    counter: Counter[str] = Counter()
    for url in urls:
        if not url:
            continue
        host = _host(url)
        if host:
            counter[host] += 1
    return sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_platform_detect.py -v`
Expected: 10 passed.

- [ ] **Step 6: Commit**

```bash
git add src/platform_detect.py config/platforms.yaml tests/test_platform_detect.py
git commit -m "feat(platform): domain to platform and bucket, measured VIC ordering"
```

---

### Task 6: Shared models with provenance validation

**Files:**
- Create: `src/models.py`, `tests/test_models.py`

**Interfaces:**
- Consumes: `Bucket` from Task 5.
- Produces:
  - `@dataclass(frozen=True) class EventRecord` with fields: `event_id: str`, `title: str`, `date: date`, `end_date: date | None`, `venue_name: str | None`, `suburb: str | None`, `region: str`, `presenter_raw: str | None`, `artists: tuple[str, ...]`, `ticket_url: str | None`, `platform: str`, `platform_bucket: str`, `price_min: float | None`, `on_sale: bool`, `is_sold_out: bool | None`, `source_url: str`, `retrieved_at: datetime`
  - `make_event_id(title: str, event_date: date, venue: str | None) -> str`
  - `@dataclass class OrganiserRecord` (mutable; `resolve` builds it incrementally) with the fields listed in the implementation below
  - `class ProvenanceError(ValueError)`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_models.py
from datetime import UTC, date, datetime

import pytest

from src.models import EventRecord, ProvenanceError, make_event_id


def _event(**overrides: object) -> EventRecord:
    base: dict[str, object] = dict(
        event_id="abc123",
        title="NCM X PSEUDO: Stigmergy",
        date=date(2026, 6, 4),
        end_date=date(2026, 8, 9),
        venue_name="Colour",
        suburb="Preston",
        region="Melbourne metro",
        presenter_raw=None,
        artists=(),
        ticket_url="https://2026.rising.melbourne/program/x",
        platform="rising.melbourne",
        platform_bucket="SELF_HOSTED",
        price_min=18.0,
        on_sale=True,
        is_sold_out=None,
        source_url="https://beat.com.au/gig-guide/",
        retrieved_at=datetime.now(UTC),
    )
    base.update(overrides)
    return EventRecord(**base)  # type: ignore[arg-type]


def test_a_valid_event_constructs() -> None:
    assert _event().title.startswith("NCM")


def test_missing_source_url_is_refused() -> None:
    with pytest.raises(ProvenanceError):
        _event(source_url="")


def test_missing_retrieved_at_is_refused() -> None:
    with pytest.raises(ProvenanceError):
        _event(retrieved_at=None)


def test_event_id_is_stable_for_the_same_inputs() -> None:
    a = make_event_id("Gig Night", date(2026, 6, 4), "The Barwon Club")
    b = make_event_id("Gig Night", date(2026, 6, 4), "The Barwon Club")
    assert a == b


def test_event_id_differs_across_venues() -> None:
    a = make_event_id("Gig Night", date(2026, 6, 4), "The Barwon Club")
    b = make_event_id("Gig Night", date(2026, 6, 4), "The Corner Hotel")
    assert a != b
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.models'`

- [ ] **Step 3: Write the implementation**

```python
# src/models.py
"""Shared record types.

The hard invariant: source_url and retrieved_at are refused at construction if
absent, so an unauditable row cannot physically reach the output.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import date, datetime


class ProvenanceError(ValueError):
    """Raised when a record lacks a source URL or a retrieval timestamp."""


def make_event_id(title: str, event_date: date, venue: str | None) -> str:
    raw = f"{title.strip().lower()}|{event_date.isoformat()}|{(venue or '').strip().lower()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


@dataclass(frozen=True)
class EventRecord:
    event_id: str
    title: str
    date: date
    end_date: date | None
    venue_name: str | None
    suburb: str | None
    region: str
    presenter_raw: str | None
    artists: tuple[str, ...]
    ticket_url: str | None
    platform: str
    platform_bucket: str
    price_min: float | None
    on_sale: bool
    is_sold_out: bool | None
    source_url: str
    retrieved_at: datetime

    def __post_init__(self) -> None:
        if not self.source_url:
            raise ProvenanceError(f"event {self.title!r} has no source_url")
        if not isinstance(self.retrieved_at, datetime):
            raise ProvenanceError(f"event {self.title!r} has no retrieved_at")


@dataclass
class OrganiserRecord:
    organiser_id: str
    canonical_name: str
    aliases: set[str] = field(default_factory=set)
    is_venue_operator: bool | None = None
    presenter_inferred: bool = False
    region: str = ""
    suburbs: set[str] = field(default_factory=set)
    niches: set[str] = field(default_factory=set)
    events_90d: int = 0
    events_365d: int = 0
    last_event_date: date | None = None
    next_event_date: date | None = None
    has_live_onsale: bool = False
    platforms_used: set[str] = field(default_factory=set)
    platform_counts: dict[str, int] = field(default_factory=dict)
    bucket_counts: dict[str, int] = field(default_factory=dict)
    primary_platform: str = "Unknown"
    primary_bucket: str = "UNKNOWN"
    typical_venue_size: str = "unknown"
    web: str | None = None
    instagram: str | None = None
    instagram_followers: int | None = None
    facebook_followers: int | None = None
    phone: str | None = None
    phone_source: str | None = None
    mailing_list_signal: bool = False
    engagement_signal: str | None = None
    sellout_count_90d: int = 0
    sellout_rate: float | None = None
    audience_source: str = "unknown"
    audience_checked_at: datetime | None = None
    venues_played: set[str] = field(default_factory=set)
    latest_activity: str = ""
    status_lifecycle: str = "active"
    score: int = 0
    tier: str = "D"
    score_breakdown: dict[str, int] = field(default_factory=dict)
    evidence: list[dict[str, str]] = field(default_factory=list)
    needs_verification: list[str] = field(default_factory=list)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_models.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/models.py tests/test_models.py
git commit -m "feat(models): event and organiser records with provenance refusal"
```

---

### Task 7: The Beat parser

**Files:**
- Create: `src/parse.py`, `fixtures/beat_gig_guide.html`, `tests/test_parse_beat.py`
- Create: `config/geography.yaml`, `config/niches.yaml`

**Interfaces:**
- Consumes: `EventRecord`, `make_event_id` (Task 6); `detect_platform`, `load_platform_map` (Task 5); `CachedPage` (Task 4).
- Produces:
  - `EMAIL_FIELD_DENYLIST: frozenset[str]`
  - `parse_beat_guide(page: CachedPage, platform_map: dict[str, str], geography: dict[str, str]) -> list[EventRecord]`
  - `parse_beat_date(text: str) -> date | None`
  - `parse_price_min(text: str) -> float | None`
  - `classify_niches(title: str, genres: list[str], categories: list[str], niche_config: dict) -> set[str]`
  - `resolve_region(suburb: str | None, geography: dict[str, str]) -> str`

- [ ] **Step 1: Capture the golden fixture**

```bash
cd "C:/Users/61416/OneDrive/Desktop/EventLinqs/eventlinqs-organiser-engine"
curl -sS -A "EventLinqsResearchBot/1.0 (+mailto:lawaladams9@gmail.com)" \
  --max-time 30 -o fixtures/beat_gig_guide.html "https://beat.com.au/gig-guide/"
python -c "print(open('fixtures/beat_gig_guide.html',encoding='utf-8',errors='replace').read().count('gig-card'))"
```

Expected: a count of at least 200. If it is 0, the page structure has changed and the
selectors below need re-deriving before continuing.

- [ ] **Step 2: Write `config/geography.yaml`**

```yaml
# Victorian suburb or locality -> region. Corridor first, per the scoring law.
corridor:
  - Geelong
  - Geelong West
  - South Geelong
  - North Geelong
  - Newtown
  - Belmont
  - Ocean Grove
  - Barwon Heads
  - Queenscliff
  - Portarlington
  - Drysdale
  - Torquay
  - Jan Juc
  - Anglesea
  - Lorne
  - Winchelsea
melbourne_metro:
  - Melbourne
  - Fitzroy
  - Collingwood
  - Richmond
  - Brunswick
  - Northcote
  - Preston
  - Thornbury
  - St Kilda
  - Prahran
  - Footscray
  - Carlton
  - Abbotsford
  - Windsor
  - South Yarra
  - Coburg
  - Yarraville
  - Williamstown
regional_victoria:
  - Ballarat
  - Bendigo
  - Shepparton
  - Warrnambool
  - Mildura
  - Wodonga
  - Traralgon
  - Castlemaine
  - Daylesford
  - Bright
```

- [ ] **Step 3: Write `config/niches.yaml`**

```yaml
club_night:
  - dj
  - house
  - techno
  - warehouse
  - rave
  - club
  - resident
  - b2b
  - selectors
  - electronic
  - disco
  - drum and bass
gig:
  - band
  - live
  - tour
  - album launch
  - ep launch
  - single launch
  - support
  - presents
  - acoustic
  - rock
  - indie
  - punk
  - metal
  - folk
  - jazz
  - blues
comedy:
  - comedy
  - comic
  - stand up
  - stand-up
  - open mic
  - improv
  - roast
  - gala
  - showcase
```

- [ ] **Step 4: Write the failing tests**

```python
# tests/test_parse_beat.py
from datetime import UTC, date, datetime
from pathlib import Path

import yaml

from src.collect import CachedPage
from src.parse import (
    EMAIL_FIELD_DENYLIST,
    classify_niches,
    parse_beat_date,
    parse_beat_guide,
    parse_price_min,
)
from src.platform_detect import load_platform_map

ROOT = Path(__file__).resolve().parents[1]
MAP = load_platform_map(ROOT / "config" / "platforms.yaml")
GEO = yaml.safe_load((ROOT / "config" / "geography.yaml").read_text(encoding="utf-8"))
NICHES = yaml.safe_load((ROOT / "config" / "niches.yaml").read_text(encoding="utf-8"))


def _fixture_page() -> CachedPage:
    return CachedPage(
        url="https://beat.com.au/gig-guide/",
        body=(ROOT / "fixtures" / "beat_gig_guide.html").read_text(encoding="utf-8", errors="replace"),
        status_code=200,
        retrieved_at=datetime.now(UTC),
        from_cache=True,
    )


def test_parses_beat_date() -> None:
    assert parse_beat_date("THU 04 JUN 2026") == date(2026, 6, 4)
    assert parse_beat_date(" - SUN 09 AUG 2026") == date(2026, 8, 9)
    assert parse_beat_date("nonsense") is None


def test_parses_price_min() -> None:
    assert parse_price_min("$18.00 - 24.00") == 18.0
    assert parse_price_min("$25") == 25.0
    assert parse_price_min("Free") is None


def test_classifies_niches_from_genre_badges() -> None:
    assert "club_night" in classify_niches("Warehouse party", ["Electronic"], ["Music"], NICHES)
    assert "comedy" in classify_niches("Open Mic Comedy", [], ["Comedy"], NICHES)


def test_parses_many_events_from_the_fixture() -> None:
    events = parse_beat_guide(_fixture_page(), MAP, GEO)
    assert len(events) >= 200


def test_every_event_carries_provenance() -> None:
    for e in parse_beat_guide(_fixture_page(), MAP, GEO):
        assert e.source_url == "https://beat.com.au/gig-guide/"
        assert e.retrieved_at is not None


def test_beat_events_never_claim_a_presenter() -> None:
    """Verified 2026-07-22: Beat names no presenter anywhere. Never invent one."""
    assert all(e.presenter_raw is None for e in parse_beat_guide(_fixture_page(), MAP, GEO))


def test_most_events_resolve_a_platform_bucket() -> None:
    events = parse_beat_guide(_fixture_page(), MAP, GEO)
    with_link = [e for e in events if e.ticket_url]
    unknown = [e for e in with_link if e.platform_bucket == "UNKNOWN"]
    # Acceptance gate 2: at most 5 percent UNKNOWN among events carrying a link.
    assert len(unknown) / max(len(with_link), 1) <= 0.05


def test_sold_out_is_none_because_beat_does_not_mark_it() -> None:
    """Verified 2026-07-22: zero sold-out markers on Beat. Locked decision 9."""
    assert all(e.is_sold_out is None for e in parse_beat_guide(_fixture_page(), MAP, GEO))


def test_email_field_denylist_is_populated() -> None:
    assert "field-event-contact-email" in EMAIL_FIELD_DENYLIST
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_parse_beat.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.parse'`

- [ ] **Step 6: Write the implementation**

```python
# src/parse.py
"""Cached bytes to EventRecord. One parser per source. No network access.

Rail 1: EMAIL_FIELD_DENYLIST names the published contact-email fields this
parser must never read. Extraction is opt-in by selector, so an address cannot
enter the dataset even where a source publishes one.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from bs4 import BeautifulSoup, Tag

from src.collect import CachedPage
from src.models import EventRecord, make_event_id
from src.platform_detect import detect_platform

EMAIL_FIELD_DENYLIST = frozenset(
    {
        "field-event-contact-email",
        "field--name-field-event-contact-email",
        "contact-email",
        "email",
    }
)

_DATE_RE = re.compile(r"([A-Za-z]{3})\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})")
_PRICE_RE = re.compile(r"(\d+(?:\.\d{1,2})?)")
_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def parse_beat_date(text: str) -> date | None:
    """Beat prints dates as 'THU 04 JUN 2026'."""
    match = _DATE_RE.search(text or "")
    if not match:
        return None
    _, day, month, year = match.groups()
    month_num = _MONTHS.get(month.lower())
    if month_num is None:
        return None
    try:
        return date(int(year), month_num, int(day))
    except ValueError:
        return None


def parse_price_min(text: str) -> float | None:
    match = _PRICE_RE.search(text or "")
    return float(match.group(1)) if match else None


def resolve_region(suburb: str | None, geography: dict[str, list[str]]) -> str:
    if not suburb:
        return "Unknown"
    needle = suburb.strip().lower()
    labels = {
        "corridor": "Corridor",
        "melbourne_metro": "Melbourne metro",
        "regional_victoria": "Regional Victoria",
    }
    for key, label in labels.items():
        for place in geography.get(key, []):
            if place.lower() in needle:
                return label
    return "Unknown"


def classify_niches(
    title: str, genres: list[str], categories: list[str], niche_config: dict[str, list[str]]
) -> set[str]:
    haystack = " ".join([title, *genres, *categories]).lower()
    found = {niche for niche, words in niche_config.items() if any(w in haystack for w in words)}
    return found or {"other"}


def _text(node: Tag | None) -> str:
    return node.get_text(strip=True) if node else ""


def _badges(card: Tag, selector: str) -> list[str]:
    holder = card.select_one(selector)
    return [b.get_text(strip=True) for b in holder.select(".badge")] if holder else []


def _split_venue_suburb(location: str) -> tuple[str | None, str | None]:
    if not location:
        return None, None
    parts = [p.strip() for p in location.split(",")]
    if len(parts) == 1:
        return parts[0] or None, None
    return parts[0] or None, parts[-1] or None


def parse_beat_guide(
    page: CachedPage, platform_map: dict[str, str], geography: dict[str, Any]
) -> list[EventRecord]:
    soup = BeautifulSoup(page.body, "lxml")
    events: list[EventRecord] = []

    for card in soup.select(".gig-card"):
        title = _text(card.select_one(".gig-title"))
        start = parse_beat_date(_text(card.select_one(".gig-date")))
        if not title or start is None:
            continue

        end = parse_beat_date(_text(card.select_one(".gig-end-date")))
        venue, suburb = _split_venue_suburb(_text(card.select_one(".gig-location")))

        ticket_anchor = card.select_one(".gig-ticket a[href]")
        ticket_url = str(ticket_anchor["href"]) if ticket_anchor else None

        result = detect_platform(ticket_url, platform_map, source_host="beat.com.au")

        events.append(
            EventRecord(
                event_id=make_event_id(title, start, venue),
                title=title,
                date=start,
                end_date=end,
                venue_name=venue,
                suburb=suburb,
                region=resolve_region(suburb, geography),
                # Verified 2026-07-22: Beat names no presenter, on the card or the
                # detail page. Never infer one here; resolve.py venue-anchors instead.
                presenter_raw=None,
                artists=(),
                ticket_url=ticket_url,
                platform=result.platform,
                platform_bucket=str(result.bucket),
                price_min=parse_price_min(_text(card.select_one(".gig-price"))),
                on_sale=ticket_url is not None,
                # Verified 2026-07-22: Beat carries no sold-out marker. Locked decision 9.
                is_sold_out=None,
                source_url=page.url,
                retrieved_at=page.retrieved_at,
            )
        )

    return events
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_parse_beat.py -v`
Expected: 9 passed.

If `test_most_events_resolve_a_platform_bucket` fails, do not loosen the threshold. Run the
domain frequency report (Task 12) and add the missing real domains to `config/platforms.yaml`.
That is locked decision 17 working as designed.

- [ ] **Step 8: Commit**

```bash
git add src/parse.py config/geography.yaml config/niches.yaml fixtures/beat_gig_guide.html tests/test_parse_beat.py
git commit -m "feat(parse): Beat gig guide parser with golden fixture"
```

---

### Task 8: The Geelong council parser

**Files:**
- Modify: `src/parse.py`
- Create: `fixtures/geelong_events_index.html`, `fixtures/geelong_event_detail.html`, `tests/test_parse_geelong.py`

**Interfaces:**
- Consumes: everything from Task 7.
- Produces:
  - `geelong_event_links(page: CachedPage) -> list[str]`
  - `parse_geelong_detail(page: CachedPage, platform_map: dict[str, str], geography: dict[str, Any]) -> EventRecord | None`
  - `extract_geelong_phone(page: CachedPage) -> str | None`

- [ ] **Step 1: Capture the golden fixtures**

```bash
cd "C:/Users/61416/OneDrive/Desktop/EventLinqs/eventlinqs-organiser-engine"
UA="EventLinqsResearchBot/1.0 (+mailto:lawaladams9@gmail.com)"
curl -sS -A "$UA" --max-time 30 -o fixtures/geelong_events_index.html \
  "https://www.geelongcity.vic.gov.au/whats-happening/events"
sleep 2
curl -sS -A "$UA" --max-time 30 -o fixtures/geelong_event_detail.html \
  "https://www.geelongcity.vic.gov.au/whats-happening/events/geelong-folk-festival-2026"
```

If the detail URL 404s (events expire), open the index fixture, pick any
`/whats-happening/events/<slug>` link that is not `list-your-event` or
`event-planning-and-support`, and capture that instead.

- [ ] **Step 2: Write the failing tests**

```python
# tests/test_parse_geelong.py
from datetime import UTC, datetime
from pathlib import Path

import yaml

from src.collect import CachedPage
from src.guards import find_addresses
from src.parse import (
    extract_geelong_phone,
    geelong_event_links,
    parse_geelong_detail,
)
from src.platform_detect import load_platform_map

ROOT = Path(__file__).resolve().parents[1]
MAP = load_platform_map(ROOT / "config" / "platforms.yaml")
GEO = yaml.safe_load((ROOT / "config" / "geography.yaml").read_text(encoding="utf-8"))


def _page(name: str, url: str) -> CachedPage:
    return CachedPage(
        url=url,
        body=(ROOT / "fixtures" / name).read_text(encoding="utf-8", errors="replace"),
        status_code=200,
        retrieved_at=datetime.now(UTC),
        from_cache=True,
    )


def _index() -> CachedPage:
    return _page("geelong_events_index.html", "https://www.geelongcity.vic.gov.au/whats-happening/events")


def _detail() -> CachedPage:
    return _page(
        "geelong_event_detail.html",
        "https://www.geelongcity.vic.gov.au/whats-happening/events/geelong-folk-festival-2026",
    )


def test_index_yields_event_detail_links() -> None:
    links = geelong_event_links(_index())
    assert len(links) >= 3
    assert all("/whats-happening/events/" in link for link in links)


def test_index_excludes_the_admin_pages() -> None:
    links = geelong_event_links(_index())
    assert not any("list-your-event" in link for link in links)
    assert not any("event-planning-and-support" in link for link in links)


def test_detail_yields_an_event_with_a_named_presenter() -> None:
    event = parse_geelong_detail(_detail(), MAP, GEO)
    assert event is not None
    # This is the whole reason Geelong is in slice 1: Beat cannot do this.
    assert event.presenter_raw
    assert event.source_url.startswith("https://www.geelongcity.vic.gov.au/")


def test_detail_never_extracts_an_email_even_though_the_page_publishes_one(tmp_path: Path) -> None:
    """Rail 1, the sharpest case in slice 1.

    The council page exposes field-event-contact-email. The parser must not read it.
    """
    event = parse_geelong_detail(_detail(), MAP, GEO)
    assert event is not None
    serialised = repr(event)
    assert find_addresses(serialised) == []


def test_phone_is_extracted_from_the_published_field() -> None:
    """Deterministic: the live fixture may or may not carry a phone, so assert
    extraction against known markup rather than writing a test that passes
    whatever the fixture happens to contain."""
    html = (
        '<html><body>'
        '<div class="field field--name-field-event-contact-phone field__item">03 5272 5272</div>'
        '</body></html>'
    )
    page = CachedPage(
        url="https://www.geelongcity.vic.gov.au/whats-happening/events/x",
        body=html,
        status_code=200,
        retrieved_at=datetime.now(UTC),
        from_cache=True,
    )
    assert extract_geelong_phone(page) == "03 5272 5272"


def test_phone_is_none_when_no_phone_is_published() -> None:
    page = CachedPage(
        url="https://www.geelongcity.vic.gov.au/whats-happening/events/y",
        body="<html><body><h1>An event</h1></body></html>",
        status_code=200,
        retrieved_at=datetime.now(UTC),
        from_cache=True,
    )
    assert extract_geelong_phone(page) is None
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_parse_geelong.py -v`
Expected: FAIL with `ImportError: cannot import name 'geelong_event_links'`

- [ ] **Step 4: Append the implementation to `src/parse.py`**

```python
# appended to src/parse.py

from urllib.parse import urljoin

GEELONG_NON_EVENT_SLUGS = frozenset({"list-your-event", "event-planning-and-support"})
_GEELONG_PHONE_SELECTOR = ".field--name-field-event-contact-phone"
_GEELONG_ORG_SELECTOR = ".field--name-field-event-associated-org"


def geelong_event_links(page: CachedPage) -> list[str]:
    soup = BeautifulSoup(page.body, "lxml")
    links: list[str] = []
    seen: set[str] = set()
    for anchor in soup.select('a[href*="/whats-happening/events/"]'):
        href = str(anchor.get("href", ""))
        slug = href.rstrip("/").rsplit("/", 1)[-1]
        if not slug or slug in GEELONG_NON_EVENT_SLUGS:
            continue
        absolute = urljoin(page.url, href)
        if absolute not in seen:
            seen.add(absolute)
            links.append(absolute)
    return links


def extract_geelong_phone(page: CachedPage) -> str | None:
    """Published enquiry phone only.

    Lawful to collect (locked decision 11), but note it moves outreach under the
    Do Not Call Register Act. The engine never dials.
    """
    soup = BeautifulSoup(page.body, "lxml")
    return _text(soup.select_one(_GEELONG_PHONE_SELECTOR)) or None


def _first_outbound_ticket_link(soup: BeautifulSoup, source_host: str) -> str | None:
    for anchor in soup.select("a[href^=http]"):
        href = str(anchor.get("href", ""))
        if source_host in href or "google.com/maps" in href:
            continue
        return href
    return None


def parse_geelong_detail(
    page: CachedPage, platform_map: dict[str, str], geography: dict[str, Any]
) -> EventRecord | None:
    soup = BeautifulSoup(page.body, "lxml")

    # RAIL 1: the council publishes field-event-contact-email on this page.
    # It is deliberately absent from every selector below. Do not add it.
    # See EMAIL_FIELD_DENYLIST and tests/test_parse_geelong.py.

    title = _text(soup.select_one("h1"))
    start = parse_beat_date(_text(soup.select_one(".event-date-header")))
    if not title or start is None:
        return None

    presenter = _text(soup.select_one(_GEELONG_ORG_SELECTOR)) or None
    ticket_url = _first_outbound_ticket_link(soup, "geelongcity.vic.gov.au")
    result = detect_platform(ticket_url, platform_map, source_host="geelongcity.vic.gov.au")

    return EventRecord(
        event_id=make_event_id(title, start, "Greater Geelong"),
        title=title,
        date=start,
        end_date=None,
        venue_name=None,
        suburb="Geelong",
        region=resolve_region("Geelong", geography),
        presenter_raw=presenter,
        artists=(),
        ticket_url=ticket_url,
        platform=result.platform,
        platform_bucket=str(result.bucket),
        price_min=None,
        on_sale=ticket_url is not None,
        is_sold_out=None,
        source_url=page.url,
        retrieved_at=page.retrieved_at,
    )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_parse_geelong.py -v`
Expected: 6 passed.

If `test_detail_yields_an_event_with_a_named_presenter` fails because the chosen event has
no associated org, capture a different detail fixture. Do not weaken the assertion: a
Geelong event without a presenter is the exception, and the identity path is why this
source is in slice 1.

- [ ] **Step 6: Commit**

```bash
git add src/parse.py fixtures/geelong_events_index.html fixtures/geelong_event_detail.html tests/test_parse_geelong.py
git commit -m "feat(parse): Geelong council parser, the identity source, email field refused"
```

---

### Task 9: Entity resolution

**Files:**
- Create: `src/resolve.py`, `tests/test_resolve.py`

**Interfaces:**
- Consumes: `EventRecord`, `OrganiserRecord` (Task 6).
- Produces:
  - `normalise_name(name: str) -> str`
  - `resolve_organisers(events: Sequence[EventRecord], today: date) -> tuple[list[OrganiserRecord], list[dict[str, str]]]` returning `(organisers, suggested_merges)`
  - `AUTO_MERGE_THRESHOLD = 92`, `QUEUE_MERGE_THRESHOLD = 82`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_resolve.py
from datetime import UTC, date, datetime

from src.models import EventRecord, make_event_id
from src.resolve import normalise_name, resolve_organisers

TODAY = date(2026, 7, 22)


def _event(title: str, presenter: str | None, venue: str | None, when: date, platform: str = "Oztix") -> EventRecord:
    return EventRecord(
        event_id=make_event_id(title, when, venue),
        title=title,
        date=when,
        end_date=None,
        venue_name=venue,
        suburb="Geelong",
        region="Corridor",
        presenter_raw=presenter,
        artists=(),
        ticket_url="https://www.oztix.com.au/x",
        platform=platform,
        platform_bucket="COMPETITOR",
        price_min=20.0,
        on_sale=True,
        is_sold_out=None,
        source_url="https://beat.com.au/gig-guide/",
        retrieved_at=datetime.now(UTC),
    )


def test_normalise_strips_suffixes_and_punctuation() -> None:
    assert normalise_name("SAM'S COMEDY presents") == "sams comedy"
    assert normalise_name("Sams Comedy Productions") == "sams comedy"


def test_variant_spellings_merge_to_one_organiser() -> None:
    events = [
        _event("Night A", "Sam's Comedy", "The Basement", date(2026, 7, 1)),
        _event("Night B", "Sams Comedy Night", "The Barwon Club", date(2026, 7, 8)),
        _event("Night C", "SAM'S COMEDY presents", "The Basement", date(2026, 7, 15)),
    ]
    organisers, _ = resolve_organisers(events, TODAY)
    named = [o for o in organisers if not o.presenter_inferred]
    assert len(named) == 1
    assert named[0].events_90d == 3
    assert len(named[0].aliases) >= 2


def test_a_borderline_pair_is_queued_not_merged() -> None:
    events = [
        _event("Night A", "Barwon Sound", "Venue A", date(2026, 7, 1)),
        _event("Night B", "Barwon Sounds Collective", "Venue B", date(2026, 7, 8)),
    ]
    organisers, merges = resolve_organisers(events, TODAY)
    named = [o for o in organisers if not o.presenter_inferred]
    assert len(named) == 2
    assert len(merges) >= 1
    assert 82 <= float(merges[0]["score"]) <= 92


def test_beat_events_without_a_presenter_become_venue_anchored_candidates() -> None:
    events = [
        _event("Gig 1", None, "The Barwon Club", date(2026, 7, 2)),
        _event("Gig 2", None, "The Barwon Club", date(2026, 7, 9)),
    ]
    organisers, _ = resolve_organisers(events, TODAY)
    assert len(organisers) == 1
    org = organisers[0]
    assert org.presenter_inferred is True
    assert org.is_venue_operator is None
    assert org.canonical_name == "The Barwon Club"
    assert "who_books_this_room" in org.needs_verification


def test_a_named_presenter_absorbs_a_matching_venue_candidate() -> None:
    events = [
        _event("Gig 1", None, "The Barwon Club", date(2026, 7, 2)),
        _event("Gig 2", "The Barwon Club", "The Barwon Club", date(2026, 7, 9)),
    ]
    organisers, _ = resolve_organisers(events, TODAY)
    assert len(organisers) == 1
    assert organisers[0].presenter_inferred is False


def test_activity_windows_and_recency() -> None:
    events = [
        _event("Recent", "Promoter X", "V", date(2026, 7, 20)),
        _event("Older", "Promoter X", "V", date(2026, 1, 5)),
    ]
    organisers, _ = resolve_organisers(events, TODAY)
    org = organisers[0]
    assert org.events_90d == 1
    assert org.events_365d == 2
    assert org.last_event_date == date(2026, 7, 20)


def test_future_event_sets_next_event_date_and_live_onsale() -> None:
    events = [_event("Future", "Promoter Y", "V", date(2026, 8, 30))]
    org = resolve_organisers(events, TODAY)[0][0]
    assert org.next_event_date == date(2026, 8, 30)
    assert org.has_live_onsale is True


def test_primary_platform_and_bucket_are_the_most_frequent() -> None:
    """score.py reads primary_bucket for switchability.

    If resolve leaves it at the default, the entire switchability component
    silently collapses to a constant and no test on score.py alone would notice.
    """
    events = [
        _event("A", "Promoter Z", "V", date(2026, 7, 1), platform="Oztix"),
        _event("B", "Promoter Z", "V", date(2026, 7, 8), platform="Oztix"),
        _event("C", "Promoter Z", "V", date(2026, 7, 9), platform="Humanitix"),
    ]
    org = resolve_organisers(events, TODAY)[0][0]
    assert org.primary_platform == "Oztix"
    assert org.primary_bucket == "COMPETITOR"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_resolve.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.resolve'`

- [ ] **Step 3: Write the implementation**

```python
# src/resolve.py
"""Events to organisers.

Beat names no presenter, so its events roll up to venue-anchored candidates
flagged presenter_inferred=True with a queue row. Nothing is asserted that was
not read. A named presenter that matches a venue candidate absorbs it.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Sequence
from datetime import date, timedelta

from rapidfuzz import fuzz

from src.models import EventRecord, OrganiserRecord

AUTO_MERGE_THRESHOLD = 92
QUEUE_MERGE_THRESHOLD = 82

_SUFFIXES = (" presents", " productions", " events", " touring", " presents.", " pty ltd")
_PUNCT = re.compile(r"[^\w\s]")
_SPACES = re.compile(r"\s+")


def normalise_name(name: str) -> str:
    text = _PUNCT.sub("", (name or "").lower())
    text = _SPACES.sub(" ", text).strip()
    changed = True
    while changed:
        changed = False
        for suffix in _SUFFIXES:
            clean = _PUNCT.sub("", suffix).strip()
            if clean and text.endswith(" " + clean):
                text = text[: -(len(clean) + 1)].strip()
                changed = True
    return text


def _organiser_id(canonical: str) -> str:
    return hashlib.sha256(normalise_name(canonical).encode("utf-8")).hexdigest()[:16]


def _new_organiser(display_name: str, inferred: bool) -> OrganiserRecord:
    org = OrganiserRecord(organiser_id=_organiser_id(display_name), canonical_name=display_name)
    org.presenter_inferred = inferred
    if inferred:
        org.needs_verification.append("who_books_this_room")
    return org


def _absorb(org: OrganiserRecord, event: EventRecord, today: date) -> None:
    org.aliases.add(event.presenter_raw or event.venue_name or "")
    org.aliases.discard("")
    if event.venue_name:
        org.venues_played.add(event.venue_name)
    if event.suburb:
        org.suburbs.add(event.suburb)
    if event.region and event.region != "Unknown":
        org.region = event.region
    org.platforms_used.add(event.platform)
    org.platform_counts[event.platform] = org.platform_counts.get(event.platform, 0) + 1
    org.bucket_counts[event.platform_bucket] = org.bucket_counts.get(event.platform_bucket, 0) + 1

    if event.date >= today - timedelta(days=90):
        org.events_90d += 1
    if event.date >= today - timedelta(days=365):
        org.events_365d += 1
    if event.date <= today and (org.last_event_date is None or event.date > org.last_event_date):
        org.last_event_date = event.date
    if event.date > today and (org.next_event_date is None or event.date < org.next_event_date):
        org.next_event_date = event.date
        if event.on_sale:
            org.has_live_onsale = True
    if event.is_sold_out:
        org.sellout_count_90d += 1

    org.evidence.append(
        {
            "claim": f"event:{event.title}",
            "source_url": event.source_url,
            "retrieved_at": event.retrieved_at.isoformat(),
        }
    )


def _finalise(org: OrganiserRecord) -> None:
    if org.platform_counts:
        org.primary_platform = max(org.platform_counts.items(), key=lambda kv: (kv[1], kv[0]))[0]
    if org.bucket_counts:
        # score.py reads primary_bucket for switchability. Without this the whole
        # switchability component silently collapses to the default.
        org.primary_bucket = max(org.bucket_counts.items(), key=lambda kv: (kv[1], kv[0]))[0]
    total = len(org.evidence)
    if total:
        org.sellout_rate = org.sellout_count_90d / total if org.sellout_count_90d else None
    if org.presenter_inferred and org.canonical_name in org.venues_played:
        org.is_venue_operator = None


def resolve_organisers(
    events: Sequence[EventRecord], today: date
) -> tuple[list[OrganiserRecord], list[dict[str, str]]]:
    by_key: dict[str, OrganiserRecord] = {}
    suggested_merges: list[dict[str, str]] = []

    # Named presenters first, so a venue candidate can be absorbed rather than
    # created alongside a real name for the same entity.
    ordered = sorted(events, key=lambda e: e.presenter_raw is None)

    for event in ordered:
        inferred = event.presenter_raw is None
        display = event.presenter_raw or event.venue_name
        if not display:
            continue

        key = normalise_name(display)
        if not key:
            continue

        if key in by_key:
            target = by_key[key]
        else:
            target = None
            for existing_key, existing in by_key.items():
                score = fuzz.token_set_ratio(key, existing_key)
                if score > AUTO_MERGE_THRESHOLD:
                    target = existing
                    break
                if QUEUE_MERGE_THRESHOLD <= score <= AUTO_MERGE_THRESHOLD:
                    suggested_merges.append(
                        {
                            "name_a": display,
                            "name_b": existing.canonical_name,
                            "score": f"{score:.1f}",
                            "source_url": event.source_url,
                        }
                    )
            if target is None:
                target = _new_organiser(display, inferred)
                by_key[key] = target

        # A real name beats an inferred venue rollup for the same entity.
        if not inferred and target.presenter_inferred:
            target.presenter_inferred = False
            if "who_books_this_room" in target.needs_verification:
                target.needs_verification.remove("who_books_this_room")

        _absorb(target, event, today)

    organisers = list(by_key.values())
    for org in organisers:
        _finalise(org)
    return organisers, suggested_merges
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_resolve.py -v`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/resolve.py tests/test_resolve.py
git commit -m "feat(resolve): entity resolution with venue-anchored candidates"
```

---

### Task 10: Scoring

**Files:**
- Create: `src/score.py`, `tests/test_score.py`

**Interfaces:**
- Consumes: `OrganiserRecord` (Task 6).
- Produces:
  - `AUDIENCE_UNKNOWN_POINTS = 4`
  - `score_organiser(org: OrganiserRecord, today: date) -> None` (mutates `org.score`, `org.tier`, `org.score_breakdown`)
  - `tier_for(score: int) -> str`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_score.py
from datetime import date

from src.models import OrganiserRecord
from src.score import AUDIENCE_UNKNOWN_POINTS, score_organiser, tier_for

TODAY = date(2026, 7, 22)


def _org(**kw: object) -> OrganiserRecord:
    org = OrganiserRecord(organiser_id="x", canonical_name="Test Promoter")
    for key, value in kw.items():
        setattr(org, key, value)
    return org


def test_activity_bands() -> None:
    for events, expected in [(1, 7), (3, 13), (5, 20), (9, 25)]:
        org = _org(events_90d=events)
        score_organiser(org, TODAY)
        assert org.score_breakdown["activity"] == expected


def test_recency_bands() -> None:
    for days, expected in [(3, 18), (20, 14), (45, 9), (75, 4), (200, 0)]:
        org = _org(last_event_date=date.fromordinal(TODAY.toordinal() - days))
        score_organiser(org, TODAY)
        assert org.score_breakdown["recency"] == expected


def test_live_onsale_is_worth_15() -> None:
    org = _org(has_live_onsale=True)
    score_organiser(org, TODAY)
    assert org.score_breakdown["live_onsale"] == 15


def test_niche_match_scores_14() -> None:
    org = _org(niches={"club_night"})
    score_organiser(org, TODAY)
    assert org.score_breakdown["niche"] == 14


def test_other_niche_scores_zero() -> None:
    org = _org(niches={"other"})
    score_organiser(org, TODAY)
    assert org.score_breakdown["niche"] == 0


def test_greenfield_scores_highest_switchability() -> None:
    org = _org(primary_bucket="GREENFIELD")
    score_organiser(org, TODAY)
    assert org.score_breakdown["switchability"] == 9


def test_competitor_scores_lower_than_greenfield() -> None:
    greenfield, competitor = _org(primary_bucket="GREENFIELD"), _org(primary_bucket="COMPETITOR")
    score_organiser(greenfield, TODAY)
    score_organiser(competitor, TODAY)
    assert greenfield.score_breakdown["switchability"] > competitor.score_breakdown["switchability"]


def test_corridor_outranks_metro_and_regional() -> None:
    scores = {}
    for region in ("Corridor", "Melbourne metro", "Regional Victoria"):
        org = _org(region=region)
        score_organiser(org, TODAY)
        scores[region] = org.score_breakdown["corridor"]
    assert scores["Corridor"] == 7
    assert scores["Melbourne metro"] == 5
    assert scores["Regional Victoria"] == 3


def test_audience_is_the_neutral_constant_in_v1() -> None:
    """Locked decision 9: no follower data, no sell-out data on slice-1 sources."""
    org = _org(events_90d=9)
    score_organiser(org, TODAY)
    assert org.score_breakdown["audience"] == AUDIENCE_UNKNOWN_POINTS == 4


def test_sellout_override_lifts_audience_to_full_marks() -> None:
    org = _org(sellout_rate=0.6, sellout_count_90d=3)
    score_organiser(org, TODAY)
    assert org.score_breakdown["audience"] == 12


def test_max_achievable_v1_score_is_92() -> None:
    org = _org(
        events_90d=9,
        last_event_date=TODAY,
        has_live_onsale=True,
        niches={"gig"},
        primary_bucket="GREENFIELD",
        region="Corridor",
    )
    score_organiser(org, TODAY)
    assert org.score == 92
    assert org.tier == "A"


def test_tier_boundaries() -> None:
    assert tier_for(70) == "A"
    assert tier_for(69) == "B"
    assert tier_for(50) == "B"
    assert tier_for(49) == "C"
    assert tier_for(30) == "C"
    assert tier_for(29) == "D"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_score.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.score'`

- [ ] **Step 3: Write the implementation**

```python
# src/score.py
"""Rank organisers 0 to 100. Every component is stored so every score is explainable.

v1 reality (locked decision 9): no follower data is collected and neither slice-1
source marks sold out, so audience reach is the neutral constant 4 for every
organiser and the maximum achievable score is 92.
"""

from __future__ import annotations

from datetime import date

from src.models import OrganiserRecord

AUDIENCE_UNKNOWN_POINTS = 4
TARGET_NICHES = frozenset({"club_night", "gig", "comedy"})


def _activity(events_90d: int) -> int:
    if events_90d >= 7:
        return 25
    if events_90d >= 4:
        return 20
    if events_90d >= 2:
        return 13
    if events_90d == 1:
        return 7
    return 0


def _recency(last_event: date | None, today: date) -> int:
    if last_event is None:
        return 0
    days = (today - last_event).days
    if days <= 14:
        return 18
    if days <= 30:
        return 14
    if days <= 60:
        return 9
    if days <= 90:
        return 4
    return 0


def _niche(niches: set[str]) -> int:
    if niches & TARGET_NICHES:
        return 14
    if niches - {"other"}:
        return 7
    return 0


def _audience(org: OrganiserRecord) -> int:
    # Evidence beats proxy: a proven sell-out rate takes full marks regardless
    # of follower count. Dormant in v1 because no source marks sold out.
    if org.sellout_rate is not None and org.sellout_rate >= 0.5 and org.sellout_count_90d >= 3:
        return 12
    return AUDIENCE_UNKNOWN_POINTS


def _switchability(bucket: str) -> int:
    return {"GREENFIELD": 9, "SELF_HOSTED": 6, "COMPETITOR": 5}.get(bucket, 4)


def _corridor(region: str) -> int:
    return {"Corridor": 7, "Melbourne metro": 5, "Regional Victoria": 3}.get(region, 0)


def tier_for(score: int) -> str:
    if score >= 70:
        return "A"
    if score >= 50:
        return "B"
    if score >= 30:
        return "C"
    return "D"


def score_organiser(org: OrganiserRecord, today: date) -> None:
    breakdown = {
        "activity": _activity(org.events_90d),
        "recency": _recency(org.last_event_date, today),
        "live_onsale": 15 if org.has_live_onsale else 0,
        "niche": _niche(org.niches),
        "audience": _audience(org),
        "switchability": _switchability(org.primary_bucket),
        "corridor": _corridor(org.region),
    }
    org.score_breakdown = breakdown
    org.score = sum(breakdown.values())
    org.tier = tier_for(org.score)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_score.py -v`
Expected: 13 passed.

- [ ] **Step 5: Commit**

```bash
git add src/score.py tests/test_score.py
git commit -m "feat(score): explainable ranking, audience constant 4 in v1"
```

---

### Task 11: Tracker export

**Files:**
- Create: `src/export.py`, `tests/test_export.py`

**Interfaces:**
- Consumes: `OrganiserRecord` (Task 6), `assert_no_addresses` (Task 2).
- Produces:
  - `TRACKER_PATH: Path` (the absolute path to the founder's tracker)
  - `HEADER_ROW = 3`, `FIRST_DATA_ROW = 4`
  - `HUMAN_COLUMNS: frozenset[str]`, `ENGINE_COLUMNS: tuple[str, ...]`
  - `class TrackerLockedError(Exception)`
  - `export_to_tracker(tracker_path: Path, organisers: Sequence[OrganiserRecord], backup_dir: Path, today: date) -> dict[str, int]`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_export.py
from datetime import date
from pathlib import Path

import pytest
from openpyxl import Workbook, load_workbook

from src.export import (
    FIRST_DATA_ROW,
    HEADER_ROW,
    HUMAN_COLUMNS,
    TrackerLockedError,
    export_to_tracker,
)
from src.models import OrganiserRecord

TODAY = date(2026, 7, 22)

BASE_HEADERS = [
    "Organiser / Venue", "Contact Name", "City", "Event Type", "Current Platform",
    "Channel", "Contact (handle/email)", "Personalisation Note", "Status", "Priority",
    "First Touch Date", "Last Touch Date", "Touches", "Next Action Date", "Referred By", "Notes",
]


def _tracker(tmp_path: Path) -> Path:
    wb = Workbook()
    ws = wb.active
    ws.title = "Pipeline"
    ws.cell(row=1, column=1, value="EVENTLINQS  |  ORGANISER OUTREACH PIPELINE")
    for i, h in enumerate(BASE_HEADERS, start=1):
        ws.cell(row=HEADER_ROW, column=i, value=h)
    ws.cell(row=FIRST_DATA_ROW, column=1, value="The Basement Comedy")
    ws.cell(row=FIRST_DATA_ROW, column=2, value="Sam R.")
    ws.cell(row=FIRST_DATA_ROW, column=9, value="In Conversation")
    dash = wb.create_sheet("Dashboard")
    dash.cell(row=3, column=2, value="=COUNTA(Pipeline!A4:A220)")
    dash.cell(row=4, column=2, value='=COUNTIF(Pipeline!I4:I220,"To Contact")')
    path = tmp_path / "tracker.xlsx"
    wb.save(path)
    return path


def _org(name: str, **kw: object) -> OrganiserRecord:
    org = OrganiserRecord(organiser_id=f"id-{name}", canonical_name=name)
    org.region = "Corridor"
    org.primary_platform = "Oztix"
    org.niches = {"gig"}
    org.score = 61
    org.tier = "B"
    org.events_90d = 4
    org.last_event_date = date(2026, 7, 10)
    org.latest_activity = "Ran 4 events in the last 90 days."
    org.evidence = [{"claim": "x", "source_url": "https://beat.com.au/gig-guide/", "retrieved_at": "2026-07-22T00:00:00+00:00"}]
    for k, v in kw.items():
        setattr(org, k, v)
    return org


def test_backup_is_created_before_the_first_write(tmp_path: Path) -> None:
    tracker, backups = _tracker(tmp_path), tmp_path / "backups"
    export_to_tracker(tracker, [_org("Promoter A")], backups, TODAY)
    assert list(backups.glob("*.xlsx"))


def test_new_rows_land_with_status_new(tmp_path: Path) -> None:
    tracker = _tracker(tmp_path)
    export_to_tracker(tracker, [_org("Promoter A")], tmp_path / "b", TODAY)
    ws = load_workbook(tracker)["Pipeline"]
    headers = [c.value for c in ws[HEADER_ROW]]
    status_col = headers.index("Status") + 1
    new_row = [r for r in range(FIRST_DATA_ROW, ws.max_row + 1) if ws.cell(row=r, column=1).value == "Promoter A"][0]
    assert ws.cell(row=new_row, column=status_col).value == "New"


def test_organiser_id_column_is_visible_and_labelled(tmp_path: Path) -> None:
    tracker = _tracker(tmp_path)
    export_to_tracker(tracker, [_org("Promoter A")], tmp_path / "b", TODAY)
    ws = load_workbook(tracker)["Pipeline"]
    headers = [c.value for c in ws[HEADER_ROW] if c.value]
    assert "Organiser ID (DO NOT EDIT)" in headers
    assert headers[-1] == "Organiser ID (DO NOT EDIT)"
    assert ws.column_dimensions[ws.cell(row=HEADER_ROW, column=len(headers)).column_letter].hidden is False


def test_human_columns_survive_a_second_run(tmp_path: Path) -> None:
    tracker = _tracker(tmp_path)
    export_to_tracker(tracker, [_org("Promoter A")], tmp_path / "b", TODAY)

    wb = load_workbook(tracker)
    ws = wb["Pipeline"]
    headers = [c.value for c in ws[HEADER_ROW]]
    row = [r for r in range(FIRST_DATA_ROW, ws.max_row + 1) if ws.cell(row=r, column=1).value == "Promoter A"][0]
    ws.cell(row=row, column=headers.index("Status") + 1, value="Demo Booked")
    ws.cell(row=row, column=headers.index("Contact Name") + 1, value="Jo B.")
    ws.cell(row=row, column=headers.index("Personalisation Note") + 1, value="Met at Pako Festa")
    ws.cell(row=row, column=headers.index("Event Type") + 1, value="Comedy night")
    wb.save(tracker)

    export_to_tracker(tracker, [_org("Promoter A", score=80, tier="A")], tmp_path / "b", TODAY)

    ws2 = load_workbook(tracker)["Pipeline"]
    h2 = [c.value for c in ws2[HEADER_ROW]]
    row2 = [r for r in range(FIRST_DATA_ROW, ws2.max_row + 1) if ws2.cell(row=r, column=1).value == "Promoter A"][0]
    assert ws2.cell(row=row2, column=h2.index("Status") + 1).value == "Demo Booked"
    assert ws2.cell(row=row2, column=h2.index("Contact Name") + 1).value == "Jo B."
    assert ws2.cell(row=row2, column=h2.index("Personalisation Note") + 1).value == "Met at Pako Festa"
    assert ws2.cell(row=row2, column=h2.index("Event Type") + 1).value == "Comedy night"
    # Engine columns DID refresh.
    assert ws2.cell(row=row2, column=h2.index("Score") + 1).value == 80


def test_rerun_does_not_duplicate_rows(tmp_path: Path) -> None:
    tracker = _tracker(tmp_path)
    export_to_tracker(tracker, [_org("Promoter A")], tmp_path / "b", TODAY)
    first = load_workbook(tracker)["Pipeline"].max_row
    export_to_tracker(tracker, [_org("Promoter A")], tmp_path / "b", TODAY)
    assert load_workbook(tracker)["Pipeline"].max_row == first


def test_absent_organiser_goes_dormant_and_is_never_deleted(tmp_path: Path) -> None:
    tracker = _tracker(tmp_path)
    export_to_tracker(tracker, [_org("Promoter A"), _org("Promoter B")], tmp_path / "b", TODAY)
    export_to_tracker(tracker, [_org("Promoter A")], tmp_path / "b", TODAY)
    ws = load_workbook(tracker)["Pipeline"]
    names = [ws.cell(row=r, column=1).value for r in range(FIRST_DATA_ROW, ws.max_row + 1)]
    assert "Promoter B" in names
    headers = [c.value for c in ws[HEADER_ROW]]
    row = names.index("Promoter B") + FIRST_DATA_ROW
    assert "Dormant" in str(ws.cell(row=row, column=headers.index("Latest Activity") + 1).value)


def test_dashboard_ranges_are_widened_once(tmp_path: Path) -> None:
    tracker = _tracker(tmp_path)
    export_to_tracker(tracker, [_org("Promoter A")], tmp_path / "b", TODAY)
    dash = load_workbook(tracker)["Dashboard"]
    assert dash.cell(row=3, column=2).value == "=COUNTA(Pipeline!A4:A5000)"
    assert dash.cell(row=4, column=2).value == '=COUNTIF(Pipeline!I4:I5000,"To Contact")'


def test_engine_never_writes_a_contact_column(tmp_path: Path) -> None:
    tracker = _tracker(tmp_path)
    export_to_tracker(tracker, [_org("Promoter A")], tmp_path / "b", TODAY)
    ws = load_workbook(tracker)["Pipeline"]
    headers = [c.value for c in ws[HEADER_ROW]]
    row = [r for r in range(FIRST_DATA_ROW, ws.max_row + 1) if ws.cell(row=r, column=1).value == "Promoter A"][0]
    assert ws.cell(row=row, column=headers.index("Contact Name") + 1).value is None
    assert ws.cell(row=row, column=headers.index("Contact (handle/email)") + 1).value is None


def test_locked_tracker_fails_loudly(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    tracker = _tracker(tmp_path)

    def boom(*args: object, **kwargs: object) -> None:
        raise PermissionError("locked by Excel")

    monkeypatch.setattr("src.export.os.replace", boom)
    with pytest.raises(TrackerLockedError) as exc:
        export_to_tracker(tracker, [_org("Promoter A")], tmp_path / "b", TODAY)
    assert "open in Excel" in str(exc.value)


def test_human_columns_constant_matches_the_spec() -> None:
    for col in ("Contact Name", "Event Type", "Personalisation Note", "Priority", "Notes"):
        assert col in HUMAN_COLUMNS
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_export.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.export'`

- [ ] **Step 3: Write the implementation**

```python
# src/export.py
"""Write engine output into the founder's outreach tracker.

The partition rule: no column is ever both engine-owned and human-owned. Where
the engine has an opinion about a human column it writes an engine-owned twin
appended to the right, never a conditional or first-insert-only write.
"""

from __future__ import annotations

import os
import re
import shutil
from collections.abc import Sequence
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook

from src.guards import assert_no_addresses
from src.models import OrganiserRecord

TRACKER_PATH = Path(
    "C:/Users/61416/OneDrive/Desktop/EventLinqs/eventlinqs-app/docs/marketing/"
    "eventlinqs-outreach-tracker.xlsx"
)

PIPELINE_SHEET = "Pipeline"
DASHBOARD_SHEET = "Dashboard"
HEADER_ROW = 3
FIRST_DATA_ROW = 4
NAME_COLUMN = 1
ID_HEADER = "Organiser ID (DO NOT EDIT)"

HUMAN_COLUMNS = frozenset(
    {
        "Contact Name",
        "Contact (handle/email)",
        "Event Type",
        "Personalisation Note",
        "Priority",
        "First Touch Date",
        "Last Touch Date",
        "Touches",
        "Next Action Date",
        "Referred By",
        "Notes",
    }
)

# Appended to the right of the founder's existing columns, in this order.
ENGINE_COLUMNS: tuple[str, ...] = (
    "Event Type (auto)",
    "Score",
    "Tier",
    "Events 90d",
    "Last Event",
    "Next Event",
    "Venues Played",
    "Latest Activity",
    "Source URL",
    "Retrieved",
    "Needs Verification",
    ID_HEADER,
)

_RANGE_RE = re.compile(r"(Pipeline!\$?[A-Z]{1,2}\$?4:\$?[A-Z]{1,2}\$?)220")


class TrackerLockedError(Exception):
    """The tracker is open in Excel and cannot be replaced."""


def _headers(ws) -> list[str]:  # type: ignore[no-untyped-def]
    return [c.value for c in ws[HEADER_ROW]]


def _column_of(ws, name: str) -> int | None:  # type: ignore[no-untyped-def]
    headers = _headers(ws)
    return headers.index(name) + 1 if name in headers else None


def _ensure_engine_columns(ws) -> None:  # type: ignore[no-untyped-def]
    headers = [h for h in _headers(ws) if h]
    next_col = len(headers) + 1
    for name in ENGINE_COLUMNS:
        if name not in headers:
            cell = ws.cell(row=HEADER_ROW, column=next_col, value=name)
            ws.column_dimensions[cell.column_letter].hidden = False
            headers.append(name)
            next_col += 1


def _widen_dashboard(wb) -> None:  # type: ignore[no-untyped-def]
    if DASHBOARD_SHEET not in wb.sheetnames:
        return
    ws = wb[DASHBOARD_SHEET]
    for row in ws.iter_rows():
        for cell in row:
            if isinstance(cell.value, str) and cell.value.startswith("="):
                cell.value = _RANGE_RE.sub(r"\g<1>5000", cell.value)


def _existing_rows(ws) -> dict[str, int]:  # type: ignore[no-untyped-def]
    id_col = _column_of(ws, ID_HEADER)
    rows: dict[str, int] = {}
    if id_col is None:
        return rows
    for r in range(FIRST_DATA_ROW, ws.max_row + 1):
        value = ws.cell(row=r, column=id_col).value
        if value:
            rows[str(value)] = r
    return rows


def _write(ws, row: int, name: str, value: object) -> None:  # type: ignore[no-untyped-def]
    if name in HUMAN_COLUMNS:
        raise AssertionError(f"engine attempted to write human-owned column {name!r}")
    col = _column_of(ws, name)
    if col is not None:
        ws.cell(row=row, column=col, value=value)


def _fmt(value: date | None) -> str:
    return value.isoformat() if value else ""


def export_to_tracker(
    tracker_path: Path,
    organisers: Sequence[OrganiserRecord],
    backup_dir: Path,
    today: date,
) -> dict[str, int]:
    tracker_path = Path(tracker_path)
    backup_dir = Path(backup_dir)
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    shutil.copy2(tracker_path, backup_dir / f"{tracker_path.stem}.{stamp}.xlsx")

    wb = load_workbook(tracker_path)
    ws = wb[PIPELINE_SHEET]
    _ensure_engine_columns(ws)
    _widen_dashboard(wb)

    existing = _existing_rows(ws)
    seen_ids: set[str] = set()
    inserted = updated = dormant = 0

    for org in organisers:
        seen_ids.add(org.organiser_id)
        row = existing.get(org.organiser_id)
        if row is None:
            row = max(ws.max_row + 1, FIRST_DATA_ROW)
            ws.cell(row=row, column=NAME_COLUMN, value=org.canonical_name)
            status_col = _column_of(ws, "Status")
            if status_col:
                ws.cell(row=row, column=status_col, value="New")
            inserted += 1
        else:
            updated += 1

        source = org.evidence[0]["source_url"] if org.evidence else ""
        retrieved = org.evidence[0]["retrieved_at"] if org.evidence else ""

        _write(ws, row, "City", f"{org.region} / {sorted(org.suburbs)[0] if org.suburbs else ''}".strip(" /"))
        _write(ws, row, "Current Platform", org.primary_platform)
        _write(ws, row, "Event Type (auto)", ", ".join(sorted(org.niches)))
        _write(ws, row, "Score", org.score)
        _write(ws, row, "Tier", org.tier)
        _write(ws, row, "Events 90d", org.events_90d)
        _write(ws, row, "Last Event", _fmt(org.last_event_date))
        _write(ws, row, "Next Event", _fmt(org.next_event_date))
        _write(ws, row, "Venues Played", len(org.venues_played))
        _write(ws, row, "Latest Activity", org.latest_activity)
        _write(ws, row, "Source URL", source)
        _write(ws, row, "Retrieved", retrieved)
        _write(ws, row, "Needs Verification", ", ".join(org.needs_verification))
        _write(ws, row, ID_HEADER, org.organiser_id)

    # Rows are never deleted. An organiser absent from listings goes dormant.
    for organiser_id, row in existing.items():
        if organiser_id in seen_ids:
            continue
        activity_col = _column_of(ws, "Latest Activity")
        if activity_col:
            last = ws.cell(row=row, column=_column_of(ws, "Last Event") or 1).value or "unknown"
            ws.cell(row=row, column=activity_col, value=f"Dormant: no listing seen since {last}")
        dormant += 1

    tmp_path = tracker_path.with_suffix(".tmp.xlsx")
    wb.save(tmp_path)
    try:
        os.replace(tmp_path, tracker_path)
    except PermissionError as exc:
        tmp_path.unlink(missing_ok=True)
        raise TrackerLockedError(
            f"Tracker is open in Excel. Close it and re-run. ({tracker_path})"
        ) from exc

    assert_no_addresses(tracker_path)
    return {"inserted": inserted, "updated": updated, "dormant": dormant}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_export.py -v`
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add src/export.py tests/test_export.py
git commit -m "feat(export): atomic tracker write with strict column partition"
```

---

### Task 12: Verification queue, pipeline entry point, acceptance gate

**Files:**
- Create: `src/verify_queue.py`, `run.py`, `config/sources.yaml`, `tests/test_verify_queue.py`, `tests/test_run_gate.py`

**Interfaces:**
- Consumes: every module above.
- Produces:
  - `build_queue(organisers, suggested_merges, skipped_sources, today) -> list[dict[str, str]]`
  - `write_queue(rows: Sequence[dict[str, str]], path: Path) -> None` (runs `assert_no_addresses` at write time only)
  - `evaluate_gate(organisers, events) -> dict[str, object]` in `run.py`
  - `main(argv: Sequence[str] | None = None) -> int` in `run.py`

- [ ] **Step 1: Write `config/sources.yaml`**

```yaml
# Slice 1 sources. Tier 1 remainder, councils and festivals come after founder
# review of real rows (spec, out of scope section).
- name: beat_gig_guide
  base_url: https://beat.com.au/gig-guide/
  type: html
  parser: beat
  regions_covered: [Corridor, Melbourne metro, Regional Victoria]
  robots_checked: true
  notes: >-
    Volume and platform source. Server-rendered, 273 events in one fetch.
    Names no presenter, so its events venue-anchor in resolve.py.
- name: geelong_council
  base_url: https://www.geelongcity.vic.gov.au/whats-happening/events
  type: html
  parser: geelong
  regions_covered: [Corridor]
  robots_checked: true
  notes: >-
    Identity source. robots.txt is absent (404), which RFC 9309 reads as no
    restrictions. Detail hop required: the index carries no ticket links.
- name: visit_victoria
  base_url: https://www.visitvictoria.com/
  type: manual
  parser: none
  regions_covered: [Regional Victoria]
  robots_checked: true
  notes: >-
    MANUAL QUEUE ONLY. Cloudflare managed challenge on robots.txt itself.
    Never worked around. Routed to Cowork.
```

- [ ] **Step 2: Write the failing queue tests**

```python
# tests/test_verify_queue.py
from datetime import date
from pathlib import Path

import pytest

from src.guards import find_addresses
from src.models import OrganiserRecord
from src.verify_queue import QUEUE_HEADERS, build_queue, write_queue

TODAY = date(2026, 7, 22)


def _org(name: str, **kw: object) -> OrganiserRecord:
    org = OrganiserRecord(organiser_id=f"id-{name}", canonical_name=name)
    for k, v in kw.items():
        setattr(org, k, v)
    return org


def test_venue_anchored_candidates_are_queued() -> None:
    rows = build_queue([_org("The Barwon Club", presenter_inferred=True)], [], [], TODAY)
    assert any(r["reason"] == "who_books_this_room" for r in rows)


def test_unknown_platform_is_queued() -> None:
    rows = build_queue([_org("X", primary_bucket="UNKNOWN")], [], [], TODAY)
    assert any(r["reason"] == "unknown_platform" for r in rows)


def test_tier_b_and_above_gets_an_audience_check() -> None:
    rows = build_queue([_org("X", tier="B", score=55)], [], [], TODAY)
    assert any(r["reason"] == "audience_check" for r in rows)


def test_stale_organiser_is_queued() -> None:
    rows = build_queue([_org("X", last_event_date=date(2026, 1, 1))], [], [], TODAY)
    assert any(r["reason"] == "possibly_stopped" for r in rows)


def test_suggested_merges_are_queued() -> None:
    merges = [{"name_a": "A", "name_b": "B", "score": "87.0", "source_url": "https://x"}]
    rows = build_queue([], merges, [], TODAY)
    assert any(r["reason"] == "suggested_merge" for r in rows)


def test_blocked_sources_are_queued() -> None:
    rows = build_queue([], [], [("https://www.visitvictoria.com/events", "SKIPPED_BLOCKED")], TODAY)
    assert any(r["reason"] == "source_blocked_manual" for r in rows)


def test_written_queue_contains_no_address(tmp_path: Path) -> None:
    """Rail 1 at write time only. Once Cowork fills it, it is never scanned again."""
    from openpyxl import load_workbook

    path = tmp_path / "verification_queue.xlsx"
    write_queue(build_queue([_org("X", presenter_inferred=True)], [], [], TODAY), path)
    assert path.exists()
    ws = load_workbook(path)["Verification"]
    cells = [str(c) for row in ws.iter_rows(values_only=True) for c in row if c is not None]
    assert find_addresses("\n".join(cells)) == []
    assert len(cells) > len(QUEUE_HEADERS)  # header row plus at least one real row


def test_write_queue_aborts_if_a_row_carries_an_address(tmp_path: Path) -> None:
    """The guard must actually fire, not just be called. If a future change ever
    routes an address into the queue, this write fails loudly."""
    from src.guards import GuardViolation

    path = tmp_path / "verification_queue.xlsx"
    poisoned = [
        {
            "organiser": "X",
            "organiser_id": "id-X",
            "reason": "no_contact_route",
            "detail": "found sam@example.com on their site",
            "source_url": "https://x",
        }
    ]
    with pytest.raises(GuardViolation):
        write_queue(poisoned, path)
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_verify_queue.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.verify_queue'`

- [ ] **Step 4: Write `src/verify_queue.py`**

```python
# src/verify_queue.py
"""The human check list. This is where Cowork earns its keep.

Rail 1: the engine writes no address here, proven by assert_no_addresses at
write time. Once a human or Cowork begins filling it, it is never scanned again.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, timedelta
from pathlib import Path

from openpyxl import Workbook

from src.guards import assert_no_addresses
from src.models import OrganiserRecord

QUEUE_HEADERS = ("organiser", "organiser_id", "reason", "detail", "source_url")


def build_queue(
    organisers: Sequence[OrganiserRecord],
    suggested_merges: Sequence[dict[str, str]],
    skipped_sources: Sequence[tuple[str, str]],
    today: date,
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []

    def add(name: str, organiser_id: str, reason: str, detail: str, source: str) -> None:
        rows.append(
            {
                "organiser": name,
                "organiser_id": organiser_id,
                "reason": reason,
                "detail": detail,
                "source_url": source,
            }
        )

    for org in organisers:
        source = org.evidence[0]["source_url"] if org.evidence else ""
        if org.presenter_inferred:
            add(org.canonical_name, org.organiser_id, "who_books_this_room",
                "Venue-anchored candidate. Confirm who books this room.", source)
        if org.primary_bucket == "UNKNOWN":
            add(org.canonical_name, org.organiser_id, "unknown_platform",
                "Ticket link did not resolve to a bucket.", source)
        if org.tier in ("A", "B") and org.instagram_followers is None:
            add(org.canonical_name, org.organiser_id, "audience_check",
                "Confirm follower count from their own public profile, one at a time.", source)
        if org.last_event_date and (today - org.last_event_date) > timedelta(days=120):
            add(org.canonical_name, org.organiser_id, "possibly_stopped",
                f"Last event {org.last_event_date.isoformat()}. May have stopped.", source)
        if not org.phone and not org.instagram:
            add(org.canonical_name, org.organiser_id, "no_contact_route",
                "No contact route found. Check their own site or public profile.", source)

    for merge in suggested_merges:
        add(merge["name_a"], "", "suggested_merge",
            f"Possible duplicate of {merge['name_b']} at {merge['score']}.", merge.get("source_url", ""))

    for url, reason in skipped_sources:
        if reason == "SKIPPED_BLOCKED":
            add(url, "", "source_blocked_manual",
                "Source is bot-gated. Work it manually, never engineer around the gate.", url)

    return rows


def write_queue(rows: Sequence[dict[str, str]], path: Path) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Verification"
    ws.append(list(QUEUE_HEADERS))
    for row in rows:
        ws.append([row.get(h, "") for h in QUEUE_HEADERS])
    wb.save(path)
    assert_no_addresses(path)
```

- [ ] **Step 5: Run the queue tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_verify_queue.py -v`
Expected: 8 passed.

- [ ] **Step 6: Write the failing gate test**

```python
# tests/test_run_gate.py
from datetime import UTC, date, datetime

from run import evaluate_gate
from src.models import EventRecord, OrganiserRecord, make_event_id


def _event(bucket: str, has_link: bool = True) -> EventRecord:
    when = date(2026, 7, 1)
    return EventRecord(
        event_id=make_event_id(f"t{bucket}{has_link}", when, "V"),
        title="T", date=when, end_date=None, venue_name="V", suburb="Geelong",
        region="Corridor", presenter_raw=None, artists=(),
        ticket_url="https://www.oztix.com.au/x" if has_link else None,
        platform="Oztix", platform_bucket=bucket, price_min=None, on_sale=has_link,
        is_sold_out=None, source_url="https://beat.com.au/gig-guide/",
        retrieved_at=datetime.now(UTC),
    )


def _orgs(count: int, named: int) -> list[OrganiserRecord]:
    out = []
    for i in range(count):
        org = OrganiserRecord(organiser_id=f"id{i}", canonical_name=f"Org {i}")
        org.presenter_inferred = i >= named
        out.append(org)
    return out


def test_gate_passes_on_healthy_numbers() -> None:
    result = evaluate_gate(_orgs(70, 20), [_event("COMPETITOR") for _ in range(100)])
    assert result["passed"] is True


def test_gate_fails_below_60_organisers() -> None:
    result = evaluate_gate(_orgs(40, 20), [_event("COMPETITOR") for _ in range(100)])
    assert result["passed"] is False
    assert "distinct organisers" in str(result["failures"])


def test_gate_fails_below_15_named_presenters() -> None:
    result = evaluate_gate(_orgs(70, 5), [_event("COMPETITOR") for _ in range(100)])
    assert result["passed"] is False
    assert "named presenters" in str(result["failures"])


def test_gate_fails_when_unknown_exceeds_5_percent() -> None:
    events = [_event("COMPETITOR") for _ in range(90)] + [_event("UNKNOWN") for _ in range(10)]
    result = evaluate_gate(_orgs(70, 20), events)
    assert result["passed"] is False
    assert "UNKNOWN" in str(result["failures"])


def test_events_without_a_link_are_excluded_from_the_platform_ratio() -> None:
    events = [_event("COMPETITOR") for _ in range(50)] + [_event("GREENFIELD", has_link=False) for _ in range(50)]
    assert evaluate_gate(_orgs(70, 20), events)["passed"] is True
```

- [ ] **Step 7: Run the gate test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/test_run_gate.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'run'`

- [ ] **Step 8: Write `run.py`**

```python
# run.py
"""One command, full pipeline.

    python run.py --region corridor
    python run.py --refresh
    python run.py --dry-run          # everything except the tracker write
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from datetime import UTC, date, datetime
from pathlib import Path

import yaml

from src.collect import Collector
from src.export import TRACKER_PATH, export_to_tracker
from src.models import EventRecord, OrganiserRecord
from src.parse import (
    classify_niches,
    geelong_event_links,
    parse_beat_guide,
    parse_geelong_detail,
)
from src.platform_detect import domain_frequency_report, load_platform_map
from src.resolve import resolve_organisers
from src.score import score_organiser
from src.verify_queue import build_queue, write_queue

ROOT = Path(__file__).resolve().parent
MIN_ORGANISERS = 60
MIN_NAMED_PRESENTERS = 15
MAX_UNKNOWN_RATIO = 0.05


def evaluate_gate(
    organisers: Sequence[OrganiserRecord], events: Sequence[EventRecord]
) -> dict[str, object]:
    """Slice-1 acceptance gate. Never loosen a threshold to go green."""
    failures: list[str] = []

    distinct = len(organisers)
    if distinct < MIN_ORGANISERS:
        failures.append(f"only {distinct} distinct organisers, need {MIN_ORGANISERS}")

    named = sum(1 for o in organisers if not o.presenter_inferred)
    if named < MIN_NAMED_PRESENTERS:
        failures.append(f"only {named} named presenters, need {MIN_NAMED_PRESENTERS}")

    with_link = [e for e in events if e.ticket_url]
    unknown = [e for e in with_link if e.platform_bucket == "UNKNOWN"]
    ratio = len(unknown) / len(with_link) if with_link else 0.0
    if ratio > MAX_UNKNOWN_RATIO:
        failures.append(f"UNKNOWN platform ratio {ratio:.1%} exceeds {MAX_UNKNOWN_RATIO:.0%}")

    return {
        "passed": not failures,
        "failures": failures,
        "distinct_organisers": distinct,
        "named_presenters": named,
        "unknown_ratio": round(ratio, 4),
        "events": len(events),
    }


def _load_configs() -> tuple[dict[str, str], dict[str, object], dict[str, list[str]], list[dict[str, object]]]:
    cfg = ROOT / "config"
    return (
        load_platform_map(cfg / "platforms.yaml"),
        yaml.safe_load((cfg / "geography.yaml").read_text(encoding="utf-8")),
        yaml.safe_load((cfg / "niches.yaml").read_text(encoding="utf-8")),
        yaml.safe_load((cfg / "sources.yaml").read_text(encoding="utf-8")),
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="EventLinqs organiser intelligence engine")
    parser.add_argument("--region", default="corridor")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    platform_map, geography, niche_config, sources = _load_configs()
    collector = Collector(cache_dir=ROOT / "data" / "raw", refresh=args.refresh)
    today = datetime.now(UTC).date()
    events: list[EventRecord] = []

    for source in sources:
        if source["type"] == "manual":
            print(f"[manual] {source['name']}: {source['notes'].strip()}")
            collector.skipped.append((str(source["base_url"]), "SKIPPED_BLOCKED"))
            continue

        page = collector.fetch(str(source["base_url"]))
        if page is None:
            print(f"[skipped] {source['name']}")
            continue

        if source["parser"] == "beat":
            found = parse_beat_guide(page, platform_map, geography)
            events.extend(found)
            print(f"[beat] {len(found)} events")
        elif source["parser"] == "geelong":
            links = geelong_event_links(page)
            print(f"[geelong] {len(links)} detail pages to fetch")
            for link in links:
                detail = collector.fetch(link)
                if detail is None:
                    continue
                event = parse_geelong_detail(detail, platform_map, geography)
                if event is not None:
                    events.append(event)

    print("\n=== domain frequency report (locked decision 17) ===")
    for host, count in domain_frequency_report(e.ticket_url for e in events)[:50]:
        print(f"{count:5d}  {host}")

    organisers, merges = resolve_organisers(events, today)
    for org in organisers:
        titles = [str(e["claim"]).removeprefix("event:") for e in org.evidence]
        org.niches = classify_niches(" ".join(titles), [], [], niche_config)
        score_organiser(org, today)
        org.latest_activity = (
            f"Ran {org.events_90d} events in the last 90 days across "
            f"{len(org.venues_played)} venues. Currently selling through {org.primary_platform}."
        )

    organisers.sort(key=lambda o: o.score, reverse=True)

    queue = build_queue(organisers, merges, collector.skipped, today)
    write_queue(queue, ROOT / "verification_queue.xlsx")
    print(f"\n[queue] {len(queue)} rows written")

    gate = evaluate_gate(organisers, events)
    print("\n=== slice-1 acceptance gate ===")
    for key, value in gate.items():
        print(f"{key}: {value}")

    if args.dry_run:
        print("\n[dry-run] tracker not written")
        return 0 if gate["passed"] else 1

    summary = export_to_tracker(TRACKER_PATH, organisers, ROOT / "backups", today)
    print(f"\n[tracker] {summary}")
    return 0 if gate["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 9: Run the gate tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_run_gate.py -v`
Expected: 5 passed.

- [ ] **Step 10: Run the whole suite and the linters**

```bash
.venv/Scripts/python.exe -m pytest -v
.venv/Scripts/python.exe -m ruff check .
.venv/Scripts/python.exe -m mypy src run.py
```

Expected: all tests pass, ruff clean, mypy clean.

- [ ] **Step 11: Commit**

```bash
git add src/verify_queue.py run.py config/sources.yaml tests/test_verify_queue.py tests/test_run_gate.py
git commit -m "feat(run): pipeline entry point, verification queue, acceptance gate"
```

---

### Task 13: First live run and the founder review gate

**Files:**
- Modify: `config/platforms.yaml` (corrected against the measured report)
- Create: `docs/SLICE-1-RESULTS.md`

**Interfaces:**
- Consumes: the whole pipeline.
- Produces: evidence for the founder review that section 14 of the build brief requires.

- [ ] **Step 1: Dry run, tracker untouched**

```bash
cd "C:/Users/61416/OneDrive/Desktop/EventLinqs/eventlinqs-organiser-engine"
.venv/Scripts/python.exe run.py --region corridor --dry-run
```

Expected: event counts per source, a domain frequency report, a queue row count, and the
gate block. The tracker is NOT written.

- [ ] **Step 2: Correct `config/platforms.yaml` against the report**

Read the printed domain frequency table. Any host in the top 50 that is a real ticketing
platform but is missing from `platforms.yaml` gets added, with the platform name as the
value. Any seeded domain that never appears is left in place (it costs nothing) but noted.

This is locked decision 17. Do not skip it: the seed map came from market recall and the
measured Victorian mix already differs from it.

- [ ] **Step 3: Re-run the dry run and confirm the gate**

```bash
.venv/Scripts/python.exe run.py --region corridor --dry-run
```

Expected: `passed: True`. If UNKNOWN still exceeds 5 percent, repeat step 2 rather than
lowering the threshold.

- [ ] **Step 4: Do the spot check**

Add `--spot-check N` to `run.py`: after scoring, it prints N organisers drawn with a fixed
seed (so the sample is reproducible and cannot be re-rolled until it looks good) with the
three facts a human needs to verify each one.

In `run.py`, add to the argument parser:

```python
    parser.add_argument("--spot-check", type=int, default=0, metavar="N")
```

and immediately before the gate block:

```python
    if args.spot_check:
        import random

        sample = random.Random(20260722).sample(
            organisers, min(args.spot_check, len(organisers))
        )
        print(f"\n=== spot check: {len(sample)} rows, verify 9 of 10 by hand ===")
        for org in sample:
            source = org.evidence[0]["source_url"] if org.evidence else "(none)"
            print(f"\norganiser : {org.canonical_name}")
            print(f"inferred  : {org.presenter_inferred}")
            print(f"platform  : {org.primary_platform} ({org.primary_bucket})")
            print(f"source    : {source}")
```

Then run it and verify by hand:

```bash
.venv/Scripts/python.exe run.py --region corridor --dry-run --spot-check 10
```

Open each printed source URL in a browser. For each row confirm two things: the organiser
name matches what the page shows (for an inferred row, that the venue is right), and the
platform matches the ticket link on that page. **At least 9 of 10 must be right.** Record
each row as pass or fail with its URL in Step 5. Below 9, fix parsing before writing the
tracker; do not re-draw the sample.

- [ ] **Step 5: Write `docs/SLICE-1-RESULTS.md`**

Record, with no padding and no rounding up:

- distinct organisers, named presenters, venue-anchored candidates
- platform bucket distribution (COMPETITOR by platform, GREENFIELD, SELF_HOSTED, UNKNOWN)
- the domain frequency table
- the spot-check result, 10 rows, pass or fail per row with the URL
- what the gate reported
- anything that did not work

- [ ] **Step 6: Write the tracker for real**

Only after the gate passes and the spot check is 9 of 10 or better.

```bash
.venv/Scripts/python.exe run.py --region corridor
```

Expected: a `[tracker]` summary line with inserted, updated and dormant counts, and a
backup file in `backups/`.

- [ ] **Step 7: Verify the tracker by hand**

Open `eventlinqs-app/docs/marketing/eventlinqs-outreach-tracker.xlsx` and confirm:
the Dashboard counts still work, the three original sample rows are untouched, new rows
carry `Status = New`, `Organiser ID (DO NOT EDIT)` is the last visible column, and no
email address appears anywhere.

- [ ] **Step 8: Commit and STOP for founder review**

```bash
git add -A
git commit -m "docs: slice 1 results and corrected platform map"
```

Per section 14 of the build brief and the spec's out-of-scope section, **stop here**. Tier 1
remainder, Tier 2 venue pages, Tier 3 councils and Tier 4 festivals are not built until
Lawal has reviewed real rows. One hundred correct rows beats a thousand wrong ones.

---

## Self-Review

**Spec coverage:** every spec section maps to a task. Architecture and module boundaries
(Tasks 1 to 12), rail 1 with scan scoping (Tasks 2, 8, 12), rail 2 (Tasks 3, 4, 5), rail 3
with fail-closed (Tasks 3, 4), phone plus DNCR note (Task 8), data model with provenance
refusal (Task 6), both slice-1 sources (Tasks 7, 8), platform detection and the four buckets
(Task 5), the domain frequency report and locked decision 17 (Tasks 5, 12, 13), entity
resolution with thresholds and venue anchoring (Task 9), niche classification (Task 7),
scoring with the audience constant (Task 10), the full export contract including
`Event Type (auto)`, `Status = New`, dormant, visible ID column, atomic write, backup, lock
failure and Dashboard widening (Task 11), the verification queue including bot-gated sources
(Task 12), the acceptance gate (Tasks 12, 13), and the founder review stop (Task 13).

**Known deviation:** `src/models.py` is not in the spec's tree. It holds the shared record
types to avoid a circular import between `parse`, `resolve`, `score` and `export`.

**Carried gap:** `EventLinqs_Verified_Seed_List.xlsx` is still missing, so no task consumes
it. Task 13's domain and venue output is the substitute seed, as the spec's known-gaps
section states.

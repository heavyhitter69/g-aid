import json
import asyncio
import re
import threading
import urllib.error
import urllib.request
from datetime import datetime
from typing import TypedDict, Annotated, Sequence, AsyncGenerator, Any
from langchain_core.messages import BaseMessage

# --- State Definition ---
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], lambda a, b: a + b]
    session_id: str
    current_agent: str
    artifacts: list[str]


ORCHESTRA_MODEL = "g-aid-orchestra"
BASE_MODEL = "deepseek-r1:8b"
_WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
_MONTHS = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)

IDENTITY = (
    "G-AID Orchestra chat is served by the desktop Ollama path "
    "(g-aid-orchestra / g-aid-orchestra-fast). This Python engine runs validated processing nodes only."
)
_MONTHS_SHORT = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_WEEKDAYS_SHORT = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

_resolved_model: str | None = None


def today_line() -> str:
    now = datetime.now()
    return f"{_WEEKDAYS[now.weekday()]}, {now.day} {_MONTHS[now.month - 1]} {now.year}"


_MONTH_INDEX = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3,
    "april": 4, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9, "october": 10,
    "oct": 10, "november": 11, "nov": 11, "december": 12, "dec": 12,
}
_MONTH_RE = (
    r"January|February|March|April|May|June|July|August|September|October|November|December|"
    r"Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"
)


def _is_leap(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def _month_starts(year: int) -> str:
    return ", ".join(
        f"{_MONTHS_SHORT[month]} {_WEEKDAYS_SHORT[datetime(year, month + 1, 1).weekday()]}"
        for month in range(12)
    )


def _years_from_prompt(prompt: str, now: datetime) -> list[int]:
    years = {now.year}
    for match in re.finditer(r"\b((?:19|20)\d{2})\b", prompt):
        years.add(int(match.group(1)))
    if re.search(r"\bnext year\b", prompt, re.I):
        years.add(now.year + 1)
    if re.search(r"\blast year\b", prompt, re.I):
        years.add(now.year - 1)
    return sorted(year for year in years if 1900 <= year <= 2100)[:6]


def _weekday_line(year: int, month: int, day: int) -> str:
    try:
        date = datetime(year, month, day)
    except ValueError:
        return ""
    return f"{date.day} {_MONTHS[date.month - 1]} {date.year} is a {_WEEKDAYS[date.weekday()]}"


def _named_weekdays(prompt: str, years: list[int]) -> list[str]:
    lines: list[str] = []
    seen: set[str] = set()

    def add(year: int, month: int, day: int) -> None:
        line = _weekday_line(year, month, day)
        if line and line not in seen:
            seen.add(line)
            lines.append(line)

    for match in re.finditer(
        rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+({_MONTH_RE})(?:\s*,?\s*)((?:19|20)\d{{2}})\b",
        prompt,
        re.I,
    ):
        add(int(match.group(3)), _MONTH_INDEX[match.group(2).lower()], int(match.group(1)))
    for match in re.finditer(
        rf"\b({_MONTH_RE})\s+(\d{{1,2}})(?:st|nd|rd|th)?(?:,)?\s+((?:19|20)\d{{2}})\b",
        prompt,
        re.I,
    ):
        add(int(match.group(3)), _MONTH_INDEX[match.group(1).lower()], int(match.group(2)))
    for match in re.finditer(r"\b((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})\b", prompt):
        add(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    if re.search(r"ghana\s+independence", prompt, re.I):
        for year in years:
            add(year, 3, 6)
    return lines[:8]


def calendar_facts(prompt: str = "") -> str:
    now = datetime.now()
    years = _years_from_prompt(prompt, now)
    parts = [
        f"Today is {today_line()}.",
        f'The current year is {now.year}. "This year" means {now.year}.',
    ]
    for year in years:
        leap_txt = "is" if _is_leap(year) else "is not"
        parts.append(f"{year} {leap_txt} a leap year.")
        parts.append(f"Weekday of the 1st of each month in {year}: {_month_starts(year)}.")
    named = _named_weekdays(prompt, years)
    if named:
        parts.append("Exact weekdays: " + "; ".join(named) + ".")
    parts.append("A holiday on another date has its own weekday; do not reuse today's weekday.")
    return " ".join(parts)


def orchestra_system(prompt: str = "") -> str:
    return f"{IDENTITY}\n{calendar_facts(prompt)}"


def wants_think(prompt: str) -> bool:
    markers = (
        "--- File Context ---",
        "--- Workspace ---",
        "GROUND TRUTH",
        "Implementation Plan",
        "PLAN MODE",
    )
    return any(marker in prompt for marker in markers) or len(prompt) > 1200


def _listed_models() -> list[str]:
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8") or "{}")
        return [str(entry.get("name") or "") for entry in data.get("models") or []]
    except Exception:
        return []


def _has_model(names: list[str], want: str) -> bool:
    return any(name == want or name.startswith(f"{want}:") for name in names)


def ensure_orchestra_model() -> str:
    global _resolved_model
    if _resolved_model:
        return _resolved_model
    names = _listed_models()
    if _has_model(names, ORCHESTRA_MODEL):
        _resolved_model = ORCHESTRA_MODEL
        return _resolved_model
    if not _has_model(names, BASE_MODEL) and not any(name.startswith("deepseek-r1") for name in names):
        _resolved_model = BASE_MODEL
        return _resolved_model
    payload = {
        "model": ORCHESTRA_MODEL,
        "from": BASE_MODEL,
        "system": IDENTITY,
        "stream": False,
        "parameters": {"temperature": 0.2, "num_ctx": 8192},
    }
    req = urllib.request.Request(
        "http://127.0.0.1:11434/api/create",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            resp.read()
        _resolved_model = ORCHESTRA_MODEL
    except Exception:
        _resolved_model = BASE_MODEL
    return _resolved_model

THOUGHT_ECHO = re.compile(
    r"(?i)("
    r"you are g-aid|"
    r"never say you are|"
    r"deepseek|"
    r"chatgpt|"
    r"ollama|"
    r"if asked who you are|"
    r"the user (says|said|asked|prompt|is asking)|"
    r"okay, the user|"
    r"system prompt|"
    r"do not mention|"
    r"plan mode\.|"
    r"ground truth workspace|"
    r"do not paste|"
    r"implementation plan tab"
    r")"
)


def clean_thought(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"</?(?:think|思考)>", "", text, flags=re.I)
    kept = []
    for line in text.splitlines():
        if THOUGHT_ECHO.search(line):
            continue
        kept.append(line)
    return "\n".join(kept)


async def wait_for_ollama(timeout_sec: float = 20.0) -> None:
    deadline = asyncio.get_event_loop().time() + timeout_sec
    while True:
        try:
            urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=1).read()
            return
        except (urllib.error.URLError, TimeoutError, OSError):
            if asyncio.get_event_loop().time() >= deadline:
                raise RuntimeError("Ollama is not running on 127.0.0.1:11434")
            await asyncio.sleep(0.2)


def _put(loop: asyncio.AbstractEventLoop, queue: asyncio.Queue, item: Any) -> None:
    loop.call_soon_threadsafe(queue.put_nowait, item)


def _ollama_worker(prompt: str, loop: asyncio.AbstractEventLoop, queue: asyncio.Queue) -> None:
    payload = {
        "model": ensure_orchestra_model(),
        "messages": [
            {"role": "system", "content": orchestra_system(prompt)},
            {"role": "user", "content": prompt},
        ],
        "stream": True,
        "think": wants_think(prompt),
        "keep_alive": "60m",
        "options": {
            "temperature": 0.2,
            "num_ctx": 8192,
        },
    }
    req = urllib.request.Request(
        "http://127.0.0.1:11434/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            for raw in resp:
                if not raw:
                    continue
                try:
                    data = json.loads(raw.decode("utf-8"))
                except json.JSONDecodeError:
                    continue
                message = data.get("message") or {}
                _put(
                    loop,
                    queue,
                    (
                        "chunk",
                        clean_thought(message.get("thinking") or ""),
                        message.get("content") or "",
                    ),
                )
                if data.get("done"):
                    break
        _put(loop, queue, ("done", "", ""))
    except urllib.error.HTTPError as exc:
        if exc.code == 400 and payload.get("think"):
            payload.pop("think", None)
            _ollama_worker(prompt, loop, queue)
            return
        _put(loop, queue, ("error", str(exc), ""))
    except Exception as exc:
        _put(loop, queue, ("error", str(exc), ""))


async def stream_langgraph_agent(prompt: str, session_id: str) -> AsyncGenerator[bytes, None]:
    del prompt, session_id
    preamble = {
        "agentId": "orchestrator-agent",
        "confidence": 0,
        "showConfidence": False,
        "capabilityTrace": [],
        "rulesMatched": [],
        "epistemicTypesProduced": [],
    }
    yield b"\x00" + json.dumps(preamble).encode("utf-8") + b"\n"
    yield (
        "I'm G-AID. This Python engine does not serve G-AID Orchestra chat. "
        "Chat uses local Ollama aliases g-aid-orchestra (DeepSeek) and "
        "g-aid-orchestra-fast (Qwen). I will not substitute another model."
    ).encode("utf-8")
    yield b"\n\x02" + json.dumps({"type": "error", "message": "orchestra_chat_disabled"}) + b"\n"

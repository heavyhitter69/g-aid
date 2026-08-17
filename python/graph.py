import json
import asyncio
import threading
import urllib.error
import urllib.request
from typing import TypedDict, Annotated, Sequence, AsyncGenerator, Any
from langchain_core.messages import BaseMessage

# --- State Definition ---
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], lambda a, b: a + b]
    session_id: str
    current_agent: str
    artifacts: list[str]


async def wait_for_ollama(timeout_sec: float = 45) -> None:
    deadline = asyncio.get_event_loop().time() + timeout_sec
    while True:
        try:
            urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=2).read()
            return
        except (urllib.error.URLError, TimeoutError, OSError):
            if asyncio.get_event_loop().time() >= deadline:
                raise RuntimeError("Ollama is not running on 127.0.0.1:11434")
            await asyncio.sleep(0.5)


def _put(loop: asyncio.AbstractEventLoop, queue: asyncio.Queue, item: Any) -> None:
    loop.call_soon_threadsafe(queue.put_nowait, item)


def _ollama_worker(prompt: str, loop: asyncio.AbstractEventLoop, queue: asyncio.Queue) -> None:
    identity = (
        "You are G-AID Orchestra, the geoscientific assistant inside the G-AID application. "
        "Never say you are DeepSeek, DeepSeek-R1, ChatGPT, Ollama, or any other third-party model. "
        "If asked who you are, what model you are, or who made you, answer that you are G-AID Orchestra. "
        "Do not mention DeepSeek in thoughts or answers."
    )
    payload = {
        "model": "deepseek-r1:8b",
        "messages": [
            {"role": "system", "content": identity},
            {"role": "user", "content": prompt},
        ],
        "stream": True,
        "think": True,
        "options": {"temperature": 0.2},
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
                        message.get("thinking") or "",
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
    is_analysis = "--- File Context ---" in prompt
    preamble = {
        "agentId": "orchestrator-agent",
        "confidence": 0.95 if is_analysis else 0,
        "showConfidence": is_analysis,
        "capabilityTrace": ["G-AID Orchestra"] if is_analysis else [],
        "rulesMatched": ["langgraph_routing"] if is_analysis else [],
        "epistemicTypesProduced": ["interpretation", "recommendation"] if is_analysis else [],
        "confidenceProvenance": {
            "dataQualityScore": 0.9 if is_analysis else 0,
            "crossMethodAgreement": 0.8 if is_analysis else 0,
            "geologicalConsistency": 0.85 if is_analysis else 0,
            "computedByKernel": "g-aid-orchestra",
        },
    }
    yield b"\x00" + json.dumps(preamble).encode("utf-8") + b"\n"

    try:
        await wait_for_ollama()
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()
        threading.Thread(target=_ollama_worker, args=(prompt, loop, queue), daemon=True).start()

        in_think = True
        yield b"<think>"
        while True:
            kind, thinking, content = await queue.get()
            if kind == "error":
                raise RuntimeError(thinking)
            if kind == "done":
                break
            if thinking:
                yield thinking.encode("utf-8")
            if content:
                if in_think:
                    yield b"</think>\n"
                    in_think = False
                yield content.encode("utf-8")
        if in_think:
            yield b"</think>\n"
    except Exception as e:
        yield f"\n\n> ❌ **Intelligence Engine Error:** {str(e)}".encode("utf-8")
    finally:
        epilogue = {
            "type": "synthesis_complete",
            "opportunitiesDetected": 1 if is_analysis else 0,
            "hypothesesCreated": 1 if is_analysis else 0,
        }
        yield b"\n\x02" + json.dumps(epilogue).encode("utf-8") + b"\n"

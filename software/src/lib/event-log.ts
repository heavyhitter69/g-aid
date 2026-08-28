/**
 * event-log.ts
 * Append-only scientific event store.
 * State is NEVER mutated — only events are appended.
 * Full provenance, replay, and undo are free by design.
 */

import type { ScientificEvent, ScientificEventType, ActorId } from "@/types/scientific";

let globalSequence = 0;

function generateId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export class ScientificEventLog {
  private events: ScientificEvent[] = [];
  private currentSessionId: string;
  private currentCorrelationId: string;

  constructor(sessionId?: string) {
    this.currentSessionId = sessionId ?? `session_${Date.now()}`;
    this.currentCorrelationId = generateCorrelationId();
  }

  // ─── Write ──────────────────────────────────────────────────────────────────

  append<T>(
    type: ScientificEventType,
    actorId: ActorId,
    payload: T,
    causationEventId?: string
  ): ScientificEvent<T> {
    const event: ScientificEvent<T> = {
      id: generateId(),
      sequenceNumber: ++globalSequence,
      type,
      actorId,
      timestamp: new Date().toISOString(),
      sessionId: this.currentSessionId,
      payload,
      causationEventId: causationEventId ?? null,
      correlationId: this.currentCorrelationId,
    };
    this.events.push(event);
    return event;
  }

  /** Begin a new correlation group (e.g. new agent turn) */
  startCorrelation(): string {
    this.currentCorrelationId = generateCorrelationId();
    return this.currentCorrelationId;
  }

  // ─── Read ───────────────────────────────────────────────────────────────────

  getAll(): ScientificEvent[] {
    return [...this.events];
  }

  getSince(sequenceNumber: number): ScientificEvent[] {
    return this.events.filter((e) => e.sequenceNumber > sequenceNumber);
  }

  getByType(type: ScientificEventType): ScientificEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  getByTypes(types: ScientificEventType[]): ScientificEvent[] {
    const typeSet = new Set(types);
    return this.events.filter((e) => typeSet.has(e.type));
  }

  getByCorrelation(correlationId: string): ScientificEvent[] {
    return this.events.filter((e) => e.correlationId === correlationId);
  }

  getByCausation(causationEventId: string): ScientificEvent[] {
    return this.events.filter((e) => e.causationEventId === causationEventId);
  }

  /** Get causal chain starting from an event (BFS) */
  getCausalChain(rootEventId: string, maxDepth = 10): ScientificEvent[] {
    const result: ScientificEvent[] = [];
    const frontier = [rootEventId];
    const visited = new Set<string>();

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
      const nextFrontier: string[] = [];
      for (const eventId of frontier) {
        if (visited.has(eventId)) continue;
        visited.add(eventId);
        const children = this.getByCausation(eventId);
        result.push(...children);
        nextFrontier.push(...children.map((e) => e.id));
      }
      frontier.splice(0, frontier.length, ...nextFrontier);
    }

    return result;
  }

  getLatestSequenceNumber(): number {
    return this.events.length > 0
      ? this.events[this.events.length - 1].sequenceNumber
      : 0;
  }

  getCount(): number {
    return this.events.length;
  }

  // ─── Persistence ────────────────────────────────────────────────────────────

  serialize(): string {
    return JSON.stringify({
      sessionId: this.currentSessionId,
      globalSequenceAtExport: globalSequence,
      events: this.events,
    });
  }

  restore(json: string): void {
    try {
      const data = JSON.parse(json);
      this.currentSessionId = data.sessionId ?? this.currentSessionId;
      this.events = data.events ?? [];
      // Restore global sequence to avoid collisions
      if (data.globalSequenceAtExport) {
        globalSequence = Math.max(globalSequence, data.globalSequenceAtExport);
      }
    } catch (err) {
      console.error("[EventLog] Failed to restore from JSON:", err);
    }
  }

  /** Export provenance report — human-readable summary of all events */
  exportProvenanceReport(): string {
    const lines = [
      `# Scientific Event Provenance Report`,
      `Generated: ${new Date().toISOString()}`,
      `Total Events: ${this.events.length}`,
      `Session: ${this.currentSessionId}`,
      ``,
    ];

    for (const event of this.events) {
      lines.push(
        `[${event.sequenceNumber}] ${event.timestamp} | ${event.type} | by: ${event.actorId}` +
          (event.causationEventId ? ` | caused by: ${event.causationEventId}` : "")
      );
    }

    return lines.join("\n");
  }
}

// Singleton instance for the application
let _log: ScientificEventLog | null = null;

export function getEventLog(): ScientificEventLog {
  if (!_log) {
    _log = new ScientificEventLog();
    // Attempt to restore from localStorage
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("gaid-event-log");
      if (stored) {
        try {
          _log.restore(stored);
        } catch {
          // Corrupted storage — start fresh
        }
      }
    }
  }
  return _log;
}

export function resetEventLog(): void {
  _log = new ScientificEventLog();
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("gaid-event-log");
  }
}

export function persistEventLog(): void {
  if (typeof window !== "undefined" && _log) {
    try {
      window.localStorage.setItem("gaid-event-log", _log.serialize());
    } catch {
      // Storage quota exceeded — log warning
      console.warn("[EventLog] Could not persist event log — storage quota exceeded");
    }
  }
}

import type { CatalogInspection, CatalogRecord, DomainHint, MediaClass, SupportStatus } from "./types.ts";
import type { AdapterSniff, CatalogAdapter, SniffContext } from "./adapters/types.ts";
import { adapterRegistry } from "./registry.ts";

export interface Classification {
  adapter: CatalogAdapter | null;
  sniff: AdapterSniff | null;
  inspect: CatalogInspection;
  supportStatus: SupportStatus;
  adapterId: string | null;
  formatId: string;
  mediaClass: MediaClass;
  domainHint: DomainHint;
  sniffConfidence: number;
  method: CatalogRecord["provenance"]["method"];
}

export function classifyPeek(ctx: SniffContext): Classification {
  for (const adapter of adapterRegistry()) {
    const sniff = adapter.sniff(ctx);
    if (!sniff) continue;
    const inspect = adapter.inspect(ctx, sniff);
    const method = adapter.supportStatus === "supported" ? "adapter-sniff" : "format-sniff";
    return {
      adapter,
      sniff,
      inspect,
      supportStatus: adapter.supportStatus,
      adapterId: adapter.id,
      formatId: sniff.formatId || adapter.formatId,
      mediaClass: sniff.mediaClass,
      domainHint: sniff.domainHint,
      sniffConfidence: sniff.confidence,
      method,
    };
  }
  return {
    adapter: null,
    sniff: null,
    inspect: {},
    supportStatus: "unknown",
    adapterId: null,
    formatId: "unknown",
    mediaClass: "unknown",
    domainHint: "unknown",
    sniffConfidence: 0,
    method: "unknown",
  };
}

export function isSupportedProcessingRecord(record: Pick<CatalogRecord, "supportStatus" | "adapterId">): boolean {
  return record.supportStatus === "supported" && (record.adapterId === "magarrow" || record.adapterId === "gsm19");
}

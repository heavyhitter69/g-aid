import { firstLines, headerSummaryFromText } from "../peek-text.ts";
import {
  deferredRead,
  okIfSupported,
  type AdapterSniff,
  type CatalogAdapter,
  type CatalogInspection,
  type SniffContext,
} from "./types.ts";

const GSM19_HEADER = /time\s+nt\s+sq/i;

function gsm19Sniff(ctx: SniffContext): AdapterSniff | null {
  if (!GSM19_HEADER.test(ctx.peekText)) return null;
  return {
    confidence: 0.94,
    formatId: "gsm19",
    mediaClass: "tabular-text",
    domainHint: "magnetics",
    notes: ["Matched GSM-19 header contract (time nT sq)."],
  };
}

function gsm19Inspect(ctx: SniffContext): CatalogInspection {
  const header = firstLines(ctx.peekText, 40).join("\n");
  const idLine = firstLines(ctx.peekText, 40).find((line) => /\/id/i.test(line));
  return {
    columns: ["time", "nT", "sq"],
    headerSummary: headerSummaryFromText(idLine || header),
    units: "nT",
  };
}

export const gsm19Adapter: CatalogAdapter = {
  id: "gsm19",
  formatId: "gsm19",
  supportStatus: "supported",
  sniff: gsm19Sniff,
  inspect: gsm19Inspect,
  validate: (record) => okIfSupported(record, "gsm19"),
  read: () => deferredRead("gsm19"),
};

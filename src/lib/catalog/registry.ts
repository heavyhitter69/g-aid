import { magarrowAdapter } from "./adapters/magarrow.ts";
import { gsm19Adapter } from "./adapters/gsm19.ts";
import { gravityCsvAdapter, gravityXyzAdapter } from "./adapters/gravity.ts";
import { demAsciiAdapter } from "./adapters/dem.ts";
import { ertCsvAdapter, ertDatAdapter } from "./adapters/ert.ts";
import { radiometricCsvAdapter, radiometricSpectrumAdapter, radiometricXyzAdapter } from "./adapters/radio.ts";
import { gprCsvAdapter, gprDztAdapter } from "./adapters/gpr.ts";
import { recognisedAdapters } from "./adapters/recognised.ts";
import type { CatalogAdapter } from "./adapters/types.ts";

const adapters: CatalogAdapter[] = [
  magarrowAdapter,
  gsm19Adapter,
  gravityXyzAdapter,
  gravityCsvAdapter,
  demAsciiAdapter,
  ertDatAdapter,
  ertCsvAdapter,
  radiometricXyzAdapter,
  radiometricCsvAdapter,
  radiometricSpectrumAdapter,
  gprCsvAdapter,
  gprDztAdapter,
  ...recognisedAdapters,
];

export function adapterRegistry(): CatalogAdapter[] {
  return adapters;
}

export function getAdapter(id: string): CatalogAdapter | undefined {
  return adapters.find((adapter) => adapter.id === id);
}

export function supportedAdapterIds(): string[] {
  return adapters.filter((adapter) => adapter.supportStatus === "supported").map((adapter) => adapter.id);
}

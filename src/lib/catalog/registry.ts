import { magarrowAdapter } from "./adapters/magarrow.ts";
import { gsm19Adapter } from "./adapters/gsm19.ts";
import { gravityCsvAdapter, gravityXyzAdapter } from "./adapters/gravity.ts";
import { recognisedAdapters } from "./adapters/recognised.ts";
import type { CatalogAdapter } from "./adapters/types.ts";

const adapters: CatalogAdapter[] = [
  magarrowAdapter,
  gsm19Adapter,
  gravityXyzAdapter,
  gravityCsvAdapter,
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

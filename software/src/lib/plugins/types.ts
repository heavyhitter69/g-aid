export type PluginCategory = "reference" | "magnetics" | "space-weather" | "news" | "seismology";

export interface PluginManifest {
  id: string;
  name: string;
  publisher: string;
  version: string;
  category: PluginCategory;
  description: string;
  detail: string;
  match: RegExp;
  defaultEnabled: boolean;
  needsKey?: boolean;
  keyLabel?: string;
  network: boolean;
}

export interface PluginSecrets {
  newsApiKey?: string;
}

export interface PluginState {
  enabled: Record<string, boolean>;
  secrets: PluginSecrets;
}

export interface PluginNote {
  id: string;
  title: string;
  text: string;
}

export type PluginLookup = (query: string, secrets: PluginSecrets) => Promise<string>;

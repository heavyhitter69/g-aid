"use client";

import { useMemo, useState } from "react";
import { Puzzle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { PLUGIN_CATALOG, PLUGIN_CATEGORIES, isPluginEnabled } from "@/lib/plugins/catalog";
import type { PluginManifest } from "@/lib/plugins/types";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "relative h-[18px] w-[32px] shrink-0 rounded-full border transition-colors",
        on ? "bg-[#007acc] border-[#007acc]" : "bg-[#3c3c3c] border-[#3c3c3c]"
      )}
    >
      <span
        className={cn(
          "absolute top-[1px] h-[14px] w-[14px] rounded-full bg-white transition-transform",
          on ? "left-[15px]" : "left-[2px]"
        )}
      />
    </button>
  );
}

function PluginCard({
  plugin,
  compact,
  selected,
  onSelect,
}: {
  plugin: PluginManifest;
  compact?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { pluginState, setPluginEnabled } = useAppStore();
  const enabled = isPluginEnabled(plugin.id, pluginState?.enabled);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect?.();
      }}
      className={cn(
        "w-full text-left rounded border px-2 py-2 transition-colors cursor-pointer",
        selected ? "bg-[#2a2d2e] border-[#007acc]" : "bg-transparent border-transparent hover:bg-[#2a2d2e]"
      )}
    >
      <div className="flex items-start gap-2">
        <Puzzle className="h-4 w-4 mt-0.5 text-[#4ec9b0] shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-[#cccccc] font-medium truncate">{plugin.name}</span>
            <Toggle
              on={enabled}
              onClick={() => setPluginEnabled(plugin.id, !enabled)}
            />
          </div>
          <div className="text-[10px] text-[#858585] truncate">{plugin.publisher} · v{plugin.version}</div>
          {!compact && <p className="text-[11px] text-[#9d9d9d] mt-1 leading-snug">{plugin.description}</p>}
        </div>
      </div>
    </div>
  );
}

export function PluginStoreSidebar() {
  const { openWorkbenchTab, setWorkspaceView } = useAppStore();
  const [query, setQuery] = useState("");
  const plugins = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PLUGIN_CATALOG.filter(
      (plugin) =>
        !q ||
        plugin.name.toLowerCase().includes(q) ||
        plugin.description.toLowerCase().includes(q) ||
        plugin.publisher.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="h-full flex flex-col font-sans">
      <div className="px-3 pt-3 pb-2">
        <h3 className="text-xs font-bold uppercase text-[#858585] mb-2">Plugin Store</h3>
        <div className="relative">
          <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-[#858585]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search plugins"
            className="w-full bg-[#3c3c3c] text-[#cccccc] text-[11px] rounded pl-7 pr-2 py-1 outline-none border border-transparent focus:border-[#007acc]"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {plugins.map((plugin) => (
          <PluginCard
            key={plugin.id}
            plugin={plugin}
            compact
            onSelect={() => {
              openWorkbenchTab("extensions", "view", "Plugin Store");
              setWorkspaceView("extensions");
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function PluginStoreView() {
  const { pluginState, setPluginEnabled, setPluginSecret } = useAppStore();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | PluginManifest["category"]>("all");
  const [selectedId, setSelectedId] = useState(PLUGIN_CATALOG[0]?.id || "igrf");
  const selected = PLUGIN_CATALOG.find((plugin) => plugin.id === selectedId) || PLUGIN_CATALOG[0];
  const enabled = isPluginEnabled(selected.id, pluginState?.enabled);
  const plugins = PLUGIN_CATALOG.filter((plugin) => {
    if (category !== "all" && plugin.category !== category) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      plugin.name.toLowerCase().includes(q) ||
      plugin.description.toLowerCase().includes(q) ||
      plugin.publisher.toLowerCase().includes(q)
    );
  });

  return (
    <section className="h-full flex bg-[#1e1e1e] text-[#cccccc] font-sans">
      <div className="w-[280px] shrink-0 border-r border-[#2b2b2b] flex flex-col">
        <div className="p-3 border-b border-[#2b2b2b]">
          <div className="text-[13px] text-white font-medium mb-2">Plugin Store</div>
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-[#858585]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search IGRF, NOAA, news…"
              className="w-full bg-[#3c3c3c] text-[#cccccc] text-[12px] rounded pl-7 pr-2 py-1.5 outline-none border border-transparent focus:border-[#007acc]"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setCategory("all")}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded border",
                category === "all" ? "border-[#007acc] text-white" : "border-[#3c3c3c] text-[#858585]"
              )}
            >
              All
            </button>
            {PLUGIN_CATEGORIES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setCategory(entry.id)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded border",
                  category === entry.id ? "border-[#007acc] text-white" : "border-[#3c3c3c] text-[#858585]"
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {plugins.map((plugin) => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              selected={plugin.id === selected.id}
              onSelect={() => setSelectedId(plugin.id)}
            />
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl text-white font-semibold">{selected.name}</h2>
            <div className="text-[12px] text-[#858585] mt-1">
              {selected.publisher} · {selected.version} · {selected.network ? "Uses the network" : "Local"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPluginEnabled(selected.id, !enabled)}
            className={cn(
              "text-[12px] px-3 py-1.5 rounded",
              enabled ? "bg-[#3c3c3c] text-[#cccccc]" : "bg-[#007acc] text-white"
            )}
          >
            {enabled ? "Disable" : "Enable"}
          </button>
        </div>
        <p className="text-[13px] leading-relaxed text-[#cccccc] mb-4">{selected.detail}</p>
        <p className="text-[12px] text-[#9d9d9d] mb-6">
          G-AID only sends the chat question to a plugin, never survey files or folder paths. Disable a plugin here to stop it.
        </p>
        {selected.needsKey && (
          <label className="block max-w-md">
            <span className="text-[11px] text-[#858585] uppercase">{selected.keyLabel}</span>
            <input
              type="password"
              value={pluginState?.secrets?.newsApiKey || ""}
              onChange={(event) => setPluginSecret("newsApiKey", event.target.value)}
              placeholder="Optional — GDELT works without a key"
              className="mt-1 w-full bg-[#3c3c3c] text-[#cccccc] text-[12px] rounded px-2 py-1.5 outline-none border border-transparent focus:border-[#007acc]"
            />
          </label>
        )}
      </div>
    </section>
  );
}

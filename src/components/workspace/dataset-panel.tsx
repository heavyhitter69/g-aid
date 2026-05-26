"use client";

/**
 * dataset-panel.tsx
 * Dataset cards for the sidebar — shows loaded datasets with quality, overlap, and lineage info.
 * Uses view-model selectors only — no raw snapshot reads.
 */

import { useState } from "react";
import {
  Database, Layers, AlertTriangle, CheckCircle2, XCircle, HelpCircle,
  Minus, Plus, GitMerge, Link2, Lightbulb
} from "lucide-react";
import { useScientificState } from "@/store/scientific-state";
import { cn } from "@/lib/utils";
import type { DatasetCardViewModel } from "@/types/scientific";

const MODALITY_CONFIG: Record<string, { color: string; label: string; short: string }> = {
  magnetic:       { color: "#f15bb5", label: "Magnetics",   short: "MAG" },
  resistivity:    { color: "#3b9fd9", label: "Resistivity", short: "ERT" },
  gravity:        { color: "#fee440", label: "Gravity",     short: "GRAV" },
  seismic:        { color: "#00bbf9", label: "Seismic",     short: "SEIS" },
  "well-log":     { color: "#4ec9a0", label: "Well Log",    short: "LOG" },
  geochemical:    { color: "#9b5de5", label: "Geochem",     short: "GEO" },
  dem:            { color: "#858585", label: "DEM",         short: "DEM" },
  "remote-sensing": { color: "#f97316", label: "Remote Sensing", short: "RS" },
};

const QUALITY_CONFIG = {
  good:     { icon: CheckCircle2, color: "text-[#4ec9a0]", label: "Good" },
  moderate: { icon: AlertTriangle, color: "text-[#fee440]", label: "Moderate" },
  poor:     { icon: XCircle, color: "text-red-400", label: "Poor" },
  unknown:  { icon: HelpCircle, color: "text-[#555]", label: "Unknown" },
};

function DatasetCard({ vm }: { vm: DatasetCardViewModel }) {
  const [expanded, setExpanded] = useState(false);
  const modality = MODALITY_CONFIG[vm.modality] ?? { color: "#858585", label: vm.modality, short: "???" };
  const quality = QUALITY_CONFIG[vm.qualityLabel];
  const QualityIcon = quality.icon;

  return (
    <div className="rounded-lg border border-[#2b2b2b] bg-[#1e1e1e] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-2 hover:bg-[#252526] transition-colors text-left"
      >
        {/* Modality badge */}
        <span
          className="text-[8px] font-bold px-1.5 py-0.5 rounded font-mono shrink-0"
          style={{ background: `${modality.color}22`, color: modality.color }}
        >
          {modality.short}
        </span>

        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-[#cccccc] font-medium truncate">{vm.name}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <QualityIcon className={cn("h-2.5 w-2.5", quality.color)} />
            <span className={cn("text-[9px]", quality.color)}>{quality.label}</span>
            {vm.overlappingDatasetNames.length > 0 && (
              <span className="text-[9px] text-[#3b9fd9] flex items-center gap-0.5">
                <Link2 className="h-2 w-2" />
                {vm.overlappingDatasetNames.length} overlap
              </span>
            )}
            {vm.opportunityCount > 0 && (
              <span className="text-[9px] text-[#fee440] flex items-center gap-0.5">
                <Lightbulb className="h-2 w-2" />
                {vm.opportunityCount}
              </span>
            )}
          </div>
        </div>

        {expanded ? <Minus className="h-3 w-3 text-[#555] shrink-0" /> : <Plus className="h-3 w-3 text-[#555] shrink-0" />}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-[#2b2b2b] px-3 pb-3 pt-2 space-y-1.5 text-[9px]">
          <DetailRow label="CRS" value={vm.crs} />
          <DetailRow label="Units" value={vm.units} />
          <DetailRow label="Lineage" value={`${vm.lineageSteps} processing step${vm.lineageSteps !== 1 ? "s" : ""}`} />

          {vm.overlappingDatasetNames.length > 0 && (
            <div>
              <div className="text-[#555] mb-0.5">Spatial Overlaps</div>
              {vm.overlappingDatasetNames.map((name) => (
                <div key={name} className="flex items-center gap-1 text-[#3b9fd9]">
                  <GitMerge className="h-2.5 w-2.5" />
                  <span>{name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#555]">{label}</span>
      <span className="text-[#858585] font-mono">{value}</span>
    </div>
  );
}

export function DatasetPanel() {
  const { getDatasetCardsViewModel } = useScientificState();
  const datasets = getDatasetCardsViewModel();

  if (datasets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center space-y-2">
        <Database className="h-6 w-6 text-[#3c3c3c]" />
        <p className="text-[10px] text-[#555]">No datasets loaded</p>
        <p className="text-[9px] text-[#3c3c3c] max-w-[150px] leading-relaxed">
          Upload geophysical data to begin analysis
        </p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1.5">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-1.5 text-[10px] text-[#858585]">
          <Layers className="h-3 w-3" />
          <span className="font-medium">{datasets.length} dataset{datasets.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="text-[9px] text-[#555]">
          {datasets.filter((d) => d.overlappingDatasetNames.length > 0).length} overlapping
        </div>
      </div>
      {datasets.map((vm) => (
        <DatasetCard key={vm.id} vm={vm} />
      ))}
    </div>
  );
}

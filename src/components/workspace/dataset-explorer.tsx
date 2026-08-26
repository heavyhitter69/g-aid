"use client";

import { useAppStore } from "@/store/app-store";
import type { CatalogRecord, SupportStatus } from "@/lib/catalog/types";

function statusLabel(status: SupportStatus): string {
  if (status === "supported") return "supported";
  if (status === "recognised-unsupported") return "recognised-unsupported";
  return "unknown";
}

function statusClass(status: SupportStatus): string {
  if (status === "supported") return "text-emerald-400";
  if (status === "recognised-unsupported") return "text-amber-400";
  return "text-[#858585]";
}

function RecordRow({ record }: { record: CatalogRecord }) {
  const setMapFocus = useAppStore((s) => s.setMapFocus);
  const errors = record.parseErrors?.join("; ");
  const spatial = record.mediaClass === "raster" || record.mediaClass === "vector";
  return (
    <tr
      className={`border-b border-[#3c3c3c] align-top ${spatial ? "cursor-pointer hover:bg-[#2a2d2e]" : ""}`}
      onClick={() => {
        if (!spatial) return;
        setMapFocus({ catalogId: record.id, path: record.relativePath });
      }}
    >
      <td className="px-3 py-2 font-mono text-xs text-[#cccccc]">
        <div className="truncate max-w-[28rem]" title={record.relativePath}>
          {record.relativePath}
        </div>
        <div className="text-[10px] text-[#6a6a6a]">{record.id}</div>
      </td>
      <td className={`px-3 py-2 text-xs whitespace-nowrap ${statusClass(record.supportStatus)}`}>
        {statusLabel(record.supportStatus)}
      </td>
      <td className="px-3 py-2 text-xs text-[#cccccc] whitespace-nowrap">
        {record.formatId}
        <div className="text-[10px] text-[#858585]">{record.mediaClass}</div>
      </td>
      <td className="px-3 py-2 text-xs text-[#858585]">{record.sniffConfidence.toFixed(2)}</td>
      <td className="px-3 py-2 text-xs text-[#f0c674] max-w-[20rem]">
        {errors || "—"}
      </td>
    </tr>
  );
}

export function DatasetExplorer() {
  const catalog = useAppStore((s) => s.projectCatalog);
  const workspaceRoot = useAppStore((s) => s.workspaceRoot);

  if (!workspaceRoot) {
    return (
      <section className="p-6 bg-[#1e1e1e] h-full text-[#cccccc]">
        <h2 className="text-lg font-semibold mb-4 text-white">Dataset Explorer</h2>
        <p className="text-sm text-[#858585]">Open a survey folder to build the project catalog. G-AID does not ship sample datasets.</p>
      </section>
    );
  }

  if (!catalog) {
    return (
      <section className="p-6 bg-[#1e1e1e] h-full text-[#cccccc]">
        <h2 className="text-lg font-semibold mb-4 text-white">Dataset Explorer</h2>
        <p className="text-sm text-[#858585]">
          Catalog not ready yet. Opening a folder writes <span className="font-mono">G-AID Output/project.catalog.json</span>.
        </p>
      </section>
    );
  }

  const supported = catalog.records.filter((r) => r.supportStatus === "supported").length;
  const recognised = catalog.records.filter((r) => r.supportStatus === "recognised-unsupported").length;
  const unknown = catalog.records.filter((r) => r.supportStatus === "unknown").length;

  return (
    <section className="p-6 bg-[#1e1e1e] h-full text-[#cccccc] overflow-auto">
      <h2 className="text-lg font-semibold mb-2 text-white">Dataset Explorer</h2>
      <p className="text-sm text-[#858585] mb-4">
        {catalog.records.length} source files
        {catalog.truncated ? " (truncated)" : ""}. Supported {supported}, recognised-unsupported {recognised}, unknown {unknown}.
        Mixed folders do not start a magnetic workflow. Only supported MagArrow and GSM-19 records can be processing inputs.
        Click a raster or vector row to locate it on the map workspace. Shapefile, LAS, and SEG-Y will not decode as map layers.
      </p>
      {catalog.records.length === 0 ? (
        <p className="text-sm text-[#858585]">No source files were catalogued in this folder.</p>
      ) : (
        <table className="w-full text-left border border-[#3c3c3c] rounded overflow-hidden">
          <thead className="bg-[#252526] text-[11px] uppercase tracking-wide text-[#858585]">
            <tr>
              <th className="px-3 py-2 font-medium">File</th>
              <th className="px-3 py-2 font-medium">Support</th>
              <th className="px-3 py-2 font-medium">Format / media</th>
              <th className="px-3 py-2 font-medium">Confidence</th>
              <th className="px-3 py-2 font-medium">Parse errors</th>
            </tr>
          </thead>
          <tbody>
            {catalog.records.map((record) => (
              <RecordRow key={record.id} record={record} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

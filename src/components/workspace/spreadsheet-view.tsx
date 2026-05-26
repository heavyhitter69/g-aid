"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  cellAddress,
  columnLabel,
  isJsonGridContent,
  parseSpreadsheetRows,
  serializeToCsv,
} from "@/lib/parse-spreadsheet";
import { EDITOR_PREVIEW_ROW_CAP } from "@/lib/read-file-content";

const MIN_COLS = 18;
const MIN_ROWS = 40;
const DEFAULT_COL_W = 96;
const DEFAULT_ROW_H = 22;
const HEADER_W = 40;

type CellPos = { row: number; col: number };
type Selection = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};

interface SpreadsheetViewProps {
  filePath: string;
  content: string;
  onChange: (value: string) => void;
}

function normalizeSelection(a: CellPos, b: CellPos): Selection {
  return {
    startRow: Math.min(a.row, b.row),
    startCol: Math.min(a.col, b.col),
    endRow: Math.max(a.row, b.row),
    endCol: Math.max(a.col, b.col),
  };
}

function inSelection(row: number, col: number, sel: Selection): boolean {
  return (
    row >= sel.startRow &&
    row <= sel.endRow &&
    col >= sel.startCol &&
    col <= sel.endCol
  );
}

function selectionSize(sel: Selection) {
  return {
    rows: sel.endRow - sel.startRow + 1,
    cols: sel.endCol - sel.startCol + 1,
  };
}

export function SpreadsheetView({
  filePath,
  content,
  onChange,
}: SpreadsheetViewProps) {
  const fileName = filePath.split("/").pop() ?? filePath;
  const isJson = isJsonGridContent(content);
  const gridRef = useRef<HTMLDivElement>(null);

  const parsedRows = useMemo(
    () => parseSpreadsheetRows(content, filePath),
    [content, filePath]
  );

  const [selection, setSelection] = useState<Selection>({
    startRow: 0,
    startCol: 0,
    endRow: 0,
    endCol: 0,
  });
  const [colWidths, setColWidths] = useState<number[]>([]);
  const [rowHeights, setRowHeights] = useState<number[]>([]);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const [editingCell, setEditingCell] = useState<CellPos | null>(null);
  const [editValue, setEditValue] = useState("");
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const colCount = useMemo(() => {
    const dataCols = parsedRows.reduce((m, r) => Math.max(m, r.length), 0);
    return Math.max(MIN_COLS, dataCols);
  }, [parsedRows]);

  const rowCount = useMemo(
    () => Math.max(MIN_ROWS, parsedRows.length),
    [parsedRows]
  );

  const displayRowCount = Math.min(rowCount, EDITOR_PREVIEW_ROW_CAP);
  const capped = parsedRows.length > EDITOR_PREVIEW_ROW_CAP;

  useEffect(() => {
    setSelection({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
    setColWidths(Array.from({ length: colCount }, () => DEFAULT_COL_W));
    setRowHeights(Array.from({ length: displayRowCount }, () => DEFAULT_ROW_H));
    setEditingCell(null);
  }, [filePath, colCount, displayRowCount]);

  const getColWidth = (col: number) => colWidths[col] ?? DEFAULT_COL_W;
  const getRowHeight = (row: number) => rowHeights[row] ?? DEFAULT_ROW_H;

  const getCell = (row: number, col: number): string =>
    parsedRows[row]?.[col] ?? "";

  const commitRows = useCallback(
    (rows: string[][]) => {
      if (isJson) onChange(JSON.stringify(rows));
      else onChange(serializeToCsv(rows));
    },
    [onChange, isJson]
  );

  const setCell = useCallback(
    (row: number, col: number, value: string) => {
      const next = parsedRows.map((r) => [...r]);
      while (next.length <= row) next.push([]);
      while (next[row].length <= col) next[row].push("");
      next[row][col] = value;
      commitRows(next);
    },
    [parsedRows, commitRows]
  );

  const fillRange = useCallback(
    (sel: Selection, sourceValue: string) => {
      const next = parsedRows.map((r) => [...r]);
      for (let r = sel.startRow; r <= sel.endRow; r++) {
        while (next.length <= r) next.push([]);
        for (let c = sel.startCol; c <= sel.endCol; c++) {
          while (next[r].length <= c) next[r].push("");
          next[r][c] = sourceValue;
        }
      }
      commitRows(next);
    },
    [parsedRows, commitRows]
  );

  const activeRow = selection.startRow;
  const activeCol = selection.startCol;
  const activeValue = getCell(activeRow, activeCol);
  const activeRef = cellAddress(activeRow, activeCol);
  const selectCell = (row: number, col: number, extend = false) => {
    if (extend) {
      setSelection((s) =>
        normalizeSelection({ row: s.startRow, col: s.startCol }, { row, col })
      );
    } else {
      setSelection(normalizeSelection({ row, col }, { row, col }));
    }
    setEditingCell(null);
  };

  const selectColumn = (col: number) => {
    setSelection({
      startRow: 0,
      startCol: col,
      endRow: displayRowCount - 1,
      endCol: col,
    });
    setEditingCell(null);
  };

  const selectRow = (row: number) => {
    setSelection({
      startRow: row,
      startCol: 0,
      endRow: row,
      endCol: colCount - 1,
    });
    setEditingCell(null);
  };

  const startColResize = (col: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = getColWidth(col);

    const onMove = (ev: MouseEvent) => {
      const w = Math.max(48, startW + (ev.clientX - startX));
      setColWidths((prev) => {
        const next = [...prev];
        while (next.length <= col) next.push(DEFAULT_COL_W);
        next[col] = w;
        return next;
      });
      const chars = (w / 7).toFixed(2);
      setTooltip({
        x: ev.clientX + 12,
        y: ev.clientY + 12,
        text: `Width: ${chars} (${w} pixels)`,
      });
    };

    const onUp = () => {
      setTooltip(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startRowResize = (row: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = getRowHeight(row);

    const onMove = (ev: MouseEvent) => {
      const h = Math.max(16, startH + (ev.clientY - startY));
      setRowHeights((prev) => {
        const next = [...prev];
        while (next.length <= row) next.push(DEFAULT_ROW_H);
        next[row] = h;
        return next;
      });
      const pts = (h * 0.72).toFixed(2);
      setTooltip({
        x: ev.clientX + 12,
        y: ev.clientY + 12,
        text: `Height: ${pts} (${h} pixels)`,
      });
    };

    const onUp = () => {
      setTooltip(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startFillDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const anchor = {
      row: selectionRef.current.startRow,
      col: selectionRef.current.startCol,
    };
    const source = getCell(anchor.row, anchor.col);

    const onMove = (ev: MouseEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const cell = el?.closest("[data-cell]");
      if (cell instanceof HTMLElement) {
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        if (!Number.isNaN(row) && !Number.isNaN(col)) {
          const next = normalizeSelection(anchor, { row, col });
          selectionRef.current = next;
          setSelection(next);
        }
      }
    };

    const onUp = () => {
      fillRange(selectionRef.current, source);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const beginEdit = (row: number, col: number) => {
    setEditingCell({ row, col });
    setEditValue(getCell(row, col));
    selectCell(row, col);
  };

  const commitEdit = () => {
    if (editingCell) {
      setCell(editingCell.row, editingCell.col, editValue);
      setEditingCell(null);
    }
  };

  const { rows: selRows, cols: selCols } = selectionSize(selection);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#f0f0f0] text-[#333] font-sans">
      {/* Formula bar */}
      <div className="shrink-0 flex items-stretch h-7 border-b border-[#d4d4d4] bg-[#f0f0f0]">
        <div className="w-14 shrink-0 flex items-center justify-center text-[11px] font-medium border-r border-[#d4d4d4] bg-white text-[#333]">
          {activeRef}
        </div>
        <div className="w-6 shrink-0 flex items-center justify-center text-[10px] text-[#666] border-r border-[#d4d4d4]">
          fx
        </div>
        <input
          type="text"
          value={editingCell ? editValue : activeValue}
          onChange={(e) => {
            if (editingCell) setEditValue(e.target.value);
            else setCell(activeRow, activeCol, e.target.value);
          }}
          onFocus={() => {
            if (!editingCell) beginEdit(activeRow, activeCol);
          }}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitEdit();
              selectCell(Math.min(activeRow + 1, displayRowCount - 1), activeCol);
            }
          }}
          className="flex-1 min-w-0 px-2 text-[12px] bg-white border-0 outline-none"
        />
      </div>

      {capped && (
        <div className="shrink-0 bg-[#fff4ce] text-[#333] text-[11px] px-3 py-0.5 border-b border-[#d4d4d4]">
          Showing first {EDITOR_PREVIEW_ROW_CAP} of {parsedRows.length} rows.
        </div>
      )}

      <div ref={gridRef} className="flex-1 min-h-0 overflow-auto bg-[#e8e8e8] relative spreadsheet-container">
        <table
          className="border-collapse text-[11px] spreadsheet-grid"
          style={{ tableLayout: "fixed" }}
        >
          <thead className="sticky top-0 z-20">
            <tr>
              <th
                className="sticky left-0 z-30 bg-[#f0f0f0] border border-[#d4d4d4]"
                style={{ width: HEADER_W, height: DEFAULT_ROW_H }}
              />
              {Array.from({ length: colCount }).map((_, col) => {
                const colSelected =
                  selection.startCol <= col &&
                  selection.endCol >= col &&
                  selection.startRow === 0 &&
                  selection.endRow === displayRowCount - 1;
                return (
                  <th
                    key={col}
                    className={cn(
                      "relative bg-[#f0f0f0] border border-[#d4d4d4] text-center text-[#333] font-normal p-0",
                      colSelected && "bg-[#217346] text-white"
                    )}
                    style={{
                      width: getColWidth(col),
                      minWidth: getColWidth(col),
                      height: DEFAULT_ROW_H,
                    }}
                  >
                    <button
                      type="button"
                      title="Select column"
                      className="w-full h-full flex items-center justify-center cursor-default hover:bg-black/5"
                      onClick={() => selectColumn(col)}
                    >
                      {columnLabel(col)}
                    </button>
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      className="absolute top-0 right-0 w-[5px] h-full cursor-col-resize z-40 hover:bg-[#217346]/30"
                      onMouseDown={(e) => startColResize(col, e)}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: displayRowCount }).map((_, row) => {
              const rowSelected =
                selection.startRow <= row &&
                selection.endRow >= row &&
                selection.startCol === 0 &&
                selection.endCol === colCount - 1;
              return (
                <tr key={row}>
                  <td
                    className={cn(
                      "sticky left-0 z-10 relative bg-[#f0f0f0] border border-[#d4d4d4] text-center text-[#333] p-0",
                      rowSelected && "bg-[#217346] text-white"
                    )}
                    style={{ width: HEADER_W, height: getRowHeight(row) }}
                  >
                    <button
                      type="button"
                      title="Select row"
                      className="w-full h-full flex items-center justify-center cursor-default hover:bg-black/5"
                      onClick={() => selectRow(row)}
                    >
                      {row + 1}
                    </button>
                    <div
                      role="separator"
                      aria-orientation="horizontal"
                      className="absolute left-0 bottom-0 w-full h-[5px] cursor-row-resize z-40 hover:bg-[#217346]/30"
                      onMouseDown={(e) => startRowResize(row, e)}
                    />
                  </td>
                  {Array.from({ length: colCount }).map((_, col) => {
                    const selected = inSelection(row, col, selection);
                    const isActive = row === activeRow && col === activeCol;
                    const isEditing =
                      editingCell?.row === row && editingCell?.col === col;

                    return (
                      <td
                        key={col}
                        data-cell
                        data-row={row}
                        data-col={col}
                        className={cn(
                          "relative p-0 border border-[#d4d4d4] cursor-cell",
                          selected && !isActive && "bg-[#e2efda]",
                          isActive && "bg-white"
                        )}
                        style={{
                          width: getColWidth(col),
                          height: getRowHeight(row),
                        }}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          selectCell(row, col, e.shiftKey);
                        }}
                        onDoubleClick={() => beginEdit(row, col)}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                commitEdit();
                                selectCell(
                                  Math.min(row + 1, displayRowCount - 1),
                                  col
                                );
                              }
                              if (e.key === "Escape") setEditingCell(null);
                            }}
                            className="absolute inset-0 w-full h-full px-1.5 text-[11px] border-2 border-[#217346] outline-none z-20"
                          />
                        ) : (
                          <div className="w-full h-full px-1.5 flex items-center overflow-hidden text-[11px] text-[#333] pointer-events-none">
                            {getCell(row, col)}
                          </div>
                        )}

                        {isActive && (
                          <div
                            className="absolute inset-0 pointer-events-none border-2 border-[#217346] z-10"
                            aria-hidden
                          />
                        )}

                        {row === selection.endRow &&
                          col === selection.endCol && (
                            <div
                              role="button"
                              tabIndex={0}
                              className="absolute -bottom-[3px] -right-[3px] w-[6px] h-[6px] bg-[#217346] border border-white z-30 cursor-crosshair pointer-events-auto"
                              onMouseDown={startFillDrag}
                              title="Drag to fill"
                            />
                          )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tooltip && (
        <div
          className="fixed z-[100] px-2 py-1 text-[11px] bg-[#fafafa] border border-[#ababab] rounded shadow-md text-[#217346] font-medium pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}

      <div className="shrink-0 flex items-center h-8 bg-[#f0f0f0] border-t border-[#d4d4d4] px-1 gap-0.5">
        <button
          type="button"
          className="h-6 px-3 text-[11px] font-medium bg-white border border-b-0 border-[#d4d4d4] rounded-t text-[#217346]"
        >
          Sheet1
        </button>
        <button
          type="button"
          className="h-5 w-5 flex items-center justify-center rounded-full border border-[#d4d4d4] bg-white text-[#666] hover:bg-[#e8e8e8] ml-1"
          aria-label="Add sheet"
        >
          <Plus className="h-3 w-3" />
        </button>
        <span className="ml-auto pr-2 text-[10px] text-[#888] truncate max-w-[40%]">
          {fileName}
          {selRows > 1 || selCols > 1
            ? ` · ${selRows}×${selCols} selected`
            : ""}
        </span>
      </div>
    </div>
  );
}

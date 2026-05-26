/** Excel-style column label: 0 → A, 25 → Z, 26 → AA */
export function columnLabel(index: number): string {
  let label = "";
  let n = index;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

export function cellAddress(row: number, col: number): string {
  return `${columnLabel(col)}${row + 1}`;
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let insideQuotes = false;
  let current = "";

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function detectDelimiter(firstLine: string, ext: string): string {
  if (ext === "tsv") return "\t";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (tabs > 0 && tabs >= commas) return "\t";
  if (semis > commas) return ";";
  return ",";
}

/** Parse CSV/TSV text or JSON grid (from xlsx loader) into rows. */
export function parseSpreadsheetRows(
  rawText: string,
  fileId?: string
): string[][] {
  let text = rawText.replace(/^\uFEFF/, "").trim();
  if (!text) return [];

  const trimmedStart = text.trimStart();
  if (
    trimmedStart.startsWith("[[") ||
    trimmedStart.startsWith('["') ||
    trimmedStart === "[]"
  ) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((row) =>
          Array.isArray(row)
            ? row.map((cell) =>
                cell !== null && cell !== undefined ? String(cell) : ""
              )
            : []
        );
      }
    } catch {
      // fall through to delimited parse
    }
  }

  if (text.startsWith("[") && !trimmedStart.startsWith("[[")) {
    return [[text]];
  }

  const ext = fileId?.split(".").pop()?.toLowerCase() ?? "";
  const lines = text.split(/\r?\n/);
  const delimiter = detectDelimiter(lines[0] ?? "", ext);

  return lines.map((line) => parseDelimitedLine(line, delimiter));
}

export function serializeToCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (
            cell.includes(",") ||
            cell.includes('"') ||
            cell.includes("\n") ||
            cell.includes("\r")
          ) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        })
        .join(",")
    )
    .join("\n");
}

export function isJsonGridContent(rawText: string): boolean {
  return rawText.trim().startsWith("[");
}

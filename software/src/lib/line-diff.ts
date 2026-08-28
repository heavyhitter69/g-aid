export type DiffRow = { kind: "equal" | "add" | "del"; text: string };

const MAX_DIFF_LINES = 800;

export function lineCounts(text: string): number {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

export function countLineDiff(previous: string, next: string): { additions: number; deletions: number } {
  const a = previous.split(/\r?\n/);
  const b = next.split(/\r?\n/);
  const countsA = new Map<string, number>();
  const countsB = new Map<string, number>();
  for (const line of a) countsA.set(line, (countsA.get(line) || 0) + 1);
  for (const line of b) countsB.set(line, (countsB.get(line) || 0) + 1);
  let additions = 0;
  let deletions = 0;
  const keys = new Set([...countsA.keys(), ...countsB.keys()]);
  for (const key of keys) {
    const ca = countsA.get(key) || 0;
    const cb = countsB.get(key) || 0;
    if (cb > ca) additions += cb - ca;
    if (ca > cb) deletions += ca - cb;
  }
  return { additions, deletions };
}

export function lineDiff(previous: string, next: string): DiffRow[] {
  const a = previous.split(/\r?\n/);
  const b = next.split(/\r?\n/);
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    const rows: DiffRow[] = [];
    for (const text of a.slice(0, 40)) rows.push({ kind: "del", text });
    if (a.length > 40) rows.push({ kind: "del", text: `… ${a.length - 40} more lines` });
    for (const text of b.slice(0, 40)) rows.push({ kind: "add", text });
    if (b.length > 40) rows.push({ kind: "add", text: `… ${b.length - 40} more lines` });
    return rows;
  }

  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ kind: "equal", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ kind: "del", text: a[i] });
      i += 1;
    } else {
      rows.push({ kind: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    rows.push({ kind: "del", text: a[i] });
    i += 1;
  }
  while (j < m) {
    rows.push({ kind: "add", text: b[j] });
    j += 1;
  }
  return rows;
}

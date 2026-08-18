import { execFileSync, spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { PipelineEvent, ScientificArtifact } from "@/pipeline/interfaces";

export interface NodeResult {
  artifacts: ScientificArtifact[];
  events: PipelineEvent[];
  success: boolean;
  error?: string;
}

function appRoot(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const cwd = /* turbopackIgnore: true */ process.cwd();
  if (resourcesPath) {
    const packaged = `${resourcesPath}${path.sep}app`;
    if (exists(`${packaged}${path.sep}python${path.sep}nodes`)) return packaged;
  }
  if (exists(`${cwd}${path.sep}python${path.sep}nodes`)) return cwd;
  const parentApp = path.join(cwd, "..");
  if (exists(`${parentApp}${path.sep}python${path.sep}nodes`)) return parentApp;
  return cwd;
}

function pythonDir(): string {
  return `${appRoot()}${path.sep}python`;
}

function exists(file: string): boolean {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

function engineDir(): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const cwd = process.cwd();
  const candidates = [
    resourcesPath ? path.join(resourcesPath, "g-aid-engine") : "",
    path.join(cwd, "..", "g-aid-engine"),
    path.join(cwd, "python", "dist", "g-aid-engine"),
    path.join(cwd, "resources", "g-aid-engine"),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (exists(path.join(dir, "g-aid-engine.exe")) || exists(path.join(dir, "g-aid-engine"))) {
      return dir;
    }
  }
  return null;
}

function isPackagedRuntime(): boolean {
  return Boolean(engineDir());
}

function isPoetryPath(value: string): boolean {
  return /pypoetry/i.test(value.replace(/\\/g, "/"));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function windowsUserPythons(): string[] {
  if (process.platform !== "win32") return [];
  const found: string[] = [];
  const root = path.join(os.homedir(), "AppData", "Local", "Programs", "Python");
  if (!exists(root)) return found;
  try {
    for (const name of fs.readdirSync(root)) {
      found.push(path.join(root, name, "python.exe"));
    }
  } catch {
    /* ignore */
  }
  return found;
}

function collectPythonCandidates(): string[] {
  const candidates: string[] = [];
  const envPython = process.env.GAID_PYTHON;
  if (envPython) candidates.push(envPython);

  const localVenv = path.join(pythonDir(), ".venv");
  candidates.push(
    path.join(localVenv, "Scripts", "python.exe"),
    path.join(localVenv, "bin", "python")
  );

  const engine = engineDir();
  if (engine) {
    candidates.push(
      path.join(engine, "python.exe"),
      path.join(engine, "_internal", "python.exe")
    );
  }

  candidates.push(...windowsUserPythons());

  if (!isPackagedRuntime()) {
    const home = os.homedir();
    const poetryRoot = path.join(home, "AppData", "Local", "pypoetry", "Cache", "virtualenvs");
    if (exists(poetryRoot)) {
      try {
        for (const name of fs.readdirSync(poetryRoot)) {
          if (!name.toLowerCase().includes("g-aid")) continue;
          candidates.push(
            path.join(poetryRoot, name, "Scripts", "python.exe"),
            path.join(poetryRoot, name, "bin", "python")
          );
        }
      } catch {
        /* ignore */
      }
    }
  }

  candidates.push("python", "py", "python3");
  return candidates;
}

function resolveNamedInterpreter(cmd: string): string | null {
  try {
    const out = execFileSync(cmd, ["-c", "import sys; print(sys.executable)"], {
      timeout: 8000,
      windowsHide: true,
      encoding: "utf8",
    })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .pop();
    if (out && !isPoetryPath(out)) return out;
  } catch {
    /* missing or blocked */
  }
  return null;
}

let cachedPython: string | null = null;

export function resolvePythonExecutable(): string {
  if (cachedPython) return cachedPython;
  for (const candidate of collectPythonCandidates()) {
    if (isPoetryPath(candidate)) continue;
    if (candidate === "python" || candidate === "py" || candidate === "python3") {
      const resolved = resolveNamedInterpreter(candidate);
      if (resolved) {
        cachedPython = resolved;
        return cachedPython;
      }
      continue;
    }
    if (exists(candidate)) {
      cachedPython = candidate;
      return cachedPython;
    }
  }
  cachedPython = process.platform === "win32" ? "python" : "python3";
  return cachedPython;
}

export function resolvePythonScript(scriptPath: string): string {
  if (path.isAbsolute(scriptPath)) return scriptPath;
  const root = appRoot();
  return `${root}${path.sep}${scriptPath.replace(/[\\/]/g, path.sep)}`;
}

function engineBase(): string {
  return process.env.GAID_ENGINE_URL?.trim() || "http://127.0.0.1:8000";
}

function httpDetail(parsed: { error?: string; detail?: unknown }): string | undefined {
  if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error;
  const detail = parsed.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) return String((item as { msg: unknown }).msg);
        return "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  return undefined;
}

function isMissingEngineRoute(status: number, message?: string): boolean {
  if (status === 404 || status === 405) return true;
  const text = (message || "").trim().toLowerCase();
  return text === "not found" || text === "method not allowed";
}

async function executeViaFastApi(
  nodeId: string,
  inputArtifacts: ScientificArtifact[],
  parameters: Record<string, unknown>
): Promise<NodeResult | null> {
  const attempts = isPackagedRuntime() ? 10 : 2;
  const url = `${engineBase()}/api/v1/run-node`;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node_id: nodeId,
          input_artifacts: inputArtifacts,
          parameters,
        }),
        signal: AbortSignal.timeout(120000),
      });
      const parsed = (await response.json().catch(() => ({}))) as NodeResult & {
        error?: string;
        detail?: unknown;
      };
      const message = httpDetail(parsed);
      if (!response.ok) {
        if (isMissingEngineRoute(response.status, message)) return null;
        return {
          artifacts: parsed.artifacts || [],
          events: parsed.events || [],
          success: false,
          error: message || `Engine HTTP ${response.status}`,
        };
      }
      return {
        artifacts: parsed.artifacts || [],
        events: parsed.events || [],
        success: parsed.success !== false,
        error: parsed.error,
      };
    } catch {
      if (i < attempts - 1) await sleep(400);
    }
  }
  return null;
}

function pythonPathEnv(pythonExe: string): string {
  const parts = [pythonDir(), path.join(pythonDir(), "_vendor")];
  const engine = engineDir();
  if (engine && pythonExe.toLowerCase().replace(/\\/g, "/").includes("/g-aid-engine/")) {
    parts.push(path.join(engine, "_internal"));
  }
  const existing = process.env.PYTHONPATH;
  if (existing) parts.push(existing);
  return parts.join(path.delimiter);
}

function executeViaSpawn(
  nodeId: string,
  scriptPath: string,
  inputArtifacts: ScientificArtifact[],
  parameters: Record<string, unknown>
): Promise<NodeResult> {
  return new Promise((resolve) => {
    const python = resolvePythonExecutable();
    const absScript = resolvePythonScript(scriptPath);
    if (!exists(absScript)) {
      resolve({
        artifacts: [],
        events: [],
        success: false,
        error: `Python node script not found: ${absScript}`,
      });
      return;
    }

    const payload = {
      node_id: nodeId,
      input_artifacts: inputArtifacts,
      parameters,
    };

    const child = spawn(python, [absScript], {
      cwd: pythonDir(),
      env: {
        ...process.env,
        PYTHONPATH: pythonPathEnv(python),
        PYTHONIOENCODING: "utf-8",
      },
      windowsHide: true,
    });

    let stdoutData = "";
    let errorMessage = "";

    child.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });
    child.stderr.on("data", (data) => {
      errorMessage += data.toString();
    });
    child.on("error", (err) => {
      resolve({
        artifacts: [],
        events: [],
        success: false,
        error: `Failed to start Python (${python}): ${err.message}`,
      });
    });
    child.on("close", (code) => {
      if (code !== 0 && !stdoutData.trim()) {
        resolve({
          artifacts: [],
          events: [],
          success: false,
          error: `Python process exited with code ${code}. Stderr: ${errorMessage}`,
        });
        return;
      }

      try {
        const lines = stdoutData.trim().split("\n");
        let parsedResult: NodeResult | null = null;
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            parsedResult = JSON.parse(lines[i]) as NodeResult;
            break;
          } catch {
            /* keep looking */
          }
        }

        if (!parsedResult) {
          resolve({
            artifacts: [],
            events: [],
            success: false,
            error: `No valid JSON returned from python node. stdout: ${stdoutData} stderr: ${errorMessage}`,
          });
          return;
        }

        resolve({
          artifacts: parsedResult.artifacts || [],
          events: parsedResult.events || [],
          success: parsedResult.success !== false && code === 0,
          error: parsedResult.error || (code === 0 ? undefined : errorMessage),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        resolve({
          artifacts: [],
          events: [],
          success: false,
          error: `Failed to parse python output: ${message}`,
        });
      }
    });

    child.stdin.write(JSON.stringify(payload) + "\n");
    child.stdin.end();
  });
}

export async function executePythonNode(
  nodeId: string,
  scriptPath: string,
  inputArtifacts: ScientificArtifact[],
  parameters: Record<string, unknown>
): Promise<NodeResult> {
  const viaApi = await executeViaFastApi(nodeId, inputArtifacts, parameters);
  if (viaApi) return viaApi;

  const spawned = await executeViaSpawn(nodeId, scriptPath, inputArtifacts, parameters);
  if (spawned.success) return spawned;

  const hint = isPackagedRuntime()
    ? " The bundled engine on port 8000 did not expose POST /api/v1/run-node (that is a missing API route, not missing survey files). Fully quit G-AID and reopen it. If this continues, testers need Python 3 with numpy and pandas on PATH — not a Poetry venv."
    : "";
  return {
    artifacts: spawned.artifacts || [],
    events: spawned.events || [],
    success: false,
    error: `${spawned.error || "Python node failed."}${hint}`,
  };
}

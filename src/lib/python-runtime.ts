import { spawn } from "child_process";
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

function collectPythonCandidates(): string[] {
  const candidates: string[] = [];
  const envPython = process.env.GAID_PYTHON || process.env.PYTHON;
  if (envPython) candidates.push(envPython);

  const localVenv = path.join(pythonDir(), ".venv");
  candidates.push(
    path.join(localVenv, "Scripts", "python.exe"),
    path.join(localVenv, "bin", "python")
  );

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

  candidates.push("python", "py", "python3");
  return candidates;
}

let cachedPython: string | null = null;

export function resolvePythonExecutable(): string {
  if (cachedPython) return cachedPython;
  for (const candidate of collectPythonCandidates()) {
    if (candidate === "python" || candidate === "py" || candidate === "python3") {
      cachedPython = candidate;
      return candidate;
    }
    if (exists(candidate)) {
      cachedPython = candidate;
      return candidate;
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

async function executeViaFastApi(
  nodeId: string,
  inputArtifacts: ScientificArtifact[],
  parameters: Record<string, unknown>
): Promise<NodeResult | null> {
  try {
    const response = await fetch("http://127.0.0.1:8000/api/v1/run-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        node_id: nodeId,
        input_artifacts: inputArtifacts,
        parameters,
      }),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const text = await response.text();
      return {
        artifacts: [],
        events: [],
        success: false,
        error: `FastAPI run-node ${response.status}: ${text}`,
      };
    }
    const parsed = (await response.json()) as NodeResult & { error?: string };
    return {
      artifacts: parsed.artifacts || [],
      events: parsed.events || [],
      success: parsed.success !== false,
      error: parsed.error,
    };
  } catch {
    return null;
  }
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
        PYTHONPATH: pythonDir(),
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
  return executeViaSpawn(nodeId, scriptPath, inputArtifacts, parameters);
}

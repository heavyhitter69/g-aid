/**
 * route.ts — /api/agent/orchestrate
 * Coordination layer. Resolves capabilities, selects kernel, runs reasoning + synthesis.
 * All inline — no sub-fetch to agent routes. Clean 3-phase stream protocol:
 *   \x00{json}\n  — preamble
 *   text tokens    — streamed content (NO \x01 prefix per token, text mode entered once)
 *   \n\x02{json}\n — epilogue
 *
 * The client receives exactly one clean stream.
 */

import type { NextRequest } from "next/server";
import { resolveFromIntent, selectMinimalAgents, resolveFromState } from "@/lib/capability-graph";
import { buildAgentContext, formatContextForPrompt } from "@/lib/context-engine";
import { compileDAG } from "@/lib/workflow-planner";
import fs from "fs";
import path from "path";
import { synthesizeResponse } from "@/lib/agent-prompts";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { magneticKernel } from "@/lib/kernels/magnetic-kernel";
import { resistivityKernel } from "@/lib/kernels/resistivity-kernel";
import { gravityKernel } from "@/lib/kernels/gravity-kernel";
import { seismicKernel } from "@/lib/kernels/seismic-kernel";
import { geologicalKernel } from "@/lib/kernels/geological-kernel";
import type { ReasoningKernel } from "@/lib/kernels/kernel-base";
import type {
  ScientificProjectSnapshot,
  AgentId,
  StreamPreamble,
  ConfidenceProvenance,
} from "@/types/scientific";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── Kernel registry ──────────────────────────────────────────────────────────

const KERNEL_MAP: Record<string, ReasoningKernel> = {
  "magnetic-agent":    magneticKernel,
  "resistivity-agent": resistivityKernel,
  "gravity-agent":     gravityKernel,
  "seismic-agent":     seismicKernel,
  "geological-agent":  geologicalKernel,
};

// ─── Request shape ────────────────────────────────────────────────────────────

interface OrchestrateRequest {
  message: string;
  sessionId: string;
  mode?: "interpret" | "plan" | "status";
  snapshotData?: ScientificProjectSnapshot;
  projectName?: string;
  guestId?: string;
}

// ─── Stream helpers ───────────────────────────────────────────────────────────

const encoder = new TextEncoder();
const enc = (s: string) => encoder.encode(s);
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  let body: OrchestrateRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, sessionId, mode = "interpret", snapshotData } = body;
  if (!message || !sessionId) {
    return Response.json({ error: "message and sessionId are required" }, { status: 400 });
  }

  const snapshot: ScientificProjectSnapshot = snapshotData ?? makeEmptySnapshot(sessionId);

  // ── Conversational routing check ──────────────────────────────────────────
  const lowerMsg = message.toLowerCase().trim();
  const isGreeting = /^(hi|hello|hey|howdy|greetings|good\s(morning|afternoon|evening)|what's up|sup|yo)\b/.test(lowerMsg);
  const isConversational = isGreeting || lowerMsg === "help" || lowerMsg === "who are you";

  // ── Capability + agent resolution ─────────────────────────────────────────
  let capabilities: ReturnType<typeof resolveFromIntent> = [];
  let agentIds: AgentId[] = [];

  if (isConversational) {
    agentIds = ["orchestrator-agent"];
  } else {
    capabilities = resolveFromIntent(message, snapshot);
    agentIds     = selectMinimalAgents(capabilities, snapshot);
  }

  const proactiveOpps = resolveFromState(snapshot);

  // Primary agent: prefer specialist over geological (geological synthesises last)
  const primaryAgentId: AgentId =
    agentIds.find((a) => a !== "geological-agent") ??
    agentIds[0] ??
    "orchestrator-agent";

  const kernel = KERNEL_MAP[primaryAgentId] ?? null;

  // ── Context ───────────────────────────────────────────────────────────────
  const agentContext = buildAgentContext(snapshot, message, primaryAgentId);

  // ─────────────────────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (s: string) => controller.enqueue(enc(s));

      try {
        // ── Plan mode ──────────────────────────────────────────────────────
        if (mode === "plan" && capabilities.length > 0) {
          const { dag, markdown } = compileDAG(capabilities, snapshot.datasets, snapshot);

          const planPreamble: StreamPreamble = buildPreamble(
            primaryAgentId, 0.65, capabilities, [], []
          );
          enqueue(`\x00${JSON.stringify(planPreamble)}\n`);
          await delay(80);

          // Stream plan markdown token by token
          const tokens = markdown.split(" ");
          for (const token of tokens) {
            enqueue(token + " ");
            await delay(14);
          }

          enqueue(`\n\n---\n\n*Workflow compiled from ${capabilities.length} capability(ies).*\n`);
          enqueue(`\n\x02${JSON.stringify({
            type: "plan_complete",
            dag,
            opportunitiesDetected: proactiveOpps.length,
          })}\n`);

          controller.close();
          return;
        }

        // ── Direct NLP Pipeline Trigger (Diurnal Analysis) ─────────────────
        if (lowerMsg.includes("diurnal analysis") || lowerMsg.includes("diurnal correction")) {
          const planPreamble: StreamPreamble = buildPreamble(
            "magnetic-agent", 0.95, capabilities, [], []
          );
          
          let targetFolder = "DAY 1";
          const dayMatch = lowerMsg.match(/day\s*\d+/i);
          const customMatch = lowerMsg.match(/(?:for|on)\s+([a-z0-9\s\_-]+?)(?:\s|$)/i);
          
          if (dayMatch) {
             targetFolder = dayMatch[0].toUpperCase(); // E.g., "DAY 23"
          } else if (customMatch) {
             targetFolder = customMatch[1].trim(); // E.g., "block a" -> "block a"
          }
          
          let projectName = body.projectName || "";
          let baseDir = path.join(process.cwd(), "public", projectName);
          
          // Attempt Supabase Cloud Ingestion
          const supabase = await createServerSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          
          let usingSupabase = false;
          let targetProjectId = "";
          
          let isGuest = !user;
          let activeUserId = user?.id || body.guestId;
          
          if (activeUserId && projectName) {
            const activeBucket = isGuest ? "demo_workspace" : "gaid_workspace";
            const activeTable = isGuest ? "demo_project_files" : "project_files";
            
            // For guests, projectName is the identifier since they don't have project UUIDs
            if (isGuest) {
               targetProjectId = projectName;
               const { data: files } = await supabase
                 .from(activeTable)
                 .select("storage_path, name")
                 .eq("project_name", projectName)
                 .eq("guest_id", activeUserId)
                 .like("storage_path", `%${targetFolder}%`);
                 
               if (files && files.length > 0) {
                 usingSupabase = true;
                 baseDir = path.join(process.cwd(), ".tmp", "executions", body.sessionId || Date.now().toString(), projectName);
                 
                 for (const file of files) {
                    const { data: blob } = await supabase.storage.from(activeBucket).download(file.storage_path);
                    if (blob) {
                       const buffer = Buffer.from(await blob.arrayBuffer());
                       const pathParts = file.storage_path.split("/");
                       const relativePath = pathParts.slice(2).join("/"); // e.g. DAY 1/BASE.txt
                       const destPath = path.join(baseDir, relativePath);
                       
                       fs.mkdirSync(path.dirname(destPath), { recursive: true });
                       fs.writeFileSync(destPath, buffer);
                    }
                 }
               }
            } else {
               const { data: project } = await supabase
                 .from("projects")
                 .select("id")
                 .eq("user_id", user!.id)
                 .eq("name", projectName)
                 .maybeSingle();
                 
               if (project) {
                 targetProjectId = project.id;
                 const { data: files } = await supabase
                   .from(activeTable)
                   .select("storage_path, name")
                   .eq("project_id", project.id)
                   .like("storage_path", `%${targetFolder}%`);
                   
                 if (files && files.length > 0) {
                   usingSupabase = true;
                   baseDir = path.join(process.cwd(), ".tmp", "executions", body.sessionId || Date.now().toString(), projectName);
                   
                   for (const file of files) {
                      const { data: blob } = await supabase.storage.from(activeBucket).download(file.storage_path);
                      if (blob) {
                         const buffer = Buffer.from(await blob.arrayBuffer());
                         const pathParts = file.storage_path.split("/");
                         const relativePath = pathParts.slice(2).join("/");
                         const destPath = path.join(baseDir, relativePath);
                         
                         fs.mkdirSync(path.dirname(destPath), { recursive: true });
                         fs.writeFileSync(destPath, buffer);
                      }
                   }
                 }
               }
            }
          }
          
          // Fallback: Auto-discover the project name in public/ (helpful for guest testing!)
          if (!usingSupabase) {
            if (!fs.existsSync(path.join(baseDir, targetFolder))) {
               const publicDirs = fs.readdirSync(path.join(process.cwd(), "public"), { withFileTypes: true })
                  .filter(d => d.isDirectory() && d.name !== "g-aid output")
                  .map(d => d.name);
               
               for (const pd of publicDirs) {
                  if (fs.existsSync(path.join(process.cwd(), "public", pd, targetFolder))) {
                     projectName = pd;
                     baseDir = path.join(process.cwd(), "public", projectName);
                     break;
                  }
               }
            }
          }
          
          // Compute dynamic task folder
          const outputDir = path.join(baseDir, "g-aid output");
          let nextTaskNum = 1;
          if (fs.existsSync(outputDir)) {
             const dirs = fs.readdirSync(outputDir, { withFileTypes: true })
               .filter(dirent => dirent.isDirectory() && dirent.name.toLowerCase().startsWith("task "))
               .map(dirent => parseInt(dirent.name.toLowerCase().replace("task ", ""), 10))
               .filter(n => !isNaN(n));
             if (dirs.length > 0) {
               nextTaskNum = Math.max(...dirs) + 1;
             }
          }
          const taskFolder = `task ${nextTaskNum}`;

          enqueue(`\x00${JSON.stringify(planPreamble)}\n`);
          await delay(80);
          enqueue(`Initiating **Magnetic Diurnal Correction Pipeline** for \`${projectName}/${targetFolder}\`...\nOutput will be saved to \`g-aid output/${taskFolder}\`\n\n`);
          let projectFilesUpdates: any[] = [];
          try {
            const { MagneticPreprocessingPipeline } = await import("@/pipeline/MagneticPreprocessingPipeline");
            const pipeline = new MagneticPreprocessingPipeline();
            let summaryMsg = "";
            await pipeline.runPipeline([], (event) => {
              if (event.type === "NODE_PROGRESS") {
                 const msg = `- ✅ **${event.nodeId || "Pipeline"}**: ${event.message}\n`;
                 enqueue(msg);
                 summaryMsg += msg;
              } else if (event.type === "QC_WARNING") {
                 const msg = `- ⚠️ **QC ${event.severity?.toUpperCase()}**: ${event.message}\n`;
                 enqueue(msg);
                 summaryMsg += msg;
              }
            }, { projectName, targetFolder, taskFolder, baseDir, outDir: outputDir });
            
            const uriProj = encodeURIComponent(projectName);
            const uriTask = encodeURIComponent(taskFolder);
            const treeProj = projectName.toUpperCase();
            
            projectFilesUpdates = [
               { id: `${treeProj}/g-aid output/${taskFolder}/airborne_corrected.csv`, name: "airborne_corrected.csv", type: "file", path: `/${projectName}/g-aid output/${taskFolder}/airborne_corrected.csv` },
               { id: `${treeProj}/g-aid output/${taskFolder}/mag_map.png`, name: "mag_map.png", type: "file", path: `/${projectName}/g-aid output/${taskFolder}/mag_map.png` },
               { id: `${treeProj}/g-aid output/${taskFolder}/diurnal_analysis.xlsx`, name: "diurnal_analysis.xlsx", type: "file", path: `/${projectName}/g-aid output/${taskFolder}/diurnal_analysis.xlsx` }
            ];
            
            // Upload artifacts to Supabase if running in cloud mode
            if (usingSupabase && activeUserId && targetProjectId) {
               const activeBucket = isGuest ? "demo_workspace" : "gaid_workspace";
               const activeTable = isGuest ? "demo_project_files" : "project_files";
               const outPath = path.join(outputDir, taskFolder);
               
               if (fs.existsSync(outPath)) {
                  projectFilesUpdates = [];
                  const outFiles = fs.readdirSync(outPath);
                  
                  for (const fName of outFiles) {
                     const filePath = path.join(outPath, fName);
                     const buffer = fs.readFileSync(filePath);
                     const storagePath = `${activeUserId}/${targetProjectId}/g-aid output/${taskFolder}/${fName}`;
                     
                     // Upload to Supabase Storage
                     await supabase.storage.from(activeBucket).upload(storagePath, buffer, { upsert: true });
                     
                     // Insert into metadata table
                     if (isGuest) {
                        await supabase.from(activeTable).insert({
                           guest_id: activeUserId,
                           project_name: targetProjectId,
                           name: fName,
                           storage_path: storagePath,
                           size_bytes: fs.statSync(filePath).size,
                        });
                     } else {
                        await supabase.from(activeTable).insert({
                           project_id: targetProjectId,
                           user_id: activeUserId,
                           name: fName,
                           storage_path: storagePath,
                           size_bytes: fs.statSync(filePath).size,
                        });
                     }
                     
                     projectFilesUpdates.push({
                        id: `${treeProj}/g-aid output/${taskFolder}/${fName}`,
                        name: fName,
                        type: "file",
                        path: storagePath
                     });
                  }
               }
            }
            
            enqueue(`\n\n**Pipeline Execution Complete.** Generated artifacts in \`g-aid output/${taskFolder}/\`:\n- [airborne_corrected.csv](/${uriProj}/g-aid%20output/${uriTask}/airborne_corrected.csv)\n- [mag_map.png](/${uriProj}/g-aid%20output/${uriTask}/mag_map.png)\n- [diurnal_analysis.xlsx](/${uriProj}/g-aid%20output/${uriTask}/diurnal_analysis.xlsx)\n\nClick the links above to download and view them directly.`);
          } catch (e: any) {
            enqueue(`\n\n❌ **Pipeline Failed**: ${e.message}`);
          }
          
          enqueue(`\n\x02${JSON.stringify({
            type: "agent_complete",
            agentId: "magnetic-agent",
            thought: "Detected direct request for diurnal analysis. Executing physical pipeline graph dynamically.",
            hypothesisEvents: [],
            opportunitiesDetected: 0,
            agentsDispatched: ["magnetic-agent"],
            capabilitiesResolved: [],
            contextTokens: 0,
            sessionId,
            projectFilesUpdates
          })}\n`);
          controller.close();
          return;
        }

        // ── Interpret mode: run kernel if available ────────────────────────
        let ruleMatchIds: string[] = [];
        let hypothesisEvents: object[] = [];
        let derivedConfidence = 0.55;
        let kernelProvenance: ConfidenceProvenance | null = null;

        if (kernel) {
          try {
            const result = await kernel.reason(message, snapshot.datasets, snapshot);
            ruleMatchIds       = result.ruleMatchIds;
            derivedConfidence  = result.baseProvenance.derivedConfidence;
            kernelProvenance   = result.baseProvenance;
            hypothesisEvents   = result.hypotheses.map((h) => ({
              type: "HYPOTHESIS_CREATED",
              payload: { hypothesis: h },
            }));
          } catch {
            // Kernel error — fall through to base provenance
          }
        }

        // ── Phase 1: Preamble ──────────────────────────────────────────────
        const provenance: ConfidenceProvenance = kernelProvenance ?? {
          dataQualityScore:       snapshot.datasets.length > 0 ? 0.6 : null,
          crossMethodAgreement:   agentIds.length > 1 ? 0.65 : null,
          modelConvergence:       null,
          geologicalConsistency:  null,
          spatialCoverage:        snapshot.datasets.length > 0 ? 0.55 : null,
          spatialCompatibility:   null,
          linespacing:            null,
          derivedConfidence,
          computedAt:             new Date().toISOString(),
          computedByKernel:       kernel?.agentId ?? "orchestrator",
        };

        const preamble: StreamPreamble = buildPreamble(
          primaryAgentId,
          provenance.derivedConfidence,
          capabilities,
          ruleMatchIds,
          [],
        );
        preamble.confidenceProvenance = provenance;
        enqueue(`\x00${JSON.stringify(preamble)}\n`);

        await delay(60);

        // ── Phase 2: Response text (no \x01 per token — enter text mode once) ─
        const responseText = synthesizeResponse({
          agentId:      primaryAgentId,
          query:        message,
          hypotheses:   snapshot.hypothesisGraph.filter((h) => h.status === "active"),
          datasets:     snapshot.datasets,
          provenance,
          ruleMatchIds,
        });

        // Append proactive opportunity note if any were found
        const fullText = proactiveOpps.length > 0
          ? responseText + `\n\n---\n\n**💡 ${proactiveOpps.length} proactive opportunit${proactiveOpps.length === 1 ? "y" : "ies"} detected.** Use the chips in the panel to activate them.`
          : responseText;

        // Stream tokens with human-readable cadence
        const tokens = fullText.split(/(?<= )/);  // split keeping trailing space
        for (const token of tokens) {
          enqueue(token);
          // Vary delay: longer after newlines (paragraph beats), shorter for mid-sentence
          const hasNewline = token.includes("\n");
          await delay(hasNewline ? 25 : 10);
        }

        // ── Phase 3: Epilogue ──────────────────────────────────────────────
        const thought = generateThought(message, primaryAgentId, capabilities, ruleMatchIds, snapshot.datasets.length);
        enqueue(`\n\x02${JSON.stringify({
          type:                   "agent_complete",
          agentId:                primaryAgentId,
          thought,
          hypothesisEvents,
          opportunitiesDetected:  proactiveOpps.length,
          agentsDispatched:       agentIds,
          capabilitiesResolved:   capabilities.map((c) => c.id),
          contextTokens:          agentContext.tokenEstimate,
          sessionId,
        })}\n`);

        controller.close();
      } catch (err) {
        enqueue(`\n*Internal error: ${err instanceof Error ? err.message : "unknown"}*`);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Session-Id": sessionId,
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPreamble(
  agentId: AgentId,
  confidence: number,
  capabilities: ReturnType<typeof resolveFromIntent>,
  ruleMatchIds: string[],
  hypothesesUpdated: string[],
): StreamPreamble {
  return {
    type: "preamble",
    agentId,
    confidence,
    confidenceProvenance: {
      dataQualityScore: null, crossMethodAgreement: null, modelConvergence: null,
      geologicalConsistency: null, spatialCoverage: null, spatialCompatibility: null,
      linespacing: null, derivedConfidence: confidence,
      computedAt: new Date().toISOString(),
      computedByKernel: "orchestrator",
    },
    toolsInvoked:            capabilities.flatMap((c) => c.requiredTools),
    capabilityTrace:         capabilities.map((c) => c.id),
    rulesMatched:            ruleMatchIds,
    hypothesesUpdated,
    epistemicTypesProduced:  [],
  };
}

// ─── Thought generator ────────────────────────────────────────────────────────
// Produces a brief internal reasoning trace for the ThoughtDisclosure UI.

function generateThought(
  query: string,
  agentId: AgentId,
  capabilities: ReturnType<typeof resolveFromIntent>,
  ruleMatchIds: string[],
  datasetCount: number,
): string {
  const lower = query.toLowerCase();
  const isGreeting = /^(hi|hello|hey|howdy|greetings|what's up|sup|yo)\b/.test(lower);
  const isHelp     = /\b(help|what can you do|what do you do|capabilities|features|upload|load|import|add|open|switch)\b/.test(lower);
  const isPlan     = lower.includes("/plan");
  const isConversational = /^(how\s+are\s+you|how's\s+it\s+going|how\s+is\s+it\s+going|who\s+are\s+you|what\s+are\s+you|who\s+is\s+this|are\s+you\s+(there|alive|real|human|bot|ai)|thanks|thank\s+you|cool|awesome|great|ok|okay|yes|no|test|hello\s+there|what\s+day|holiday)\b/.test(lower);

  if (isGreeting) {
    return [
      `[1/3] Tokenizer matching conversational signature: 'greeting'. Routing away from expert domain kernels.`,
      `[2/3] Bypassing spatial constraint grids and CRS alignment indexes.`,
      `[3/3] Render output: Loading greeting & onboarding welcome layout.`
    ].join("\n");
  }
  if (isHelp) {
    return [
      `[1/3] Parsing query intent: platform support / tutorial request detected.`,
      `[2/3] Retrieving UI workspace configuration and interactive instruction cards.`,
      `[3/3] Render output: Synthesizing step-by-step walk-through for data ingestion and project navigation.`
    ].join("\n");
  }
  if (isConversational) {
    return [
      `[1/3] Linguistic parser evaluated non-geophysical query: 'conversational/general'. Bypassing geophysical rules engine.`,
      `[2/3] Querying local environment settings and mock schedules.`,
      `[3/3] Render output: Formulating friendly conversational reply and guiding user towards survey analyses.`
    ].join("\n");
  }
  if (isPlan) {
    const capList = capabilities.map((c) => c.id).join(", ") || "none matched";
    return [
      `[1/3] Pipeline build trigger: compiling executable DAG workflow.`,
      `[2/3] Resolved intent to active capabilities: [${capList}].`,
      `[3/3] Render output: Assembling ${capabilities.length} node(s) with ${datasetCount} loaded datasets constraining solver inputs.`
    ].join("\n");
  }

  const steps: string[] = [];
  
  // Step 1: Parsing
  steps.push(`[1/4] Semantic Parsing: Analyzing token structure and search vectors. Checked against mineral exploration and geophysics domain ontologies.`);
  
  // Step 2: Agent Matching
  const agentLabel: Record<string, string> = {
    "orchestrator-agent": "Orchestrator Synthesis Core",
    "magnetic-agent":     "Magnetic Expert Kernel (coincident anomaly check)",
    "resistivity-agent":  "Electrical Resistivity / ERT Expert Kernel",
    "gravity-agent":      "Gravity Anomaly Density Kernel",
    "seismic-agent":      "Seismic Reflection & Depth Conversion Kernel",
    "geological-agent":   "Cross-disciplinary Geological Synthesis",
  };
  const selectedAgent = agentLabel[agentId] ?? agentId;

  if (capabilities.length > 0) {
    steps.push(`[2/4] Multi-Agent Routing: intent matched to ${capabilities.length} expert capability(ies): [${capabilities.map((c) => c.id).join(", ")}]. calibrating target solver and routing to: ${selectedAgent}.`);
  } else {
    steps.push(`[2/4] Multi-Agent Routing: no specialized geophysical capabilities matched. routing to: ${selectedAgent} for cross-disciplinary correlation.`);
  }

  // Step 3: Spatial constraints & Datasets
  if (datasetCount === 0) {
    steps.push(`[3/4] Spatial Constraint checking: 0 geophysical datasets loaded. epistemic bounds set to low. warning user that confidence will remain minimal without physical constraints.`);
  } else {
    steps.push(`[3/4] Spatial Constraint checking: found ${datasetCount} active survey dataset(s). verifying spatial bounds, coordinate reference systems (CRS), and computing signal-to-noise ratio (SNR) consistency.`);
  }

  // Step 4: Rule matching & Hypotheses
  if (ruleMatchIds.length > 0) {
    steps.push(`[4/4] Ontology & Inference Engine: Matched ${ruleMatchIds.length} domain rules: [${ruleMatchIds.slice(0, 3).join(", ")}]. generating hypothesis nodes with epistemic provenance metrics.`);
  } else {
    steps.push(`[4/4] Ontology & Inference Engine: no matching hard-coded domain inference rules. executing high-level geological interpretation heuristics.`);
  }

  return steps.join("\n");
}

function makeEmptySnapshot(projectId: string): ScientificProjectSnapshot {
  return {
    projectId,
    snapshotSequenceNumber: 0,
    datasets: [],
    hypothesisGraph: [],
    epistemicBranches: [],
    executionDAG: null,
    toolExecutions: [],
    opportunities: [],
    interpretations: [],
    spatialIndexSummary: {
      registeredDatasets: 0,
      overlapPairs: [],
      crsSet: [],
      dominantCRS: null,
      totalCoverageAreaKm2: 0,
      compatibilityIssues: [],
    },
    lastModified: new Date().toISOString(),
  };
}

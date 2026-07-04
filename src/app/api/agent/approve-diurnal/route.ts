import type { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { generateTasksMarkdown } from "../orchestrate/implementation-plan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ApproveRequest {
  sessionId: string;
  decision: "approve" | "reject";
  comment?: string;
}

interface ProjectFileUpdate {
  id: string;
  name: string;
  type: "file" | "folder";
  path: string;
}

const encoder = new TextEncoder();
const enc = (s: string) => encoder.encode(s);
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function POST(request: NextRequest): Promise<Response> {
  let body: ApproveRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sessionId, decision } = body;
  console.log("📊 APPROVE: Received approval request", { sessionId, decision });
  if (!sessionId || !decision) {
    return Response.json({ error: "sessionId and decision are required" }, { status: 400 });
  }

  // Import the pending approval store
  const { PENDING_APPROVAL } = await import("../orchestrate/implementation-plan");
  const pending = PENDING_APPROVAL[sessionId];
  console.log("📊 APPROVE: Pending approval keys:", Object.keys(PENDING_APPROVAL), "found:", !!pending);
  
  if (!pending) {
    console.error("📊 APPROVE: No pending approval for session", sessionId);
    return Response.json({ error: "No pending approval found for this session" }, { status: 404 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (s: string) => controller.enqueue(enc(s));

      try {
        if (decision === "reject") {
          enqueue(`\x00${JSON.stringify({
            type: "preamble",
            agentId: "magnetic-agent",
            confidence: 0.8,
            confidenceProvenance: {
              dataQualityScore: null,
              crossMethodAgreement: null,
              modelConvergence: null,
              geologicalConsistency: null,
              spatialCoverage: null,
              spatialCompatibility: null,
              linespacing: null,
              derivedConfidence: 0.8,
              computedAt: new Date().toISOString(),
              computedByKernel: "orchestrator"
            },
            toolsInvoked: [],
            capabilityTrace: [],
            rulesMatched: [],
            hypothesesUpdated: [],
            epistemicTypesProduced: []
          })}\n`);
          await delay(80);
          enqueue(`Diurnal analysis cancelled by user.`);
          delete PENDING_APPROVAL[sessionId];
          controller.close();
          return;
        }

        const { taskFolder, outputDir } = pending;
        console.log("📊 APPROVE: taskFolder =", taskFolder, "outputDir =", outputDir);

        // Create tasks.md
        const tasksContent = generateTasksMarkdown("", taskFolder);
        const tasksPath = path.join(outputDir, "tasks.md");
        fs.writeFileSync(tasksPath, tasksContent);
        console.log("📊 APPROVE: Wrote tasks.md to", tasksPath);

        // Start task execution
        enqueue(`\x00${JSON.stringify({
          type: "preamble",
          agentId: "magnetic-agent",
          confidence: 0.95,
          confidenceProvenance: {
            dataQualityScore: null,
            crossMethodAgreement: null,
            modelConvergence: null,
            geologicalConsistency: null,
            spatialCoverage: null,
            spatialCompatibility: null,
            linespacing: null,
            derivedConfidence: 0.95,
            computedAt: new Date().toISOString(),
            computedByKernel: "orchestrator"
          },
          toolsInvoked: [],
          capabilityTrace: ["diurnal-correction"],
          rulesMatched: [],
          hypothesesUpdated: [],
          epistemicTypesProduced: []
        })}\n`);
        await delay(80);

        enqueue(`**Workflow Approved.** Starting execution...\n\n`);
        console.log("📊 APPROVE: Starting pipeline execution");

        // Execute pipeline with task progress updates
        const { MagneticPreprocessingPipeline } = await import("@/pipeline/MagneticPreprocessingPipeline");
        const pipeline = new MagneticPreprocessingPipeline();
        
        // Extract project info from output path
        // Handle both public/ and .tmp/executions/ paths
        const publicDir = path.join(process.cwd(), "public");
        const tmpExecDir = path.join(process.cwd(), ".tmp", "executions");
        let projectName = "";
        if (outputDir.includes(tmpExecDir)) {
          // .tmp/executions/{sessionId}/{projectName}/g-aid output
          const afterTmp = outputDir.replace(tmpExecDir + path.sep, "");
          const parts = afterTmp.split(path.sep);
          projectName = parts.length >= 2 ? parts[1] : "";
        } else if (outputDir.includes(publicDir)) {
          projectName = outputDir.replace(publicDir + path.sep, "").split(path.sep)[0];
        }
        console.log("📊 APPROVE: Resolved projectName =", JSON.stringify(projectName), "from outputDir =", outputDir);
        
        const projectFilesUpdates: ProjectFileUpdate[] = [];
        
        const pipelineParams = { projectName, targetFolder: "", taskFolder, baseDir: path.dirname(outputDir), outDir: outputDir };
        console.log("📊 APPROVE: Pipeline params:", JSON.stringify(pipelineParams));
        
        const pipelineSuccess = await pipeline.runPipeline([], async (event) => {
          console.log("📊 APPROVE: Pipeline event:", event.type, event.nodeId, event.message);
          if (event.type === "NODE_PROGRESS") {
            enqueue(`- 🔧 **${event.nodeId || "Step"}**: ${event.message}\n`);
            
            // Update tasks.md as we progress
            const tasksPathUpdated = path.join(outputDir, "tasks.md");
            if (fs.existsSync(tasksPathUpdated)) {
              let tasksContentUpdate = fs.readFileSync(tasksPathUpdated, "utf-8");
              const phaseMap: Record<string, string> = {
                "file_discovery": "Phase 1: Data Discovery",
                "flight_path_cleaner": "Phase 2: Flight Path Cleaning",
                "time_synchronizer": "Phase 3: Time Synchronization",
                "diurnal_corrector": "Phase 4: Diurnal Correction",
                "qc_engine": "Phase 5: Quality Control"
              };
              
              const phaseName = phaseMap[event.nodeId || ""];
              if (phaseName) {
                tasksContentUpdate = tasksContentUpdate.replace(
                  `- [ ] ${phaseName}`,
                  `- [x] ${phaseName}`
                );
                fs.writeFileSync(tasksPathUpdated, tasksContentUpdate);
              }
            }
          } else if (event.type === "QC_WARNING") {
            enqueue(`- ⚠️ **QC ${event.severity?.toUpperCase()}**: ${event.message}\n`);
          } else if (event.type === "PIPELINE_FAILED") {
            console.error("📊 APPROVE: Pipeline FAILED:", event.message);
            enqueue(`- ❌ **Pipeline Error**: ${event.message}\n`);
          }
        }, pipelineParams);
        
        console.log("📊 APPROVE: Pipeline completed, success =", pipelineSuccess);

        // Collect output files
        const taskDir = path.join(outputDir, taskFolder);
        if (fs.existsSync(taskDir)) {
          const outFiles = fs.readdirSync(taskDir);
          const treeProj = projectName.toUpperCase();
          const fileSizes: Record<string, number> = {};
          
          const publicTaskDir = path.join(process.cwd(), "public", projectName, "g-aid output", taskFolder);
          fs.mkdirSync(publicTaskDir, { recursive: true });
          
          for (const fName of outFiles) {
            const filePath = path.join(taskDir, fName);
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
              const publicFilePath = path.join(publicTaskDir, fName);
              fs.copyFileSync(filePath, publicFilePath);
              fileSizes[fName] = stat.size;
              projectFilesUpdates.push({
                id: `g-aid output/${taskFolder}/${fName}`,
                name: fName,
                type: "file",
                path: `/${projectName}/g-aid output/${taskFolder}/${fName}`
              });
            }
          }

          // Upload to Supabase if needed (cloud mode)
          const supabaseModule = await import("@/lib/supabase/server");
          const supabase = await supabaseModule.createServerSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          
          if (user && projectName) {
            const { data: project } = await supabase
              .from("projects")
              .select("id")
              .eq("user_id", user.id)
              .eq("name", projectName)
              .maybeSingle();
              
            if (project) {
              const bucket = "gaid_workspace";
              for (const fName of outFiles) {
                const filePath = path.join(taskDir, fName);
                const buffer = fs.readFileSync(filePath);
                const storagePath = `${user.id}/${project.id}/g-aid output/${taskFolder}/${fName}`;
                
                await supabase.storage.from(bucket).upload(storagePath, buffer, { upsert: true });
                await supabase.from("project_files").insert({
                  project_id: project.id,
                  user_id: user.id,
                  name: fName,
                  storage_path: storagePath,
                  size_bytes: fileSizes[fName]
                });
              }
            }
          }
        }

        const finalTasksPath = path.join(outputDir, "tasks.md");
        const publicTaskDir = path.join(process.cwd(), "public", projectName, "g-aid output", taskFolder);
        const publicFinalTasksPath = path.join(publicTaskDir, "tasks.md");
        if (fs.existsSync(finalTasksPath)) {
          fs.copyFileSync(finalTasksPath, publicFinalTasksPath);
        }
        projectFilesUpdates.unshift({
          id: `g-aid output/${taskFolder}/tasks.md`,
          name: "tasks.md",
          type: "file",
          path: `/${projectName}/g-aid output/${taskFolder}/tasks.md`
        });

        enqueue(`\n\n✅ **Execution Complete.** All artifacts generated in \`g-aid output/${taskFolder}/\`.\n`);

        enqueue(`\n\x02${JSON.stringify({
          type: "execution_complete",
          agentId: "magnetic-agent",
          taskFolder,
          projectFilesUpdates,
          hypothesisEvents: []
        })}\n`);

        delete PENDING_APPROVAL[sessionId];
        controller.close();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        const errorStack = err instanceof Error ? err.stack : "";
        console.error("📊 APPROVE: Execution error:", errorMsg, "\n", errorStack);
        enqueue(`\n❌ **Execution Failed**: ${errorMsg}`);
        enqueue(`\n\x02${JSON.stringify({
          type: "execution_failed",
          agentId: "magnetic-agent",
          error: errorMsg,
          hypothesisEvents: []
        })}\n`);
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Session-Id": sessionId,
    }
  });
}
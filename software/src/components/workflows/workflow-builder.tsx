"use client";

import { useCallback, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import { motion } from "framer-motion";
import { WorkflowNode } from "./workflow-node";
import { Button } from "@/components/ui/button";
import { Play, Plus } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

const nodeTypes = { workflow: WorkflowNode };

const initialNodes: Node[] = [
  { id: "1", type: "workflow", position: { x: 0, y: 100 }, data: { label: "Upload Dataset", type: "upload", status: "complete" } },
  { id: "2", type: "workflow", position: { x: 220, y: 50 }, data: { label: "Data Cleaning", type: "clean", status: "complete" } },
  { id: "3", type: "workflow", position: { x: 220, y: 180 }, data: { label: "Filtering", type: "filter", status: "complete" } },
  { id: "4", type: "workflow", position: { x: 440, y: 100 }, data: { label: "Inversion", type: "inversion", status: "running" } },
  { id: "5", type: "workflow", position: { x: 660, y: 50 }, data: { label: "Mapping", type: "map", status: "idle" } },
  { id: "6", type: "workflow", position: { x: 660, y: 180 }, data: { label: "AI Interpretation", type: "ai", status: "idle" } },
  { id: "7", type: "workflow", position: { x: 880, y: 100 }, data: { label: "Report Generation", type: "report", status: "idle" } },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "1", target: "2", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#ffffff" } },
  { id: "e1-3", source: "1", target: "3", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#ffffff" } },
  { id: "e2-4", source: "2", target: "4", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#ffffff" } },
  { id: "e3-4", source: "3", target: "4", markerEnd: { type: MarkerType.ArrowClosed, color: "#ffffff" } },
  { id: "e4-5", source: "4", target: "5", markerEnd: { type: MarkerType.ArrowClosed, color: "#ffffff" } },
  { id: "e4-6", source: "4", target: "6", markerEnd: { type: MarkerType.ArrowClosed, color: "#ffffff" } },
  { id: "e5-7", source: "5", target: "7", markerEnd: { type: MarkerType.ArrowClosed, color: "#ffffff" } },
  { id: "e6-7", source: "6", target: "7", markerEnd: { type: MarkerType.ArrowClosed, color: "#ffffff" } },
];

const nodePalette = [
  "Upload Dataset", "Data Cleaning", "Filtering", "Inversion",
  "Mapping", "AI Interpretation", "Report Generation",
];

export function WorkflowBuilder() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { setProcessingStatus } = useAppStore();
  const [running, setRunning] = useState(false);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#ffffff" } }, eds)),
    [setEdges]
  );

  const [events, setEvents] = useState<any[]>([]);

  const runWorkflow = async () => {
    setRunning(true);
    setProcessingStatus("running");
    setEvents([]);
    
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, status: "running" },
      }))
    );

    try {
      const response = await fetch('/api/pipeline/event-stream');
      
      if (!response.body) {
        throw new Error('No readable stream returned');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let isDone = false;
      while (!isDone) {
        const { value, done } = await reader.read();
        if (done) {
          isDone = true;
          break;
        }
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const eventData = JSON.parse(line.slice(6));
            setEvents(prev => [...prev, eventData]);
            
            if (eventData.type === 'PIPELINE_COMPLETE' || eventData.type === 'PIPELINE_FAILED') {
              setProcessingStatus(eventData.type === 'PIPELINE_COMPLETE' ? "complete" : "error");
              setRunning(false);
              setNodes((nds) =>
                nds.map((n) => ({
                  ...n,
                  data: {
                    ...n.data,
                    status: eventData.type === 'PIPELINE_COMPLETE' ? "complete" : "error",
                  },
                }))
              );
            }
          }
        }
      }
    } catch (error) {
      console.error("Pipeline streaming error:", error);
      setRunning(false);
      setProcessingStatus("error");
    }
  };

  return (
    <section className="h-full flex flex-col relative">
      <header className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
        <h2 className="font-semibold text-sm text-white">Workflow Builder</h2>
        <menu className="flex gap-2 list-none p-0 m-0">
          <li><Button variant="outline" size="sm"><Plus className="h-3 w-3" /> Add Node</Button></li>
          <li>
            <Button size="sm" onClick={runWorkflow} disabled={running}>
              <Play className="h-3 w-3" /> {running ? "Running..." : "Run Scientific Pipeline"}
            </Button>
          </li>
        </menu>
      </header>
      
      <div className="flex-1 min-h-0 flex relative">
        <figure className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            className="bg-transparent"
          >
            <Background color="rgba(255,255,255,0.05)" gap={20} />
            <Controls className={cn(
              "!bg-zinc-900 !border-white/10 !shadow-none",
              "[&>button]:!bg-white/5 [&>button]:!border-white/10 [&>button]:!text-white"
            )} />
            <MiniMap
              nodeColor={() => "#ffffff"}
              maskColor="rgba(0,0,0,0.8)"
              className="!bg-zinc-900 !border-white/10"
            />
          </ReactFlow>
        </figure>
        
        {/* Telemetry Panel */}
        <aside className="w-[300px] border-l border-white/5 bg-[#141414] shrink-0 flex flex-col h-full overflow-hidden absolute right-0 top-0 bottom-0 z-20 pointer-events-none sm:pointer-events-auto">
          <div className="p-3 border-b border-white/5 flex items-center justify-between bg-[#1e1e1e]">
            <span className="text-xs font-semibold text-white uppercase tracking-wider">Scientific Telemetry</span>
            <span className={cn("w-2 h-2 rounded-full", running ? "bg-green-500 animate-pulse" : "bg-zinc-600")} />
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-[10px]">
            {events.length === 0 && (
              <div className="text-zinc-500 text-center mt-4">Waiting for pipeline execution...</div>
            )}
            {events.map((evt, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  "p-2 rounded border break-words",
                  evt.severity === "fatal" || evt.type === "PIPELINE_FAILED" ? "border-red-900/50 bg-red-900/20 text-red-200" :
                  evt.severity === "warning" || evt.type === "QC_WARNING" ? "border-yellow-900/50 bg-yellow-900/20 text-yellow-200" :
                  evt.type === "NODE_COMPLETED" || evt.type === "PIPELINE_COMPLETE" ? "border-green-900/50 bg-green-900/20 text-green-200" :
                  "border-white/5 bg-white/5 text-zinc-300"
                )}
              >
                <div className="font-bold mb-1 opacity-75">{evt.type} {evt.nodeId ? `[${evt.nodeId}]` : ''}</div>
                <div>{evt.message}</div>
                <div className="text-[8px] opacity-50 mt-1">{new Date(evt.timestamp).toLocaleTimeString()}</div>
              </motion.div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

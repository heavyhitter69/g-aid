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

  const runWorkflow = () => {
    setRunning(true);
    setProcessingStatus("running");
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, status: n.id === "4" ? "running" : n.data.status },
      }))
    );
    setTimeout(() => {
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: {
            ...n.data,
            status: ["1", "2", "3", "4", "5", "6", "7"].includes(n.id as string)
              ? "complete"
              : n.data.status,
          },
        }))
      );
      setProcessingStatus("complete");
      setRunning(false);
    }, 3000);
  };

  return (
    <section className="h-full flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-white/5">
        <h2 className="font-semibold text-sm text-white">Workflow Builder</h2>
        <menu className="flex gap-2 list-none p-0 m-0">
          <li><Button variant="outline" size="sm"><Plus className="h-3 w-3" /> Add Node</Button></li>
          <li>
            <Button size="sm" onClick={runWorkflow} disabled={running}>
              <Play className="h-3 w-3" /> {running ? "Running..." : "Run Workflow"}
            </Button>
          </li>
        </menu>
      </header>
      <aside className="flex gap-4 p-3 border-b border-white/5 overflow-x-auto">
        {nodePalette.map((label) => (
          <motion.span
            key={label}
            whileHover={{ scale: 1.05 }}
            className="shrink-0 text-[10px] px-3 py-1.5 rounded-lg border border-white/5 bg-white/5 cursor-grab font-mono text-zinc-400 hover:border-white/20 hover:text-white transition-all"
          >
            {label}
          </motion.span>
        ))}
      </aside>
      <figure className="flex-1 min-h-[400px]">
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
    </section>
  );
}

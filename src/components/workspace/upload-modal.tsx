"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, File, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
}

export function UploadModal({ open, onClose }: UploadModalProps) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "validating" | "done">("idle");

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      setFile(f);
      simulateUpload();
    }
  }, []);

  const simulateUpload = () => {
    setStatus("uploading");
    setTimeout(() => setStatus("validating"), 1000);
    setTimeout(() => setStatus("done"), 2500);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      simulateUpload();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 block"
            onClick={onClose}
          />
          <motion.dialog
            open
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg glass-panel rounded-2xl p-6 border border-white/10 list-none"
          >
            <header className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-white">Upload Dataset</h2>
              <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4 text-zinc-400" /></Button>
            </header>
            <label
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`block border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                dragging ? "border-white bg-white/5" : "border-white/10 hover:border-white/20"
              }`}
            >
              <input type="file" className="hidden" accept=".csv,.dat,.segy" onChange={handleFileSelect} />
              <Upload className="h-10 w-10 text-white mx-auto mb-4" />
              <p className="text-sm text-white mb-1">Drag & drop geophysical data</p>
              <p className="text-xs text-zinc-400">Supports .csv, .dat, .segy</p>
            </label>
            {file && (
              <motion.article
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-4 rounded-lg border border-white/10 bg-white/[0.02]"
              >
                <header className="flex items-center gap-3">
                  <File className="h-8 w-8 text-white" />
                  <section>
                    <p className="text-sm font-medium text-white">{file.name}</p>
                    <p className="text-xs text-zinc-400">{(file.size / 1024).toFixed(1)} KB</p>
                  </section>
                  {status !== "done" ? (
                    <Loader2 className="h-5 w-5 text-white animate-spin ml-auto" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-white ml-auto" />
                  )}
                </header>
                {status !== "idle" && (
                  <ul className="mt-3 space-y-1 font-mono text-[10px]">
                    <li className="text-white">✓ File received</li>
                    <li className={status === "validating" || status === "done" ? "text-white" : "text-zinc-500"}>
                      {status === "uploading" ? "⋯ Parsing metadata" : "✓ Metadata parsed — 850 stations, 4 arrays"}
                    </li>
                    <li className={status === "done" ? "text-white" : "text-zinc-500"}>
                      {status === "done" ? "✓ Validation complete" : "⋯ Running QC checks"}
                    </li>
                  </ul>
                )}
              </motion.article>
            )}
            <footer className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button disabled={status !== "done"} onClick={onClose}>Import to Workspace</Button>
            </footer>
          </motion.dialog>
        </>
      )}
    </AnimatePresence>
  );
}

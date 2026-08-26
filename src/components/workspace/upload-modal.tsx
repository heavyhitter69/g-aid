"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FolderOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
}

/** Honest empty state — does not simulate upload progress or invent QC stats. */
export function UploadModal({ open, onClose }: UploadModalProps) {
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
              <h2 className="text-lg font-semibold text-white">Open survey folder</h2>
              <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4 text-zinc-400" /></Button>
            </header>
            <div className="border border-white/10 rounded-xl p-8 text-center">
              <FolderOpen className="h-10 w-10 text-white mx-auto mb-4" />
              <p className="text-sm text-white mb-1">Use File → Open Folder</p>
              <p className="text-xs text-zinc-400">
                G-AID reads the survey on disk. There is no cloud upload in this workflow, and progress is not simulated.
              </p>
            </div>
            <footer className="mt-6 flex justify-end">
              <Button onClick={onClose}>Close</Button>
            </footer>
          </motion.dialog>
        </>
      )}
    </AnimatePresence>
  );
}

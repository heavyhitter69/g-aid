"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { LARGE_FILE_LINE_THRESHOLD } from "@/lib/read-file-content";

const LINE_HEIGHT = 19;
const GUTTER_VIRTUALIZE_ABOVE = LARGE_FILE_LINE_THRESHOLD;

interface TextEditorProps {
  filePath: string;
  content: string;
  onChange: (value: string) => void;
  projectName?: string | null;
}

export function TextEditor({
  filePath,
  content,
  onChange,
  projectName,
}: TextEditorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);

  const [scrollMetrics, setScrollMetrics] = useState({
    scrollTop: 0,
    clientHeight: 400,
    scrollHeight: 1,
  });

  const lineCount = useMemo(() => {
    if (!content) return 1;
    let n = 1;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === "\n") n++;
    }
    return n;
  }, [content]);

  const displayName = filePath.split("/").pop() ?? filePath;
  const useVirtualGutter = lineCount > GUTTER_VIRTUALIZE_ABOVE;

  const breadcrumbParts = useMemo(() => {
    const segments: string[] = [];
    if (projectName) segments.push(projectName);
    const pathParts = filePath.split("/").filter(Boolean);
    if (pathParts.length > 1) segments.push(...pathParts.slice(0, -1));
    segments.push(displayName);
    return segments;
  }, [projectName, filePath, displayName]);

  const updateScrollMetrics = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollMetrics({
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    });
  }, []);

  useEffect(() => {
    updateScrollMetrics();
  }, [content, updateScrollMetrics]);

  const { scrollTop, clientHeight, scrollHeight } = scrollMetrics;

  const gutterStart = useVirtualGutter
    ? Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - 2)
    : 0;
  const gutterVisibleCount = useVirtualGutter
    ? Math.ceil(clientHeight / LINE_HEIGHT) + 5
    : lineCount;
  const gutterEnd = Math.min(lineCount, gutterStart + gutterVisibleCount);

  const gutterNumbers = useMemo(() => {
    const nums: number[] = [];
    for (let i = gutterStart; i < gutterEnd; i++) nums.push(i + 1);
    return nums;
  }, [gutterStart, gutterEnd]);

  const handleMinimapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const mini = minimapRef.current;
    if (!el || !mini) return;
    const rect = mini.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    el.scrollTop = ratio * Math.max(0, el.scrollHeight - el.clientHeight);
    updateScrollMetrics();
  };

  const handleMinimapDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    handleMinimapClick(e);
  };

  const viewportTop =
    scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
  const viewportHeight =
    scrollHeight > 0 ? (clientHeight / scrollHeight) * 100 : 100;

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#1e1e1e] text-[#cccccc]">
      <div className="shrink-0 flex items-center gap-0.5 px-3 py-1.5 text-[11px] text-[#858585] border-b border-[#2b2b2b] bg-[#181818] overflow-x-auto whitespace-nowrap font-sans select-none">
        {breadcrumbParts.map((part, i) => (
          <span key={`${part}-${i}`} className="flex items-center gap-0.5 shrink-0">
            {i > 0 && <span className="text-[#454545] px-0.5">›</span>}
            <span
              className={cn(
                i === breadcrumbParts.length - 1
                  ? "text-[#cccccc]"
                  : "hover:text-white cursor-default"
              )}
            >
              {part}
            </span>
          </span>
        ))}
      </div>

      <div className="flex flex-1 min-h-0">
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto min-h-0"
          onScroll={updateScrollMetrics}
        >
          <div
            className="flex min-w-full"
            style={{ minHeight: lineCount * LINE_HEIGHT }}
          >
            <div
              className="sticky left-0 z-10 shrink-0 bg-[#1e1e1e] text-[#858585] font-mono text-[13px] text-right select-none border-r border-[#2b2b2b]"
              aria-hidden
              style={{
                paddingTop: useVirtualGutter ? gutterStart * LINE_HEIGHT : 0,
              }}
            >
              {gutterNumbers.map((num) => (
                <div
                  key={num}
                  className="pr-3 pl-3"
                  style={{ height: LINE_HEIGHT, lineHeight: `${LINE_HEIGHT}px` }}
                >
                  {num}
                </div>
              ))}
            </div>

            <textarea
              value={content}
              onChange={(e) => onChange(e.target.value)}
              spellCheck={false}
              wrap="off"
              className={cn(
                "flex-1 min-w-0 bg-[#1e1e1e] text-[#d4d4d4] font-mono text-[13px]",
                "outline-none border-0 resize-none py-0 pl-3 pr-4",
                "selection:bg-[#264f78] caret-white"
              )}
              style={{
                lineHeight: `${LINE_HEIGHT}px`,
                minHeight: lineCount * LINE_HEIGHT,
                tabSize: 4,
              }}
            />
          </div>
        </div>

        <div
          ref={minimapRef}
          role="scrollbar"
          aria-label="Document minimap"
          className="relative w-[80px] shrink-0 bg-[#1e1e1e] border-l border-[#2b2b2b] cursor-pointer overflow-hidden select-none"
          onClick={handleMinimapClick}
          onMouseMove={handleMinimapDrag}
        >
          <div className="absolute inset-0 overflow-hidden opacity-60">
            <pre
              className="m-0 p-2 font-mono text-[#6e7681] whitespace-pre pointer-events-none"
              style={{
                fontSize: "11px",
                lineHeight: "14px",
                transform: "scale(0.14)",
                transformOrigin: "top left",
                width: "720%",
              }}
            >
              {content.length > 200_000
                ? content.slice(0, 200_000) + "\n…"
                : content || " "}
            </pre>
          </div>

          <div
            className="absolute left-0 right-0 bg-[#264f78]/40 border-y border-[#3794ff]/40 pointer-events-none"
            style={{
              top: `${viewportTop}%`,
              height: `${Math.min(Math.max(viewportHeight, 3), 100)}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

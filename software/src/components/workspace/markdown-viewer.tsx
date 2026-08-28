import React from "react";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MarkdownViewerProps {
  content: string;
}

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  // Pre-process GitHub alerts so they can be rendered via custom blockquote component
  // We'll just let ReactMarkdown parse them as blockquotes and style the blockquote component
  
  return (
    <div className="w-full h-full p-8 max-w-[800px] mx-auto overflow-y-auto">
      <div className="prose prose-invert prose-p:my-1 prose-pre:bg-[#1e1e1e] prose-pre:border prose-pre:border-[#2b2b2b] prose-code:text-[#d4d4d4] prose-code:bg-[#1e1e1e] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-table:border-collapse prose-table:w-full prose-td:border prose-td:border-[#2b2b2b] prose-td:p-2 prose-th:border prose-th:border-[#2b2b2b] prose-th:p-2 prose-th:bg-[#181818] prose-th:text-left text-[#cccccc]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

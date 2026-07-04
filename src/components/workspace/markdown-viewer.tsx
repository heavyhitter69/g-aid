import React from "react";
import { cn } from "@/lib/utils";
import { Info, AlertTriangle, AlertCircle, Lightbulb } from "lucide-react";

interface MarkdownViewerProps {
  content: string;
}

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  // A simple markdown parser that supports headings, bold, lists, code, and GitHub style alerts.
  
  const renderMarkdown = () => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Blank lines
      if (trimmed === "") {
        elements.push(<div key={`blank-${i}`} className="h-4" />);
        i++;
        continue;
      }
      
      // Headings
      if (line.startsWith("# ")) {
        elements.push(<h1 key={i} className="text-2xl font-bold text-white mt-6 mb-4">{parseInline(line.slice(2))}</h1>);
        i++; continue;
      }
      if (line.startsWith("## ")) {
        elements.push(<h2 key={i} className="text-lg font-semibold text-white mt-6 mb-3">{parseInline(line.slice(3))}</h2>);
        i++; continue;
      }
      if (line.startsWith("### ")) {
        elements.push(<h3 key={i} className="text-base font-semibold text-white mt-4 mb-2">{parseInline(line.slice(4))}</h3>);
        i++; continue;
      }

      // GitHub Alerts
      if (trimmed.startsWith("> [!")) {
        const typeMatch = trimmed.match(/> \[!(.*?)\]/);
        if (typeMatch) {
          const type = typeMatch[1].toUpperCase();
          const alertLines: string[] = [];
          
          let alertLine = trimmed.replace(/> \[!.*?\]\s*/, "");
          if (alertLine) alertLines.push(alertLine);
          
          i++;
          while (i < lines.length && lines[i].trim().startsWith(">")) {
            alertLines.push(lines[i].trim().slice(1).trim());
            i++;
          }
          
          let borderColor = "border-[#3c3c3c]";
          let titleColor = "text-[#cccccc]";
          let Icon = Info;
          
          if (type === "IMPORTANT") {
            borderColor = "border-[#8957e5]";
            titleColor = "text-[#8957e5]";
            Icon = AlertCircle;
          } else if (type === "WARNING" || type === "CAUTION") {
            borderColor = "border-[#d18616]";
            titleColor = "text-[#d18616]";
            Icon = AlertTriangle;
          } else if (type === "NOTE") {
            borderColor = "border-[#3794ff]";
            titleColor = "text-[#3794ff]";
            Icon = Info;
          } else if (type === "TIP") {
            borderColor = "border-[#4caf50]";
            titleColor = "text-[#4caf50]";
            Icon = Lightbulb;
          }

          elements.push(
            <div key={`alert-${i}`} className={cn("my-4 border-l-2 pl-4 py-1", borderColor)}>
              <div className={cn("flex items-center gap-1.5 font-semibold text-xs mb-1", titleColor)}>
                {type}
              </div>
              <div className="text-[13px] text-[#cccccc] leading-relaxed">
                {alertLines.map((l, idx) => (
                  <p key={idx} className="mb-1">{parseInline(l)}</p>
                ))}
              </div>
            </div>
          );
          continue;
        }
      }

      // Blockquotes (standard)
      if (trimmed.startsWith(">")) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          quoteLines.push(lines[i].trim().slice(1).trim());
          i++;
        }
        elements.push(
          <div key={`quote-${i}`} className="border-l-2 border-[#555] pl-4 py-1 my-4 text-[#aaa] italic">
            {quoteLines.map((l, idx) => (
              <p key={idx} className="mb-1">{parseInline(l)}</p>
            ))}
          </div>
        );
        continue;
      }
      
      // Code Blocks
      if (trimmed.startsWith("```")) {
        const lang = trimmed.slice(3).trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        elements.push(
          <div key={`codeblock-${i}`} className="my-4 bg-[#1e1e1e] border border-[#2b2b2b] rounded-md overflow-hidden font-mono text-[13px]">
            {lang && (
              <div className="bg-[#2d2d2d] border-b border-[#3c3c3c] px-3 py-1 text-xs text-[#858585]">
                {lang}
              </div>
            )}
            <pre className="p-3 overflow-x-auto text-[#d4d4d4]">
              <code>{codeLines.join('\n')}</code>
            </pre>
          </div>
        );
        continue;
      }

      // Unordered Lists
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const listItems = [];
        while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) {
          listItems.push(lines[i].trim().slice(2));
          i++;
        }
        elements.push(
          <ul key={`ul-${i}`} className="list-disc list-outside ml-5 my-2 space-y-1 text-[13px] text-[#cccccc] leading-relaxed">
            {listItems.map((item, idx) => (
              <li key={idx}>{parseInline(item)}</li>
            ))}
          </ul>
        );
        continue;
      }

      // Paragraphs
      elements.push(
        <p key={`p-${i}`} className="text-[13px] text-[#cccccc] leading-relaxed mb-2">
          {parseInline(trimmed)}
        </p>
      );
      
      i++;
    }
    
    return elements;
  };

  const parseInline = (text: string) => {
    if (!text) return text;
    // VERY simple inline parser for **bold**, `code`, and [links](url)
    const elements: React.ReactNode[] = [];
    
    let currentStr = text;
    let keyIdx = 0;
    
    while (currentStr.length > 0) {
      // Find the earliest matching token
      const boldMatch = currentStr.match(/\*\*(.*?)\*\*/);
      const codeMatch = currentStr.match(/`(.*?)`/);
      const linkMatch = currentStr.match(/\[(.*?)\]\((.*?)\)/);
      
      let earliestMatch = null;
      let earliestType = "";
      
      if (boldMatch && (!earliestMatch || boldMatch.index! < earliestMatch.index!)) {
        earliestMatch = boldMatch; earliestType = "bold";
      }
      if (codeMatch && (!earliestMatch || codeMatch.index! < earliestMatch.index!)) {
        earliestMatch = codeMatch; earliestType = "code";
      }
      if (linkMatch && (!earliestMatch || linkMatch.index! < earliestMatch.index!)) {
        earliestMatch = linkMatch; earliestType = "link";
      }
      
      if (!earliestMatch) {
        elements.push(<span key={keyIdx++}>{currentStr}</span>);
        break;
      }
      
      const beforeStr = currentStr.slice(0, earliestMatch.index);
      if (beforeStr) {
        elements.push(<span key={keyIdx++}>{beforeStr}</span>);
      }
      
      if (earliestType === "bold") {
        elements.push(<strong key={keyIdx++} className="font-semibold text-white">{earliestMatch[1]}</strong>);
      } else if (earliestType === "code") {
        elements.push(<code key={keyIdx++} className="bg-[#2d2d2d] border border-[#3c3c3c] text-[#d4d4d4] rounded px-1 py-0.5 font-mono text-[12px] mx-0.5">{earliestMatch[1]}</code>);
      } else if (earliestType === "link") {
        elements.push(<a key={keyIdx++} href={earliestMatch[2]} target="_blank" rel="noreferrer" className="text-[#007acc] hover:underline cursor-pointer">{earliestMatch[1]}</a>);
      }
      
      currentStr = currentStr.slice(earliestMatch.index! + earliestMatch[0].length);
    }
    
    return <>{elements}</>;
  };

  return (
    <div className="w-full h-full p-8 max-w-[800px] mx-auto overflow-y-auto">
      {renderMarkdown()}
    </div>
  );
}

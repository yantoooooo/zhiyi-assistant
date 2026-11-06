"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { hideProductIds } from "@/lib/answer-visibility";

type Props = { text: string; productIds?: readonly string[] };

/** Render model text as readable, safe Markdown without interpreting HTML. */
export function AssistantAnswer({ text, productIds = [] }: Props) {
  return <div className="assistant-answer">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children }) => <div className="answer-table-scroll" role="region" aria-label="回答对照表" tabIndex={0}><table>{children}</table></div>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
      }}
    >{hideProductIds(text, productIds)}</ReactMarkdown>
  </div>;
}

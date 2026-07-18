"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
}

// The stream constructs failure messages with these exact prefixes; treat them
// as a distinct, clearly-styled error bubble rather than a normal reply.
const ERROR_PREFIX = /^(Error|Connection error):\s*/;

function renderMarkdown(text: string) {
  // Split on bold (**text**) and links ([text](url)) patterns
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      // Internal links use Next.js Link for client-side navigation
      if (href.startsWith("/")) {
        return (
          <Link
            key={i}
            href={href}
            className="text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            {label}
          </Link>
        );
      }
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2 hover:text-accent-hover"
        >
          {label}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent px-4 py-3 text-sm text-white">
          {content}
        </div>
      </div>
    );
  }

  // Assistant error messages get a distinct danger-tinted bubble with an icon.
  if (ERROR_PREFIX.test(content)) {
    return (
      <div className="flex justify-start">
        <div className="flex max-w-[80%] items-start gap-2 rounded-2xl rounded-bl-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger leading-relaxed">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="whitespace-pre-wrap break-words">
            {content.replace(ERROR_PREFIX, "")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-card border border-card-border px-4 py-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
        {renderMarkdown(content)}
      </div>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Check, MessageSquare, PanelLeftClose } from "lucide-react";
import { ChatMessage } from "@/components/ChatMessage";
import type { Message, ToolActivity } from "@/lib/chat";

export interface WizardChatDrawerProps {
  step: 1 | 2 | 3 | 4;
  messages: Message[];
  streamingText: string;
  toolActivities: ToolActivity[];
  heartbeatTick: number;
  statusMessage: string | null;
  /** A foreground turn is streaming — input is disabled. */
  streaming: boolean;
  /** Desktop collapse state (owned by the wizard). */
  collapsed: boolean;
  /** A new assistant message landed while collapsed. */
  unread: boolean;
  onToggleCollapse: () => void;
  onSend: (text: string) => void;
}

const PLACEHOLDERS: Record<1 | 2 | 3 | 4, string> = {
  1: "Refine the options…",
  2: "Adjust days or sides…",
  3: "Anything else to add?",
  4: "Any final changes?",
};

function ToolActivityList({
  toolActivities,
  heartbeatTick,
  statusMessage,
}: {
  toolActivities: ToolActivity[];
  heartbeatTick: number;
  statusMessage: string | null;
}) {
  const anyRunning = toolActivities.some((a) => a.durationMs == null);
  return (
    <div className="flex flex-col items-start gap-1.5 py-2">
      {toolActivities.length > 0 && (
        <div className="flex flex-col gap-1">
          {toolActivities.map((activity, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-muted">
              {activity.durationMs != null ? (
                <Check className="h-3 w-3 text-success/70" />
              ) : (
                <Loader2 className="h-3 w-3 animate-spin text-accent" />
              )}
              <span>{activity.label}</span>
              {activity.durationMs != null && (
                <span className="opacity-50">{(activity.durationMs / 1000).toFixed(1)}s</span>
              )}
            </div>
          ))}
        </div>
      )}
      {!anyRunning && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="relative flex h-3.5 w-3.5 items-center justify-center">
            {heartbeatTick > 0 && (
              <span
                key={heartbeatTick}
                className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75"
                style={{ animation: "ping 1s cubic-bezier(0, 0, 0.2, 1) 1 forwards" }}
              />
            )}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success/50" />
          </span>
          <span>{statusMessage ?? "Thinking..."}</span>
        </div>
      )}
    </div>
  );
}

/** Shared message list + tool activity + input, used by both the desktop panel
 *  and the mobile sheet. */
function DrawerContent({
  step,
  messages,
  streamingText,
  toolActivities,
  heartbeatTick,
  statusMessage,
  streaming,
  onSend,
}: Pick<
  WizardChatDrawerProps,
  | "step"
  | "messages"
  | "streamingText"
  | "toolActivities"
  | "heartbeatTick"
  | "statusMessage"
  | "streaming"
  | "onSend"
>) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, toolActivities]);

  function submit() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    onSend(text);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const showActivity = streaming && (streamingText === "" || toolActivities.some((a) => a.durationMs == null));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && !streamingText && !streaming && (
          <p className="px-1 py-6 text-center text-xs text-muted">
            Chat with the planner to refine each step.
          </p>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} role={msg.role} content={msg.content} />
        ))}
        {streamingText && <ChatMessage role="assistant" content={streamingText} />}
        {showActivity && (
          <ToolActivityList
            toolActivities={toolActivities}
            heartbeatTick={heartbeatTick}
            statusMessage={statusMessage}
          />
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-card-border p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDERS[step]}
            disabled={streaming}
            className="flex-1 rounded-lg border border-input-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
          />
          <button
            onClick={submit}
            disabled={streaming || !input.trim()}
            aria-label="Send"
            className="flex items-center justify-center rounded-lg bg-accent px-3 text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WizardChatDrawer(props: WizardChatDrawerProps) {
  const { collapsed, unread, onToggleCollapse, streaming } = props;
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      {/* Desktop: collapsed slim tab */}
      {collapsed && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Open chat"
          className="hidden shrink-0 flex-col items-center gap-2 rounded-xl border border-card-border bg-card py-3 shadow-sm transition-colors hover:bg-tag-bg lg:flex lg:w-12"
        >
          <span className="relative">
            <MessageSquare className="h-5 w-5 text-accent" />
            {unread && (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-danger" />
            )}
          </span>
          <span className="[writing-mode:vertical-rl] text-[11px] font-medium text-muted">Chat</span>
        </button>
      )}

      {/* Desktop: expanded panel */}
      {!collapsed && (
        <div className="hidden shrink-0 flex-col rounded-xl border border-card-border bg-card shadow-sm lg:flex lg:w-72">
          <div className="flex items-center justify-between border-b border-card-border px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold text-foreground">Chat</h2>
              {streaming && <Loader2 className="h-3 w-3 animate-spin text-accent" />}
            </div>
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse chat"
              className="rounded-md p-1 text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
          <DrawerContent {...props} />
        </div>
      )}

      {/* Mobile: floating button (bottom-left to clear the AssistantFAB) + sheet */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Open chat"
        className="fixed bottom-20 left-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-colors hover:bg-accent-hover lg:hidden"
      >
        <MessageSquare className="h-5 w-5" />
        {unread && <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-card bg-danger" />}
      </button>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSheetOpen(false)} />
          <div className="relative flex h-[75vh] flex-col rounded-t-2xl border-t border-card-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-card-border px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-semibold text-foreground">Chat</h2>
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close chat"
                className="rounded-md p-1 text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <DrawerContent {...props} />
          </div>
        </div>
      )}
    </>
  );
}

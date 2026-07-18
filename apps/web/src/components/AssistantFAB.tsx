"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, X, Send, Loader2, RotateCcw, Check } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { useToast } from "./Toast";
import { getToolLabel, isWriteTool } from "@/lib/chat";
import type { Message, ToolActivity } from "@/lib/chat";

interface AssistantSessionState {
  claudeSessionId: string | null;
  messages: Message[];
  lastActive: string;
}

const STORAGE_KEY = "meal-planner-assistant-session";
const INACTIVITY_MS = 24 * 60 * 60 * 1000; // 24 hours

function loadSession(): AssistantSessionState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as AssistantSessionState;
    const elapsed = Date.now() - new Date(state.lastActive).getTime();
    if (elapsed > INACTIVITY_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

function saveSession(state: AssistantSessionState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable
  }
}

function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function getPageContext(pathname: string): string {
  if (pathname === "/") return "the Home page";
  if (pathname === "/plan") return "the Meal Planning page";
  if (pathname === "/week") return "the This Week view (current meal plan)";
  if (pathname.startsWith("/recipes")) return "the Recipes page (browsing the recipe library)";
  if (pathname === "/grocery") return "the Grocery List page (current shopping list)";
  if (pathname.startsWith("/settings/preferences")) return "the Family Preferences page";
  if (pathname.startsWith("/settings/kitchen")) return "the Kitchen Settings page";
  if (pathname.startsWith("/settings/history")) return "the Meal Plan History page";
  if (pathname.startsWith("/settings/sides")) return "the Sides settings page";
  if (pathname.startsWith("/settings/swaps")) return "the Ingredient Swaps settings page";
  if (pathname.startsWith("/settings/recurring")) return "the Recurring Groceries settings page";
  if (pathname.startsWith("/settings")) return "the Settings page";
  if (pathname.startsWith("/review")) return "the Meal Review page";
  return pathname;
}

const QUICK_ACTIONS = [
  { label: "Add pantry item", message: "I'd like to add something to our pantry." },
  { label: "Set someone as away", message: "I need to set a family member as away for the week." },
  { label: "Update grocery list", message: "I'd like to update our grocery list." },
  { label: "Check preferences", message: "What are our current family preferences?" },
];

interface AssistantFABProps {
  pathname: string;
}

export function AssistantFAB({ pathname }: AssistantFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [heartbeatTick, setHeartbeatTick] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);
  const [hasUnread, setHasUnread] = useState(false);
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  const persistRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOpenRef = useRef(isOpen);
  // Hide on surfaces that host their own dedicated chat (cook + plan).
  const hidden = pathname.startsWith("/cook") || pathname.startsWith("/plan");
  const { toast } = useToast();

  // Keep ref in sync so the streaming callback can read current open state
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // Clear unread indicator when panel opens
  useEffect(() => {
    if (isOpen) setHasUnread(false);
  }, [isOpen]);

  // Restore session from localStorage on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const saved = loadSession();
    if (saved) {
      setClaudeSessionId(saved.claudeSessionId);
      setMessages(saved.messages);
    }
  }, []);

  // Persist to localStorage (debounced)
  useEffect(() => {
    if (!initialized.current) return;
    if (messages.length === 0 && !claudeSessionId) return;

    if (persistRef.current) clearTimeout(persistRef.current);
    persistRef.current = setTimeout(() => {
      saveSession({
        claudeSessionId,
        messages,
        lastActive: new Date().toISOString(),
      });
    }, 300);
  }, [messages, claudeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;

      const userMessage = text.trim();
      setInput("");
      setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
      setStreaming(true);
      setStreamingText("");
      let hadWrites = false;

      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claudeSessionId,
            message: userMessage,
            pageContext: getPageContext(pathname),
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`API error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6);

            try {
              const event = JSON.parse(json);

              switch (event.type) {
                case "session_id":
                  setClaudeSessionId(event.sessionId);
                  break;

                case "text_delta":
                  accumulatedText += event.text;
                  setStreamingText(accumulatedText);
                  setStatusMessage(null);
                  break;

                case "tool_start":
                  setStatusMessage(null);
                  setToolActivities(prev => [...prev, {
                    toolName: event.toolName,
                    toolUseId: event.toolUseId,
                    label: getToolLabel(event.toolName),
                    startedAt: Date.now(),
                  }]);
                  break;

                case "tool_progress":
                  break;

                case "tool_complete": {
                  const completedAt = Date.now();
                  setToolActivities(prev =>
                    prev.map(a =>
                      a.toolUseId === event.toolUseId && a.durationMs == null
                        ? {
                            ...a,
                            durationMs: event.durationMs ?? completedAt - a.startedAt,
                            isError: event.isError,
                          }
                        : a,
                    ),
                  );
                  if (event.toolName && isWriteTool(event.toolName)) {
                    hadWrites = true;
                  }
                  break;
                }

                case "tool_result": {
                  if (event.toolName && isWriteTool(event.toolName) && event.summary) {
                    toast(event.summary, "info");
                  }
                  break;
                }

                case "heartbeat":
                  setHeartbeatTick(t => t + 1);
                  break;

                case "status":
                  setStatusMessage(event.message);
                  break;

                case "message_complete":
                  accumulatedText = "";
                  setStreamingText("");
                  setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: event.text },
                  ]);
                  // Mark unread if panel is closed
                  if (!isOpenRef.current) setHasUnread(true);
                  break;

                case "error":
                  setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: `Error: ${event.message}` },
                  ]);
                  break;

                case "done":
                  if (accumulatedText) {
                    setMessages((prev) => [
                      ...prev,
                      { role: "assistant", content: accumulatedText },
                    ]);
                    accumulatedText = "";
                    setStreamingText("");
                    if (!isOpenRef.current) setHasUnread(true);
                  }
                  break;
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Connection error: ${String(err)}` },
        ]);
      } finally {
        setStreaming(false);
        setToolActivities([]);
        setHeartbeatTick(0);
        setStatusMessage(null);
        setStreamingText("");
        // Refresh server component data if any write tools were called
        if (hadWrites) router.refresh();
      }
    },
    [claudeSessionId, pathname, streaming, toast, router],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleNewConversation() {
    clearSession();
    setMessages([]);
    setClaudeSessionId(null);
    setInput("");
    setStreamingText("");
    setToolActivities([]);
    setHeartbeatTick(0);
    setStatusMessage(null);
  }

  const hasMessages = messages.length > 0 || streaming;

  if (hidden) return null;

  return (
    <>
      {/* Chat panel */}
      <div
        className={`fixed z-40 transition-all duration-200 ease-out
          md:bottom-24 md:right-6 md:w-96 md:h-[32rem] md:rounded-2xl
          max-md:inset-x-0 max-md:bottom-0 max-md:h-[70vh] max-md:rounded-t-2xl max-md:rounded-b-none
          flex flex-col border border-card-border bg-card shadow-2xl
          ${isOpen ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-4 opacity-0 pointer-events-none"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-card-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Assistant</h2>
          <div className="flex items-center gap-1">
            {hasMessages && (
              <button
                onClick={handleNewConversation}
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground"
                title="New conversation"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!hasMessages && (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <p className="text-sm text-muted">How can I help?</p>
              <div className="flex flex-wrap justify-center gap-2">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => {
                      sendMessage(action.message);
                    }}
                    className="rounded-full border border-card-border bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:border-accent hover:text-accent"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage key={i} role={msg.role} content={msg.content} />
          ))}

          {streamingText && <ChatMessage role="assistant" content={streamingText} />}

          {streaming && (streamingText === "" || toolActivities.some(a => a.durationMs == null)) && (
            <div className="flex flex-col items-center gap-1.5 py-3">
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
              {!toolActivities.some(a => a.durationMs == null) && (
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                  <span>{statusMessage ?? "Thinking..."}</span>
                </div>
              )}
              <span className="relative mt-2 flex h-1.5 w-1.5">
                {heartbeatTick > 0 && (
                  <span
                    key={heartbeatTick}
                    className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75"
                    style={{ animation: "ping 1s cubic-bezier(0, 0, 0.2, 1) 1" }}
                  />
                )}
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success/50" />
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-card-border p-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              disabled={streaming}
              className="flex-1 rounded-lg border border-input-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={streaming || !input.trim()}
              className="flex items-center justify-center rounded-lg bg-accent px-3 text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {streaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* FAB button — hidden on mobile when panel is open */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-all duration-200 hover:bg-accent-hover hover:scale-105 max-md:bottom-5 max-md:right-4 ${isOpen ? "max-md:hidden" : ""}`}
        title={isOpen ? "Close assistant" : "Open assistant"}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
        {/* Unread indicator */}
        {hasUnread && !isOpen && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-white" />
          </span>
        )}
      </button>
    </>
  );
}

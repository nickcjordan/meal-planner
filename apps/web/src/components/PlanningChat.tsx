"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Play, RotateCcw } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { MealPlanPanel } from "./MealPlanPanel";
import { RecipeModal } from "./RecipeModal";
import type { MealProposal } from "@meal-planner/agent";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface SessionState {
  claudeSessionId: string | null;
  messages: Message[];
  proposal: MealProposal | null;
  weekOf: string;
  confirmed: boolean;
}

const STORAGE_KEY = "meal-planner-active-session";

function loadSession(weekOf: string): SessionState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as SessionState;
    if (state.weekOf !== weekOf) return null;
    return state;
  } catch {
    return null;
  }
}

function saveSession(state: SessionState) {
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

const TOOL_LABELS: Record<string, string> = {
  search_recipes: "Searching recipes...",
  get_recipe_details: "Reading recipe details...",
  get_recent_meal_plans: "Checking recent meal history...",
  get_recipe_history: "Looking up recipe history...",
  get_pantry_items: "Checking pantry items...",
  save_meal_plan: "Saving your meal plan...",
  present_meal_plan: "Preparing meal plan...",
};

interface PlanningChatProps {
  weekOf: string;
}

export function PlanningChat({ weekOf }: PlanningChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<MealProposal | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [modalRecipeId, setModalRecipeId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const saved = loadSession(weekOf);
    if (saved) {
      setClaudeSessionId(saved.claudeSessionId);
      setMessages(saved.messages);
      setProposal(saved.proposal);
      setConfirmed(saved.confirmed);
    }
  }, [weekOf]);

  const persistSession = useCallback(() => {
    saveSession({ claudeSessionId, messages, proposal, weekOf, confirmed });
  }, [claudeSessionId, messages, proposal, weekOf, confirmed]);

  useEffect(() => {
    if (initialized.current && (messages.length > 0 || claudeSessionId)) {
      persistSession();
    }
  }, [messages, claudeSessionId, proposal, confirmed, persistSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  async function sendMessage(text: string, showAsUserMessage = true) {
    if (!text.trim() || streaming) return;

    const userMessage = text.trim();
    setInput("");
    if (showAsUserMessage) {
      setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    }
    setStreaming(true);
    setStreamingText("");
    setToolStatus(null);

    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claudeSessionId,
          weekOf,
          message: userMessage,
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
                break;

              case "tool_progress":
                setToolStatus(TOOL_LABELS[event.toolName] ?? `Using ${event.toolName}...`);
                break;

              case "tool_result":
                setToolStatus(null);
                break;

              case "meal_proposal":
                setProposal(event.proposal);
                break;

              case "message_complete":
                accumulatedText = "";
                setStreamingText("");
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: event.text },
                ]);
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
      setToolStatus(null);
      setStreamingText("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleRequestSwap(day: string, mealType: string, complexity?: string) {
    const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
    const complexityNote = complexity ? ` Swap it for a ${complexity} recipe.` : "";
    sendMessage(`Can you swap ${dayLabel}'s ${mealType} for something different?${complexityNote}`);
  }

  function handleSaved() {
    setConfirmed(true);
    clearSession();
  }

  function handleStartNew() {
    clearSession();
    setMessages([]);
    setClaudeSessionId(null);
    setProposal(null);
    setConfirmed(false);
    setInput("");
  }

  const weekLabel = new Date(weekOf).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const hasStarted = messages.length > 0 || streaming;

  // Before a proposal exists, chat is full-width centered
  if (!proposal) {
    return (
      <>
        <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-3xl flex-col rounded-xl border border-card-border bg-card shadow-sm">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {!hasStarted && (
              <div className="flex h-full flex-col items-center justify-center gap-6">
                <div className="text-center">
                  <h1 className="text-2xl font-bold text-foreground">Plan Your Week</h1>
                  <p className="mt-2 text-muted text-sm">
                    Week of {weekLabel}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <button
                    onClick={() => sendMessage("Plan my dinners for this week. Surprise me!", false)}
                    className="flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                  >
                    <Play className="h-4 w-4" /> Start Planning
                  </button>
                  <p className="text-xs text-muted">Or type preferences below</p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <ChatMessage key={i} role={msg.role} content={msg.content} />
            ))}

            {streamingText && <ChatMessage role="assistant" content={streamingText} />}

            {toolStatus && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                {toolStatus}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-card-border p-4">
            <div className="flex gap-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={!hasStarted ? "Or describe preferences, constraints, or cravings..." : "Ask for changes..."}
                disabled={streaming}
                rows={1}
                className="flex-1 resize-none rounded-lg border border-input-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={streaming || !input.trim()}
                className="flex items-center justify-center rounded-lg bg-accent px-4 text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {streaming ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {modalRecipeId && <RecipeModal recipeId={modalRecipeId} onClose={() => setModalRecipeId(null)} />}
      </>
    );
  }

  // After a proposal exists: split layout — chat sidebar left, plan hero right
  return (
    <>
      <div className="flex h-[calc(100vh-7rem)] gap-4">
        {/* Chat sidebar */}
        <div className="flex w-80 shrink-0 flex-col rounded-xl border border-card-border bg-card shadow-sm xl:w-96">
          <div className="border-b border-card-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Chat</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <ChatMessage key={i} role={msg.role} content={msg.content} />
            ))}

            {streamingText && <ChatMessage role="assistant" content={streamingText} />}

            {toolStatus && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {toolStatus}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {!confirmed ? (
            <div className="border-t border-card-border p-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask for swaps or changes..."
                  disabled={streaming}
                  className="flex-1 rounded-lg border border-input-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={streaming || !input.trim()}
                  className="flex items-center justify-center rounded-lg bg-accent px-3 text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="border-t border-card-border p-3">
              <button
                onClick={handleStartNew}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" /> New session
              </button>
            </div>
          )}
        </div>

        {/* Meal plan hero */}
        <div className="flex-1 min-w-0 rounded-xl border border-card-border bg-card shadow-sm">
          <MealPlanPanel
            proposal={proposal}
            weekOf={weekOf}
            onRequestSwap={handleRequestSwap}
            onRemoveExtra={(name) => sendMessage(`Remove the "${name}" extra from the plan.`)}
            onRecipeClick={(id) => setModalRecipeId(id)}
            onSaved={handleSaved}
          />
        </div>
      </div>

      {modalRecipeId && <RecipeModal recipeId={modalRecipeId} onClose={() => setModalRecipeId(null)} />}
    </>
  );
}

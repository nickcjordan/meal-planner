"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Send, Loader2, Play, RotateCcw, Info, ShoppingCart, ChefHat } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { MealPlanPanel } from "./MealPlanPanel";
import { RecipeModal } from "./RecipeModal";
import { getToolLabel } from "@/lib/chat";
import type { Message } from "@/lib/chat";
import type { MealProposal, ProposedStaple, ProposedSuggestion } from "@meal-planner/agent";

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
  const persistRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Family context for pre-planning reminder
  const [familyContext, setFamilyContext] = useState<{
    members: { name: string; isActive: boolean; notes?: string }[];
    adaptations: { name: string; memberName: string; isActive: boolean }[];
    inventoryAlerts: { name: string; status: string }[];
  } | null>(null);

  const fetchFamilyContext = useCallback(async () => {
    try {
      const [membersRes, adaptRes, invRes] = await Promise.all([
        fetch("/api/members").then((r) => r.json()),
        fetch("/api/adaptations").then((r) => r.json()),
        fetch("/api/inventory").then((r) => r.json()).catch(() => []),
      ]);
      const memberMap = Object.fromEntries(membersRes.map((m: { id: string; name: string }) => [m.id, m.name]));
      setFamilyContext({
        members: membersRes,
        adaptations: adaptRes.map((a: { name: string; memberId: string; isActive: boolean }) => ({
          name: a.name, memberName: memberMap[a.memberId] ?? "Unknown", isActive: a.isActive,
        })),
        inventoryAlerts: invRes.filter((i: { status: string }) => i.status === "out" || i.status === "low"),
      });
    } catch {
      // silent — reminder is optional
    }
  }, []);

  useEffect(() => { fetchFamilyContext(); }, [fetchFamilyContext]);

  // Restore session from localStorage on mount
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

  // Persist to localStorage (debounced to avoid excessive writes)
  useEffect(() => {
    if (!initialized.current) return;
    if (messages.length === 0 && !claudeSessionId) return;

    if (persistRef.current) clearTimeout(persistRef.current);
    persistRef.current = setTimeout(() => {
      saveSession({ claudeSessionId, messages, proposal, weekOf, confirmed });
    }, 300);
  }, [messages, claudeSessionId, proposal, confirmed, weekOf]);

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

              case "tool_start":
                setToolStatus(getToolLabel(event.toolName));
                break;

              case "tool_progress":
                setToolStatus(getToolLabel(event.toolName));
                break;

              case "tool_result":
                setToolStatus(null);
                break;

              case "status":
                setToolStatus(event.message);
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

  function handleRemoveStaple(stapleName: string) {
    if (!proposal) return;
    const updatedStaples = (proposal.groceryStaples ?? []).filter((s) => s.name !== stapleName);
    setProposal({ ...proposal, groceryStaples: updatedStaples });
  }

  function handleAddStaple(staple: ProposedStaple) {
    if (!proposal) return;
    const existing = proposal.groceryStaples ?? [];
    if (existing.some((s) => s.name === staple.name)) return;
    setProposal({ ...proposal, groceryStaples: [...existing, staple] });
  }

  function handleConfirmCarryover(name: string, action: "confirmed" | "added-to-list") {
    if (!proposal) return;
    if (action === "added-to-list") {
      // Remove from carryover — the agent should re-present without it
      sendMessage(`I don't have the leftover ${name}. Please add it to the shopping list.`);
    } else {
      // Just update local state to show confirmed
      const updated = (proposal.carryoverItems ?? []).filter((c) => c.name !== name);
      setProposal({ ...proposal, carryoverItems: updated });
    }
  }

  function handleAcceptSuggestion(suggestion: ProposedSuggestion) {
    if (!proposal) return;

    // Pantry promotions: add to pantry via API, then tell the agent
    if (suggestion.type === "pantry-promotion") {
      const updatedSuggestions = (proposal.suggestions ?? []).filter((s) => s.id !== suggestion.id);
      setProposal({ ...proposal, suggestions: updatedSuggestions });
      sendMessage(
        `Yes, add "${suggestion.title}" to our pantry — we always have it on hand.`,
        false,
      );
      return;
    }

    if (suggestion.item) {
      // Add the suggested item as a staple in the plan
      handleAddStaple(suggestion.item);
      // Remove from suggestions
      const updatedSuggestions = (proposal.suggestions ?? []).filter((s) => s.id !== suggestion.id);
      setProposal({ ...proposal, suggestions: updatedSuggestions });

      // If it's a smart-promotion, also add it as a permanent staple via chat
      if (suggestion.type === "smart-promotion") {
        sendMessage(
          `Yes, add "${suggestion.item.name}" as a ${suggestion.item.frequency} grocery staple.`,
          false,
        );
      }
    } else {
      // For deal-meal or other non-item suggestions, delegate to chat
      sendMessage(`I'd like to add the suggested "${suggestion.title}" to the plan.`);
    }
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
        <div className="mx-auto flex h-full max-w-3xl flex-col rounded-xl border border-card-border bg-card shadow-sm">
          <div className={`flex-1 p-6 space-y-4 ${hasStarted ? "overflow-y-auto" : "overflow-hidden"}`}>
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

                {/* Family context reminder */}
                {familyContext && (familyContext.members.some((m) => !m.isActive) || familyContext.inventoryAlerts.length > 0 || familyContext.adaptations.some((a) => a.isActive)) && (
                  <div className="mt-4 w-full max-w-md rounded-lg border border-card-border bg-background px-4 py-3 text-left text-xs text-muted">
                    <div className="flex items-center gap-1.5 text-foreground font-medium mb-1.5">
                      <Info className="h-3.5 w-3.5" /> Before you plan
                    </div>
                    <ul className="space-y-0.5 ml-5 list-disc">
                      {familyContext.members.filter((m) => !m.isActive).map((m) => (
                        <li key={m.name} className="text-amber-500">{m.name} is marked away this week</li>
                      ))}
                      {familyContext.adaptations.filter((a) => a.isActive).map((a) => (
                        <li key={a.name}>{a.memberName}: {a.name} active</li>
                      ))}
                      {familyContext.inventoryAlerts.map((i) => (
                        <li key={i.name}>{i.status === "out" ? "Out of" : "Low on"} {i.name}</li>
                      ))}
                      <li>Anyone traveling? Guests coming? Mention it below.</li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            {messages.map((msg, i) => (
              <ChatMessage key={i} role={msg.role} content={msg.content} />
            ))}

            {streamingText && <ChatMessage role="assistant" content={streamingText} />}

            {streaming && (streamingText === "" || toolStatus) && (
              <div className={`flex flex-col items-center justify-center gap-3 ${messages.length === 0 && !streamingText ? "h-full" : "py-8"}`}>
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
                <span className="text-sm text-muted">
                  {toolStatus ?? "Thinking..."}
                </span>
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
      <div className="flex h-full gap-4">
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

            {streaming && (streamingText === "" || toolStatus) && (
              <div className="flex items-center gap-2 py-3 text-xs text-muted justify-center">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                <span>{toolStatus ?? "Thinking..."}</span>
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
            <div className="border-t border-card-border p-3 space-y-3">
              <div className="rounded-lg bg-tag-bg p-3">
                <p className="text-xs font-medium text-foreground">Plan saved! What&apos;s next?</p>
                <div className="mt-2 flex gap-2">
                  <Link
                    href="/grocery"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    Grocery List
                  </Link>
                  <Link
                    href="/week"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-card-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-card hover:text-foreground"
                  >
                    <ChefHat className="h-3.5 w-3.5" />
                    This Week
                  </Link>
                </div>
              </div>
              <button
                onClick={handleStartNew}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Start a new session
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
            onRemoveStaple={handleRemoveStaple}
            onConfirmCarryover={handleConfirmCarryover}
            onAcceptSuggestion={handleAcceptSuggestion}
            onRecipeClick={(id) => setModalRecipeId(id)}
            onSaved={handleSaved}
            onDiscard={handleStartNew}
          />
        </div>
      </div>

      {modalRecipeId && <RecipeModal recipeId={modalRecipeId} onClose={() => setModalRecipeId(null)} />}
    </>
  );
}

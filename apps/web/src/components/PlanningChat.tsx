"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Send, Loader2, Play, RotateCcw, Info, ShoppingCart, ChefHat, Check } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { MealPlanPanel } from "./MealPlanPanel";
import { IngredientReviewPanel } from "./IngredientReviewPanel";
import { RecipeModal } from "./RecipeModal";
import { useToast } from "./Toast";
import { getToolLabel, isWriteTool } from "@/lib/chat";
import { formatWeekOf } from "@/lib/week";
import type { Message, ToolActivity } from "@/lib/chat";
import type { MealProposal, ProposedSuggestion, MealAlternativesPayload, AlternativeMeal } from "@meal-planner/agent";

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
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [heartbeatTick, setHeartbeatTick] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<MealProposal | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [modalRecipeId, setModalRecipeId] = useState<string | null>(null);
  const [excludedIngredients, setExcludedIngredients] = useState<Set<string>>(new Set());
  const [alternatives, setAlternatives] = useState<MealAlternativesPayload | null>(null);
  const [respinLoading, setRespinLoading] = useState(false);
  const { toast } = useToast();
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
                break;
              }

              case "tool_result": {
                // Audit trail: toast for write tool completions
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

              case "meal_proposal":
                setProposal(event.proposal);
                // A full plan re-present clears any lingering alternatives
                setAlternatives(null);
                setRespinLoading(false);
                setToolActivities([]); // Stop spinner immediately
                break;

              case "meal_alternatives":
                setAlternatives(event.alternatives);
                setRespinLoading(false);
                setToolActivities([]); // Stop spinner immediately
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
      setToolActivities([]);
      setHeartbeatTick(0);
      setStatusMessage(null);
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

  function handleConfirmCarryover(name: string, action: "confirmed" | "need" | undefined) {
    if (!proposal) return;
    const updated = (proposal.carryoverItems ?? []).map((c) =>
      c.name === name ? { ...c, status: action } : c,
    );
    setProposal({ ...proposal, carryoverItems: updated });
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
      // Add the suggested item as a staple and remove from suggestions in one update
      // (two separate setProposal calls would race — the second overwrites the first)
      const existing = proposal.groceryStaples ?? [];
      const alreadyExists = existing.some((s) => s.name === suggestion.item!.name);
      const updatedSuggestions = (proposal.suggestions ?? []).filter((s) => s.id !== suggestion.id);
      setProposal({
        ...proposal,
        groceryStaples: alreadyExists ? existing : [...existing, suggestion.item],
        suggestions: updatedSuggestions,
      });

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

  function handleDismissSuggestion(suggestionId: string) {
    if (!proposal) return;
    const updatedSuggestions = (proposal.suggestions ?? []).filter((s) => s.id !== suggestionId);
    setProposal({ ...proposal, suggestions: updatedSuggestions });
  }

  function handleRequestRespin(selectedSlots: Array<{ day: string; mealType: string }>) {
    setRespinLoading(true);
    setAlternatives(null);
    const slotDescriptions = selectedSlots
      .map((s) => `${s.day.charAt(0).toUpperCase() + s.day.slice(1)}'s ${s.mealType}`)
      .join(", ");
    sendMessage(
      `I'd like to re-spin these meals — please suggest 3 alternatives for each: ${slotDescriptions}`,
    );
  }

  function handleConfirmRespinPicks(picks: Array<{ day: string; mealType: string; picked: AlternativeMeal }>) {
    // Apply all picks to the proposal at once
    if (proposal) {
      const pickMap = new Map(picks.map((p) => [`${p.day}-${p.mealType}`, p.picked]));
      const updatedMeals = proposal.meals.map((m) => {
        const pick = pickMap.get(`${m.day}-${m.mealType}`);
        return pick
          ? { ...m, recipeId: pick.recipeId, recipeName: pick.recipeName, complexity: pick.complexity, reasoning: pick.reasoning, adaptations: pick.adaptations }
          : m;
      });
      setProposal({ ...proposal, meals: updatedMeals });
    }

    // Close modal and ask AI to re-present the full updated plan
    setAlternatives(null);
    const pickDescriptions = picks
      .map((p) => `${p.day.charAt(0).toUpperCase() + p.day.slice(1)}: ${p.picked.recipeName}`)
      .join(", ");
    sendMessage(
      `I've picked replacements for the re-spun meals: ${pickDescriptions}. Please present the updated full plan.`,
      false,
    );
  }

  function handleCancelRespin() {
    setAlternatives(null);
    setRespinLoading(false);
  }

  function handleToggleIngredient(key: string) {
    setExcludedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
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
    setExcludedIngredients(new Set());
    setInput("");
  }

  const weekLabel = formatWeekOf(weekOf, {
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

            {streaming && (streamingText === "" || toolActivities.some(a => a.durationMs == null)) && (
              <div className={`flex flex-col items-center justify-center gap-3 ${messages.length === 0 && !streamingText ? "h-full" : "py-8"}`}>
                {toolActivities.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {toolActivities.map((activity, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-muted">
                        {activity.durationMs != null ? (
                          <Check className="h-3.5 w-3.5 text-green-500/70" />
                        ) : (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
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
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-5 w-5 items-center justify-center">
                      {heartbeatTick > 0 && (
                        <span
                          key={heartbeatTick}
                          className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"
                          style={{ animation: "ping 1s cubic-bezier(0, 0, 0.2, 1) 1 forwards" }}
                        />
                      )}
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500/50" />
                    </span>
                    <span className="text-sm text-muted">{statusMessage ?? "Thinking..."}</span>
                  </div>
                )}
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

            {streaming && (streamingText === "" || toolActivities.some(a => a.durationMs == null)) && (
              <div className="flex flex-col items-center gap-1.5 py-3">
                {toolActivities.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {toolActivities.map((activity, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-muted">
                        {activity.durationMs != null ? (
                          <Check className="h-3 w-3 text-green-500/70" />
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
                    <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                      {heartbeatTick > 0 && (
                        <span
                          key={heartbeatTick}
                          className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"
                          style={{ animation: "ping 1s cubic-bezier(0, 0, 0.2, 1) 1 forwards" }}
                        />
                      )}
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500/50" />
                    </span>
                    <span>{statusMessage ?? "Thinking..."}</span>
                  </div>
                )}
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
            excludedIngredients={excludedIngredients}
            alternatives={alternatives}
            respinLoading={respinLoading}
            streaming={streaming}
            onRequestRespin={handleRequestRespin}
            onConfirmRespinPicks={handleConfirmRespinPicks}
            onCancelRespin={handleCancelRespin}
            onRequestSwap={handleRequestSwap}
            onRemoveExtra={(name) => sendMessage(`Remove the "${name}" extra from the plan.`)}
            onRemoveStaple={handleRemoveStaple}
            onConfirmCarryover={handleConfirmCarryover}
            onAcceptSuggestion={handleAcceptSuggestion}
            onDismissSuggestion={handleDismissSuggestion}
            onToggleAdaptation={(day, _mealType, adaptationName, currentlyApplied) => {
              const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
              if (currentlyApplied) {
                sendMessage(`Skip the ${adaptationName} adaptation for ${dayLabel}'s meal — go with the original ingredients.`);
              } else {
                sendMessage(`Apply the ${adaptationName} adaptation to ${dayLabel}'s meal — use the substituted ingredients.`);
              }
            }}
            onRecipeClick={(id) => setModalRecipeId(id)}
            onSaved={handleSaved}
            onDiscard={handleStartNew}
          />
        </div>

        {/* Ingredient review panel */}
        <div className="w-72 shrink-0 rounded-xl border border-card-border bg-card shadow-sm">
          <IngredientReviewPanel
            proposal={proposal}
            excludedIngredients={excludedIngredients}
            onToggleIngredient={handleToggleIngredient}
            disabled={confirmed}
          />
        </div>
      </div>

      {modalRecipeId && <RecipeModal recipeId={modalRecipeId} onClose={() => setModalRecipeId(null)} />}
    </>
  );
}

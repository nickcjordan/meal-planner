"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui";
import { RecipeModal } from "@/components/RecipeModal";
import { ResumeBanner } from "@/components/ResumeBanner";
import { useToast } from "@/components/Toast";
import { tryApi } from "@/lib/api";
import { getToolLabel, isWriteTool, type Message, type ToolActivity } from "@/lib/chat";
import type {
  MealOptionsPayload,
  PlanDraftPayload,
  WeekRoundoutPayload,
  ProposedSuggestion,
} from "@meal-planner/agent";
import {
  createInitialWizardState,
  loadWizardState,
  saveWizardState,
  clearWizardState,
  toPreviewRequest,
  autoPick,
  mapPlanDraft,
  mapWeekRoundout,
  applyMealOptionsPayload,
  computeMeters,
  draftInputKey,
  buildDraftMessage,
  buildRoundoutMessage,
  buildAdHocMessage,
  toSavedMeals,
  acceptedStaples,
  savedCarryovers,
  EMPTY_FILTERS,
  type WizardState,
  type WizardFilters,
  type MealOptionCard,
  type PlanningOptionsResponse,
  type RoundoutStapleLine,
  type PreviewState,
  type GroceryPreviewResponse,
  type RoundoutUI,
} from "@/lib/wizard";
import { WizardStepper } from "./WizardStepper";
import { WizardChatDrawer } from "./WizardChatDrawer";
import { MealOptionsGrid } from "./MealOptionsGrid";
import { GroceryRail } from "./GroceryRail";
import { PlanDraftStep } from "./PlanDraftStep";
import { RoundOutStep } from "./RoundOutStep";
import { FinalReviewStep } from "./FinalReviewStep";

/** Loose SSE-event shape (mirrors the legacy parse-then-switch style). */
interface WizardEvent {
  type: string;
  sessionId?: string;
  text?: string;
  toolName?: string;
  toolUseId?: string;
  durationMs?: number;
  isError?: boolean;
  summary?: string;
  message?: string;
  payload?: unknown;
}

const EMPTY_PREVIEW: PreviewState = { items: [], count: 0, warnings: [], loading: false, stale: false };

interface StapleDueApi {
  name: string;
  style: "specific" | "flexible";
  category: string;
  defaultQuantity?: number;
  defaultUnit?: string;
  description?: string;
  frequency: "weekly" | "biweekly" | "monthly" | "as-needed";
}

export interface PlanningWizardProps {
  weekOf: string;
}

export function PlanningWizard({ weekOf }: PlanningWizardProps) {
  const { toast } = useToast();

  // ─── Persisted wizard state ────────────────────────────────────────────────
  const [state, setState] = useState<WizardState>(() => createInitialWizardState(weekOf));
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ─── Options grid (fetched fresh, NOT persisted) ───────────────────────────
  const [optionsResponse, setOptionsResponse] = useState<PlanningOptionsResponse | null>(null);
  const [grid, setGrid] = useState<MealOptionCard[]>([]);
  const gridRef = useRef<MealOptionCard[]>([]);
  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [filters, setFilters] = useState<WizardFilters>(EMPTY_FILTERS);

  // ─── Chat / turn UI ────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [heartbeatTick, setHeartbeatTick] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [transition, setTransition] = useState<"draft" | "roundout" | null>(null);
  const turnVersionRef = useRef(0);

  // ─── Drawer / modal / replace / resume ─────────────────────────────────────
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const [drawerUnread, setDrawerUnread] = useState(false);
  const [modalRecipeId, setModalRecipeId] = useState<string | null>(null);
  const [replacingSlot, setReplacingSlot] = useState<number | null>(null);
  const [resumeInfo, setResumeInfo] = useState<{ savedAt: string | null } | null>(null);

  // ─── Preview + save ────────────────────────────────────────────────────────
  const [preview, setPreview] = useState<PreviewState>(EMPTY_PREVIEW);
  const [saving, setSaving] = useState(false);

  // ─── Refs for background data / async coordination ─────────────────────────
  const staplesDueRef = useRef<RoundoutStapleLine[]>([]);
  const prefetchRef = useRef<{ inputKey: string; roundout: RoundoutUI } | null>(null);
  const initialized = useRef(false);
  const persistRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewReqRef = useRef(0);

  /** Add an assistant chat bubble; if the drawer is collapsed, flag unread. */
  const pushAssistant = useCallback((content: string) => {
    setMessages((prev) => [...prev, { role: "assistant", content }]);
    setDrawerCollapsed((collapsed) => {
      if (collapsed) setDrawerUnread(true);
      return collapsed;
    });
  }, []);

  // ─── Load options + staples-due on mount / week change ─────────────────────
  const loadOptions = useCallback(
    async (targetWeek: string) => {
      setOptionsLoading(true);
      setOptionsError(false);
      const res = await tryApi<PlanningOptionsResponse>(
        `/api/planning/options?week=${encodeURIComponent(targetWeek)}`,
      );
      if (res.ok) {
        setOptionsResponse(res.data);
        setGrid(res.data.options);
        setSearchActive(false);
      } else {
        setOptionsError(true);
        toast(res.error.message, "error");
      }
      setOptionsLoading(false);
    },
    [toast],
  );

  const loadStaplesDue = useCallback(async (targetWeek: string) => {
    const res = await tryApi<{ due: StapleDueApi[]; asNeeded: StapleDueApi[] }>(
      `/api/planning/staples-due?week=${encodeURIComponent(targetWeek)}`,
    );
    if (res.ok) {
      staplesDueRef.current = res.data.due.map((s) => ({
        name: s.name,
        style: s.style,
        category: s.category,
        quantity: s.defaultQuantity,
        unit: s.defaultUnit,
        description: s.description,
        frequency: s.frequency,
      }));
    }
  }, []);

  useEffect(() => {
    void loadOptions(weekOf);
    void loadStaplesDue(weekOf);
  }, [weekOf, loadOptions, loadStaplesDue]);

  // ─── Restore persisted state on mount ──────────────────────────────────────
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const saved = loadWizardState(weekOf);
    if (saved) {
      setState(saved);
      if (
        !saved.savedSessionId &&
        (saved.selectedRecipeIds.length > 0 || saved.draft || saved.step > 1)
      ) {
        setResumeInfo({ savedAt: saved.savedAt ?? null });
      }
    }
  }, [weekOf]);

  // ─── Debounced persistence ─────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized.current) return;
    const isFresh =
      state.selectedRecipeIds.length === 0 &&
      !state.draft &&
      state.step === 1 &&
      !state.savedSessionId;
    if (isFresh) return;
    if (persistRef.current) clearTimeout(persistRef.current);
    persistRef.current = setTimeout(() => saveWizardState(state), 300);
  }, [state]);

  // ─── Debounced grocery preview ─────────────────────────────────────────────
  const previewRequest = useMemo(() => toPreviewRequest(state), [state]);
  const previewKey = JSON.stringify(previewRequest);
  useEffect(() => {
    if (previewRequest.meals.length === 0) {
      setPreview(EMPTY_PREVIEW);
      return;
    }
    setPreview((prev) => ({ ...prev, loading: true }));
    const reqId = ++previewReqRef.current;
    const t = setTimeout(async () => {
      const res = await tryApi<GroceryPreviewResponse>("/api/grocery/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: previewKey,
      });
      if (reqId !== previewReqRef.current) return; // superseded
      if (res.ok) {
        setPreview({
          items: res.data.items,
          count: res.data.count,
          warnings: res.data.warnings,
          loading: false,
          stale: false,
        });
      } else {
        setPreview((prev) => ({ ...prev, loading: false }));
        toast(res.error.message, "error");
      }
    }, 500);
    return () => clearTimeout(t);
    // previewKey fully captures previewRequest; toast is stable.
  }, [previewKey, previewRequest.meals.length, toast]);

  /** Optimistic count nudge on selection change; corrected by the next preview. */
  function bumpPreview(delta: number) {
    setPreview((prev) => ({ ...prev, count: Math.max(0, prev.count + delta), stale: true }));
  }

  // ─── Turn runner ───────────────────────────────────────────────────────────
  const runTurn = useCallback(
    async (
      message: string,
      opts: {
        resume: boolean;
        isPrefetch: boolean;
        inputKey?: string;
        advanceOnDraft?: boolean;
        advanceOnRoundout?: boolean;
      },
    ) => {
      const version = opts.isPrefetch ? -1 : ++turnVersionRef.current;
      const isCurrent = () => opts.isPrefetch || turnVersionRef.current === version;

      if (!opts.isPrefetch) {
        setStreaming(true);
        setStreamingText("");
        setToolActivities([]);
        setStatusMessage(null);
      }

      let accumulatedText = "";
      let bubbleFromPayload = false;

      try {
        const response = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claudeSessionId: opts.resume ? stateRef.current.plannerSessionId : null,
            weekOf,
            message,
            mode: "wizard",
          }),
        });
        if (!response.ok || !response.body) {
          throw new Error(`API error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let event: WizardEvent;
            try {
              event = JSON.parse(line.slice(6)) as WizardEvent;
            } catch {
              continue;
            }
            if (!isCurrent()) continue;

            switch (event.type) {
              case "session_id":
                // Only foreground turns persist the planner session id.
                if (!opts.isPrefetch && event.sessionId) {
                  setState((prev) => ({ ...prev, plannerSessionId: event.sessionId! }));
                }
                break;

              case "text_delta":
                if (opts.isPrefetch) break;
                accumulatedText += event.text ?? "";
                setStreamingText(accumulatedText);
                setStatusMessage(null);
                break;

              case "tool_start":
                if (opts.isPrefetch) break;
                setStatusMessage(null);
                setToolActivities((prev) => [
                  ...prev,
                  {
                    toolName: event.toolName ?? "",
                    toolUseId: event.toolUseId,
                    label: getToolLabel(event.toolName ?? ""),
                    startedAt: Date.now(),
                  },
                ]);
                break;

              case "tool_complete": {
                if (opts.isPrefetch) break;
                const completedAt = Date.now();
                setToolActivities((prev) =>
                  prev.map((a) =>
                    a.toolUseId === event.toolUseId && a.durationMs == null
                      ? { ...a, durationMs: event.durationMs ?? completedAt - a.startedAt, isError: event.isError }
                      : a,
                  ),
                );
                break;
              }

              case "tool_result":
                if (!opts.isPrefetch && event.toolName && isWriteTool(event.toolName) && event.summary) {
                  toast(event.summary, "info");
                }
                break;

              case "heartbeat":
                if (!opts.isPrefetch) setHeartbeatTick((t) => t + 1);
                break;

              case "status":
                if (!opts.isPrefetch) setStatusMessage(event.message ?? null);
                break;

              case "meal_options": {
                const payload = event.payload as MealOptionsPayload;
                if (payload.annotations?.length) {
                  setState((prev) => {
                    const annotations = { ...prev.annotations };
                    for (const a of payload.annotations!) annotations[a.recipeId] = a.note;
                    return { ...prev, annotations };
                  });
                }
                setGrid((prev) => applyMealOptionsPayload(prev, payload));
                if (!opts.isPrefetch && payload.message) {
                  bubbleFromPayload = true;
                  pushAssistant(payload.message);
                }
                break;
              }

              case "plan_draft": {
                const draft = mapPlanDraft(event.payload as PlanDraftPayload);
                setState((prev) => ({
                  ...prev,
                  draft,
                  step: opts.advanceOnDraft ? 2 : prev.step,
                }));
                // Prefetch the roundout against a fresh session, keyed by inputKey.
                const key = draftInputKey(draft);
                prefetchRef.current = null;
                void runTurn(buildRoundoutMessage(weekOf, draft, staplesDueRef.current), {
                  resume: false,
                  isPrefetch: true,
                  inputKey: key,
                });
                break;
              }

              case "week_roundout": {
                const key = opts.inputKey ?? draftInputKey(stateRef.current.draft ?? []);
                const roundout = mapWeekRoundout(event.payload as WeekRoundoutPayload, key);
                if (opts.isPrefetch) {
                  prefetchRef.current = { inputKey: key, roundout };
                } else {
                  setState((prev) => ({
                    ...prev,
                    roundout,
                    step: opts.advanceOnRoundout ? 3 : prev.step,
                  }));
                }
                break;
              }

              case "message_complete":
                if (opts.isPrefetch || bubbleFromPayload) {
                  accumulatedText = "";
                  break;
                }
                if (event.text) {
                  accumulatedText = "";
                  setStreamingText("");
                  pushAssistant(event.text);
                }
                break;

              case "error":
                if (!opts.isPrefetch) pushAssistant(`Error: ${event.message ?? "something went wrong"}`);
                break;

              case "done":
                if (!opts.isPrefetch && !bubbleFromPayload && accumulatedText) {
                  const text = accumulatedText;
                  accumulatedText = "";
                  setStreamingText("");
                  pushAssistant(text);
                }
                break;
            }
          }
        }
      } catch (err) {
        if (!opts.isPrefetch) {
          pushAssistant(`Connection error: ${String(err)}`);
          toast("The planner turn failed", "error", {
            action: { label: "Retry", onClick: () => void runTurn(message, opts) },
          });
        }
      } finally {
        if (!opts.isPrefetch && isCurrent()) {
          setStreaming(false);
          setToolActivities([]);
          setHeartbeatTick(0);
          setStatusMessage(null);
          setStreamingText("");
          setTransition(null);
        }
      }
    },
    [weekOf, toast, pushAssistant],
  );

  // ─── Selection ─────────────────────────────────────────────────────────────
  function applyReplacement(newId: string) {
    const idx = replacingSlot;
    if (idx == null) return;
    const card = gridRef.current.find((c) => c.id === newId);
    setState((prev) => {
      if (!prev.draft) return prev;
      const oldId = prev.draft[idx]?.recipeId;
      const draft = prev.draft.map((m, i) =>
        i === idx
          ? {
              ...m,
              recipeId: newId,
              recipeName: card?.name ?? newId,
              complexity: card?.complexity ?? m.complexity,
              sides: [],
              adaptationDecisions: [],
            }
          : m,
      );
      const selectedRecipeIds = prev.selectedRecipeIds.map((id) => (id === oldId ? newId : id));
      const selectedMeta = { ...prev.selectedMeta };
      if (oldId) delete selectedMeta[oldId];
      if (card) {
        selectedMeta[newId] = {
          name: card.name,
          complexity: card.complexity,
          protein: card.primaryProtein,
          cuisine: card.cuisineType,
          totalTime: card.totalTime,
        };
      }
      return { ...prev, draft, selectedRecipeIds, selectedMeta, step: 2 };
    });
    setReplacingSlot(null);
  }

  function toggleSelect(id: string) {
    if (replacingSlot != null) {
      applyReplacement(id);
      return;
    }
    const has = stateRef.current.selectedRecipeIds.includes(id);
    setState((prev) => {
      const already = prev.selectedRecipeIds.includes(id);
      const selectedRecipeIds = already
        ? prev.selectedRecipeIds.filter((x) => x !== id)
        : [...prev.selectedRecipeIds, id];
      const selectedMeta = { ...prev.selectedMeta };
      if (already) {
        delete selectedMeta[id];
      } else {
        const card = gridRef.current.find((c) => c.id === id);
        if (card) {
          selectedMeta[id] = {
            name: card.name,
            complexity: card.complexity,
            protein: card.primaryProtein,
            cuisine: card.cuisineType,
            totalTime: card.totalTime,
          };
        }
      }
      return { ...prev, selectedRecipeIds, selectedMeta };
    });
    bumpPreview(has ? -3 : 3);
  }

  // ─── Continue transitions ──────────────────────────────────────────────────
  function continueToDraft() {
    const s = stateRef.current;
    const meals = s.selectedRecipeIds.map((id) => {
      const meta = s.selectedMeta[id];
      return {
        name: meta?.name ?? id,
        id,
        complexity: meta?.complexity ?? "standard",
        protein: meta?.protein,
        totalTime: meta?.totalTime ?? 0,
      };
    });
    const constraints =
      optionsResponse?.context.scheduleConstraints.map((c) => `${c.day}: ${c.note}`).join("; ") ?? "";
    setTransition("draft");
    void runTurn(buildDraftMessage(weekOf, meals, constraints), {
      resume: true,
      isPrefetch: false,
      advanceOnDraft: true,
    });
  }

  function continueToRoundout() {
    const draft = stateRef.current.draft ?? [];
    const key = draftInputKey(draft);
    if (prefetchRef.current && prefetchRef.current.inputKey === key) {
      setState((prev) => ({ ...prev, roundout: prefetchRef.current!.roundout, step: 3 }));
      return;
    }
    setTransition("roundout");
    void runTurn(buildRoundoutMessage(weekOf, draft, staplesDueRef.current), {
      resume: true,
      isPrefetch: false,
      inputKey: key,
      advanceOnRoundout: true,
    });
  }

  function navigateStep(step: 1 | 2 | 3 | 4) {
    setReplacingSlot(null);
    setState((prev) => ({ ...prev, step }));
  }

  // ─── Ad-hoc chat ───────────────────────────────────────────────────────────
  function handleSend(text: string) {
    if (streaming) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    const ctx = {
      grid: gridRef.current.map((c) => ({
        name: c.name,
        id: c.id,
        complexity: c.complexity,
        protein: c.primaryProtein,
      })),
      staplesDue: staplesDueRef.current,
    };
    void runTurn(buildAdHocMessage(stateRef.current.step, stateRef.current, text, ctx), {
      resume: true,
      isPrefetch: false,
    });
  }

  // ─── Search ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(
    async (q: string) => {
      if (!q) {
        setSearchActive(false);
        if (optionsResponse) setGrid(optionsResponse.options);
        return;
      }
      setSearching(true);
      const res = await tryApi<PlanningOptionsResponse>(
        `/api/planning/options?week=${encodeURIComponent(weekOf)}&q=${encodeURIComponent(q)}`,
      );
      if (res.ok) {
        setGrid(res.data.options);
        setSearchActive(true);
      } else {
        toast(res.error.message, "error");
      }
      setSearching(false);
    },
    [weekOf, optionsResponse, toast],
  );

  // ─── Draft-step handlers ───────────────────────────────────────────────────
  function updateDraft(mutator: (draft: WizardState["draft"]) => WizardState["draft"]) {
    setState((prev) => ({ ...prev, draft: mutator(prev.draft) }));
  }

  const draftHandlers = {
    onChangeDay: (idx: number, day: string) =>
      updateDraft((d) => d?.map((m, i) => (i === idx ? { ...m, day } : m)) ?? d),
    onToggleSide: (idx: number, sideIdx: number) =>
      updateDraft(
        (d) =>
          d?.map((m, i) =>
            i === idx
              ? { ...m, sides: m.sides.map((s, j) => (j === sideIdx ? { ...s, accepted: !s.accepted } : s)) }
              : m,
          ) ?? d,
      ),
    onToggleAdaptation: (idx: number, adaptationName: string) =>
      updateDraft(
        (d) =>
          d?.map((m, i) =>
            i === idx
              ? {
                  ...m,
                  adaptationDecisions: m.adaptationDecisions.map((a) =>
                    a.adaptationName === adaptationName ? { ...a, applied: !a.applied } : a,
                  ),
                }
              : m,
          ) ?? d,
      ),
    onReplaceMeal: (idx: number) => {
      setReplacingSlot(idx);
      setState((prev) => ({ ...prev, step: 1 }));
    },
  };

  // ─── Round-out handlers ────────────────────────────────────────────────────
  function updateRoundout(mutator: (r: RoundoutUI) => RoundoutUI) {
    setState((prev) => (prev.roundout ? { ...prev, roundout: mutator(prev.roundout) } : prev));
  }

  const roundoutHandlers = {
    onToggleStaple: (name: string) =>
      updateRoundout((r) => ({
        ...r,
        staples: r.staples.map((s) => (s.name === name ? { ...s, accepted: !s.accepted } : s)),
      })),
    onResolveCarryover: (name: string, status: "confirmed" | "need" | undefined) =>
      updateRoundout((r) => ({
        ...r,
        carryovers: r.carryovers.map((c) => (c.name === name ? { ...c, status } : c)),
      })),
    onSuggestionAction: (id: string, action: "accept" | "dismiss") => {
      const suggestion = stateRef.current.roundout?.suggestions.find((s) => s.id === id);
      updateRoundout((r) => {
        const suggestions: RoundoutUI["suggestions"] = r.suggestions.map((s) =>
          s.id === id
            ? { ...s, state: action === "accept" ? ("accepted" as const) : ("dismissed" as const) }
            : s,
        );
        // Accepted item-bearing suggestions land in the visible Recurring group
        // (toggleable there = natural undo). Pantry promotions are chat-only.
        let staples = r.staples;
        if (action === "accept" && suggestion?.item && suggestion.type !== "pantry-promotion") {
          const existingIdx = staples.findIndex((s) => s.name === suggestion.item!.name);
          staples =
            existingIdx >= 0
              ? staples.map((s, i) => (i === existingIdx ? { ...s, accepted: true } : s))
              : [...staples, { ...suggestion.item!, accepted: true }];
        }
        return { ...r, suggestions, staples };
      });
      // Non-item accepts are chat actions (legacy handleAcceptSuggestion parity).
      if (action === "accept" && suggestion) {
        maybeChatForSuggestion(suggestion);
      }
    },
    onRemoveExtra: (name: string) =>
      updateRoundout((r) => ({ ...r, extras: r.extras.filter((e) => e.name !== name) })),
  };

  function maybeChatForSuggestion(suggestion: ProposedSuggestion) {
    if (suggestion.type === "pantry-promotion") {
      handleSystemChat(`Yes, add "${suggestion.title}" to our pantry — we always have it on hand.`);
    } else if (!suggestion.item) {
      handleSystemChat(`I'd like to add the suggested "${suggestion.title}" to the plan.`);
    } else if (suggestion.type === "smart-promotion") {
      handleSystemChat(`Yes, add "${suggestion.item.name}" as a ${suggestion.item.frequency} grocery staple.`);
    }
  }

  /** Fire a self-contained turn without adding a visible user bubble. */
  function handleSystemChat(text: string) {
    if (streaming) return;
    const ctx = { grid: gridRef.current.map((c) => ({ name: c.name, id: c.id, complexity: c.complexity, protein: c.primaryProtein })), staplesDue: staplesDueRef.current };
    void runTurn(buildAdHocMessage(stateRef.current.step, stateRef.current, text, ctx), {
      resume: true,
      isPrefetch: false,
    });
  }

  // ─── Save + merge (two-stage) ──────────────────────────────────────────────
  const runGroceryMerge = useCallback(
    async (sessionId: string) => {
      const res = await tryApi("/api/grocery/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, excludedIngredients: stateRef.current.excludedIngredients }),
      });
      if (res.ok) {
        setState((prev) => ({ ...prev, mergeFailed: false }));
      } else {
        setState((prev) => ({ ...prev, mergeFailed: true }));
        toast("Plan saved, but adding to grocery list failed", "error", {
          action: { label: "Retry", onClick: () => void runGroceryMerge(sessionId) },
        });
      }
    },
    [toast],
  );

  async function handleConfirm() {
    const s = stateRef.current;
    const draft = s.draft ?? [];
    setSaving(true);
    const res = await tryApi<{ id: string }>("/api/sessions/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekOf,
        meals: toSavedMeals(draft),
        extras: s.roundout?.extras ?? [],
        groceryStaples: acceptedStaples(s.roundout),
        carryoverItems: savedCarryovers(s.roundout),
        summary: "Weekly meal plan",
      }),
    });
    if (res.ok) {
      setState((prev) => ({ ...prev, savedSessionId: res.data.id }));
      clearWizardState();
      setResumeInfo(null);
      await runGroceryMerge(res.data.id);
    } else {
      toast(res.error.message, "error");
    }
    setSaving(false);
  }

  function handleStartNew() {
    clearWizardState();
    prefetchRef.current = null;
    setState(createInitialWizardState(weekOf));
    setMessages([]);
    setReplacingSlot(null);
    setResumeInfo(null);
    setPreview(EMPTY_PREVIEW);
    setFilters(EMPTY_FILTERS);
  }

  function toggleExclusionKeys(keys: string[]) {
    if (keys.length === 0) return;
    setState((prev) => {
      const set = new Set(prev.excludedIngredients);
      const allExcluded = keys.every((k) => set.has(k));
      for (const k of keys) {
        if (allExcluded) set.delete(k);
        else set.add(k);
      }
      return { ...prev, excludedIngredients: [...set] };
    });
  }

  // ─── Derived ───────────────────────────────────────────────────────────────
  const meters = useMemo(() => computeMeters(state.selectedMeta), [state.selectedMeta]);
  const replacingName =
    replacingSlot != null ? state.draft?.[replacingSlot]?.recipeName ?? "this meal" : null;

  // ─── Step content ──────────────────────────────────────────────────────────
  let stepContent: React.ReactNode;
  if (state.step === 1) {
    if (optionsError && grid.length === 0) {
      stepContent = (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-danger" />
          <p className="text-sm text-muted">Couldn&apos;t load recipe options.</p>
          <Button variant="secondary" size="sm" onClick={() => void loadOptions(weekOf)}>
            <RotateCcw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      );
    } else if (optionsLoading && grid.length === 0) {
      stepContent = <div className="py-16 text-center text-sm text-muted">Loading options…</div>;
    } else {
      stepContent = (
        <MealOptionsGrid
          options={grid}
          annotations={state.annotations}
          selectedIds={state.selectedRecipeIds}
          filters={filters}
          searching={searching}
          searchActive={searchActive}
          banner={optionsResponse?.banner ?? null}
          meters={meters}
          continuing={transition === "draft" && streaming}
          onToggleSelect={toggleSelect}
          onFiltersChange={setFilters}
          onSearch={handleSearch}
          onAutoPick={handleAutoPick}
          onShowRecipe={setModalRecipeId}
          onContinue={continueToDraft}
        />
      );
    }
  } else if (state.step === 2 && state.draft) {
    stepContent = (
      <PlanDraftStep
        draft={state.draft}
        onChangeDay={draftHandlers.onChangeDay}
        onToggleSide={draftHandlers.onToggleSide}
        onToggleAdaptation={draftHandlers.onToggleAdaptation}
        onReplaceMeal={draftHandlers.onReplaceMeal}
        onShowRecipe={setModalRecipeId}
        onContinue={continueToRoundout}
        onBack={() => navigateStep(1)}
        busy={transition === "roundout" && streaming}
      />
    );
  } else if (state.step === 3 && state.roundout) {
    stepContent = (
      <RoundOutStep
        roundout={state.roundout}
        onToggleStaple={roundoutHandlers.onToggleStaple}
        onResolveCarryover={roundoutHandlers.onResolveCarryover}
        onSuggestionAction={roundoutHandlers.onSuggestionAction}
        onRemoveExtra={roundoutHandlers.onRemoveExtra}
        onContinue={() => navigateStep(4)}
        onBack={() => navigateStep(2)}
        refreshing={streaming}
      />
    );
  } else if (state.step === 4) {
    stepContent = (
      <FinalReviewStep
        state={state}
        preview={preview}
        onConfirm={handleConfirm}
        onBack={() => navigateStep(3)}
        onToggleExclusion={(key) => toggleExclusionKeys([key])}
        saving={saving}
        savedSessionId={state.savedSessionId}
        mergeFailed={state.mergeFailed}
        onRetryMerge={() => state.savedSessionId && void runGroceryMerge(state.savedSessionId)}
        onStartNew={handleStartNew}
      />
    );
  } else {
    stepContent = <div className="py-16 text-center text-sm text-muted">Loading…</div>;
  }

  function handleAutoPick() {
    const ids = autoPick(gridRef.current, 5);
    setState((prev) => {
      const selectedMeta = { ...prev.selectedMeta };
      for (const id of ids) {
        const card = gridRef.current.find((c) => c.id === id);
        if (card) {
          selectedMeta[id] = {
            name: card.name,
            complexity: card.complexity,
            protein: card.primaryProtein,
            cuisine: card.cuisineType,
            totalTime: card.totalTime,
          };
        }
      }
      return { ...prev, selectedRecipeIds: ids, selectedMeta };
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 max-lg:h-auto">
      <WizardStepper step={state.step} weekOf={weekOf} onNavigate={navigateStep} />

      {resumeInfo && !state.savedSessionId && (
        <ResumeBanner
          savedAt={resumeInfo.savedAt}
          onDiscard={handleStartNew}
          onDismiss={() => setResumeInfo(null)}
        />
      )}

      {replacingSlot != null && (
        <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-foreground">
          <RotateCcw className="h-4 w-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">Pick a replacement for {replacingName}.</span>
          <button
            onClick={() => {
              setReplacingSlot(null);
              setState((prev) => ({ ...prev, step: 2 }));
            }}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-muted hover:bg-background hover:text-foreground"
          >
            <X className="mr-1 inline h-3 w-3" />
            Cancel
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3 pb-16 max-lg:flex-none lg:pb-0">
        <WizardChatDrawer
          step={state.step}
          messages={messages}
          streamingText={streamingText}
          toolActivities={toolActivities}
          heartbeatTick={heartbeatTick}
          statusMessage={statusMessage}
          streaming={streaming}
          collapsed={drawerCollapsed}
          unread={drawerUnread}
          onToggleCollapse={() => {
            setDrawerCollapsed((c) => !c);
            setDrawerUnread(false);
          }}
          onSend={handleSend}
        />

        <main className="flex min-w-0 flex-1 flex-col rounded-xl border border-card-border bg-card p-4 shadow-sm">
          {stepContent}
        </main>

        <GroceryRail
          preview={preview}
          step={state.step}
          excludedIngredients={state.excludedIngredients}
          onToggleExclusion={toggleExclusionKeys}
        />
      </div>

      {modalRecipeId && <RecipeModal recipeId={modalRecipeId} onClose={() => setModalRecipeId(null)} />}
    </div>
  );
}

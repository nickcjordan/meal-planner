"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  ShieldAlert,
  ThumbsDown,
  Heart,
  UtensilsCrossed,
  Calendar,
  Salad,
  Users,
  FlaskConical,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronRight,
  X,
  ArrowRightLeft,
} from "lucide-react";
import type {
  FamilyMember,
  FamilyPreference,
  PreferenceType,
  DietaryAdaptation,
  AdaptationLeniency,
  SubstitutionRule,
} from "@meal-planner/types";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CardSkeleton } from "@/components/Skeleton";

// ─── Constants ───────────────────────────────────────────────

const ROLES = ["dad", "mom", "son", "daughter", "partner", "other"];

const PREFERENCE_TYPES: {
  value: PreferenceType;
  label: string;
  description: string;
  icon: typeof ShieldAlert;
  color: string;
  placeholder: { key: string; value: string };
}[] = [
  { value: "restriction", label: "Restriction", description: "Allergies & intolerances", icon: ShieldAlert, color: "bg-danger/15 text-danger", placeholder: { key: "tree-nuts", value: "Emma is allergic" } },
  { value: "dislike", label: "Dislike", description: "Ingredients to avoid", icon: ThumbsDown, color: "bg-warning/15 text-warning", placeholder: { key: "cilantro", value: "Tastes like soap" } },
  { value: "like", label: "Like", description: "Ingredients & flavors to favor", icon: Heart, color: "bg-success/15 text-success", placeholder: { key: "spicy", value: "We love spicy food" } },
  { value: "cuisine", label: "Cuisine", description: "Cuisine affinities", icon: UtensilsCrossed, color: "bg-accent/15 text-accent", placeholder: { key: "mexican", value: "High preference" } },
  { value: "schedule", label: "Schedule", description: "Day-specific constraints", icon: Calendar, color: "bg-info/15 text-info", placeholder: { key: "tuesday", value: "Soccer night — staples only" } },
  { value: "diet", label: "Diet", description: "Temporary programs", icon: Salad, color: "bg-success/15 text-success", placeholder: { key: "whole30", value: "No sugar, grains, dairy, legumes, alcohol" } },
];

const TYPE_MAP = Object.fromEntries(PREFERENCE_TYPES.map((t) => [t.value, t]));

const LENIENCY_OPTIONS: { value: AdaptationLeniency; label: string; desc: string }[] = [
  { value: "always", label: "Always adapt", desc: "Swap ingredients in every meal, opt out individually" },
  { value: "when-easy", label: "When easy", desc: "Only swap when all substitutions are direct 1:1 replacements" },
  { value: "gentle-reminder", label: "Gentle reminder", desc: "Just show what could be swapped, opt in individually" },
];

const LENIENCY_STYLES: Record<AdaptationLeniency, string> = {
  "always": "bg-success/15 text-success",
  "when-easy": "bg-accent/15 text-accent",
  "gentle-reminder": "bg-tag-bg text-muted",
};

const inputClass = "mt-1 w-full rounded-lg border border-input-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none";

function memberInitialColor(name: string) {
  const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500"];
  let hash = 0;
  for (const ch of name) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

// ─── Page Component ──────────────────────────────────────────

export default function FamilySettingsPage() {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [adaptations, setAdaptations] = useState<DietaryAdaptation[]>([]);
  const [preferences, setPreferences] = useState<FamilyPreference[]>([]);
  const [loading, setLoading] = useState(true);

  // Member form
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState({ name: "", role: "", notes: "" });
  const [savingMember, setSavingMember] = useState(false);

  // Adaptation form
  const [showAdaptForm, setShowAdaptForm] = useState(false);
  const [editingAdaptId, setEditingAdaptId] = useState<string | null>(null);
  const [adaptForm, setAdaptForm] = useState({
    memberId: "", name: "", description: "", leniency: "when-easy" as AdaptationLeniency,
    skipNote: "", rules: [] as SubstitutionRule[],
  });
  const [savingAdapt, setSavingAdapt] = useState(false);
  const [expandedAdapt, setExpandedAdapt] = useState<string | null>(null);

  // Preference form
  const [showPrefForm, setShowPrefForm] = useState(false);
  const [editingPrefKey, setEditingPrefKey] = useState<{ type: string; key: string } | null>(null);
  const [prefForm, setPrefForm] = useState({
    type: "restriction" as PreferenceType, key: "", value: "", memberId: "", startDate: "", endDate: "",
  });
  const [savingPref, setSavingPref] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "member" | "adaptation" | "preference"; id: string; key?: string; name: string } | null>(null);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [m, a, p] = await Promise.all([
        fetch("/api/members").then((r) => r.json()),
        fetch("/api/adaptations").then((r) => r.json()),
        fetch("/api/preferences").then((r) => r.json()),
      ]);
      setMembers(m);
      setAdaptations(a);
      setPreferences(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Member handlers ────────────────────────────────────
  function openAddMember() {
    setMemberForm({ name: "", role: "", notes: "" });
    setEditingMemberId(null);
    setShowMemberForm(true);
  }
  function openEditMember(m: FamilyMember) {
    setMemberForm({ name: m.name, role: m.role ?? "", notes: m.notes ?? "" });
    setEditingMemberId(m.id);
    setShowMemberForm(true);
  }
  async function handleMemberSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberForm.name.trim()) return;
    setSavingMember(true);
    try {
      if (editingMemberId) {
        await fetch(`/api/members/${editingMemberId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: memberForm.name.trim(), role: memberForm.role || undefined, notes: memberForm.notes || undefined }),
        });
      } else {
        await fetch("/api/members", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: memberForm.name.trim(), role: memberForm.role || undefined, notes: memberForm.notes || undefined }),
        });
      }
      setShowMemberForm(false);
      setEditingMemberId(null);
      await fetchAll();
      toast(editingMemberId ? "Member updated" : "Member added");
    } finally { setSavingMember(false); }
  }
  async function toggleMemberActive(m: FamilyMember) {
    await fetch(`/api/members/${m.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !m.isActive }),
    });
    await fetchAll();
  }
  async function deleteMember(id: string) {
    await fetch(`/api/members/${id}`, { method: "DELETE" });
    await fetchAll();
    setDeleteConfirm(null);
    toast("Member removed");
  }

  // ─── Adaptation handlers ────────────────────────────────
  function openAddAdapt() {
    setAdaptForm({ memberId: members[0]?.id ?? "", name: "", description: "", leniency: "when-easy", skipNote: "", rules: [] });
    setEditingAdaptId(null);
    setShowAdaptForm(true);
  }
  function openEditAdapt(a: DietaryAdaptation) {
    setAdaptForm({
      memberId: a.memberId, name: a.name, description: a.description ?? "",
      leniency: a.leniency, skipNote: a.skipNote ?? "", rules: [...a.rules],
    });
    setEditingAdaptId(a.id);
    setShowAdaptForm(true);
  }
  function addRule() {
    setAdaptForm({ ...adaptForm, rules: [...adaptForm.rules, { id: crypto.randomUUID(), from: "", to: "", quality: "exact" as const }] });
  }
  function updateRule(idx: number, updates: Partial<SubstitutionRule>) {
    const rules = [...adaptForm.rules];
    rules[idx] = { ...rules[idx], ...updates };
    setAdaptForm({ ...adaptForm, rules });
  }
  function removeRule(idx: number) {
    setAdaptForm({ ...adaptForm, rules: adaptForm.rules.filter((_, i) => i !== idx) });
  }
  async function handleAdaptSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adaptForm.name.trim() || !adaptForm.memberId) return;
    setSavingAdapt(true);
    try {
      const body = {
        memberId: adaptForm.memberId, name: adaptForm.name.trim(),
        description: adaptForm.description || undefined, leniency: adaptForm.leniency,
        skipNote: adaptForm.skipNote || undefined,
        rules: adaptForm.rules.filter((r) => r.from.trim() && r.to.trim()),
      };
      if (editingAdaptId) {
        await fetch(`/api/adaptations/${editingAdaptId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } else {
        await fetch("/api/adaptations", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      setShowAdaptForm(false);
      setEditingAdaptId(null);
      await fetchAll();
      toast(editingAdaptId ? "Adaptation updated" : "Adaptation added");
    } finally { setSavingAdapt(false); }
  }
  async function toggleAdaptActive(a: DietaryAdaptation) {
    await fetch(`/api/adaptations/${a.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !a.isActive }),
    });
    await fetchAll();
  }
  async function deleteAdapt(id: string) {
    await fetch(`/api/adaptations/${id}`, { method: "DELETE" });
    await fetchAll();
    setDeleteConfirm(null);
    toast("Adaptation removed");
  }

  // ─── Preference handlers ────────────────────────────────
  function openAddPref(type?: PreferenceType) {
    setPrefForm({ type: type ?? "restriction", key: "", value: "", memberId: "", startDate: "", endDate: "" });
    setEditingPrefKey(null);
    setShowPrefForm(true);
  }
  function openEditPref(pref: FamilyPreference) {
    setPrefForm({
      type: pref.type, key: pref.key, value: pref.value,
      memberId: pref.memberId ?? "", startDate: pref.startDate ?? "", endDate: pref.endDate ?? "",
    });
    setEditingPrefKey({ type: pref.type, key: pref.key });
    setShowPrefForm(true);
  }
  async function handlePrefSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prefForm.key.trim() || !prefForm.value.trim()) return;
    setSavingPref(true);
    try {
      if (editingPrefKey && (editingPrefKey.type !== prefForm.type || editingPrefKey.key !== prefForm.key)) {
        await fetch(`/api/preferences/${encodeURIComponent(editingPrefKey.type)}/${encodeURIComponent(editingPrefKey.key)}`, { method: "DELETE" });
      }
      const selectedMember = members.find((m) => m.id === prefForm.memberId);
      await fetch("/api/preferences", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: prefForm.type, key: prefForm.key.trim().toLowerCase(), value: prefForm.value.trim(),
          memberId: prefForm.memberId || undefined,
          member: selectedMember?.name ?? undefined,
          startDate: prefForm.startDate || undefined, endDate: prefForm.endDate || undefined,
        }),
      });
      setShowPrefForm(false);
      setEditingPrefKey(null);
      await fetchAll();
      toast(editingPrefKey ? "Preference updated" : "Preference added");
    } finally { setSavingPref(false); }
  }
  async function deletePref(type: string, key: string) {
    await fetch(`/api/preferences/${encodeURIComponent(type)}/${encodeURIComponent(key)}`, { method: "DELETE" });
    await fetchAll();
    setDeleteConfirm(null);
    toast("Preference removed");
  }

  function handleDeleteConfirm() {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === "member") deleteMember(deleteConfirm.id);
    else if (deleteConfirm.type === "adaptation") deleteAdapt(deleteConfirm.id);
    else if (deleteConfirm.type === "preference") deletePref(deleteConfirm.id, deleteConfirm.key!);
  }

  // ─── Render ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const activeMembers = members.filter((m) => m.isActive);
  const inactiveMembers = members.filter((m) => !m.isActive);
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));
  const currentPrefType = TYPE_MAP[prefForm.type];
  const groupedPrefs = PREFERENCE_TYPES.map((t) => ({ ...t, items: preferences.filter((p) => p.type === t.value) }));

  return (
    <div className="mx-auto max-w-3xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Family &amp; Preferences</h1>
        <p className="mt-2 text-sm text-muted">
          Family members, dietary adaptations, and meal planning preferences. Claude uses all of this every time it plans.
        </p>
      </div>

      {/* Family summary card */}
      {members.length > 0 && (
        <div className="mt-4 rounded-lg border border-card-border bg-card px-5 py-3 text-sm">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {members.slice(0, 5).map((m) => (
                <div key={m.id} className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-card text-xs font-bold text-white ${m.isActive ? memberInitialColor(m.name) : "bg-muted/40"}`}>
                  {m.name.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
            <div className="text-muted">
              <span className="font-medium text-foreground">{activeMembers.length} member{activeMembers.length !== 1 ? "s" : ""}</span>
              {inactiveMembers.length > 0 && <span> ({inactiveMembers.length} away)</span>}
              {adaptations.filter((a) => a.isActive).length > 0 && (
                <span> &middot; {adaptations.filter((a) => a.isActive).length} adaptation{adaptations.filter((a) => a.isActive).length !== 1 ? "s" : ""}</span>
              )}
              {preferences.length > 0 && (
                <span> &middot; {preferences.length} preference{preferences.length !== 1 ? "s" : ""}</span>
              )}
            </div>
          </div>
          {inactiveMembers.length > 0 && (
            <p className="mt-1.5 text-xs text-amber-500">
              {inactiveMembers.map((m) => m.name).join(", ")} {inactiveMembers.length === 1 ? "is" : "are"} marked away this week.
            </p>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          SECTION 1: Family Members
          ════════════════════════════════════════════════════════ */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted uppercase tracking-wider">
            <Users className="h-4 w-4" /> Family Members ({members.length})
          </h2>
          <button onClick={openAddMember} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover">
            <Plus className="h-3.5 w-3.5" /> Add Member
          </button>
        </div>

        {showMemberForm && (
          <form onSubmit={handleMemberSubmit} className="mt-4 rounded-xl border border-accent/30 bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">{editingMemberId ? "Edit Member" : "Add Family Member"}</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted">Name</label>
                <input type="text" value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} placeholder="e.g. Nick" className={inputClass} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted">Role</label>
                <select value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })} className={inputClass}>
                  <option value="">Select...</option>
                  {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted">Notes <span className="text-muted/50">(optional)</span></label>
                <input type="text" value={memberForm.notes} onChange={(e) => setMemberForm({ ...memberForm, notes: e.target.value })} placeholder="e.g. picky eater" className={inputClass} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => { setShowMemberForm(false); setEditingMemberId(null); }} className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground">Cancel</button>
              <button type="submit" disabled={savingMember || !memberForm.name.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                {savingMember ? <Loader2 className="h-4 w-4 animate-spin" /> : editingMemberId ? "Update" : "Add"}
              </button>
            </div>
          </form>
        )}

        {members.length === 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-card-border py-10 text-center">
            <Users className="mx-auto h-10 w-10 text-muted/30" />
            <p className="mt-3 text-sm text-muted">No family members yet.</p>
            <p className="text-xs text-muted mt-1">Add the people you cook for so Claude can personalize plans.</p>
          </div>
        )}

        <div className="mt-3 space-y-2">
          {activeMembers.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl border border-card-border bg-card px-4 py-2.5">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${memberInitialColor(m.name)}`}>
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{m.name}</span>
                  {m.role && <span className="rounded-full bg-tag-bg px-2 py-0.5 text-[10px] font-semibold text-tag-text">{m.role}</span>}
                </div>
                {m.notes && <p className="text-xs text-muted">{m.notes}</p>}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEditMember(m)} className="rounded-lg p-1.5 text-muted hover:bg-tag-bg hover:text-foreground" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => toggleMemberActive(m)} className="rounded-lg p-1.5 text-success hover:bg-tag-bg" title="Deactivate"><ToggleRight className="h-4 w-4" /></button>
                <button onClick={() => setDeleteConfirm({ type: "member", id: m.id, name: m.name })} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {inactiveMembers.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl border border-card-border bg-card px-4 py-2.5 opacity-50">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/30 text-sm font-bold text-muted">{m.name.charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground">{m.name}</span>
                <span className="ml-2 text-xs text-muted">away</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => toggleMemberActive(m)} className="rounded-lg p-1.5 text-muted hover:bg-tag-bg hover:text-success" title="Reactivate"><ToggleLeft className="h-4 w-4" /></button>
                <button onClick={() => setDeleteConfirm({ type: "member", id: m.id, name: m.name })} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          SECTION 2: Dietary Adaptations
          ════════════════════════════════════════════════════════ */}
      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted uppercase tracking-wider">
            <FlaskConical className="h-4 w-4" /> Dietary Adaptations ({adaptations.length})
          </h2>
          {members.length > 0 && (
            <button onClick={openAddAdapt} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover">
              <Plus className="h-3.5 w-3.5" /> Add Adaptation
            </button>
          )}
        </div>

        {showAdaptForm && (
          <form onSubmit={handleAdaptSubmit} className="mt-4 rounded-xl border border-accent/30 bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">{editingAdaptId ? "Edit Adaptation" : "Add Dietary Adaptation"}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted">Family member</label>
                <select value={adaptForm.memberId} onChange={(e) => setAdaptForm({ ...adaptForm, memberId: e.target.value })} className={inputClass}>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted">Name</label>
                <input type="text" value={adaptForm.name} onChange={(e) => setAdaptForm({ ...adaptForm, name: e.target.value })} placeholder="e.g. Lactose Intolerance" className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted">Description <span className="text-muted/50">(optional)</span></label>
                <input type="text" value={adaptForm.description} onChange={(e) => setAdaptForm({ ...adaptForm, description: e.target.value })} placeholder="e.g. Can eat dairy with Lactaid pills, prefers LF swaps where easy" className={inputClass} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted">Leniency</label>
                <div className="mt-1 space-y-1.5">
                  {LENIENCY_OPTIONS.map((opt) => (
                    <label key={opt.value} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${adaptForm.leniency === opt.value ? "border-accent bg-accent/10" : "border-input-border hover:border-muted"}`}>
                      <input type="radio" name="leniency" value={opt.value} checked={adaptForm.leniency === opt.value}
                        onChange={() => setAdaptForm({ ...adaptForm, leniency: opt.value })} className="mt-0.5" />
                      <div>
                        <div className="font-medium text-foreground">{opt.label}</div>
                        <div className="text-xs text-muted">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted">Skip note</label>
                <input type="text" value={adaptForm.skipNote} onChange={(e) => setAdaptForm({ ...adaptForm, skipNote: e.target.value })} placeholder="e.g. Take Lactaid pill with meal" className={inputClass} />
                <p className="mt-1 text-xs text-muted">Shown when a meal is NOT adapted</p>
              </div>
            </div>

            {/* Substitution rules */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted">Substitution Rules</label>
                <button type="button" onClick={addRule} className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover">
                  <Plus className="h-3 w-3" /> Add Rule
                </button>
              </div>
              {adaptForm.rules.length === 0 && (
                <p className="mt-2 text-xs text-muted">No rules yet. Add ingredient swaps like &ldquo;milk &rarr; lactose-free milk&rdquo;.</p>
              )}
              <div className="mt-2 space-y-2">
                {adaptForm.rules.map((rule, i) => (
                  <div key={rule.id} className="flex items-start gap-2 rounded-lg border border-input-border bg-background p-3">
                    <div className="grid flex-1 grid-cols-2 gap-2">
                      <input type="text" value={rule.from} onChange={(e) => updateRule(i, { from: e.target.value })} placeholder="Original (e.g. milk)" className="rounded-lg border border-input-border bg-card px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none" />
                      <div className="flex items-center gap-2">
                        <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-muted" />
                        <input type="text" value={rule.to} onChange={(e) => updateRule(i, { to: e.target.value })} placeholder="Replacement (e.g. LF milk)" className="flex-1 rounded-lg border border-input-border bg-card px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none" />
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => updateRule(i, { quality: rule.quality === "exact" ? "approximate" : "exact" })}
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${rule.quality === "exact" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                          {rule.quality === "exact" ? "Exact" : "Approximate"}
                        </button>
                      </div>
                      {rule.quality === "approximate" && (
                        <input type="text" value={rule.condition ?? ""} onChange={(e) => updateRule(i, { condition: e.target.value })} placeholder="When to use (e.g. in soups but not baking)" className="rounded-lg border border-input-border bg-card px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none" />
                      )}
                    </div>
                    <button type="button" onClick={() => removeRule(i)} className="mt-1 rounded-lg p-1 text-muted hover:bg-danger/10 hover:text-danger">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => { setShowAdaptForm(false); setEditingAdaptId(null); }} className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground">Cancel</button>
              <button type="submit" disabled={savingAdapt || !adaptForm.name.trim() || !adaptForm.memberId} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                {savingAdapt ? <Loader2 className="h-4 w-4 animate-spin" /> : editingAdaptId ? "Update" : "Add"}
              </button>
            </div>
          </form>
        )}

        {adaptations.length === 0 && members.length > 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-card-border py-10 text-center">
            <FlaskConical className="mx-auto h-10 w-10 text-muted/30" />
            <p className="mt-3 text-sm text-muted">No dietary adaptations yet.</p>
            <p className="text-xs text-muted mt-1">Add ingredient swap profiles for lactose intolerance, gluten sensitivity, etc.</p>
          </div>
        )}
        {members.length === 0 && (
          <p className="mt-4 text-xs text-muted">Add family members first to create dietary adaptations.</p>
        )}

        <div className="mt-3 space-y-2">
          {adaptations.map((a) => {
            const member = memberMap[a.memberId];
            const isExpanded = expandedAdapt === a.id;
            return (
              <div key={a.id} className={`rounded-xl border border-card-border bg-card ${!a.isActive ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-3 px-5 py-3">
                  <button type="button" onClick={() => setExpandedAdapt(isExpanded ? null : a.id)} className="text-muted hover:text-foreground">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{a.name}</span>
                      {member && <span className="rounded-full bg-tag-bg px-2 py-0.5 text-[10px] font-semibold text-tag-text">{member.name}</span>}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${LENIENCY_STYLES[a.leniency]}`}>
                        {LENIENCY_OPTIONS.find((o) => o.value === a.leniency)?.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {a.rules.length} rule{a.rules.length !== 1 ? "s" : ""}
                      {a.skipNote ? ` — Skip: ${a.skipNote}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEditAdapt(a)} className="rounded-lg p-1.5 text-muted hover:bg-tag-bg hover:text-foreground" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => toggleAdaptActive(a)} className={`rounded-lg p-1.5 ${a.isActive ? "text-success" : "text-muted"} hover:bg-tag-bg`} title={a.isActive ? "Deactivate" : "Activate"}>
                      {a.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                    </button>
                    <button onClick={() => setDeleteConfirm({ type: "adaptation", id: a.id, name: a.name })} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                {isExpanded && a.rules.length > 0 && (
                  <div className="border-t border-card-border px-5 py-3">
                    <table className="w-full text-xs">
                      <thead><tr className="text-muted"><th className="pb-1.5 text-left font-medium">Original</th><th className="pb-1.5 text-left font-medium">Replacement</th><th className="pb-1.5 text-left font-medium">Quality</th><th className="pb-1.5 text-left font-medium">Condition</th></tr></thead>
                      <tbody>
                        {a.rules.map((r) => (
                          <tr key={r.id} className="border-t border-card-border/50">
                            <td className="py-1.5 text-foreground">{r.from}</td>
                            <td className="py-1.5 text-foreground">{r.to}</td>
                            <td className="py-1.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.quality === "exact" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{r.quality}</span></td>
                            <td className="py-1.5 text-muted">{r.condition ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          SECTION 3: Preferences
          ════════════════════════════════════════════════════════ */}
      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted uppercase tracking-wider">
            <ShieldAlert className="h-4 w-4" /> Preferences ({preferences.length})
          </h2>
          <button onClick={() => openAddPref()} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover">
            <Plus className="h-3.5 w-3.5" /> Add Preference
          </button>
        </div>

        {showPrefForm && (
          <form onSubmit={handlePrefSubmit} className="mt-4 rounded-xl border border-accent/30 bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">{editingPrefKey ? "Edit Preference" : "Add New Preference"}</h3>
            <div className="mb-3">
              <label className="text-xs font-medium text-muted">Type</label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {PREFERENCE_TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button key={t.value} type="button" onClick={() => setPrefForm({ ...prefForm, type: t.value })}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${prefForm.type === t.value ? "border-accent bg-accent/10 text-accent" : "border-input-border text-muted hover:text-foreground"}`}>
                      <Icon className="h-3.5 w-3.5" />{t.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-muted">{currentPrefType?.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted">Subject</label>
                <input type="text" value={prefForm.key} onChange={(e) => setPrefForm({ ...prefForm, key: e.target.value })} placeholder={currentPrefType?.placeholder.key} className={inputClass} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted">Family member <span className="text-muted/50">(optional)</span></label>
                <select value={prefForm.memberId} onChange={(e) => setPrefForm({ ...prefForm, memberId: e.target.value })} className={inputClass}>
                  <option value="">All / Family-wide</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted">Details</label>
                <input type="text" value={prefForm.value} onChange={(e) => setPrefForm({ ...prefForm, value: e.target.value })} placeholder={currentPrefType?.placeholder.value} className={inputClass} />
              </div>
              {prefForm.type === "diet" && (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted">Start date <span className="text-muted/50">(optional)</span></label>
                    <input type="date" value={prefForm.startDate} onChange={(e) => setPrefForm({ ...prefForm, startDate: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted">End date <span className="text-muted/50">(optional)</span></label>
                    <input type="date" value={prefForm.endDate} onChange={(e) => setPrefForm({ ...prefForm, endDate: e.target.value })} className={inputClass} />
                  </div>
                </>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => { setShowPrefForm(false); setEditingPrefKey(null); }} className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground">Cancel</button>
              <button type="submit" disabled={savingPref || !prefForm.key.trim() || !prefForm.value.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                {savingPref ? <Loader2 className="h-4 w-4 animate-spin" /> : editingPrefKey ? "Update" : "Add"}
              </button>
            </div>
          </form>
        )}

        {/* Grouped preference lists */}
        {groupedPrefs.map((group) => {
          if (group.items.length === 0) return null;
          const Icon = group.icon;
          return (
            <div key={group.value} className="mt-6">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                <Icon className="h-3.5 w-3.5" /> {group.label}s ({group.items.length})
              </h3>
              <div className="space-y-2">
                {group.items.map((pref) => {
                  const linkedMember = pref.memberId ? memberMap[pref.memberId] : null;
                  const displayMember = linkedMember?.name ?? pref.member;
                  return (
                    <div key={`${pref.type}-${pref.key}`} className="flex items-center gap-4 rounded-xl border border-card-border bg-card px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{pref.key}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${group.color}`}>{group.label}</span>
                          {displayMember && (
                            <span className="rounded-full bg-tag-bg px-2 py-0.5 text-[10px] font-semibold text-tag-text">{displayMember}</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          {pref.value}
                          {pref.startDate && <span> &middot; {pref.startDate}{pref.endDate ? ` to ${pref.endDate}` : " onwards"}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openEditPref(pref)} className="rounded-lg p-1.5 text-muted hover:bg-tag-bg hover:text-foreground" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setDeleteConfirm({ type: "preference", id: pref.type, key: pref.key, name: pref.key })} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {preferences.length === 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-card-border py-10 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-muted/30" />
            <p className="mt-3 text-sm text-muted">No preferences configured yet.</p>
            <p className="text-xs text-muted mt-1">Add allergies, dislikes, schedule constraints, and more.</p>
          </div>
        )}

        {preferences.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {PREFERENCE_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.value} onClick={() => openAddPref(t.value)} className="flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground">
                  <Icon className="h-3 w-3" /> Add {t.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════
          Info Section
          ════════════════════════════════════════════════════════ */}
      <div className="mt-10 rounded-lg border border-card-border bg-card p-6 text-sm text-muted">
        <p className="font-medium text-foreground">How this page works</p>
        <ul className="mt-2 ml-4 list-disc space-y-1">
          <li><strong>Family Members</strong> tell Claude who it&rsquo;s cooking for. Mark someone as &ldquo;away&rdquo; to adjust servings for the week.</li>
          <li><strong>Dietary Adaptations</strong> define ingredient swap profiles (e.g., lactose-free). Claude applies them per-meal based on the leniency setting. You can override any meal in chat.</li>
          <li><strong>Preferences</strong> are planning rules: restrictions (hard no), dislikes (avoid), likes (favor), cuisine affinities, schedule constraints, and temporary diets.</li>
          <li>Everything here can also be managed through the planning chat: &ldquo;My daughter is allergic to tree nuts&rdquo;, &ldquo;Add my son Jake&rdquo;, etc.</li>
        </ul>
      </div>

      <ConfirmDialog
        open={!!deleteConfirm}
        title={`Delete ${deleteConfirm?.type ?? "item"}`}
        message={`Remove "${deleteConfirm?.name}"? This cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

# UI Primitives & Foundation

Shared building blocks for the meal-planner UI. **Use these for all new code.** They match the app's token-based visual language and fix dark mode for free.

## What exists

Import from the barrel: `import { Button, Modal, Card, ... } from "@/components/ui";`

| Primitive | Notes |
|---|---|
| `Button` | `variant`: `primary \| secondary \| danger \| ghost \| icon`; `size`: `sm \| md \| lg`; `loading` (spinner + disabled). Forwards all `<button>` props + ref. |
| `Modal` | Backdrop, Escape-close, focus trap, scroll lock, focus restore. `size`: `sm \| md \| lg \| xl`. Props: `open`, `onClose`, `title?`, `showClose?`, `closeOnBackdrop?`, `initialFocus?`, `ariaLabel?`. |
| `ConfirmDialog` | Rebased on `Modal`. Same public API as before (`open`, `title`, `message`, `confirmLabel?`, `onConfirm`, `onCancel`). |
| `Input` / `Textarea` / `Select` | One field style, focus ring baked in. Forward refs + native props. `fieldClassName` is exported if you must style a raw field. |
| `Card` | `rounded-xl border border-card-border bg-card shadow-sm`; `padding`: `none \| sm \| md \| lg`. |
| `Badge` | Rounded-full chip; `color`: `accent \| success \| warning \| danger \| info \| neutral`. |
| `EmptyState` | `icon?` (Lucide) + `title` + `description?` + `action?`. Use for every empty list/collection. |
| `PageHeader` | `title` (text-2xl bold) + `subtitle?` + `actions?` slot. |
| `Skeleton` / `ListSkeleton` | Shimmer placeholders. Also live at `@/components/ui/Skeleton` for server-component `loading.tsx` files. |

Non-component foundation:

- `@/lib/api` — `api<T>(input, init?)` and `tryApi<T>(...)`, plus `ApiError`.
- `@/lib/format` — `formatMinutes(85) => "1h 25m"`, `decodeHtmlEntities(s)` (for HEB names).
- `@/components/Toast` — `useToast()` -> `{ toast, dismiss }`. Toast v2: error/warning linger, pause-on-hover, optional `action`.

## Adoption rules

1. **Buttons, inputs, modals, cards, badges, empty states → always the primitives.** No new hand-rolled versions.
2. **Token colors only.** Use `bg-accent`, `text-danger`, `bg-success/15`, etc. **Never** raw Tailwind palette (`bg-green-600`, `text-amber-500`, `red-500`…). Only tokens flip in dark mode.
3. **All fetches go through `api()` / `tryApi()`.** Never read `res.json()` directly; never treat an error-shaped body as success.
4. **Toast on every failure.** In a `catch`, call `toast(err.message, "error")` (use `ApiError.message` — it carries the server's `error` string). Toast success only after the server confirms.
5. **`EmptyState` for every empty collection** — never render "looks empty" for a failed load; that's an error, toast it.
6. **Optimistic updates must roll back or refetch on failure.**

## Examples

```tsx
import { Button, EmptyState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";

const { toast } = useToast();

async function save() {
  try {
    await api("/api/thing", { method: "POST", body: JSON.stringify(input) });
    toast("Saved", "success");
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Save failed", "error");
  }
}

// Undo pattern via toast action:
const id = toast("Item removed", "info", { action: { label: "Undo", onClick: restore } });
```

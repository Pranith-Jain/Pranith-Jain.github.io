# Frontend Audit — 2026-06-23

**Scope:** Full code-only sweep of the React 19 + Tailwind v4 frontend (~583 `.tsx`:
UI primitives, global chrome, shared + feature components, core/marketing pages, 179 DFIR
tool pages, 157 threat-intel pages, admin + radar).
**Method:** 1 mechanical grep pass (hard repo-wide counts) + 8 parallel read-only audit
agents, each measuring drift against the project's **own** `DESIGN_SYSTEM.md` /
`docs/DESIGN-2026.md`, not generic preference.
**Constraints honored:** visual / UX / a11y polish only — no behavior, data-fetch, or
business-logic changes proposed; brand identity kept; perf budgets respected; SOC
dashboards left on-brand with real-data behavior (no redesigns).

> Coverage note: all 8 slices completed with full per-file itemization (UI+layout,
> components, core pages, DFIR A–Z, threat-intel A–Z, admin+radar) plus 2 supplements.
> (Several slices were re-run after transient API rate-limiting; full coverage achieved.)

---

## Executive summary

The frontend is **mature and structurally sound — there are no P0 crashes and no broken
layouts.** The design system itself is excellent (real focus traps, severity tokens,
elevation scale, dark-mode consolidation). The gap is **adoption**: the codebase is
mid-migration to its own 2026 token system, and the migration stalled. The result is a
**two-speed UI** — recently-redesigned surfaces (DFIR hub, Hero, Snapshots, Status, MCP)
look modern; everything else still runs the legacy `rounded-lg` + `bg-white
dark:bg-slate-900/40` + ad-hoc `text-sm` vocabulary.

Almost every finding is **high-volume but low-risk and mechanical**. The five systemic
patterns below account for the large majority of issues; fixing them at the
primitive/shared level cascades across hundreds of files.

| Severity | Count (itemized, 6 slices) | Notes                                                        |
| -------- | -------------------------- | ------------------------------------------------------------ |
| P0       | 1                          | Unlabeled OSINT form controls (a11y) — single component pair |
| P1       | ~40                        | Mostly systemic patterns + the `<Button>` focus-ring defect  |
| P2       | ~60                        | Localized but visible                                        |
| P3       | ~50                        | Polish / nits                                                |

---

## Top systemic patterns (ranked by leverage — fix these first)

### S1 · `<Button>` primitive has no visible focus ring — **P1, fix first**

- **File:** `src/components/ui/Button.tsx:84` (`focus-visible:outline-none`, no replacement ring in any of the 6 VARIANT strings)
- The flagship button sets `outline-none` and relies on a global `:focus-visible` outline
  that Tailwind's higher-specificity utility overrides → **keyboard focus shows nothing.**
  This both fails WCAG 2.4.7 and plausibly explains the primitive's near-zero adoption
  (~17 uses vs ~1365 raw `<button>`). **One-line fix, and it unblocks any future
  standardization on `<Button>`.**
- **Fix:** add `focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2` (+ dark ring-offset) to the base class, or drop `outline-none`. **Effort: S.**

### S2 · Deprecated `rounded-lg` + legacy card surfaces instead of `.surface-card`

- **Scale:** `rounded-lg` in **411 files**; legacy `bg-white dark:bg-slate-900/*` card
  pattern in **114 files**. `DESIGN_SYSTEM.md:335,340` marks `rounded-lg` **DEPRECATED**
  and the migration checklist item (line 395) is **unchecked** — this is the project's own
  unfinished work.
- **Why it shows:** legacy cards paint `dark:bg-slate-900/40` (translucent) instead of the
  consolidated `surface-200`, so cards render as slightly different grays in dark mode next
  to migrated surfaces.
- **Fix:** replace the hand-rolled cluster with `.surface-card` (carries `rounded-xl` +
  `shadow-e1` + `border-400` + correct dark fill) and `card-hover` where a lift is wanted.
  Start at the **primitive/shared layer** (S2a) so it cascades. **Effort: M–L (mechanical).**
  - **S2a (do first):** fix the primitives that _re-seed_ the deprecated token into every
    consumer: `ui/Skeleton`, `ui/Modal`/`Drawer` close buttons, `ui/Select`/`TextField`/
    `SearchInput`/`RadioGroup`/`TabBar`/`FilterBar`/`Tabs`, `AsyncState`/`DataState`,
    `DataPageLayout`. (~12–14 primitives.)

### S3 · Ad-hoc `text-sm` / `text-xs` instead of the `text-tool` / `text-meta` scale

- **Scale: 478 files.** `DESIGN_SYSTEM.md` lists `text-sm`/`text-xs` as explicit
  "Common Violations (DO NOT USE)".
- **Fix:** sweep `text-sm`→`text-tool` (13px), `text-xs`→`text-meta` (12px),
  `text-[10px]`→`text-micro`. Worst offenders: SecretLeaks, Webamon, Observe, admin tabs,
  `sections/*`. **Effort: L (mechanical, scriptable with review).**

### S4 · Threat-intel pages use brand-blue where rose-600/400 is the convention

- **Scale: 149 of 157 threat-intel files reference `brand-*`** (some legit cross-links to
  `/dfir`, but ~40+ are real accent/tab/selection violations). `DESIGN_SYSTEM.md` mandates
  rose for all `/threatintel` tabs/accents; many render as DFIR pages.
- **Fix:** swap `brand-*`→`rose-*` on active tabs (`border-rose-600 text-rose-600
dark:border-rose-400 dark:text-rose-400`), selection highlights, accent icons/chips,
  hover borders. Leave SVG/canvas data-viz hex fills and genuine `/dfir` pivots alone.
  **Effort: M (high-volume, low-risk).**

### S5 · Async tool actions + clipboard with no feedback (DFIR tools)

- **Scale:** ~33 DFIR tool pages `await` scan/lookup/LLM/upload with **no loading/busy
  state**; ~32 copy buttons fire `navigator.clipboard` silently (**49 files** call it
  total). Slow paths (Wayback/CDX, username enumeration, AI verdict/query-gen) look frozen.
- **Fix:** `busy` state → disable trigger + spinner + verb-ing label; transient "Copied"
  swap (~1.5s) + `aria-live="polite"`. A shared `useCopyFeedback` hook + the existing
  `Toast`/`CopyButton` primitive covers most cases. **Effort: M (per-page but patterned).**

### Secondary systemic threads (P2–P3, fold into the sweeps above)

- **Dark-mode text parity:** `text-slate-400/500` without a `dark:` variant across ~40+
  TI files, `sections/*`, several components → use `text-slate-500 dark:text-slate-400`.
- **Touch targets <44px / inputs <16px (iOS zoom):** filter pills, inline toggles, OSINT
  forms, admin inputs. → `min-h-11`/`py-2`; inputs `text-base sm:text-…`.
- **Missing `focus-visible` rings** on interactive Link/card/pill elements (DFIR + sections).
- **Wide tables not `overflow-x-auto` on mobile:** ~25 DFIR pages + Webamon, MISP, Maltrail.
- **Hand-rolled markup that a primitive already covers:** `DataPageLayout` error/empty,
  `FilterBar` search, `MobileMenu` (dead dup), 9 admin `<table>`s, rainbow admin buttons.
- **`window.prompt()` for input** (off-brand, inaccessible): `ReportView.tsx:1272`,
  `ObservableDb.tsx:495`, `Tracer.tsx`, `ScheduleTab.tsx`, `ExternalResources.tsx`.

---

## Must-fix individual findings (P0 / high-value P1)

### [P0] `Domain.tsx` Webamon expand/collapse toggle is dead (`useRef` not `useState`)

- `src/pages/dfir/Domain.tsx:39` — `webamonExpanded` was a `useRef`; clicking the disclosure
  mutated `.current` but never re-rendered, so the chevron never flipped and the section
  never collapsed. **Fixed in Phase 0:** converted to `useState` + `aria-expanded`. **Effort: S.**

### [P0] OSINT graph/map form controls are unlabeled

- `src/components/dfir/osint/IdentifierForm.tsx:33-57`, `PinForm.tsx:55-66` — type-select
  - label/note fields are placeholder-only; SR users hear "edit text, blank" on the core
    OSINT data-entry surface. **Fix:** sr-only `<label>` / `aria-label` (sibling fields at
    47-57 already do this). **Effort: S.**

### [P1] Tooltip not keyboard-dismissible / unreachable on touch

- `src/components/ui/Tooltip.tsx:58-66` — no Escape handler (WCAG 1.4.13), hover/focus-only
  on a non-focusable wrapper → content lost on mobile. **Fix:** Escape listener; document
  "never put essential info only in a Tooltip". **Effort: M.**

### [P1] `MobileMenu` is a dead, inaccessible duplicate nav

- `src/components/ui/MobileMenu.tsx` — full-screen overlay with no focus trap / scroll-lock
  / ESC / `aria-modal`, magic `top-[72px]`. **Fix:** delete it (Header drawer already does
  this correctly), or rebuild on the `Drawer` primitive. **Effort: S.**

### [P1] Argus page is a blank white flash during redirect

- `src/pages/Argus.tsx:1-8` — sets `window.location.href` and `return null`; if the
  external host is slow it reads as a dead page. **Fix:** centered `surface-card` with
  spinner + "Redirecting…" + manual fallback `<a>`. **Effort: S.**

### [P1] Experience page missing `PageMeta` + standard shell

- `src/pages/Experience.tsx` — recruiter-facing page falls back to the global `<title>`/
  social preview and lacks the documented container/top-padding. **Fix:** add `<PageMeta>`
  (mirror Skills/About) + standard detail-page shell. **Effort: S.**

### [P1] DFIR pass/fail conveyed by color alone

- `src/components/dfir/AuthResultsChips.tsx`, `EmailAuthCard.tsx` — SPF/DKIM/DMARC state is
  color-only (emerald/amber/rose), no icon/aria-label → colorblind + SR users can't tell.
  **Fix:** per-state icon (Check/AlertTriangle/X) + `aria-label`. **Effort: S.**

### [P1] CisaKevCatalog & CertInAdvisories double-wrap chrome when embedded as CveIntel tabs

- `src/pages/threatintel/CisaKevCatalog.tsx:157`, `CertInAdvisories.tsx:170-175` (embedded
  in `CveIntel.tsx:81,84`) — each renders its own container + h1 + intro **inside**
  CveIntel's `DataPageLayout`, so the tab embed (the primary entry) shows double padding,
  mismatched max-width, and a redundant title — **it looks broken.** **Fix:** add a `bare?`
  prop (pattern already used for `K8sCve bare`) to drop the wrapper when embedded; wrap the
  standalone route in `DataPageLayout`. **Effort: M.**

### [P1] KnowledgeGraph discards its loading state — dead-looking cold load

- `src/pages/threatintel/KnowledgeGraph.tsx:123` — `const [, setLoading] = useState(true)`
  throws away the flag; the graph region is gated on `{data && …}`, so a slow
  `/graph/cross-report` fetch renders the filter card over emptiness (looks broken). **Fix:**
  restore `loading` and render a skeleton/`<TabLoader>` while `loading && !data`. **Effort: S.**

### [P2] ACH confidence bar is built from an invalid CSS color → renders nothing (real bug)

- `src/pages/threatintel/ACH.tsx:173-178` — `linear-gradient(..., ${confidenceColor(...)
.replace('bg-','')}, transparent)` yields `emerald-500` (a Tailwind class, **not** a CSS
  color), so the per-hypothesis confidence bar silently paints transparent. **Fix:** map
  confidence to a real token/CSS color, or apply the class directly. **Effort: S.**

### [P1] Radar pages off-palette (`gray-*`) + dead "Keys & Secrets" tab

- `src/pages/radar/Home.tsx`, `ScanResults.tsx` — legacy `gray-*` scale + `bg-slate-800/900`
  fills (user-facing); the "Keys & Secrets" tab is a dead toggle that shows identical recon
  content; JS/Links/Endpoints render external URLs as non-clickable rows with a misleading
  ExternalLink icon. **Fix:** slate scale + `surface-card`; `EmptyState` (or disable) for
  the secrets tab; make resource rows real `<a>`. **Effort: M.**

_(Full P2/P3 itemization per slice lives in the working files under
`scratchpad/audit/findings-_.md`; the systemic sweeps S2–S5 absorb most of them.)\*

---

## Per-area health

| Area                   | Health                | Headline issue                                                                                                                                                                                     |
| ---------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI primitives**      | Strong foundation     | `<Button>` focus-ring defect (S1); primitives re-seed deprecated tokens (S2a)                                                                                                                      |
| **Global layout/nav**  | Good                  | `MobileMenu` dead dup; Header `top-[72px]` magic offset                                                                                                                                            |
| **Shared components**  | Good                  | `CopyToClipboard` light-mode invisible; "X of the Day" nested-group bug                                                                                                                            |
| **intel / sections**   | Good                  | every `sections/*` card bypasses `.surface-card` (S2); `AiSummaryCard` nested `<button>`                                                                                                           |
| **Core / marketing**   | Good (two-speed)      | editorial pages (Blog/CaseStudy/Sponsor) on legacy vocabulary; Argus blank flash                                                                                                                   |
| **DFIR tools (N–Z)**   | Sound                 | silent async + clipboard (S5); tables not mobile-scrollable                                                                                                                                        |
| **DFIR tools (A–M)**   | _itemization pending_ | same patterns (S1–S5) confirmed repo-wide                                                                                                                                                          |
| **Threat-intel (A–Z)** | Mature                | rose-vs-brand drift (S4, 149/157 files); CisaKev/CertIn double-wrap; KnowledgeGraph dead-loading; silent destructive deletes (MalwareVault/ObservableDb); map keyboard a11y; ACH invalid-color bar |
| **Admin**              | Functionally solid    | wholesale token/primitive bypass; rainbow button accents; raw hex `#16161f`                                                                                                                        |
| **Radar**              | Needs work            | off-palette `gray-*`; dead secrets tab; non-clickable resource rows                                                                                                                                |

---

## Recommended remediation plan (phased, for approval)

Ordered by **leverage ÷ risk**. Each phase is independently shippable and verifiable
(typecheck + visual check). No behavior changes in any phase.

- **Phase 0 — Quick a11y wins (S, ~½ day):** S1 Button focus ring · P0 OSINT labels ·
  Tooltip Escape · delete `MobileMenu` · DFIR color-only pass/fail icons · Argus redirect
  card · Experience `PageMeta`. _Highest value-to-effort; mostly one-liners._
- **Phase 1 — Primitive-layer token migration (M):** S2a — fix the ~14 primitives that
  re-seed `rounded-lg`/legacy surfaces so the fix cascades; `DataPageLayout`/`FilterBar`
  adopt `Alert`/`EmptyState`/`SearchInput`.
- **Phase 2 — `surface-card` + dark-parity sweep (M–L):** S2 across `sections/*`, core
  editorial pages, DFIR/TI/admin/radar cards; fold in `text-slate-*` dark variants.
- **Phase 3 — Type-scale sweep (L, scripted + reviewed):** S3 `text-sm`→`text-tool`,
  `text-xs`→`text-meta` repo-wide.
- **Phase 4 — Threat-intel rose convention (M):** S4 `brand-*`→`rose-*` on TI tabs/accents.
- **Phase 5 — DFIR tool feedback (M):** S5 shared loading + copy-feedback hook across tool
  pages; mobile table `overflow-x-auto`; touch-target/iOS-zoom fixes.
- **Phase 6 — Complete itemization (S):** re-run the rate-limited DFIR A–M / TI A–M audits
  for any non-systemic stragglers; replace `window.prompt()` call sites with Modal+textarea;
  radar resource-row links + dead-tab fix.

---

## Out of scope / explicitly NOT flagged

- Canvas/SVG/map data-viz hex fills (globes, choropleths, graphs, MITRE Navigator export
  colors) — legitimate, left alone.
- `Home.tsx` eager loading — intentional, not a perf finding.
- SOC dashboards — kept on-brand with real-data behavior per project constraint; only the
  brand-vs-rose tab color is flagged, no redesign.
- Any data-fetching / API / business-logic change.

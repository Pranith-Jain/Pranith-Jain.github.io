# A11y Until Clean

**Category:** Accessibility / manual

## Loop Description

After building or editing UI (`src/components/`, `src/pages/`), drive accessibility to
clean: keyboard navigation, focus management, ARIA correctness, color contrast, and
screen-reader semantics — beyond what `eslint-plugin-jsx-a11y` catches statically. Loop
until a real a11y review of the changed UI surfaces nothing actionable.

## Guardrails

**Type:** Hardened with anti-gaming rules

- Do NOT silence a jsx-a11y rule to pass lint — fix the markup so the rule is satisfied
  honestly.
- Do NOT add `aria-*` attributes that lie about state/role to quiet a checker; incorrect
  ARIA is worse than none.
- Verify behavior, not just static lint: tab order, visible focus, dialog focus-trap,
  contrast ratios — these need a real review, not a rule pass.
- Keep the visual design intact while fixing a11y; don't regress the UI to satisfy a
  checker.

## Kickoff Prompt

```
Start the "A11y Until Clean" loop.

Goal: The changed UI is keyboard-navigable, correctly labeled, and meets contrast — clean on a real review
Max iterations: 6
Between iterations run: npm run lint (jsx-a11y) + an a11y review of the changed components (keyboard, focus, ARIA, contrast)
Exit when: jsx-a11y passes AND a fresh a11y review of the changed UI finds nothing actionable

Step 1: Lint, then review the changed components for keyboard nav, focus management, ARIA
correctness, and contrast. Fix the markup at the source and re-review.

Self-pace this loop. After each iteration, lint + review, and only continue while anything
is actionable. Stop when clean or max iterations is reached. Give a short status update
each pass.
```

## Steps (Agent Actions)

1. **Lint** — `npm run lint` (jsx-a11y); fix violations honestly (no disables).
2. **Keyboard + focus** — tab order, visible focus, dialog focus-trap on the changed UI.
3. **Semantics** — correct roles/labels/ARIA; nothing that misreports state.
4. **Contrast** — verify text/UI contrast ratios; re-review until nothing is actionable.

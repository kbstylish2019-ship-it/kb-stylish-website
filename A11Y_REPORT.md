# WCAG 2.1 AA Accessibility Audit

Scope: Complete review of key components under `src/components/` against WCAG 2.1 AA. Findings include semantic HTML, ARIA usage, keyboard/focus management, and color contrast risks, with precise file/line references and concrete fixes.

## Executive Summary

- Semantic issues: 3 instances of non-semantic click targets used as interactive UI
- ARIA gaps: 6 areas lacking accessible names or proper roles; 2 pagination controls missing aria-current
- Focus/keyboard: 3 modal/menu patterns at risk of focus loss and keyboard-only failure
- Contrast: Repeated use of low-opacity text on low-contrast surfaces likely to fail 4.5:1 for small text

Overall status: Needs improvements to meet WCAG 2.1 AA across interactive controls, modals, and contrast.

---

## 1) Semantic HTML Violations

- `components/booking/BookingModal.tsx`
  - Line 87: `<div className="absolute inset-0 bg-black/50" onClick={onClose} />`
  - Issue: Non-semantic div used as an interactive close target.
  - Fix options:
    - Option A (recommended): Keep div but add role and keyboard support:
      - `role="button"`, `tabIndex={0}`, `aria-label="Close overlay"`, and close on Enter/Escape.
    - Option B: Replace with visually-hidden button overlay.

- `components/vendor/AddProductModal.tsx`
  - Lines 73–77: `<div className="absolute inset-0 ... " onClick={onClose} aria-hidden="true" />`
  - Issue: Same as above; `aria-hidden="true"` implies it’s not interactive for AT, yet it closes on click.
  - Fix: Either remove onClick or convert to an accessible dismiss control as above.

- `components/layout/Header.tsx`
  - Navigation items are proper `<a>` links. Brand link uses `<a href="/">` (semantic). No semantic issue flagged here.

---

## 2) ARIA Roles & Labels

- `components/admin/UsersTable.tsx`
  - Lines 83–90: Search `<input>` has no explicit label.
  - Fix: Add `<label>` with `htmlFor="users-search-input"` and `id`, or `aria-label="Search users"`.

- `components/vendor/OrdersTable.tsx`
  - Lines 62–70: Search `<input>` lacks a label.
  - Fix: Add `<label>` or `aria-label="Search orders"`.

- `components/layout/Header.tsx`
  - Lines 111–130: Container has `role="menu"` but child items are `<a>` without `role="menuitem"`.
  - Issue: If you opt into ARIA menu pattern, descendants must comply (`menuitem`, roving tabindex, Arrow key navigation).
  - Fix options:
    - Option A (recommended): Remove `role="menu"` and keep it as a plain list of links (simpler, valid).
    - Option B: Implement full menu pattern: `role="menu"`, children `role="menuitem"`, keyboard handling, focus management.

- `components/product/ProductOptions.tsx`
  - Lines 56–71: Buttons act like radio options, but there is no ARIA state.
  - Fix options:
    - Option A (recommended): Use native radio inputs grouped by `fieldset/legend`.
    - Option B: Add ARIA:
      - Wrap with `role="radiogroup"` and per-option `role="radio"` with `aria-checked={selected === value}` and keyboard support.

- `components/booking/BookingModal.tsx`
  - Date buttons (151–163) and time buttons (178–190) do not expose selection state to AT.
  - Fix: Add `aria-pressed={active}` or convert to radiogroups with radios (preferred).

- Pagination (both tables)
  - `UsersTable.tsx` lines 233–246 and `OrdersTable.tsx` lines 165–177: page buttons lack `aria-current="page"` on the active page.
  - Fix: Add `aria-current="page"` on the active page number button.

---

## 3) Keyboard Navigation & Focus Management

- Modals: Focus trap and initial focus

  - `components/features/AuthModal.tsx`
    - Lines 31–108: `role="dialog"` and Escape-to-close present, but:
      - No initial focus on open (should move focus into the modal, typically close button or heading).
      - No focus trap; background remains tabbable.
    - Fix: On mount, focus the first interactive element and implement a focus trap (or use a11y library like `@radix-ui/react-dialog` or `focus-trap-react`).

  - `components/booking/BookingModal.tsx`
    - Lines 79–219: `role="dialog"` present; no Escape-to-close, no focus trap, no initial focus.
    - Fix: Add Escape to close, focus the close button on open, and trap focus while open.

  - `components/vendor/AddProductModal.tsx`
    - Lines 70–279: No focus trap or initial focus management.
    - Fix: Same as above.

- Menus: Keyboard behavior

  - `components/layout/Header.tsx`
    - Lines 99–130: Profile dropdown toggled by button with `aria-expanded`, but no keyboard navigation within items (Arrow keys), and no Escape handler to close.
    - Fix: Either implement full menu keyboard controls (Escape/Arrow keys, focus management) or use a simpler list without ARIA menu roles.

- Global arrow-key listener

  - `components/product/ProductImageGallery.tsx`
    - Lines 23–30: `window.addEventListener("keydown", ...)` to navigate images.
    - Risk: Global handler fires regardless of focus; can interfere with screen reader/keyboard navigation elsewhere.
    - Fix: Scope key handling to when gallery has focus or when a containing region is focused. Consider explicit next/prev buttons with labels:
      - “Previous image”, “Next image” with `aria-label`.

---

## 4) Color Contrast Risks

Observed patterns likely to fail 4.5:1 for body-sized text on dark backgrounds:

- Low-opacity foreground on dark backgrounds:
  - `text-foreground/60`, `text-foreground/50`, `text-foreground/40` frequently used for body text.
    - Examples:
      - `components/vendor/OrdersTable.tsx` lines 106–114, 137–139
      - `components/admin/UsersTable.tsx` lines 158–163
      - `components/vendor/AddProductModal.tsx` lines 247–249, 203–207
  - Risk: On `--kb-background: #111827` or `bg-white/5`, small text at 40–60% opacity is likely < 4.5:1.

- Disabled states via `disabled:opacity-50`:
  - Several buttons (e.g., `BookingModal.tsx` line 212; OrdersTable pagination) dim both foreground and background, increasing failure risk for any text present. While disabled states have relaxed requirements for non-interactive items, text still needs to be readable. Prefer color tokens that preserve contrast.

- Suggested mitigations:
  - For small text (under 18pt/24px), avoid opacity below ~0.7 on foreground over dark backgrounds.
  - Prefer dedicated tokens for “muted” text that are pre-checked for 4.5:1 against both light/dark surfaces.
  - In dark mode, target `text-foreground/80` minimum for body text; reserve `/60` for helper/hint text at larger sizes.

---

## 5) Global Focus Style Recommendation

Add a consistent, high-contrast focus-visible style to `src/app/globals.css`. This reduces reliance on per-element `focus:outline-none` and ensures a11y-compliant outlines:

```css
/* Global, consistent keyboard focus */
:where(a, button, [role="button"], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])):focus-visible {
  outline: 2px solid var(--kb-accent-gold);
  outline-offset: 2px;
}

/* Remove outline only when replaced by strong visible focus styles */
:where(a, button, [role="button"], input, select, textarea):focus {
  outline: none;
}
```

Also add an SR-only caption style (if not already present) for table descriptions:

```css
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0);
  white-space: nowrap; border: 0;
}
```

---

## 6) File-by-File Actionable Fixes

- `components/booking/BookingModal.tsx`
  - Line 87: Replace clickable overlay div pattern (see Section 1).
  - Add Escape key to close; set initial focus to close button (line 99); trap focus within dialog.
  - Lines 151–163, 178–190: Add `aria-pressed` to selected buttons or switch to radio groups.

- `components/vendor/AddProductModal.tsx`
  - Lines 73–77: Same overlay fix as above.
  - Add initial focus, Escape-to-close, and focus trap around the dialog.
  - Provide button labels for any icon-only actions (already labeled close button is OK).

- `components/features/AuthModal.tsx`
  - Add initial focus on open (e.g., first input of active tab) and focus trap.
  - Consider `aria-describedby` pointing to the small description block under the title for additional context.

- `components/layout/Header.tsx`
  - Lines 111–130: Either remove `role="menu"` or implement full ARIA menu pattern and keyboard nav; add Escape to close when open.
  - Add `aria-controls` to the profile button referencing menu element id.

- `components/admin/UsersTable.tsx`
  - Lines 83–90: Add `<label htmlFor="users-search-input">Search users</label>` and `id` on `<input>`.
  - Lines 233–246: Add `aria-current="page"` on active page button.
  - Add visually hidden `<caption className="sr-only">Users table</caption>`.

- `components/vendor/OrdersTable.tsx`
  - Lines 62–70: Add label for search.
  - Lines 165–177: Add `aria-current="page"` on active page.
  - Add `<caption className="sr-only">Vendor orders</caption>`.

- `components/product/ProductOptions.tsx`
  - Convert option groups to radios (fieldset/legend) or add `role="radiogroup"` + per-option `role="radio"` and `aria-checked`.

- `components/product/ProductImageGallery.tsx`
  - Lines 23–30: Scope arrow-key navigation to focused gallery region and/or add explicit Prev/Next buttons with `aria-label`.

- All components with subdued text (examples above)
  - Review `text-foreground/60` and `/50` for small text, increase to `/80` or use accessible tokens.

---

## 7) Quick Reference Snippets

- Accessible search input:

```tsx
<label htmlFor="users-search-input" className="sr-only">Search users</label>
<input
  id="users-search-input"
  type="text"
  aria-label="Search users"
  // ...existing props
/>
```

- Pagination current page:

```tsx
<button
  aria-current={pageNum === currentPage ? "page" : undefined}
  // ...existing props
>
  {pageNum}
</button>
```

- Radio-group pattern for product options:

```tsx
<div role="radiogroup" aria-label={`Choose ${opt.name}`}>
  {values.map(({ value, available }) => (
    <button
      key={value}
      role="radio"
      aria-checked={selected === value}
      disabled={!available}
      // ...existing props
    >
      {value}
    </button>
  ))}
</div>
```

- Focus trap suggestion
  - Introduce `focus-trap-react` or `@radix-ui/react-dialog` for modals to get Escape-to-close, focus lock, and initial focus out-of-the-box.

---

## 8) Priority Checklist

- High (P0)
  - Add labels to all search inputs in UsersTable and OrdersTable.
  - Implement focus trap + initial focus in AuthModal, BookingModal, AddProductModal.
  - Fix Header menu semantics (remove role="menu" or fully implement menu pattern).

- Medium (P1)
  - Add `aria-current="page"` to active pagination buttons.
  - Add ARIA semantics to ProductOptions (radiogroup/radio).
  - Add `aria-pressed` for selected Date/Time buttons in BookingModal (or use radios).

- Medium/Low (P2)
  - Adjust low-contrast text uses (avoid `/40`–`/60` for small text in dark mode).
  - Replace clickable overlays with keyboard-accessible patterns.

If you’d like, I can implement these changes in a branch, starting with the P0 items (modals focus traps, Header menu semantics, and search input labels) and follow with P1 updates.

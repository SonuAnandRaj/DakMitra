# DakMitra — Unified Design System, Theme & Animation Guide

> **Design North Star:** The **In-Place Edit Modal** (`#edit-record-modal-overlay`), **Quick-Delete Modal** (`#quick-delete-modal-overlay`), **Profile Edit Card** (`.profile-edit-card`), and **Floating Action Popover** (`.directory-floating-bar`) define DakMitra's signature look and feel. Every modal, card, form, button, and overlay in the app should share this exact visual language and motion choreography.

---

## 1. Core Design DNA (The 5 Pillars)

1. **Seamless Rounded Gradient Top Accent (`::before`)**
   - Primary surfaces feature a crisp `4px` (`3px` for compact popovers) indigo-to-amber gradient bar clipped cleanly to the card's border radius using `inset: 0; border-radius: inherit;` — never requiring `overflow: hidden` so autocomplete dropdowns are never clipped.
   - Destructive/deletion surfaces shift the accent bar to a red-to-amber gradient (`#ef4444 → #f59e0b`).
2. **Tinted Elevation & OLED Dark Mode**
   - Light mode uses crisp slate surfaces (`#f8fafc` canvas, `#ffffff` cards) with soft indigo-tinted borders (`rgba(79, 70, 229, 0.18)`) and multi-layered ambient shadows.
   - Dark mode uses deep OLED navy-black (`#090e17` canvas, `#111827` cards) with soft neon indigo borders (`rgba(129, 140, 248, 0.24)`) and subtle inner highlights (`inset 0 1px 0 rgba(255, 255, 255, 0.06)`).
3. **Spring-Driven Motion Physics**
   - Entrances and interactive taps use spring overshoot curves (`cubic-bezier(0.34, 1.56, 0.64, 1)`) for pop-ins/modals and smooth deceleration (`cubic-bezier(0.22, 1, 0.36, 1)`) for staggered content reveals.
4. **Tactile, Stateful Gradient Buttons**
   - Primary and danger actions share a unified animated gradient button with a sweeping light sheen, hover lift, tactile press (`scale(0.96)`), and a **3-stage feedback machine**: `Idle → Loading (spinner) → Success (animated SVG checkmark)`.
5. **Icon-Led Headers & Interactive Inputs**
   - Every modal and section card uses a `42px` squircle icon badge (`border-radius: 14px`) with a subtle gradient tint, bold title + muted subtitle, and a circular `34px` close button that rotates `90deg` on hover.
   - Form fields use a left-aligned `18px` stroke SVG icon that lights up and scales on `:focus-within`, paired with a `1px` upward lift and soft indigo halo.

---

## 2. Unified Theme & Motion Tokens

Add these semantic tokens inside `:root` and `[data-theme="dark"]` in `<style>` (keeping your existing variables intact so nothing breaks during migration).

```css
:root {
  /* --- Brand & Semantic RGB Channels (for consistent alpha tints) --- */
  --primary-rgb: 79, 70, 229;
  --accent-rgb: 245, 158, 11;
  --danger-rgb: 239, 68, 68;
  --success-rgb: 16, 185, 129;

  /* --- Semantic Status Colors --- */
  --danger: #ef4444;
  --danger-hover: #dc2626;
  --danger-soft: rgba(239, 68, 68, 0.12);
  --danger-text: #b91c1c;
  --danger-border: rgba(239, 68, 68, 0.25);

  /* --- Signature Gradients --- */
  --grad-brand: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
  --grad-btn-primary: linear-gradient(135deg, var(--primary) 0%, #6366f1 50%, var(--accent) 100%);
  --grad-btn-danger: linear-gradient(135deg, #ef4444 0%, #dc2626 55%, #f97316 100%);
  --grad-btn-success: linear-gradient(135deg, #10b981 0%, #059669 100%);
  --grad-danger-bar: linear-gradient(135deg, #ef4444 0%, #f59e0b 100%);
  --grad-icon-primary: linear-gradient(135deg, rgba(79, 70, 229, 0.14) 0%, rgba(245, 158, 11, 0.14) 100%);
  --grad-icon-danger: linear-gradient(135deg, rgba(239, 68, 68, 0.14) 0%, rgba(245, 158, 11, 0.14) 100%);

  /* --- Surfaces & Tinted Borders --- */
  --border-tinted: rgba(79, 70, 229, 0.18);
  --border-tinted-danger: rgba(239, 68, 68, 0.24);
  --glass-bg: rgba(255, 255, 255, 0.88);
  --glass-inset: inset 0 1px 0 rgba(255, 255, 255, 0.7);

  /* --- Unified Elevation Shadows --- */
  --shadow-card: 0 12px 32px -12px rgba(79, 70, 229, 0.14), 0 2px 6px -2px rgba(15, 23, 42, 0.05);
  --shadow-modal: 0 24px 48px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(79, 70, 229, 0.08);
  --shadow-btn-primary: 0 8px 20px -6px rgba(79, 70, 229, 0.5);
  --shadow-btn-primary-hover: 0 12px 24px -6px rgba(79, 70, 229, 0.65);
  --shadow-btn-danger: 0 8px 20px -6px rgba(239, 68, 68, 0.5);
  --shadow-btn-danger-hover: 0 12px 24px -6px rgba(239, 68, 68, 0.65);
  --shadow-btn-success: 0 8px 20px -4px rgba(16, 185, 129, 0.5);

  /* --- Radii --- */
  --radius-card: 24px;
  --radius-btn: 16px;
  --radius-btn-sm: 12px;
  --radius-input: 14px;
  --radius-icon: 14px;
  --radius-chip: 10px;
  --radius-pill: 999px;

  /* --- Motion Curves & Durations --- */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-smooth: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --dur-fast: 0.18s;
  --dur-base: 0.28s;
  --dur-modal: 0.36s;
}

[data-theme="dark"] {
  --primary-rgb: 129, 140, 248;
  --accent-rgb: 251, 191, 36;
  --danger-soft: rgba(239, 68, 68, 0.18);
  --danger-text: #fca5a5;
  --danger-border: rgba(239, 68, 68, 0.32);

  --grad-icon-primary: linear-gradient(135deg, rgba(129, 140, 248, 0.18) 0%, rgba(251, 191, 36, 0.15) 100%);
  --grad-icon-danger: linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(251, 191, 36, 0.14) 100%);

  --border-tinted: rgba(129, 140, 248, 0.24);
  --border-tinted-danger: rgba(239, 68, 68, 0.32);
  --glass-bg: rgba(17, 24, 39, 0.86);
  --glass-inset: inset 0 1px 0 rgba(255, 255, 255, 0.06);

  --shadow-card: 0 14px 32px -12px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(129, 140, 248, 0.08);
  --shadow-modal: 0 24px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(129, 140, 248, 0.12);
}
```

### Sacred Z-Index Layering Map (Do Not Break)
| Layer | Element | `z-index` |
| :--- | :--- | :---: |
| Base sticky headers | `table.data-table th` | `10` |
| Search hero collapse | `.search-hero-collapse-wrap` | `20` |
| Active autocomplete field | `.dm-field:focus-within` | `50` |
| Top App Bar | `.app-bar` | `100` |
| Android Notch Cover | `.status-bar-cover` | `101` |
| Floating Bottom Nav | `.bottom-nav` | `900` |
| Floating Action Popover | `.directory-floating-bar` | `950` |
| Sidebar Backdrop / Drawer | `.sidebar-overlay` / `.sidebar` | `999` / `1000` |
| Standard Modals | `.modal-overlay` | `3000` |
| Confirm & Alert Modals | `#confirm-modal-overlay`, `#alert-modal-overlay` | `4000` |
| Toast Notification | `.toast` | `5000` |
| Splash Screen | `.splash-screen` | `9999` |

---

## 3. Unified Component System (Reusable CSS Primitives)

### 3.1 Signature Card & Modal Surfaces
Every major card (`.auth-card`, `.upload-card`, `.profile-edit-card`, `.search-hero`) and every modal (`.modal-card`) should inherit the same surface geometry and top-bar rule.

```css
/* Shared Surface DNA */
.dm-surface {
  position: relative;
  background: var(--card-bg);
  border: 1px solid var(--border-tinted);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  overflow: visible; /* Critical: keeps autocomplete dropdowns unclipped */
}

.dm-surface::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--grad-brand) top / 100% 4px no-repeat;
  pointer-events: none;
}

.dm-surface.is-danger {
  border-color: var(--border-tinted-danger);
}

.dm-surface.is-danger::before {
  background: var(--grad-danger-bar) top / 100% 4px no-repeat;
}

/* Unified Modal Shell (Upgrades base .modal-card globally) */
.modal-card {
  position: relative;
  background: var(--card-bg);
  border: 1px solid var(--border-tinted);
  border-radius: var(--radius-card);
  padding: 28px 24px 24px;
  width: 92%;
  max-width: 440px;
  box-shadow: var(--shadow-modal);
  transform: translateY(-18px) scale(0.95);
  transition: transform var(--dur-modal) var(--ease-spring);
  overflow: visible;
}

.modal-card::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--grad-brand) top / 100% 4px no-repeat;
  pointer-events: none;
}

.modal-overlay.show .modal-card {
  transform: translateY(0) scale(1);
}
```

### 3.2 Unified Header, Squircle Icon Badge & Rotating Close Button
Replaces ad-hoc `<h3>` and raw `✕` buttons across **all** modals and settings/upload/help cards.

```css
.dm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
  text-align: left;
}

.dm-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.dm-icon-badge {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-icon);
  background: var(--grad-icon-primary);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dm-icon-badge.is-danger {
  background: var(--grad-icon-danger);
  color: var(--danger);
}

.dm-close-btn {
  background: var(--btn-secondary);
  border: 1px solid var(--border);
  width: 34px;
  height: 34px;
  border-radius: 50%;
  font-size: 14px;
  cursor: pointer;
  color: var(--text-light);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.25s ease, background 0.2s ease, color 0.2s ease;
}

.dm-close-btn:hover {
  background: var(--border);
  color: var(--text);
  transform: rotate(90deg);
}

.dm-close-btn:active {
  transform: scale(0.9) rotate(90deg);
}
```

### 3.3 Unified Button System (Matches `.btn-save-profile` & `.btn-delete-profile`)
Consolidates the 6 competing button styles in `index.html` into one cohesive family.

```css
/* Base Unified Action Button */
.dm-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  height: 50px;
  padding: 0 20px;
  border-radius: var(--radius-btn);
  border: none;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.2px;
  cursor: pointer;
  overflow: hidden;
  transition: transform var(--dur-fast) var(--ease-standard),
    box-shadow var(--dur-base) var(--ease-standard),
    background-position 0.35s var(--ease-standard),
    background 0.25s ease;
}

.dm-btn svg {
  width: 19px;
  height: 19px;
  flex-shrink: 0;
}

.dm-btn:active:not(:disabled) {
  transform: scale(0.96);
}

.dm-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none !important;
}

/* Primary Brand Gradient + Sweeping Sheen */
.dm-btn-primary {
  background: var(--grad-btn-primary);
  background-size: 200% 200%;
  color: #ffffff;
  box-shadow: var(--shadow-btn-primary);
}

.dm-btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  background-position: 100% 50%;
  box-shadow: var(--shadow-btn-primary-hover);
}

/* Danger Gradient + Sweeping Sheen */
.dm-btn-danger {
  background: var(--grad-btn-danger);
  background-size: 200% 200%;
  color: #ffffff;
  box-shadow: var(--shadow-btn-danger);
}

.dm-btn-danger:hover:not(:disabled) {
  transform: translateY(-2px);
  background-position: 100% 50%;
  box-shadow: var(--shadow-btn-danger-hover);
}

/* Sweeping Sheen on Primary & Danger Buttons */
.dm-btn-primary::after,
.dm-btn-danger::after {
  content: "";
  position: absolute;
  top: 0;
  left: -120%;
  width: 60%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.28), transparent);
  transform: skewX(-25deg);
  animation: btnShine 4s infinite ease-in-out;
  pointer-events: none;
}

/* Secondary / Cancel Button */
.dm-btn-secondary {
  background: var(--btn-secondary);
  color: var(--text);
  border: 1px solid var(--border);
}

.dm-btn-secondary:hover:not(:disabled) {
  background: var(--btn-secondary-hover);
  transform: translateY(-1px);
}

/* Soft Tinted Danger (e.g., Clear Cache, Reject, Delete Request) */
.dm-btn-danger-soft {
  background: var(--danger-soft);
  color: var(--danger-text);
  border: 1px solid var(--danger-border);
}

.dm-btn-danger-soft:hover:not(:disabled) {
  background: var(--danger);
  color: #ffffff;
  border-color: var(--danger);
  transform: translateY(-1px);
}

/* Compact Size Modifier (for Settings rows, Approvals, Directory cards) */
.dm-btn-sm {
  height: 38px;
  padding: 0 14px;
  font-size: 13px;
  border-radius: var(--radius-btn-sm);
}

.dm-btn-full {
  width: 100%;
}

/* 3-State Feedback Machine */
.dm-btn.is-loading {
  pointer-events: none;
  background: var(--primary);
  box-shadow: 0 4px 12px -2px rgba(var(--primary-rgb), 0.35);
}
.dm-btn-danger.is-loading {
  background: var(--danger-hover);
}
.dm-btn.is-loading::after,
.dm-btn.is-success::after {
  display: none;
}

.dm-btn.is-success {
  pointer-events: none;
  background: var(--grad-btn-success) !important;
  box-shadow: var(--shadow-btn-success) !important;
  transform: scale(1.01);
}
```

#### Reusable JS Helper for the 3-State Button Machine
Add this single helper in `<script>` so **any** async button (Sign In, Upload Excel, Sync DB, Save Staff, Submit Approvals, Crop Photo, etc.) gets the exact same spinner → checkmark animation as your Edit/Delete modals:

```js
function setButtonState(btn, state, labelText, iconSvg = "") {
  if (!btn) return;
  btn.classList.remove("is-loading", "is-success");

  if (state === "loading") {
    if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
    btn.classList.add("is-loading");
    btn.disabled = true;
    btn.innerHTML = `<div class="btn-spinner"></div><span>${labelText || "Working..."}</span>`;
  } else if (state === "success") {
    btn.classList.add("is-success");
    btn.disabled = true;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline class="checkmark-path" points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>${labelText || "Done!"}</span>`;
  } else {
    btn.disabled = false;
    btn.innerHTML = labelText
      ? `${iconSvg}<span>${labelText}</span>`
      : (btn.dataset.originalHtml || btn.innerHTML);
  }
}
```

### 3.4 Unified Form Inputs, Selects & Glass Toast
```css
/* Unified Input / Select Focus Lift (Matches .profile-input-wrapper) */
.input-group input,
.input-group select,
.dm-select {
  border-radius: var(--radius-input);
  border: 1.5px solid var(--input-border);
  background: var(--input-bg);
  color: var(--text);
  transition: all 0.25s var(--ease-standard);
}

.input-group input:focus,
.input-group select:focus,
.dm-select:focus {
  background: var(--card-bg);
  border-color: var(--primary);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px -4px rgba(var(--primary-rgb), 0.16);
}

/* Frosted Glass Toast (Matches .directory-floating-bar) */
.toast {
  background: var(--glass-bg);
  color: var(--text);
  border: 1px solid var(--border-tinted);
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  box-shadow: var(--shadow-modal), var(--glass-inset);
  transform: translateX(-50%) translateY(20px) scale(0.92);
  transition: opacity 0.22s ease, transform 0.34s var(--ease-spring);
}

.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0) scale(1);
}
```

---

## 4. Animation Choreography & Accessibility

### Motion Standards
| Interaction | Animation / Transition | Curve | Duration |
| :--- | :--- | :--- | :---: |
| Modal Open / Close | `translateY(-18px) scale(0.95)` → `0, 1` | `--ease-spring` | `0.36s` |
| Staggered Modal / Card Fields | `@keyframes editFieldSlideIn` (`40ms`, `90ms`, `140ms`) | `--ease-smooth` | `0.32s` |
| View Switching (`.view-section.active`) | `opacity: 0; translateY(8px)` → `1, 0` | `--ease-smooth` | `0.28s` |
| Button Hover / Press | `translateY(-2px)` / `scale(0.96)` | `--ease-standard` | `0.18s` |
| Button Sheen Sweep | `@keyframes btnShine` | `ease-in-out` | `4.0s` loop |
| Checkmark Draw | `@keyframes drawCheck` | `--ease-standard` | `0.40s` |
| Updated Record Feedback | `@keyframes recordUpdatedPulse` | `ease-out` | `1.10s` |
| Chip / Popover Entrance | `@keyframes popoverBtnPop` | `--ease-spring` | `0.26s` |

### Reduced Motion Safety Net (Mandatory)
Add at the bottom of `<style>` so users with OS-level reduced motion enabled get instant, comfortable transitions:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 5. Deep Audit & Component-by-Component Upgrade Map for `index.html`

Every discrepancy found during the audit of `index.html` is listed below with its exact target upgrade.

### A. Modals (5 Modals to Upgrade to Edit/Delete Parity)
1. **Confirm Action Modal (`#confirm-modal-overlay`)**
   - *Current:* Legacy centered `.modal-card`, emoji `⚠️`, flat `.modal-btn-danger`.
   - *Upgrade:* Add `.delete-modal-card` (or `.dm-surface.is-danger`), replace `⚠️` with `.dm-icon-badge.is-danger` SVG, add `.dm-close-btn`, and upgrade `#confirm-modal-submit` to `.dm-btn.dm-btn-danger` + Cancel to `.dm-btn.dm-btn-secondary`.
2. **Alert Modal (`#alert-modal-overlay`)**
   - *Current:* Legacy `.modal-card`, emoji icon, flat gray OK button.
   - *Upgrade:* Add `.dm-header` with `.dm-icon-badge`, upgrade OK button to `.dm-btn.dm-btn-primary.dm-btn-full`.
3. **Record History Modal (`#history-modal-overlay`)**
   - *Current:* Legacy `.modal-card`, raw `✕` text button, no gradient bar, plain timeline items.
   - *Upgrade:* Use `.dm-header` with clock SVG inside `.dm-icon-badge` + `.dm-close-btn`. Add `.edit-modal-field` stagger animation to timeline entries.
4. **Office Details & Staff CRUD Modal (`#office-details-modal-overlay`)**
   - *Current:* Legacy `.modal-card`, plain `✕`, flat `💾 Save` button, un-iconified `.staff-edit-inputs`.
   - *Upgrade:* Use `.dm-close-btn`, upgrade `#save-office-staff-btn` to `.dm-btn.dm-btn-primary` driven by `setButtonState()` (spinner → checkmark on save!), and apply `var(--radius-input)` + focus-lift to `.staff-edit-inputs input`.
5. **Profile Picture Crop Modal (`#crop-modal-overlay`)**
   - *Current:* Legacy `.modal-card`, flat `✨ Save Photo` button.
   - *Upgrade:* Add `.dm-header` with camera/crop icon in `.dm-icon-badge` + `.dm-close-btn`. Upgrade `#apply-crop-btn` to `.dm-btn.dm-btn-primary` with `setButtonState()`.

### B. Views & Cards (6 Views to Unify)
6. **Auth View (`#auth-view` / `.auth-card`)**
   - Add `.dm-surface` (gives `24px` radius + `4px` gradient top bar + tinted border).
   - Wrap email, password, and signup fields in `.profile-input-wrapper` with stroke SVG `.field-icon`.
   - Upgrade `#auth-btn` to `.dm-btn.dm-btn-primary.dm-btn-full` and Passkey button to `.dm-btn.dm-btn-secondary.dm-btn-full`.
7. **Settings View (`#view-settings`)**
   - Upgrade all 4 `.upload-card` blocks (Display, Data Management, Device Security, App Information) to `.dm-surface` with `.dm-header` + `.dm-icon-badge` (SVG icons for Display, Database, Shield, Info).
   - Upgrade all inline buttons:
     - `Toggle`, `Sync`, `Lock to This Device` → `.dm-btn.dm-btn-primary.dm-btn-sm` (or `.dm-btn-full` for Lock).
     - `Export` → `.dm-btn.dm-btn-secondary.dm-btn-sm` (or emerald tinted badge style).
     - `Clear App Cache` → `.dm-btn.dm-btn-danger-soft.dm-btn-full`.
     - `Check for App Updates` → `.dm-btn.dm-btn-secondary.dm-btn-full`.
   - Style `#default-view-select` and `#export-mode-select` with `.dm-select`.
   - Wire `syncDatabase()` and `exportFullTableToExcel()` to `setButtonState()`.
8. **Upload Data View (`#view-upload`)**
   - Upgrade Manual Entry card and Excel Upload card to `.dm-surface` with `.dm-header` + `.dm-icon-badge`.
   - Upgrade `#submit-multiple-btn`, `#submit-bulk-btn`, and `#upload-excel-btn` to `.dm-btn.dm-btn-primary` with `setButtonState()`.
   - Upgrade `+ Add Row` to `.dm-btn.dm-btn-secondary`.
9. **Approvals View (`#view-approvals`)**
   - Replace inline styles on `#approval-card-...` with a dedicated `.approval-card` class (`border-radius: 18px`, `border: 1px solid var(--border)`, hover lift + `var(--border-tinted)`).
   - Upgrade `👍 Approve` → `.dm-btn.dm-btn-primary.dm-btn-sm`.
   - Upgrade `👎 Reject` & `🗑️ Delete Request` → `.dm-btn.dm-btn-danger-soft.dm-btn-sm`.
10. **Directory View (`#view-directory`)**
    - Upgrade `.directory-card` to `border-radius: 20px`, `border: 1px solid var(--border)`, hover border `var(--border-tinted)` + subtle lift.
    - Upgrade `.dir-quick-add-btn` to use `var(--grad-brand)` with tactile `scale(0.94)` press.
11. **Help & Guide View (`#view-help`)**
    - Upgrade the 4 guide cards to `.dm-surface` with `.dm-header` + `.dm-icon-badge` (replacing raw emoji `<h3>` headings).

### C. CSS Cleanup (Duplicates Spotted in `index.html`)
- Merge duplicate `.toolbar-btn` blocks (currently defined twice in `<style>`).
- Merge duplicate `.badge-primary` blocks.
- Merge duplicate `.sidebar-profile-row` / `.sidebar-avatar` blocks.
- Ensure `.view-section.active` uses `animation: fadeIn 0.28s var(--ease-smooth);`.

---

## 6. Verification & Regression Checklist

After applying the changes, test these 6 critical areas on mobile & desktop:
- [ ] **Light & Dark OLED Switch:** Toggle theme on every view and open every modal; verify zero harsh borders and readable text contrast.
- [ ] **Autocomplete Overflow:** Open Office dropdowns in Search Options, Manual Upload, Bulk Upload, and Edit Record Modal — confirm dropdowns float *above* cards/buttons without clipping (`overflow: visible` + `:focus-within { z-index: 50 }`).
- [ ] **Mobile Keyboard Handling:** Focus inputs inside Edit Modal, Quick Add, Quick Delete, and Office Staff Editor; confirm `body.keyboard-open` still pins modals to the top cleanly.
- [ ] **3-State Button Recovery:** Trigger an intentional error (e.g., offline save) and confirm `setButtonState(btn, "idle")` restores the original icon and text cleanly.
- [ ] **Z-Index Stacking:** Confirm `#confirm-modal-overlay` (`4000`) still opens *above* `#quick-delete-modal-overlay` (`3000`), and `.toast` (`5000`) floats above everything.
- [ ] **Reduced Motion:** Enable "Reduce Motion" in OS/DevTools and verify no infinite sheen or spring animations distract the user.
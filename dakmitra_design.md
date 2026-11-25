# DakMitra — Unified Design System, Theme & Animation Guide (v1.0.7)

> **Current Status:** Reflects the live, deduplicated 5-layer DakMitra stylesheet architecture (`css/01-base-layout.css` through `css/05-superadmin.css`) and `js/02-utils.js`. Pair this file with `architecture.md` for full system context.

---

## 1. Core Design DNA (The 5 Pillars)

1. **Seamless Rounded Gradient Top Bars (`::before`)**
   - Primary cards, modals, and popovers feature a `4px` (`3px` for `.directory-floating-bar`, `.approval-card`, `.feedback-card`, and `.crop-preview-dock`) indigo-to-amber gradient bar clipped via `inset: 0; border-radius: inherit; background: ... top / 100% 4px no-repeat; pointer-events: none;`.
   - Avoids needing `overflow: hidden` on cards containing autocomplete dropdowns.
   - Destructive surfaces (`.delete-modal-card`, `.approval-card.is-delete`, `.feedback-card.is-bug`) shift the top bar to a red-to-amber/orange gradient; Priority surfaces (`.priority-modal-card`) shift amber-to-indigo.
2. **High-Contrast Light & Deep OLED Dark Themes**
   - **Light:** Crisp slate canvas (`#f8fafc`), pure white cards (`#ffffff`), soft indigo-tinted borders (`rgba(79, 70, 229, 0.18)`), and layered ambient shadows.
   - **Dark:** Deep OLED canvas (`#090e17`), dark slate cards (`#111827`), soft neon indigo borders (`rgba(129, 140, 248, 0.24)`), and frosted glass surfaces (`rgba(17, 24, 39, 0.86)`).
   - Edge-to-edge system bar blending (`color-scheme`, `<meta name="theme-color">`, `.status-bar-cover`) syncs synchronously in `<head>` before first paint.
3. **Spring-Driven Motion Physics**
   - Modals, segmented sliders, popovers, toggle switches, and filter badges use spring overshoot (`--dm-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)`).
   - Card cascades, view transitions, 3D flashcard swipes, and smooth collapses use soft deceleration (`--dm-ease-smooth: cubic-bezier(0.22, 1, 0.36, 1)`).
4. **Stateful Animated Gradient Buttons**
   - Primary and danger actions share a shifting gradient with a sweeping light sheen (`btnShine`), hover lift (`-2px`), tactile press (`scale(0.96)`), and a **3-stage state machine** (`idle` → `loading` spinner → `success` animated SVG checkmark) driven by `setButtonState()` in `js/02-utils.js`.
5. **Icon-Led Headers & Interactive Inputs**
   - Modals and cards use `42px` squircle icon badges (`.dm-icon-badge` / `.edit-modal-icon`) and circular `34px` close buttons (`.dm-close-btn` / `.edit-modal-close-btn`) that rotate `90deg` on hover.
   - Form fields wrapped in `.profile-input-wrapper` place an `18px` stroke SVG `.field-icon` on the left that tints `--primary`, scales `1.1x`, and lifts the input `-1px` on `:focus-within`.

---

## 2. CSS Modular Ownership

Always place new styles in the matching layer to preserve the cascade without duplicating rules across files:

| File                     | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| :----------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `css/01-base-layout.css` | `:root` & `[data-theme="dark"]` tokens, native PWA reset, `.status-bar-cover`, `.app-bar`, `.sidebar`, `.bottom-nav`, `.container`, `.view-section`, `.search-hero-collapse-wrap`, `.dm-scroll-locked`, base `body.keyboard-open`, `prefers-reduced-motion`                                                                                                                                                                                                                                                                                         |
| `css/02-components.css`  | `.dm-surface`, `.dm-header`, `.dm-icon-badge`, `.dm-close-btn`, `.dm-btn*`, `.tabs`, `.input-group`, `.alert`, `.autocomplete-dropdown`, `.badge`, `.results-toolbar`, `.card-actions`, semantic `.toast` (with keyboard offset), `.modal-overlay` / `.modal-card` / `.edit-modal-*`, skeletons, `.splash-screen`                                                                                                                                                                                                                                   |
| `css/03-views.css`       | Search view (ambient glow, active filter pills, `List \| Table` switch, Delivery Office cards, card cascade, AI fallback cards), Directory view (cards, chips, floating bar, Quick-Add/Delete/Priority, Staff CRUD modal), Shared Priority styles, Universal `.dir-filter-bar`, Employees & User Profile modal, `.dm-toggle-row` switches, Approvals filters & cards, Upload/Bulk, Feedback Hub, Profile, Auth (orbs & sliding tabs), Full-Screen Photo Cropper (with Live Dual Preview Dock) & Lightbox, view-level `body.keyboard-open` overrides |
| `css/04-learn.css`       | Learn & Quiz shell (`#view-learn`), 3-way segmented tabs, mastery ring overview, 3D flip flashcards & swipe physics, rating & nav bars, 3-mode Quiz HUD/cards/PIN sniper/summary, office mastery bars, weak spots, division leaderboard, Directory practice button                                                                                                                                                                                                                                                                                  |
| `css/05-superadmin.css`  | Superadmin shell (`#view-superadmin` + keyboard override), `.sa-tabs-chips` scrollable tab bar, global `.sa-announcement-banner`, `.sa-card`, `.sa-user-card`, `.sa-db-table` & pager                                                                                                                                                                                                                                                                                                                                                               |

---

## 3. Active Theme, Motion & Viewport Tokens

Defined in `css/01-base-layout.css`:

| Token                                      | Light Mode                                                                    | Dark Mode (OLED)                                                            | Role                                       |
| :----------------------------------------- | :---------------------------------------------------------------------------- | :-------------------------------------------------------------------------- | :----------------------------------------- |
| `--primary` / `--primary-hover`            | `#4f46e5` / `#4338ca`                                                         | `#818cf8` / `#a5b4fc`                                                       | Brand primary & active states              |
| `--accent`                                 | `#f59e0b`                                                                     | `#fbbf24`                                                                   | Brand amber accent & highlights            |
| `--bg`                                     | `#f8fafc`                                                                     | `#090e17`                                                                   | App canvas & system notch/bar fill         |
| `--card-bg`                                | `#ffffff`                                                                     | `#111827`                                                                   | Card & modal background                    |
| `--text` / `--text-light`                  | `#0f172a` / `#475569`                                                         | `#f9fafb` / `#9ca3af`                                                       | Primary & secondary text                   |
| `--border`                                 | `#e2e8f0`                                                                     | `#1f2937`                                                                   | Standard dividers & borders                |
| `--input-bg` / `--input-border`            | `#f1f5f9` / `#cbd5e1`                                                         | `#1f2937` / `#374151`                                                       | Form input fills & strokes                 |
| `--btn-secondary` / `...-hover`            | `#f1f5f9` / `#e2e8f0`                                                         | `#1f2937` / `#374151`                                                       | Neutral secondary surfaces                 |
| `--success-bg` / `...-text` / `...-border` | `#dcfce7` / `#166534` / `#4ade80`                                             | `#064e3b` / `#34d399` / `#059669`                                           | Verified/call/success badges               |
| `--stripe-bg`                              | `rgba(79, 70, 229, 0.04)`                                                     | `rgba(129, 140, 248, 0.05)`                                                 | Subtle tinted stripes & header washes      |
| `--dm-border-tint`                         | `rgba(79, 70, 229, 0.18)`                                                     | `rgba(129, 140, 248, 0.24)`                                                 | Signature tinted card/modal border         |
| `--dm-glass-bg`                            | `rgba(255, 255, 255, 0.88)`                                                   | `rgba(17, 24, 39, 0.86)`                                                    | Frosted glass for toasts & popovers        |
| `--dm-shadow-modal`                        | `0 24px 48px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(79, 70, 229, 0.08)` | `0 24px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(129, 140, 248, 0.12)` | Deep modal & popover elevation             |
| `--dm-gradient-brand`                      | `linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)`              | Same                                                                        | Brand headers, top bars, avatars, AI badge |
| `--dm-gradient-btn`                        | `linear-gradient(135deg, var(--primary) 0%, #6366f1 50%, var(--accent) 100%)` | Same                                                                        | Primary action buttons                     |
| `--dm-gradient-danger`                     | `linear-gradient(135deg, #ef4444 0%, #dc2626 55%, #f97316 100%)`              | Same                                                                        | Destructive action buttons                 |
| `--dm-gradient-success`                    | `linear-gradient(135deg, #10b981 0%, #059669 100%)`                           | Same                                                                        | Button `.is-success` completion state      |
| `--dm-ease-spring`                         | `cubic-bezier(0.34, 1.56, 0.64, 1)`                                           | Same                                                                        | Modals, sliders, popovers, chips, toggles  |
| `--dm-ease-smooth`                         | `cubic-bezier(0.22, 1, 0.36, 1)`                                              | Same                                                                        | Reveals, cascades, media studios           |

### Dynamic Keyboard & Viewport Variables (Managed by `js/03-ui-shell.js`)

- `--vvh`: Current `visualViewport.height` (fallback `100dvh`)
- `--vv-top`: Current `visualViewport.offsetTop` (`0px`)
- `--kb-height`: Computed software keyboard height when `body.keyboard-open` is active
- `--kb-fixed-offset`: Bottom offset used by `body.keyboard-open .toast` so toasts float cleanly above the keyboard

---

## 4. Z-Index Layering Map (Sacred — Do Not Break)

| Layer                                                                           | Selector                                                           | `z-index` |
| :------------------------------------------------------------------------------ | :----------------------------------------------------------------- | :-------: |
| Sticky table headers                                                            | `table.data-table th`                                              |   `10`    |
| Pinned quick-filter bar (Approvals / Feedback)                                  | `.appr-quick-bar`                                                  |   `10`    |
| Collapsible hero wrapper                                                        | `.search-hero-collapse-wrap`                                       |   `20`    |
| Approvals filter section with open autocomplete                                 | `.appr-filter-section:focus-within`                                |   `40`    |
| Active autocomplete field                                                       | `.manual-entry-row:focus-within`, `.edit-modal-field:focus-within` |   `50`    |
| Top App Bar                                                                     | `.app-bar`                                                         |   `100`   |
| Android Notch Cover                                                             | `.status-bar-cover`                                                |   `101`   |
| Floating Bottom Nav                                                             | `.bottom-nav`                                                      |   `900`   |
| Floating Action Popover                                                         | `.directory-floating-bar`                                          |   `950`   |
| Sidebar Backdrop                                                                | `.sidebar-overlay`                                                 |   `999`   |
| Sidebar Drawer & Autocomplete Dropdown                                          | `.sidebar`, `.autocomplete-dropdown`                               |  `1000`   |
| Standard Modals (History, Office Staff, Edit, Quick-Add/Delete/Priority, Admin) | `.modal-overlay`                                                   |  `3000`   |
| Public User Profile Modal (stacks above Record History)                         | `#user-profile-modal-overlay`                                      |  `3200`   |
| Full-Screen Photo & Screenshot Lightbox                                         | `#avatar-lightbox-overlay`                                         |  `3400`   |
| Full-Screen Photo Cropper Studio                                                | `#crop-modal-overlay`                                              |  `3500`   |
| Confirm & System Alert Modals                                                   | `#confirm-modal-overlay`, `#alert-modal-overlay`                   |  `4000`   |
| Maintenance Mode Lock                                                           | `#maintenance-overlay`                                             |  `4500`   |
| Semantic Toast Notification                                                     | `.toast`                                                           |  `5000`   |
| Native-Style Splash Screen                                                      | `.splash-screen`                                                   |  `9999`   |

---

## 5. Implemented Component Primitives

### 5.1 Surfaces & Modals

- **`.dm-surface`**: Standard elevated card (`24px` radius, `var(--dm-border-tint)` border, `4px` top gradient bar, `overflow: visible` so autocomplete dropdowns never clip).
- **`.modal-overlay` + `.modal-card`**: Frosted backdrop (`backdrop-filter: blur(4px)`), spring entrance (`translateY(-18px) scale(0.96)` → `0, 1`), `24px` radius, `4px` gradient top bar.
- **`.modal-card.edit-modal-card`**: `max-width: 440px`, `overflow: visible`, paired with staggered `.edit-modal-field` entrance animations. Modifiers: `.delete-modal-card` (red-amber top bar), `.priority-modal-card` (amber-indigo top bar).

### 5.2 Headers, Icon Badges & Close Buttons

- **`.dm-header` / `.dm-header-left`**: Left-aligned flex header for cards and modals.
- **`.dm-icon-badge`**: `42px` squircle (`border-radius: 14px`) with indigo-amber tint (`.danger` for red-amber).
- **`.dm-close-btn`**: `34px` circular close button (`rotate(90deg)` on hover, `scale(0.9)` on press).
- _(Edit/Quick-Add/Quick-Delete/Priority modals also use equivalent `.edit-modal-header`, `.edit-modal-icon` / `.delete-modal-icon` / `.priority-modal-icon`, and `.edit-modal-close-btn` classes.)_

### 5.3 Button System & Toggles

| Class                                                              | Use Case                                                                                                                 |
| :----------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| `.dm-btn.dm-btn-primary`                                           | Primary CTA with shifting brand gradient & sweeping sheen (`Sign In`, `Submit`, `Save`, `Sync`, `Approve`)               |
| `.dm-btn.dm-btn-danger`                                            | High-impact destructive CTA (`Confirm Delete`)                                                                           |
| `.dm-btn.dm-btn-secondary`                                         | Cancel, Passkey sign-in, neutral secondary actions                                                                       |
| `.dm-btn.dm-btn-danger-soft`                                       | Tinted red actions (`Clear App Cache`, `Reject`, `Delete Request`, `Suspend`)                                            |
| `.dm-btn-sm` / `.dm-btn-full`                                      | Compact `38px` height modifier / `width: 100%` modifier                                                                  |
| `.btn-save-profile` / `.btn-delete-profile` / `.btn-priority-save` | Full-width `54px`/`50px` animated gradient buttons in Profile, Feedback, Edit, Quick-Add, Quick-Delete & Priority modals |
| `.dm-toggle-row` + `.dm-toggle-switch`                             | Spring-animated toggle switches used in Profile privacy, Feedback diagnostics, Learn & Quiz options, and Superadmin CMS  |

**3-State Async Feedback (`js/02-utils.js`):** Call `setButtonState(btn, "loading" | "success" | "idle", label)` to cycle `.dm-btn` buttons through spinner → animated SVG checkmark (`.checkmark-path`) → original HTML restoration.

### 5.4 Universal Filter Chips & Scrollable Tab Bars

- **`.dir-filter-bar` + `.dir-filter-chips` + `.dir-filter-chip`**: Horizontally scrollable pill filter bar with `.dir-chip-count` counters and semantic active modifiers: default (`--primary` solid), `.is-office` (indigo tint), `.is-priority` (amber tint), `.is-regular` (emerald tint), and `.is-danger` (red tint). Reused across Directory, Employees, Approvals, Feedback, Quick-Delete, Upload Bulk, Learn & Quiz, and Superadmin.
- **`.sa-tabs-chips`**: Safe centered-on-desktop / flush-left-scrollable-on-phone flex pattern (`justify-content: flex-start; overflow-x: auto;` with `margin-left: auto` on `:first-child` and `margin-right: auto` on `:last-child`). Never pair `justify-content: center` directly with `overflow-x: auto`.
- **`.dir-filter-summary` + `.dir-filter-reset-btn`**: Compact dashed summary strip showing live match counts and a 1-tap Reset/Clear pill.

### 5.5 Interactive Inputs, Autocomplete & Toasts

- **`.profile-input-wrapper`**: Icon-prefixed inputs (`padding-left: 44px`, `border-radius: 14px`) with focus elevation.
- **`.autocomplete-wrapper` + `.autocomplete-dropdown.show`**: Pops in with `dropdownPopIn` (`--dm-ease-spring`), rounded `18px` container, `30px` `.ac-item-icon`, and `.ac-item-pin`. Parent wrappers stay elevated via `:focus-within { z-index: 50 }`.
- **Semantic Frosted-Glass Toasts (`js/02-utils.js`):** `showToast(message, type)` auto-detects `.toast-success`, `.toast-error`, `.toast-warning`, or `.toast-info` with `blur(18px)` and haptic feedback.

### 5.6 Sliding Segmented Controls

- **2-Way (`.auth-segmented-tabs` + `.auth-tab-slider`):** Toggles `.is-signup` across Auth (`Sign In | Sign Up`) and Feedback (`Report Bug | Suggest Feature`).
- **3-Way (`.learn-segmented-tabs`):** Toggles `.is-tab-1` / `.is-tab-2` across `Learn | Quiz | Mastery`.
- **View Switch (`.view-mode-switch` + `.view-mode-slider`):** Toggles `.is-table` across `List | Table`.

---

## 6. View-Specific Visual Signatures

- **Search View (`#view-search`):** Fixed top ambient radial glow, pinned `.search-office-card` Delivery Office summaries, 4px left brand strip on result cards, upper-right `.card-priority-btn` bolt toggle, staggered 8-card cascade (`dmCardCascade`), active filter pills, and twinkling AI sparkle button.
- **Directory View (`#view-directory`):** `.directory-card` (`20px` radius) with a 5-column action strip (Staff, Practice, Priority, Add, Delete), `.clickable-office-chip` (`📮`), `.priority-address-chip` (`⚡`), and frosted `.directory-floating-bar` (horizontal scroll safe on narrow phones). Quick-Delete pairs category filter chips with a collapsible red `.quick-delete-selected-box` tray.
- **Employees & User Profile Modal (`#view-members`, `#user-profile-modal-overlay`):** `.member-card` list with Admin/Superadmin/You pills, and a bannered read-only profile modal with clickable contribution stat tiles.
- **Approvals View (`#view-approvals`):** Search bar + collapsible advanced filter drawer, pinned quick-filter chips, `.approval-card` (`3px` top bar, `.is-delete` red-orange), shimmer skeletons, and dual-ring `.approvals-spinner`.
- **Feedback Hub (`#view-feedback`):** `.feedback-card` (`.is-bug` red top bar), status pills (`.fb-status-*`), official `.feedback-response-box`, upvote pills (`.feedback-vote-btn.voted`), and uncropped `.lightbox-media-wrap.is-screenshot` viewer.
- **Learn & Quiz (`#view-learn`):** SVG circular mastery ring (`.learn-ring-svg`), 2-tier Office + Category filter bar, Smart Mix toggle strip, 3D `rotateY(180deg)` `.learn-flashcard` with pointer swipe physics, `.quiz-parcel-card` with perforated tear line & barcode, and `.learn-lb-row` leaderboard.
- **Superadmin Console (`#view-superadmin`):** Global `.sa-announcement-banner` (`info` / `warning` / `danger`), `.sa-tabs-chips` bar, `.sa-user-card` action controls, and horizontally scrollable `.sa-db-table` explorer.
- **Full-Screen Media Studios (Profile):**
  - **Cropper (`#crop-modal-overlay`, `z-index: 3500`):** Pure black canvas, circular/squircle `.crop-cutout` mask with rule-of-thirds grid while `.is-interacting`, frosted `.crop-preview-dock` (Profile Card + Round Icon live previews), 90° rotate, and `.crop-save-pill`.
  - **Lightbox (`#avatar-lightbox-overlay`, `z-index: 3400`):** Swipe-down-to-dismiss, pinch/double-tap zoom, tap-to-hide chrome (`.ui-hidden`), and floating `.lightbox-action-dock`.

---

## 7. Motion Choreography & Accessibility

| Interaction                   | Keyframe / Property                              | Easing                             |     Duration      |
| :---------------------------- | :----------------------------------------------- | :--------------------------------- | :---------------: |
| Modal open/close              | `translateY(-18px) scale(0.96)` → `0, 1`         | `--dm-ease-spring`                 |      `0.36s`      |
| Staggered fields              | `editFieldSlideIn` (`40ms`, `90ms`, `140ms`)     | `--dm-ease-smooth`                 |      `0.32s`      |
| Search card cascade (first 8) | `dmCardCascade` (`20ms`–`230ms` stagger)         | `--dm-ease-smooth`                 |      `0.34s`      |
| Popover & buttons             | `scale(0.84)` + `popoverBtnPop` (`20ms`–`140ms`) | `--dm-ease-spring`                 | `0.32s` / `0.26s` |
| Autocomplete dropdown         | `dropdownPopIn`                                  | `--dm-ease-spring`                 |      `0.24s`      |
| 3D Flashcard flip             | `rotateY(0deg)` → `rotateY(180deg)`              | `--dm-ease-spring`                 |      `0.52s`      |
| Collapsible hero              | `grid-template-rows: 1fr` → `0fr`                | `cubic-bezier(0.25, 0.1, 0.25, 1)` |      `0.90s`      |
| Button sheen sweep            | `btnShine`                                       | `ease-in-out`                      |    `4.0s` loop    |
| Checkmark draw                | `drawCheck`                                      | `cubic-bezier(0.4, 0, 0.2, 1)`     |      `0.40s`      |
| Record updated glow           | `recordUpdatedPulse` (`.record-updated-flash`)   | `ease-out`                         |      `1.10s`      |
| Splash exit                   | `opacity: 0` + `scale(1.04)`                     | `--dm-ease-smooth`                 |      `0.34s`      |

**Reduced Motion Safety Net (`css/01-base-layout.css`):** `@media (prefers-reduced-motion: reduce)` forces `animation-duration` and `transition-duration` to `0.01ms` globally.

---

## 8. Mobile, Safe-Area, Keyboard & Scroll-Lock Rules

1. **Bottom Nav Clearance:** `.results-container-scroll` adds `calc(84px + env(safe-area-inset-bottom, 0px))` bottom padding, and scrollable views (`#view-upload`, `#view-profile`, `#view-settings`, `#view-learn`, `#view-superadmin`, `.feedback-submit-panel`) add `calc(96px + env(safe-area-inset-bottom, 0px))`.
2. **Keyboard Open (`body.keyboard-open`):**
   - Hides `.bottom-nav` (`translateX(-50%) translateY(100px)`), removes bottom-nav padding, pins open views to `calc(var(--vvh, 100dvh) - 88px - env(safe-area-inset-top, 0px))`, lifts `.toast` to `calc(16px + var(--kb-fixed-offset, 0px))`, pins open modals inside `--vvh`, and adds `150px` bottom padding inside `#edit-record-modal-overlay` while `.autocomplete-dropdown.show` is open.
3. **Overlay Scroll Lock (`.dm-scroll-locked`):** Applied automatically to `<html>` and `<body>` whenever any `.modal-overlay.show` or `.sidebar.open` is active, blocking background scroll while permitting internal vertical/horizontal scrolling and Cropper/Lightbox gestures.

---

## 9. Rules for AI Assistants Editing UI/Styles

1. **Use Existing Tokens & Primitives First:** Prefer `--dm-*` tokens, `.dm-surface`, `.dm-header`, `.dm-icon-badge` (use `.danger`, not `.is-danger`), `.dm-close-btn`, `.dm-btn*`, `.dm-toggle-row`, and `.dir-filter-bar` / `.dir-filter-chip`.
2. **Never Duplicate Base Rules Across Layers:** Keep reset/tokens/shell in `01`, shared components/modals/forms/toasts in `02`, view styles in `03`, Learn & Quiz in `04`, and Superadmin in `05`.
3. **Never Pair `justify-content: center` with `overflow-x: auto`:** Use the `.sa-tabs-chips` auto-margin pattern so mobile chips never clip off the left edge.
4. **Never Break Autocomplete Stacking:** Any card or modal hosting `.autocomplete-dropdown` must keep `overflow: visible` and elevate focused field wrappers (`z-index: 50`).
5. **Test Both Themes & Bump `sw.js`:** Provide `[data-theme="dark"]` overrides tuned for `#090e17` / `#111827` OLED contrast, and bump `CACHE_NAME` in `sw.js` after stylesheet edits.

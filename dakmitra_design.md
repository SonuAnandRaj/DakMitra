# DakMitra — Unified Design System, Theme & Animation Guide

> **Current Status:** Reflects the live, modularized DakMitra UI (`css/01-base-layout.css`, `css/02-components.css`, `css/03-views.css`, and `js/02-utils.js`). Pair this file with `ARCHITECTURE.md` for full system context.

---

## 1. Core Design DNA (The 5 Pillars)

1. **Seamless Rounded Gradient Top Bars (`::before`)**
   - Primary cards, modals, and popovers feature a `4px` (`3px` for `.directory-floating-bar` and `.approval-card`) indigo-to-amber gradient bar clipped cleanly via `inset: 0; border-radius: inherit; background: ... top / 100% 4px no-repeat; pointer-events: none;`.
   - Avoids needing `overflow: hidden` on cards containing autocomplete dropdowns.
   - Destructive surfaces (`.delete-modal-card`, `.approval-card.is-delete`) shift the top bar to a red-to-amber/orange gradient.
2. **High-Contrast Light & Deep OLED Dark Themes**
   - **Light:** Crisp slate canvas (`#f8fafc`), pure white cards (`#ffffff`), soft indigo-tinted borders (`rgba(79, 70, 229, 0.18)`), and layered ambient shadows.
   - **Dark:** Deep OLED canvas (`#090e17`), dark slate cards (`#111827`), soft neon indigo borders (`rgba(129, 140, 248, 0.24)`), and frosted glass surfaces (`rgba(17, 24, 39, 0.86)`).
   - Edge-to-edge system bar blending (`color-scheme`, `<meta name="theme-color">`, `.status-bar-cover`) syncs synchronously in `<head>` before first paint.
3. **Spring-Driven Motion Physics**
   - Modals, segmented sliders, popovers, and filter badges use spring overshoot (`--dm-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)`).
   - Card cascades, view transitions, and smooth collapses use soft deceleration (`--dm-ease-smooth: cubic-bezier(0.22, 1, 0.36, 1)`).
4. **Stateful Animated Gradient Buttons**
   - Primary and danger actions share a shifting gradient with a sweeping light sheen (`btnShine`), hover lift (`-2px`), tactile press (`scale(0.96)`), and a **3-stage state machine** (`idle` → `loading` spinner → `success` animated SVG checkmark) driven by `setButtonState()` in `js/02-utils.js`.
5. **Icon-Led Headers & Interactive Inputs**
   - Modals and cards use `42px` squircle icon badges (`.dm-icon-badge` / `.edit-modal-icon`) and circular `34px` close buttons (`.dm-close-btn` / `.edit-modal-close-btn`) that rotate `90deg` on hover.
   - Form fields wrapped in `.profile-input-wrapper` place an `18px` stroke SVG `.field-icon` on the left that tints `--primary`, scales `1.1x`, and lifts the input `-1px` on `:focus-within`.

---

## 2. CSS Modular Ownership

Always place new styles in the matching layer to preserve the cascade:

| File | Responsibility |
| :--- | :--- |
| `css/01-base-layout.css` | `:root` & `[data-theme="dark"]` tokens, native PWA reset (`user-select: none`, tap highlight removal), `.status-bar-cover`, `.app-bar`, `.sidebar`, `.bottom-nav`, `.container`, `.view-section`, `.dm-scroll-locked`, base `body.keyboard-open` rules |
| `css/02-components.css` | `.dm-surface`, `.dm-header`, `.dm-icon-badge`, `.dm-close-btn`, `.dm-btn*`, `.modal-overlay` / `.modal-card`, semantic `.toast` variants, `.badge`, `.autocomplete-dropdown`, `.skeleton-*`, `.approvals-spinner`, `.splash-screen`, `prefers-reduced-motion` |
| `css/03-views.css` | Collapsible heroes, Search view (ambient glow, active filter pills, `List \| Table` switch, card cascade, AI fallback cards), Directory view (cards, chips, floating bar, Quick-Add/Delete, Staff CRUD modal), Edit Record modal, Approvals cards, Upload/Bulk forms, Profile view, Auth view (orbs & sliding tabs), Full-Screen Photo Cropper & Lightbox, view-level `body.keyboard-open` overrides |

---

## 3. Active Theme, Motion & Viewport Tokens

Defined in `css/01-base-layout.css`:

| Token | Light Mode | Dark Mode (OLED) | Role |
| :--- | :--- | :--- | :--- |
| `--primary` / `--primary-hover` | `#4f46e5` / `#4338ca` | `#818cf8` / `#a5b4fc` | Brand primary & active states |
| `--accent` | `#f59e0b` | `#fbbf24` | Brand amber accent & highlights |
| `--bg` | `#f8fafc` | `#090e17` | App canvas & system notch/bar fill |
| `--card-bg` | `#ffffff` | `#111827` | Card & modal background |
| `--text` / `--text-light` | `#0f172a` / `#475569` | `#f9fafb` / `#9ca3af` | Primary & secondary text |
| `--border` | `#e2e8f0` | `#1f2937` | Standard dividers & borders |
| `--input-bg` / `--input-border` | `#f1f5f9` / `#cbd5e1` | `#1f2937` / `#374151` | Form input fills & strokes |
| `--btn-secondary` / `...-hover` | `#f1f5f9` / `#e2e8f0` | `#1f2937` / `#374151` | Neutral secondary surfaces |
| `--success-bg` / `...-text` / `...-border` | `#dcfce7` / `#166534` / `#4ade80` | `#064e3b` / `#34d399` / `#059669` | Verified/call/success badges |
| `--stripe-bg` | `rgba(79, 70, 229, 0.04)` | `rgba(129, 140, 248, 0.05)` | Subtle tinted stripes & header washes |
| `--dm-border-tint` | `rgba(79, 70, 229, 0.18)` | `rgba(129, 140, 248, 0.24)` | Signature tinted card/modal border |
| `--dm-glass-bg` | `rgba(255, 255, 255, 0.88)` | `rgba(17, 24, 39, 0.86)` | Frosted glass for toasts & popovers |
| `--dm-shadow-modal` | `0 24px 48px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(79, 70, 229, 0.08)` | `0 24px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(129, 140, 248, 0.12)` | Deep modal & popover elevation |
| `--dm-gradient-brand` | `linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)` | Same | Brand headers, top bars, avatars, AI badge |
| `--dm-gradient-btn` | `linear-gradient(135deg, var(--primary) 0%, #6366f1 50%, var(--accent) 100%)` | Same | Primary action buttons |
| `--dm-gradient-danger` | `linear-gradient(135deg, #ef4444 0%, #dc2626 55%, #f97316 100%)` | Same | Destructive action buttons |
| `--dm-gradient-success` | `linear-gradient(135deg, #10b981 0%, #059669 100%)` | Same | Button `.is-success` completion state |
| `--dm-ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Same | Modals, sliders, popovers, chips |
| `--dm-ease-smooth` | `cubic-bezier(0.22, 1, 0.36, 1)` | Same | Reveals, cascades, media studios |

### Dynamic Keyboard & Viewport Variables (Managed by `js/03-ui-shell.js`)
- `--vvh`: Current `visualViewport.height` (fallback `100dvh`)
- `--vv-top`: Current `visualViewport.offsetTop` (`0px`)
- `--kb-height`: Computed software keyboard height when `body.keyboard-open` is active
- `--kb-fixed-offset`: Bottom offset so toasts float cleanly above the keyboard

---

## 4. Z-Index Layering Map (Sacred — Do Not Break)

| Layer | Selector | `z-index` |
| :--- | :--- | :---: |
| Sticky table headers | `table.data-table th` | `10` |
| Collapsible hero wrapper | `.search-hero-collapse-wrap` | `20` |
| Active autocomplete field | `.manual-entry-row:focus-within`, `.edit-modal-field:focus-within` | `50` |
| Top App Bar | `.app-bar` | `100` |
| Android Notch Cover | `.status-bar-cover` | `101` |
| Floating Bottom Nav | `.bottom-nav` | `900` |
| Floating Action Popover | `.directory-floating-bar` | `950` |
| Sidebar Backdrop | `.sidebar-overlay` | `999` |
| Sidebar Drawer & Autocomplete Dropdown | `.sidebar`, `.autocomplete-dropdown` | `1000` |
| Standard Modals (History, Office Staff, Edit, Quick-Add, Quick-Delete) | `.modal-overlay` | `3000` |
| Full-Screen Photo Lightbox | `#avatar-lightbox-overlay` | `3400` |
| Full-Screen Photo Cropper Studio | `#crop-modal-overlay` | `3500` |
| Confirm & System Alert Modals | `#confirm-modal-overlay`, `#alert-modal-overlay` | `4000` |
| Semantic Toast Notification | `.toast` | `5000` |
| Native-Style Splash Screen | `.splash-screen` | `9999` |

---

## 5. Implemented Component Primitives

### 5.1 Surfaces & Modals
- **`.dm-surface`**: Standard elevated card with `24px` radius, `var(--dm-border-tint)` border, and `4px` top gradient bar. Used on Auth, Settings, Upload, and Help cards.
  - *Note:* `#view-upload .upload-card.dm-surface` overrides `overflow: visible` so office autocomplete dropdowns never clip.
- **`.modal-overlay` + `.modal-card`**: Frosted backdrop (`backdrop-filter: blur(4px)`), spring entrance (`translateY(-18px) scale(0.96)` → `0, 1`), `24px` radius, `4px` gradient top bar.
- **`.modal-card.edit-modal-card`**: `max-width: 440px`, `overflow: visible` (for inline office autocomplete), paired with staggered `.edit-modal-field` entrance animations. Add `.delete-modal-card` for red-to-amber top bar styling.

### 5.2 Headers, Icon Badges & Close Buttons
- **`.dm-header` / `.dm-header-left`**: Left-aligned flex header for cards and modals.
- **`.dm-icon-badge`**: `42px` squircle (`border-radius: 14px`) with subtle indigo-amber tint. Add `.danger` for red-amber danger tint.
- **`.dm-close-btn`**: `34px` circular close button (`rotate(90deg)` on hover, `scale(0.9)` on press).
- *(Edit/Quick-Add/Quick-Delete modals also use equivalent `.edit-modal-header`, `.edit-modal-icon` / `.delete-modal-icon`, and `.edit-modal-close-btn` classes.)*

### 5.3 Button System
| Class | Use Case |
| :--- | :--- |
| `.dm-btn.dm-btn-primary` | Primary CTA with shifting brand gradient & sweeping sheen (`Sign In`, `Submit`, `Save`, `Sync`, `Approve`) |
| `.dm-btn.dm-btn-danger` | High-impact destructive CTA (`Confirm Delete`) |
| `.dm-btn.dm-btn-secondary` | Cancel, Passkey sign-in, neutral secondary actions |
| `.dm-btn.dm-btn-danger-soft` | Tinted red actions (`Clear App Cache`, `Reject`, `Delete Request`) |
| `.dm-btn-sm` / `.dm-btn-full` | Compact `38px` height modifier / `width: 100%` modifier |
| `.btn-save-profile` / `.btn-delete-profile` | Full-width `54px`/`50px` animated gradient buttons used in Profile Edit, Inline Edit, Quick-Add, and Quick-Delete modals |

**3-State Async Feedback (`js/02-utils.js`):**
Call `setButtonState(btn, "loading" | "success" | "idle", label)` to automatically transition `.dm-btn` buttons through spinner → animated SVG checkmark (`.checkmark-path`) → original HTML restoration.

### 5.4 Interactive Inputs & Autocomplete
- **`.profile-input-wrapper`**: Icon-prefixed inputs (`padding-left: 44px`, `border-radius: 14px`) used in Auth, Profile Edit, Inline Edit, and Quick-Delete filter.
- **`.autocomplete-wrapper` + `.autocomplete-dropdown.show`**: Pops in with `dropdownPopIn` (`--dm-ease-spring`), rounded `18px` container, `30px` `.ac-item-icon` badge, and `.ac-item-pin` pill. Always keep parent rows/fields elevated via `:focus-within { z-index: 50 }`.

### 5.5 Semantic Frosted-Glass Toasts (`js/02-utils.js`)
`showToast(message, type)` auto-detects semantic type from message keywords/emojis (or accepts explicit `"success"`, `"error"`, `"warning"`, `"info"`) and applies `.toast-success` (emerald), `.toast-error` (red), `.toast-warning` (amber), or `.toast-info` (indigo) with `blur(18px)` and haptic vibration (`50ms`, or `[40, 40, 40]` for errors).

### 5.6 Sliding Segmented Controls
- **Auth Tabs (`.auth-segmented-tabs` + `.auth-tab-slider`):** Toggles `.is-signup` to slide the pill indicator smoothly across `Sign In | Sign Up`.
- **Search View Switch (`.view-mode-switch` + `.view-mode-slider`):** Toggles `.is-table` to slide across `List | Table`.

---

## 6. View-Specific Visual Signatures

- **Search View (`#view-search`)**
  - Fixed top ambient radial glow (`#view-search::before`).
  - Result cards feature a `4px` left brand gradient strip, indigo Office badges (`.badge-primary`), amber PIN badges, and a staggered 8-card cascade (`dmCardCascade`).
  - Active filters light up `#advanced-filter-toggle-btn` with `.filter-pulse-dot` + `.filter-count-badge` and render removable `.active-filter-pill` chips.
  - Idle AI button twinkles gently (`aiSparkleTwinkle`); active AI or Voice listening pulses red via `ripple`.
- **Directory View (`#view-directory`)**
  - `.directory-card` (`border-radius: 20px`) with compact `32px` `.dir-quick-add-btn` (indigo) and `.dir-quick-delete-btn` (red) header icons.
  - BO/SO/HO addresses highlight as `.clickable-office-chip` (`📮`) and expose an `i` Staff Info button inside the frosted-glass `.directory-floating-bar` popover (shared with Search results).
  - Quick-Delete uses tap-to-toggle `.delete-select-chip.selected` chips with red check circles.
- **Approvals View (`#view-approvals`)**
  - `.approval-card` with `3px` top bar (`.is-delete` turns red-orange), `.approval-meta-box`, shimmer `.approval-skeleton-card`, and dual-ring `.approvals-spinner`.
- **Auth View (`#auth-view`)**
  - Ambient floating `.auth-orb-1` / `.auth-orb-2` background glows, floating `.auth-logo-badge`, spring card entrance (`authCardIn`), and staggered `.input-group` reveals.
- **Full-Screen Media Studios (Profile)**
  - **Cropper (`#crop-modal-overlay`, `z-index: 3500`):** Pure black canvas, circular `.crop-cutout` mask with rule-of-thirds grid visible only while `.is-interacting`, pinch-to-zoom, 90° rotate button, and `.crop-save-pill`.
  - **Lightbox (`#avatar-lightbox-overlay`, `z-index: 3400`):** Swipe-down-to-dismiss with dynamic backdrop fade, pinch/double-tap zoom, tap-to-hide chrome (`.ui-hidden`), and frosted floating `.lightbox-action-dock`.

---

## 7. Motion Choreography & Accessibility

| Interaction | Keyframe / Property | Easing | Duration |
| :--- | :--- | :--- | :---: |
| Modal open/close | `translateY(-18px) scale(0.96)` → `0, 1` | `--dm-ease-spring` | `0.36s` |
| Staggered fields | `editFieldSlideIn` (`40ms`, `90ms`, `140ms`) | `--dm-ease-smooth` | `0.32s` |
| Search card cascade (first 8) | `dmCardCascade` (`20ms`–`230ms` stagger) | `--dm-ease-smooth` | `0.34s` |
| Popover & buttons | `scale(0.84)` + `popoverBtnPop` (`20ms`–`140ms`) | `--dm-ease-spring` | `0.32s` / `0.26s` |
| Autocomplete dropdown | `dropdownPopIn` | `--dm-ease-spring` | `0.24s` |
| Collapsible hero | `grid-template-rows: 1fr` → `0fr` | `cubic-bezier(0.25, 0.1, 0.25, 1)` | `0.90s` |
| Button sheen sweep | `btnShine` | `ease-in-out` | `4.0s` loop |
| Checkmark draw | `drawCheck` | `cubic-bezier(0.4, 0, 0.2, 1)` | `0.40s` |
| Record updated glow | `recordUpdatedPulse` (`.record-updated-flash`) | `ease-out` | `1.10s` |
| Splash exit | `opacity: 0` + `scale(1.04)` | `--dm-ease-smooth` | `0.34s` |

**Reduced Motion Safety Net (`css/02-components.css`):**
`@media (prefers-reduced-motion: reduce)` forces `animation-duration` and `transition-duration` to `0.01ms` globally.

---

## 8. Mobile, Safe-Area, Keyboard & Scroll-Lock Rules

1. **Bottom Nav Clearance:** `.results-container-scroll` adds `calc(84px + env(safe-area-inset-bottom, 0px))` bottom padding and scrollable views (`#view-upload`, `#view-profile`, `#view-settings`) add `96px + safe-area` so content never hides behind `.bottom-nav`.
2. **Keyboard Open (`body.keyboard-open`):**
   - Hides `.bottom-nav` (`translate(-50%, 140%)`), removes bottom-nav padding, repositions `.toast` above `--kb-fixed-offset`, pins open modals inside `--vvh`, and adds `150px` bottom padding inside `#edit-record-modal-overlay` only while `.autocomplete-dropdown.show` is open.
3. **Overlay Scroll Lock (`.dm-scroll-locked`):**
   - Applied automatically to `<html>` and `<body>` whenever any `.modal-overlay.show` or `.sidebar.open` is active, blocking background scrolling while allowing internal modal lists and `#crop-stage` / `#lightbox-stage` gestures.

---

## 9. Rules for AI Assistants Editing UI/Styles

1. **Use Existing Tokens & Classes First:** Prefer `--dm-*` tokens, `.dm-surface`, `.dm-header`, `.dm-icon-badge` (use `.danger`, not `.is-danger`), `.dm-close-btn`, and `.dm-btn*` rather than inventing one-off inline styles.
2. **Never Break Autocomplete Stacking:** Any card or modal hosting an `.autocomplete-dropdown` must keep `overflow: visible` and elevate focused field wrappers to `z-index: 50`.
3. **Test Both Themes:** Whenever adding tinted backgrounds or borders, provide a `[data-theme="dark"]` override tuned for `#090e17` / `#111827` OLED contrast.
4. **Update `sw.js` Cache Version:** After editing any file in `css/`, bump `CACHE_NAME` in `sw.js` so installed PWAs fetch the updated stylesheet cleanly.
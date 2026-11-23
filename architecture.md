# DakMitra — Architecture & AI Context Guide

> **Purpose of this document:** Provide any AI coding assistant or developer with a complete, accurate mental model of the **DakMitra** PWA so edits can be made safely without breaking global dependencies, CSS cascade order, offline caching, or user/admin workflows.

---

## 1. Project Overview

**DakMitra** is an offline-first Progressive Web App (PWA) built for India Post staff (primarily Mirzapur & Sonbhadra divisions, PIN `231xxx`) to search, manage, and crowd-verify postal routing records (`Address`, `Office`, `Pin`) and post office staff contacts (`BO`, `SO`, `HO`).

- **Architecture Style:** Pure Vanilla HTML5, CSS3, and JavaScript (no bundler, no build step, no ES module imports). Deploys directly to static hosting (e.g., GitHub Pages).
- **Execution Model:** Ordered `<script defer src="js/...">` files sharing the global `window` scope so inline HTML handlers (`onclick="..."`, `oninput="..."`) work seamlessly.
- **Offline-First:** Boots synchronously in `0ms` from `localStorage` caches, hydrates Supabase + Realtime in the background, and uses a custom Service Worker (`sw.js`) for full offline availability.

### External Dependencies (CDN)

| Library                   | Loading Strategy                                            | Role                                                            |
| :------------------------ | :---------------------------------------------------------- | :-------------------------------------------------------------- |
| `@supabase/supabase-js@2` | `<script defer>` + dynamic fallback (`ensureSupabaseReady`) | Auth, PostgreSQL CRUD, RPCs, Realtime, Edge Functions, Passkeys |
| `fuse.js`                 | `<script defer>` + dynamic fallback (`ensureSupabaseReady`) | Fast client-side fuzzy & strict numeric search                  |
| `xlsx` (SheetJS)          | Lazy-loaded on demand via `ensureXLSXLoaded()`              | Excel bulk upload, sample template, full DB `.xlsx` export      |
| Google Fonts (`Inter`)    | Non-blocking `media="print" onload="this.media='all'"`      | UI typography                                                   |

---

## 2. Directory & File Structure

```text
dakmitra/
├── index.html                  # App shell, views, modals, 2 inline 0ms boot scripts
├── manifest.json               # PWA manifest
├── sw.js                       # Service Worker (precache + stale-while-revalidate)
├── icon-192.png                # PWA icon (192x192)
├── icon-512.png                # PWA icon (512x512)
├── ARCHITECTURE.md             # This file
├── css/
│   ├── 01-base-layout.css      # Design tokens, dark theme, reset, app bar, sidebar, bottom nav, scroll-lock, base keyboard rules
│   ├── 02-components.css       # Unified .dm-* design system, modals, semantic toasts, badges, autocomplete, skeletons, splash
│   └── 03-views.css            # View-specific styles (Search, AI, Directory, Staff, Approvals, Upload/Bulk, Auth, Profile, Cropper, Lightbox)
└── js/
    ├── 01-config.js            # Version, Supabase config/init, storage keys, SVG icons, shared state
    ├── 02-utils.js             # Escaping, storage, Lie-Fi network check, toasts, button states, alert/confirm modals
    ├── 03-ui-shell.js          # Splash, theme, PWA/SW, Android back nav, keyboard & scroll-lock, sidebar, swipe, collapsible hero, Enter nav
    ├── 04-data-sync.js         # Post office fetch/cache, PIN suffix index, directory grouping, Realtime sync, offline-to-online hydration
    ├── 05-auth-profile.js      # Sign in/up, device binding, Passkeys, Profile UI/editor, pinch-to-zoom Cropper & Lightbox
    ├── 06-search-ai.js         # Fuse search, active filter pills, history, voice/TTS, online AI routing fallback, copy/CSV
    ├── 07-directory-staff.js   # Directory infinite scroll & filtering, floating action bar, Office Staff (BO/SO/HO) CRUD, Quick-Add/Delete modals
    ├── 08-records-upload.js    # Inline Edit modal, Delete, Record History audit modal, Manual/Bulk upload, Office autocompletes, Excel upload
    ├── 09-approvals-favs.js    # Saved Favorites & Community Approvals (Pending/Resolved tabs, infinite scroll, voting)
    └── 10-settings-boot.js     # Settings preferences, Admin UI toggle, full Excel export, 0ms instant boot & session sync
```

---

## 3. Critical Load Order & Invariants

### A. Inline Pre-Paint Scripts in `index.html` (DO NOT EXTERNALIZE)

Two small inline `<script>` blocks remain inside `index.html` on purpose:

1. **`<head>` Theme & System Bar Sync:** Reads `localStorage["app-theme"]`, sets `data-theme`, `colorScheme`, `backgroundColor`, and `<meta name="theme-color">` _before first paint_ to eliminate white flashes and Android notch color mismatch.
2. **Frame-0 Splash Vertical Lock:** Locks `#splash-content` vertical position in pixels using `visualViewport.height` to prevent layout jumps on Android full-screen/3-button nav bars, then enables `.theme-transitions-ready` after 2 animation frames.

### B. CSS Cascade Order

Stylesheets **must** load in exact numerical order:

1. `css/01-base-layout.css` — Base variables (`:root`, `[data-theme="dark"]`), layout shell, `.dm-scroll-locked`, base `body.keyboard-open`.
2. `css/02-components.css` — Shared UI primitives (`.dm-surface`, `.dm-btn`, `.modal-card`, `.toast`, `.autocomplete-dropdown`, skeletons, splash).
3. `css/03-views.css` — View-specific styling, ambient accents, cropper/lightbox studios, and `body.keyboard-open` view height overrides.

### C. JavaScript Load Order

Scripts **must** load with `defer` in exact numerical order (`01` through `10`). `10-settings-boot.js` executes `bootAppInstantly()` synchronously at the bottom once all prior modules are defined.

---

## 4. Detailed Module Map

### `js/01-config.js` — Configuration & Global State

- **Version:** `APP_VERSION`, `APP_BUILD_CODE`.
- **Supabase:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `supabaseClient`, `initSupabaseClient()`, `ensureSupabaseReady()`, `loadScriptDynamically()`.
- **Constants:** `HISTORY_KEY`, `FAV_KEY`, `ICON_STAR_FILLED`, `ICON_STAR_OUTLINE`, `DIRECTORY_PAGE_SIZE (3)`, `APPROVALS_PAGE_SIZE (5)`, `viewOrder`.
- **Shared State:** `currentMode`, `isCurrentUserAdmin`, `currentUserId`, `cachedPostOffices`, `currentFilteredData`, `fuse`, `viewMode`, `directoryGroupedData`, `directoryFilteredData`, `directoryCurrentPage`, `approvalsCache`, `invalidateApprovalsCache()`.

### `js/02-utils.js` — Core Utilities & Dialogs

- **Security & Storage:** `escapeHTML()`, `escapeForOnclick()`, `getSafeStorage()`.
- **Network ("Lie-Fi" Detector):** `checkActualInternet()` (1.5s timeout probe to `clients3.google.com/generate_204`), `showOfflineToast()`, `ensureOnline()`.
- **Feedback UI:** `showToast(message, type)` (auto-detects `success`, `error`, `warning`, `info`), `setButtonState(btn, state, label)`.
- **Dialogs:** `showCustomConfirm()`, `closeConfirmModal()`, `showCustomAlert()`, `closeAlertModal()`, and overrides native `window.alert`.
- **Helpers:** `ensureXLSXLoaded()`, `getFavoriteBtnStyles()`, `scheduleCloseDropdowns()`, `cancelCloseDropdowns()`, `closeAllDropdowns()`.

### `js/03-ui-shell.js` — App Shell, Navigation & Native-Feel UX

- **Splash & Updates:** `showSplashScreen()`, `hideSplashScreen()`, `initAppVersion()`, `checkForAppUpdate()`.
- **Theme:** `applyTheme()`, `toggleTheme()`.
- **PWA:** Registers `./sw.js` (`updateViaCache: "none"`), auto-reloads on controller change, handles `beforeinstallprompt` for `#install-app-btn`.
- **Navigation:** `toggleSidebar()`, `closeSidebar()`, `switchDashboardView(viewId)`.
- **IIFE Controllers:**
  - `initPwaBackNavigation()` — Intercepts browser/Android Back button (`popstate`) to close modals -> popovers -> sidebar -> return to Search -> exit guard.
  - `initGlobalKeyboardHandler()` — Tracks `visualViewport`, sets CSS vars (`--vvh`, `--vv-top`, `--kb-height`, `--kb-fixed-offset`), toggles `body.keyboard-open`, keeps focused inputs visible.
  - `initGlobalOverlayScrollLock()` — Observes `.modal-overlay.show` & `.sidebar.open`, locks background scroll (`.dm-scroll-locked`) while permitting internal scroll and cropper/lightbox gestures.
  - `createCollapsibleHero()` — Smooth grid-row collapse on scroll for Search (`searchHeroController`), Approvals (`approvalsHeroController`), and Directory (`directoryHeroController`).
  - `initSwipeNavigation()` — Horizontal swipe switching across `viewOrder`.
  - `initSidebarDragOpen()` — Right-drag gesture on `#top-profile-btn` to open sidebar.
  - `initSmartEnterNavigation()` — Enter key moves to next visible input inside forms/modals, or triggers search/blurs on final input; dynamically sets `enterkeyhint`.

### `js/04-data-sync.js` — Data Store, Indexing & Realtime Sync

- **Fetching:** `fetchAllPostOffices(forceSync)` loads instant `dakmitra_offline_db` cache first, then runs `fetchFromServerBackground()` (paginated in 1,000-row batches, filters `is_deleted = false`).
- **Smart 3-Digit PIN Suffix Engine:** `buildPinSuffixIndex()` maps the last 3 digits of 6-digit PINs to their Office. `parseSmartSearchQuery()` parses shorthand queries like `"hallia 211"`, `"hallia@211"`, or `"211 hallia"` into a strict office filter + clean query.
- **Local Cache Store:** `persistPostOfficeCache()`, `upsertLocalPostOffice()`, `removeLocalPostOffice()`, `syncFavoritesWithCache()`, debounced `scheduleLocalUiRefresh()`, `refreshSearchInPlace()`, `refreshDirectoryInPlace()`.
- **Directory Grouping:** `buildDirectoryGroupedData()` builds sorted office buckets with precomputed lowercase `searchString`.
- **Live Sync & Reconnect:** `initRealtimeSync()` / `teardownRealtimeSync()` subscribes to `post_offices` and `edit_requests`. `hydrateOnlineState()` handles offline-to-online transitions with retry backoff, token refresh, admin re-check, and Realtime reconnection.

### `js/05-auth-profile.js` — Auth, Passkeys, Profile & Media Studios

- **Auth:** `switchTab()`, `handleAuth()` (sign in/up + single-device binding via `dakmitra_device_id` stored in `profiles.device_id`), `checkEmailVerificationRedirect()`, `signOutApp()`.
- **Passkeys:** `registerDevicePasskey()`, `signInWithDevice()`.
- **Profile:** `renderUserProfileUI()`, `saveProfileDetails()`, `updateAvatarInDatabase()`, `removeProfilePic()`.
- **Photo Cropper (`#crop-modal-overlay`):** Full-screen pinch-to-zoom, pan, double-tap zoom, mouse-wheel zoom, 90-degree rotation (`rotateCropImage()`), and 800x800 JPEG canvas export (`renderCropToCanvas()`, `applyCropAndUpload()`).
- **Photo Lightbox (`#avatar-lightbox-overlay`):** Full-screen viewer with swipe-down to dismiss, pinch-to-zoom, double-tap zoom, single-tap UI toggle, and bottom dock actions.

### `js/06-search-ai.js` — Search, Voice & AI Postal Fallback

- **Search Engine:** `triggerSearch()` combines smart 3-digit PIN suffix filtering, Fuse.js (strict `threshold: 0.0` for pure numeric queries, fuzzy `threshold: 0.3` for text), and secondary must-have `filter-office` / `filter-pin` filters.
- **UI:** `setViewMode('list'|'table')`, `updateActiveFilterIndicators()` (active filter pills), `highlightText()`, infinite scroll (`setupSearchObserver()`, 10 items per batch).
- **History:** `loadSearchHistory()`, `saveSearchTerm()` (max 5 items), `applyHistorySearch()`.
- **Voice & TTS:** `startVoiceSearch()` (`en-IN` SpeechRecognition) + spoken readout of top match with `convertToHindiWords()` for last 3 PIN digits and spaced postal acronyms (`B O`, `S O`, `H O`).
- **AI Fallback Lookup:** Auto-triggers on zero local matches (`scheduleAutoAiSearch`) or manually via `forceAiSearch()` / `triggerInlineAiBelowResults()`. Enriches prompt with live `api.postalpincode.in` hints (`fetchVillageGeoContext`) + local DB division context (`buildDivisionOfficeDirectoryContext`), invokes Supabase Edge Function `ai-postal-search`, caches in `aiMemoryCache`, and lets staff 1-tap `prefillUploadFromAi()`.
- **Export:** `copyResults()`, `exportCSV()`.

### `js/07-directory-staff.js` — Directory, Floating Bar & Office Staff CRUD

- **Directory:** `renderDirectory()`, `renderDirectoryBatch()` (3 offices per page via `IntersectionObserver`), `filterDirectory()`, `goToDirectoryOffice()`.
- **Floating Action Popover (`#directory-floating-bar`):** Shared by both Directory chips and Search items (`openDirectoryChipActions`, `closeAllDirectoryActionTrays`). Shows Info (for BO/SO/HO), History, Favorite, Edit, and Delete buttons anchored dynamically to the clicked element.
- **Office Staff Details (`BO`, `SO`, `HO`):** `detectOfficeType()`, `showOfficeDetailsModal()`, `renderOfficeStaffViewMode()`, `openOfficeStaffEditor()`, `saveOfficeStaffDetails()`. Saves **directly** to `post_offices` (bypasses approval queue). Supports:
  - `BO`: `bpm_name`, `bpm_contact`, `abpm_name`, `abpm_contact`
  - `SO`: `spm_name`, `spm_contact`, `pa_list` (JSONB array), `mts_list` (JSONB array)
  - `HO`: `pm_name`, `pm_contact`, `pa_list` (JSONB array), `mts_list` (JSONB array)
- **Quick Modals:**
  - `quickAddForOffice()` / `submitQuickAddModal()` — Add multiple comma/newline-separated addresses directly into a Directory office with duplicate warnings.
  - `quickDeleteForOffice()` / `executeQuickDeleteModal()` — Filterable chip-selection modal to bulk-delete multiple addresses from a Directory office.

### `js/08-records-upload.js` — CRUD Modals, History, Manual/Bulk & Excel Upload

- **In-Place Edit:** `updateRecord()`, `saveInlineEditRecord()`, `highlightUpdatedRecord()`.
- **Delete:** `deleteRecord()` (confirm dialog -> Admin instant RPC or Standard User `edit_requests`).
- **Record History:** `viewHistory(postOfficeId)` fetches `post_offices_history` joined with `profiles` and checks `admins`, renders diff timeline, and caches HTML per record in `localStorage`.
- **Manual Upload:** `getManualEntryRowHTML()`, `addInputRow()`, `submitMultipleRecords()`.
- **Bulk Same-Office Upload:** `switchManualUploadTab()`, `parseBulkAddresses()`, `updateBulkAddressPreview()`, `submitBulkSameOffice()`.
- **Unified Office Autocomplete:** `buildOfficeOptionHTML()`, `pickOfficeOption()`, `getOfficePinMap()`, wired across Inline Edit, Manual Rows, Bulk Same-Office, and Search Options Filter (`handleSearchOfficeFilterInput`).
- **Excel:** `uploadExcel()` (Admin only, inserts directly to `post_offices` with `upload_method: "excel_bulk"`), `downloadSampleExcel()`.

### `js/09-approvals-favs.js` — Approvals & Favorites

- **Favorites:** `toggleFavorite()`, `renderFavorites()`.
- **Approvals:** `switchApprovalTab('pending'|'resolved')`, `loadApprovalsBatch()` (5 items per batch, skeleton loaders, memory + `localStorage` offline cache).
- **Actions:** `approveRequest()` (RPC `submit_approval`, 5 community votes or 1 admin vote merges change), `rejectRequest()` (Admin only, RPC `reject_request`), `deleteOwnRequest()` (withdraws user's own `PENDING` request).

### `js/10-settings-boot.js` — Settings, Admin UI, Full Export & Bootstrap

- **Settings:** `saveDefaultView()`, `saveExportMode()`, `applyExportMode()`, `clearAppCache()`, `syncDatabase()`.
- **Admin:** `checkIfAdmin(userId)`, `applyAdminUI()` (toggles `#admin-excel-upload`).
- **Full Export:** `exportFullTableToExcel(includeDeleted)` exports all rows (active + deleted) to `.xlsx`, falling back to cached DB when offline.
- **Boot Sequence:** `bootAppInstantly()` runs immediately on script parse using `getInstantLocalSession()` + `dakmitra_offline_db`. On `DOMContentLoaded`, `initSupabaseClient()`, `checkEmailVerificationRedirect()`, and `checkUserSession()` execute background verification and sync.

---

## 5. Backend Contract (Supabase)

### Database Tables

| Table                  | Purpose & Key Columns                                                                                                                                                                                               |
| :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `post_offices`         | Master directory (`id`, `Address`, `Office`, `Pin`, `is_deleted`, `user_id`, `last_modified_by`, `last_approved_by`, `upload_method`, plus staff columns `bpm_*`, `abpm_*`, `spm_*`, `pm_*`, `pa_list`, `mts_list`) |
| `post_offices_history` | Audit log (`post_office_id`, `action` [`INSERT`/`UPDATE`/`DELETE`], `old_data`, `new_data`, `changed_by`, `approved_by`, `changed_at`)                                                                              |
| `edit_requests`        | Community queue (`id`, `post_office_id`, `action_type` [`ADD`/`EDIT`/`DELETE`], `original_data`, `proposed_data`, `status` [`PENDING`/`APPROVED`/`REJECTED`], `requested_by`, `last_approved_by`, `created_at`)     |
| `request_approvals`    | Votes per request (`edit_request_id`, `approved_by`, `is_admin`)                                                                                                                                                    |
| `profiles`             | User profile & device lock (`id`, `name`, `employee_id`, `mobile`, `designation`, `avatar_url`, `device_id`)                                                                                                        |
| `admins`               | Admin allowlist (`id` matching `auth.users.id`)                                                                                                                                                                     |

### RPC Functions & Edge Functions

- **RPC `admin_direct_submit({ request_payloads })`:** Executes an array of `ADD`/`EDIT`/`DELETE` payloads immediately for Admins without entering the pending queue.
- **RPC `submit_approval({ req_id })`:** Records a vote; returns `"APPROVED"` when threshold (5 community votes or Admin vote) is met and merges changes.
- **RPC `reject_request({ req_id })`:** Admin-only rejection of a pending request.
- **Edge Function `ai-postal-search`:** Accepts `{ prompt }`, returns `{ text }` containing a JSON array of 1–2 postal routing estimates.

---

## 6. LocalStorage Inventory

| Key                                              | Format                              | Role                                                          |
| :----------------------------------------------- | :---------------------------------- | :------------------------------------------------------------ |
| `app-theme`                                      | `"light"` \| `"dark"` \| `"system"` | Theme preference (read pre-paint in `index.html`)             |
| `dakmitra_app_version`                           | String (e.g. `"1.0.1"`)             | Detects version upgrades & triggers SW update                 |
| `dakmitra_device_id`                             | String (`dev_...`)                  | Single-device login binding                                   |
| `dakmitra_cached_profile`                        | JSON Object                         | Cached user profile + `email` + `is_admin` for 0ms boot       |
| `dakmitra_offline_db`                            | JSON Array                          | Full active `post_offices` table snapshot                     |
| `dakmitra_favorites`                             | JSON Array                          | Saved favorite records (`{ id, address, office, pin }`)       |
| `dakmitra_search_history`                        | JSON Array (max 5)                  | Recent search terms                                           |
| `dakmitra_default_view`                          | `"list"` \| `"table"`               | Default Search layout                                         |
| `dakmitra_export_mode`                           | `"show"` \| `"hide"`                | Visibility of Copy/CSV toolbar buttons                        |
| `dakmitra_approvals_cache_pending` / `_resolved` | HTML String                         | First page (5 cards) cached for offline Approvals view        |
| `dakmitra_history_<id>`                          | HTML String                         | Cached audit timeline per record                              |
| `sb-*-auth-token`                                | JSON (Supabase managed)             | Read synchronously by `getInstantLocalSession()` for 0ms boot |

---

## 7. Rules & Conventions for AI Assistants Making Edits

1. **Maintain Global Scope:** Do **not** add `type="module"` or `import`/`export` syntax unless refactoring the entire app and every inline `onclick="..."` handler in `index.html` and template strings.
2. **Preserve Script & CSS Ordering:** Never place calls to functions from later files at top-level parse time in earlier files. Keep DOM-mutating initialization inside functions or `DOMContentLoaded` when cross-file.
3. **Always Sanitize Dynamic HTML:**
   - Use `escapeHTML(val)` for all interpolated HTML text and attribute values.
   - Use `escapeForOnclick(val)` for any string injected inside single-quoted inline JS handlers.
4. **Guard All Network Mutations:** Call `if (!(await ensureOnline("..."))) return;` at the start of any write, sync, or approval function.
5. **Keep Caches Synchronized:**
   - After mutating `edit_requests` or executing `admin_direct_submit`, always call `invalidateApprovalsCache()`.
   - For instant UI updates on `post_offices`, use `upsertLocalPostOffice()` or `removeLocalPostOffice()` (which automatically persist cache, sync Favorites, and refresh Search & Directory in place).
6. **Respect Admin vs. Standard User Permissions:**
   - Admins bypass approvals via `admin_direct_submit` and have access to Excel upload and Reject buttons.
   - Standard users insert into `edit_requests` (`PENDING`).
   - _Exception:_ Office Staff Details (`BO`/`SO`/`HO`) update `post_offices` directly for all authenticated users.
7. **Service Worker Cache Busting:** Whenever modifying files in `css/`, `js/`, or `index.html` for deployment:
   - Add any newly created file paths to `LOCAL_ASSETS` in `sw.js`.
   - Bump `CACHE_NAME` in `sw.js` (currently `"po-directory-v13"`).
   - Optionally bump `APP_VERSION` / `APP_BUILD_CODE` in `js/01-config.js`.

# DakMitra — Architecture & AI Context Guide (v1.0.7)

> **Purpose of this document:** Provide any AI coding assistant or developer with a complete, accurate mental model of the **DakMitra** PWA so edits can be made safely without breaking global dependencies, CSS cascade order, offline caching, role permissions, or user/admin/superadmin workflows.

---

## 1. Project Overview

**DakMitra** is an offline-first Progressive Web App (PWA) built for India Post staff (primarily Mirzapur & Sonbhadra divisions, PIN `231xxx`) to search, manage, crowd-verify, and study postal routing records (`Address`, `Office`, `Pin`, `priority`) and post office staff contacts (`BO`, `SO`, `HO`, and parent delivery offices).

- **Architecture Style:** Pure Vanilla HTML5, CSS3, and JavaScript (no bundler, no build step, no ES module imports). Deploys directly to static hosting (GitHub Pages via `.github/workflows/static.yml`).
- **Execution Model:** Ordered `<script defer src="js/...">` files sharing the global `window` scope so inline HTML handlers (`onclick="..."`, `oninput="..."`) work seamlessly.
- **Offline-First:** Boots synchronously in `0ms` from `localStorage` caches, hydrates Supabase + Realtime in the background, and uses a custom Service Worker (`sw.js`) for full offline availability (including cached public Storage avatars).

### External Dependencies (CDN)

| Library                   | Loading Strategy                                                 | Role                                                                     |
| :------------------------ | :--------------------------------------------------------------- | :----------------------------------------------------------------------- |
| `@supabase/supabase-js@2` | `<script defer>` + deduplicated fallback (`ensureSupabaseReady`) | Auth, PostgreSQL CRUD, RPCs, Realtime, Storage, Edge Functions, Passkeys |
| `fuse.js`                 | `<script defer>` + background fallback (`ensureSupabaseReady`)   | Cached client-side fuzzy & strict numeric search                         |
| `xlsx` (SheetJS)          | Lazy-loaded on demand via `ensureXLSXLoaded()`                   | Chunked Excel bulk upload, sample template, full DB `.xlsx` export       |
| Google Fonts (`Inter`)    | Non-blocking `media="print" onload="this.media='all'"`           | UI typography                                                            |

---

## 2. Directory & File Structure

```text
dakmitra/
├── index.html                  # App shell, all views & modals, 2 inline 0ms pre-paint scripts
├── manifest.json               # PWA manifest (v1.0.7)
├── sw.js                       # Service Worker (po-directory-v46: precache + SWR + public avatars)
├── icon-192.png                # PWA icon (192x192)
├── icon-512.png                # PWA icon (512x512)
├── architecture.md             # This file
├── dakmitra_design.md          # Unified design tokens, z-index map & animation guide
├── PROJECT_MAP.md              # Quick-reference map of files, modules & backend objects
├── Edge Functions/
│   ├── ai-postal-search.ts     # Authenticated Gemini AI postal routing estimation
│   └── superadmin-auth-ops.ts  # Superadmin auth ops (approve/verify, password reset, safe delete)
├── css/
│   ├── 01-base-layout.css      # Design tokens, OLED dark theme, reset, app bar, sidebar, bottom nav, scroll-lock
│   ├── 02-components.css       # Unified .dm-* primitives, modals, semantic toasts, badges, autocomplete, skeletons, splash
│   ├── 03-views.css            # Search, AI, Delivery Office cards, Directory, Staff, Priority, Employees, Approvals, Upload, Feedback, Profile, Auth, Cropper & Lightbox
│   ├── 04-learn.css            # Learn & Quiz (3-way tabs, mastery ring, 3D flashcards, quiz modes, analytics, leaderboard)
│   └── 05-superadmin.css       # Superadmin Console, scrollable tab bar, announcement banner, user cards & DB explorer
└── js/
    ├── 01-config.js            # Version (1.0.7 / #103), Supabase/Fuse deduplicated loaders, live appConfig, shared state
    ├── 02-utils.js             # Escaping, Lie-Fi probe, ensureOnline(), toasts, button states, dialogs, phonetic key, priority & bulk preview helpers
    ├── 03-ui-shell.js          # Splash, theme, SW updates, Android back nav (with Maintenance lock guard), keyboard & scroll-lock, collapsible heroes, swipe & Enter nav
    ├── 04-data-sync.js         # Post office & office_staff caches, cached Fuse instances, PIN suffix index, Realtime sync, offline-to-online hydration
    ├── 05-auth-profile.js      # Sign in/up, strict device_id enforcement, Passkeys, Storage avatars (512x512), Cropper, Lightbox, Employees Directory & User Profile modal
    ├── 06-search-ai.js         # Shared phonetic + fuzzy search engine, Delivery Office cards, filter pills, history, voice/TTS, AI fallback, copy/CSV
    ├── 07-directory-staff.js   # Directory full search & category chips, floating bar, BO/SO/HO & parent office staff CRUD, 1-tap Priority, Quick-Add/Delete/Priority modals
    ├── 08-records-upload.js    # Inline Edit modal, Delete, Record History audit modal, Manual/Bulk upload, unified Office autocomplete, chunked Excel upload
    ├── 09-approvals-favs.js    # Saved Favorites & server-side searchable/filterable Community Approvals (Pending/Resolved, voting, deep-linking)
    ├── 11-feedback.js          # Report & Suggest Hub (bugs, features, upvotes, compressed screenshots, diagnostics, admin triage)
    ├── 12-learn-quiz.js        # Leitner spaced-repetition flashcards with Smart Mix traps, 3-mode Quiz engine, Mastery analytics, cloud sync & Division Leaderboard
    ├── 13-superadmin.js        # Superadmin Console (access/export controls, diffed CMS, user approvals/roles, paginated DB explorer, audit logs)
    └── 10-settings-boot.js     # LOADED LAST: Settings, live CMS UI enforcement, cache clear, admin/superadmin checks, full Excel export, 0ms boot & session sync
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
3. `css/03-views.css` — View-specific styling, ambient accents, Priority badges, Employees, Approvals, Feedback, Cropper/Lightbox studios, and view-level `body.keyboard-open` overrides.
4. `css/04-learn.css` — Learn & Quiz module styles and keyboard rules.
5. `css/05-superadmin.css` — Superadmin Console, announcement banner, scrollable tab bar, and DB table styles.

### C. JavaScript Load Order

Scripts load with `defer` in dependency order: `01` → `09` → `11` → `12` → `13` → **`10-settings-boot.js` (last)**. `10-settings-boot.js` runs `bootAppInstantly()` synchronously at the bottom once every feature module is defined.

---

## 4. Detailed Module Map

### `js/01-config.js` — Configuration, Live CMS Flags & Global State

- **Version:** `APP_VERSION` (`"1.0.7"`), `APP_BUILD_CODE` (`"103"`).
- **Supabase & SDK Loaders:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `supabaseClient`, `initSupabaseClient()`, deduplicated `ensureSupabaseReady()` (loads Supabase SDK on demand and loads Fuse.js in background without blocking writes).
- **Live App Config (`appConfig`):** Loaded from `dakmitra_app_config` cache and synced with `app_settings`. Exposes `canExportCSV()`, `canCopyResults()`, `canExportExcel()`, and `getCommunityVoteThreshold()`.
- **Shared State:** `currentMode`, `isCurrentUserAdmin`, `isCurrentUserSuperadmin`, `currentUserId`, `cachedPostOffices`, `currentFilteredData`, `cachedOfficeStaff`, `officeStaffByKeyMap`, `fuse`, `viewMode`, `directoryGroupedData`, `directoryFilteredData`, `approvalsCache` (`createEmptyApprovalsCacheEntry()`, `invalidateApprovalsCache()`).

### `js/02-utils.js` — Core Utilities, Phonetic Engine & Shared UI Helpers

- **Security & Storage:** `escapeHTML()`, `escapeForOnclick()` (escapes quotes, backslashes, and newlines/line separators), `getSafeStorage()`.
- **Network & Guards:** `checkActualInternet()` (probes `clients3.google.com/generate_204` with `SUPABASE_URL` fallback), `isNetworkError()`, `showOfflineToast()`, `ensureOnline()` (blocks offline actions and awaits `ensureSupabaseReady()`).
- **Feedback & Dialogs:** `showToast(message, type)`, `setButtonState(btn, state, label)`, `showCustomConfirm()`, `showCustomAlert()`, and `window.alert` override.
- **Postal Logic:** `postalPhoneticKey()` (1:1 port of PostgreSQL `public.postal_phonetic_key`), `detectOfficeType()`, `isSelfParentOfficeRow()`, `stripPostalSuffixes()`, `getEffectivePriority()`.
- **Shared Bulk Helpers:** `parseDelimitedAddresses()`, `renderBulkAddressPreview()` (shared by Directory Quick-Add and Upload Bulk Same-Office).

### `js/03-ui-shell.js` — App Shell, Navigation & Native-Feel UX

- **Splash, Theme & PWA:** `showSplashScreen()`, `hideSplashScreen()`, `initAppVersion()`, `checkForAppUpdate()` (inspects `reg.installing` / `reg.waiting`), `applyTheme()`, `toggleTheme()`, SW registration (`./sw.js`), and `beforeinstallprompt`.
- **Navigation:** `toggleSidebar()`, `closeSidebar()`, `switchDashboardView(viewId)`.
- **IIFE Controllers:**
  - `initPwaBackNavigation()` — Intercepts Android/browser Back (`popstate`) to close modals → popovers → sidebar → Learn quiz/sub-tab → previous view → root exit guard. Explicitly excludes `#maintenance-overlay` and skips stale modal entries closed via Cancel/✕.
  - `initGlobalKeyboardHandler()` — Tracks `visualViewport`, sets `--vvh`, `--vv-top`, `--kb-height`, `--kb-fixed-offset`, toggles `body.keyboard-open`, keeps focused inputs visible.
  - `initGlobalOverlayScrollLock()` — Locks background scroll (`.dm-scroll-locked`) while overlays are open, permitting internal vertical/horizontal scrolling and Cropper/Lightbox gestures.
  - `createCollapsibleHero()` — Smooth grid-row collapse on scroll for Search, Approvals, Directory, Members, and Feedback.
  - `initSwipeNavigation()`, `initSidebarDragOpen()`, `initSmartEnterNavigation()`.

### `js/04-data-sync.js` — Data Store, Indexing & Realtime Sync

- **Parent Office Staff (`office_staff`):** `normalizeOfficeKey()`, `getOfficeStaffByName()`, `loadOfficeStaffFromCache()`, `fetchOfficeStaffBackground()`, `upsertLocalOfficeStaff()`, `removeLocalOfficeStaff()`.
- **Post Offices (`post_offices`):** `fetchAllPostOffices(forceSync)` loads instant `dakmitra_offline_db` cache first, then runs paginated `fetchFromServerBackground()` (protected against overwriting local cache with `[]` if session is missing).
- **Search Indexes:** `buildPinSuffixIndex()`, `parseSmartSearchQuery()`, cached `Fuse` pool (`getCachedFuseInstance()`, `clearFuseCache()`), and precomputed metadata (`searchIndexMap`, `compareByPriorityOnly()`).
- **Local Store & Directory Grouping:** `upsertLocalPostOffice()`, `removeLocalPostOffice()`, `syncFavoritesWithCache()`, debounced `scheduleLocalUiRefresh()`, `buildDirectoryGroupedData()`.
- **Realtime & Reconnect:** `initRealtimeSync()` subscribes to `post_offices`, `office_staff`, `edit_requests`, `request_approvals`, `feedback_items`, `feedback_votes`, `app_settings`, `admins`, and `profiles` (immediately logs out blocked/suspended or device-reset users). `hydrateOnlineState()` handles offline-to-online recovery with retry backoff.

### `js/05-auth-profile.js` — Auth, Device Lock, Storage Avatars & Employees

- **Auth & Strict Device Binding:** `handleAuth()` (sign in/up + approval gating + `device_id` binding), `signInWithDevice()` (WebAuthn Passkey with full approval & `device_id` enforcement), `enforceAndBindDeviceOnSignIn()`, `getDeviceLockMismatchReason()` (Superadmins exempt), `clearSessionCachesAndState()`, `forceLogoutBlockedUser()`, `signOutApp()`.
- **Profile & Storage Avatars:** `renderUserProfileUI()`, `saveProfileDetails()` (includes `show_mobile` privacy toggle), `updateAvatarInDatabase()`, `cleanupOldStorageAvatars()`, `removeProfilePic()`. Uploads `512×512` JPEGs (`0.85` quality) to the public Supabase Storage `avatars` bucket under `<uid>/avatar_<ts>.jpg` and deletes previous files after DB commit.
- **Media Studios:** Pinch-to-zoom Cropper (`#crop-modal-overlay`) with live dual preview dock (Profile Card square + Round icon) and `URL.revokeObjectURL()` cleanup; Swipe-down Lightbox (`#avatar-lightbox-overlay`) supporting both avatars and uncropped `.is-screenshot` feedback attachments.
- **Employees Directory & Public Profiles:** `renderMembersDirectory()` (`get_members_directory` RPC), designation filter chips, `renderUserProfileLink()`, and read-only `openUserProfileModal()` (`get_user_public_profile` RPC with clickable Approved Edits / Votes Cast stats).

### `js/06-search-ai.js` — Search, Delivery Office Cards, Voice & AI Fallback

- **Shared Search Engine:** `runPostalSearchEngine()` powers both Search and Directory, combining smart 3-digit PIN suffix detection, cached `Fuse.js` (with non-Fuse fallback), `postalPhoneticKey` matching, and two-pool priority ranking.
- **UI & Delivery Office Cards:** `findMatchingDeliveryOfficesForSearch()` pins matching HO/SO cards with quick `👥 Staff` and `📂 Directory` actions. Supports `List | Table` switch, active filter pills, 1-tap Priority toggle, infinite scroll, and history (`HISTORY_KEY`).
- **Voice & TTS:** Reusable `toggleVoiceInput()`, `startVoiceSearch()` (`en-IN`), and Indian-accent TTS with `convertToHindiWords()`.
- **AI Fallback:** `scheduleAutoAiSearch()`, `forceAiSearch()`, `triggerInlineAiBelowResults()`, `fetchVillageGeoContext()`, `buildDivisionOfficeDirectoryContext()`, `ai-postal-search` Edge Function, and `prefillUploadFromAi()`.
- **Export:** `copyResults()` and `exportCSV()` (gated by `canCopyResults()` / `canExportCSV()`, revokes Blob URLs).

### `js/07-directory-staff.js` — Directory, Floating Bar, Staff CRUD & Quick Modals

- **Directory:** Full search + Search Options + Voice + universal category chips (`All`, `📮 Offices`, `⚡ Priority`, `Regular`), infinite scroll (`renderDirectoryBatch()`), `goToDirectoryOffice()`, and `renderDirectoryLink()`.
- **Floating Action Popover (`#directory-floating-bar`):** Shared by Directory chips and Search items, dynamically clamped below `.app-bar` with horizontal scroll overflow protection.
- **Office Staff CRUD (`BO`, `SO`, `HO` + Parent Delivery Offices):** `showParentOfficeDetailsModal()` (upserts `office_staff`), `showOfficeDetailsModal()` (updates `post_offices` via `update_post_office_staff_details` RPC).
- **Priority & Bulk Modals:** 1-tap optimistic `toggleRecordPriority()` (`update_address_priorities` RPC), `quickAddForOffice()`, `quickDeleteForOffice()` (with category filters & red selected chips tray), and `quickPriorityForOffice()`.

### `js/08-records-upload.js` — CRUD Modals, History, Manual/Bulk & Excel Upload

- **Edit / Delete / History:** `updateRecord()` / `saveInlineEditRecord()`, `deleteRecord()`, `viewHistory()` (fetches `post_offices_history` + `get_public_profiles_by_ids` RPC, caches HTML per record).
- **Manual & Bulk Upload:** `getManualEntryRowHTML()`, `submitMultipleRecords()`, `switchManualUploadTab()`, `submitBulkSameOffice()` (reuses `parseDelimitedAddresses()` / `renderBulkAddressPreview()`).
- **Unified Office Autocomplete:** Single parameterized `renderOfficeAutocomplete()` + `pickOfficeOption()` (touch-safe `onpointerdown` + `onclick`) wired across Inline Edit, Manual Rows, Bulk Same-Office, Search Filter, Directory Filter, and Approvals Filter.
- **Admin Excel Upload:** `uploadExcel()` trims/validates rows, skips blank or self-parent rows, and inserts in 500-row chunks; `downloadSampleExcel()`.

### `js/09-approvals-favs.js` — Favorites & Server-Side Approvals

- **Favorites:** `toggleFavorite()`, `renderFavorites()`.
- **Approvals:** Powered by `search_edit_requests` RPC with full-text/phonetic search, multi-select change-type chips, user + role autocomplete, date presets/range, office/PIN filters, vote progress, approval source, sort order, infinite scroll, and `openApprovalsForUser()` deep linking.
- **Actions:** `approveRequest()` (`submit_approval` RPC), `rejectRequest()` (`reject_request` RPC), `deleteOwnRequest()`.

### `js/11-feedback.js` — Report & Suggest Hub

- **Community Board:** Powered by `search_feedback_items` RPC, infinite scroll, type/status/mine filters, sort cycling, optimistic `toggleFeedbackVote()` (`toggle_feedback_vote`), and `refreshFeedbackOpenCount()` sidebar badge.
- **Submission Form:** Bug vs. Feature switch, impact severity, draft auto-save (`dakmitra_feedback_draft`), client-side screenshot compression (`compressFeedbackImage()` → `feedback-attachments` bucket with signed URLs), optional device diagnostics, and Admin triage modal (`admin_update_feedback` RPC).

### `js/12-learn-quiz.js` — Spaced-Repetition Learn, Quiz & Mastery

- **Flashcards:** 5-box Leitner spaced repetition, 2-tier Office + Category scope, Smart Mix (~25% geographic/phonetic neighbor traps), touch/mouse swipe physics, keyboard shortcuts, and delta-safe re-rating.
- **3-Mode Quiz Engine:** Standard Sort (Haversine geographic + PIN-proximity distractors), PIN Sniper (last 3 digits), and Spot Intruder (with flipped trap rounds), plus rapid-fire timer, hard mode, and auto-advance.
- **Mastery & Sync:** Office-wise progress bars, Weak Spots drill, background merge sync (`user_learning_progress`), and opt-in Division Leaderboard (`get_learning_leaderboard` RPC).

### `js/13-superadmin.js` — Superadmin Console

- **Controls & CMS:** Live toggles (`require_user_approval`, `export_csv_enabled`, `export_excel_enabled`, `community_vote_threshold`) and diffed CMS updates (`app_title`, `app_tagline`, `announcement_banner`, `maintenance_mode`).
- **Users:** `superadmin_get_users`, approve & verify email (`superadmin-auth-ops`), reject/suspend, promote/demote Admin, reset device lock, reset password, and safe account deletion.
- **Visual Database Explorer:** `superadmin_get_schema_overview`, `superadmin_query_table`, diffed row updates/inserts/deletes (`superadmin_mutate_row`), and full paginated CSV/JSON export.
- **Audit Log:** `superadmin_get_audit_logs`.

### `js/10-settings-boot.js` — Settings, Live CMS Enforcement & 0ms Boot (Loaded Last)

- **Settings:** Default view, export button preference, `clearAppCache()` (wipes all caches + re-syncs offline DB if online), `syncDatabase()`, `exportFullTableToExcel()`.
- **Role & CMS Enforcement:** `checkIfSuperadmin()`, `checkIfAdmin()`, `applyAdminUI()`, `applyAppConfigUI()`, `fetchAndApplyAppConfig()`.
- **Boot Sequence:** `bootAppInstantly()` renders immediately from `getInstantLocalSession()` + `dakmitra_offline_db`. On `DOMContentLoaded`, `checkUserSession()` verifies session, approval status, `device_id` lock, roles, live CMS config, and starts Realtime sync.

---

## 5. Backend Contract (Supabase)

### Database Tables

| Table                    | Purpose & Key Columns                                                                                                                                                                                     |
| :----------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `post_offices`           | Master directory (`id`, `Address`, `Office`, `Pin`, `priority`, `is_deleted`, `user_id`, `last_modified_by`, `last_approved_by`, `upload_method`, BO/SO/HO staff)                                         |
| `post_offices_history`   | Audit log (`post_office_id`, `action` [`INSERT`/`UPDATE`/`DELETE`], `old_data`, `new_data`, `changed_by`, `approved_by`, `changed_at`)                                                                    |
| `office_staff`           | Parent Delivery Office (`HO`/`SO`) staff directory (`id`, `office_name`, `office_key`, `office_type`, `pm_*`, `spm_*`, `pa_list`, `mts_list`)                                                             |
| `edit_requests`          | Community queue (`id`, `post_office_id`, `action_type`, `original_data`, `proposed_data`, `status`, `requested_by`, `last_approved_by`, `created_at`)                                                     |
| `request_approvals`      | Votes per request (`edit_request_id`, `approved_by`, `is_admin`)                                                                                                                                          |
| `profiles`               | User profile, privacy, approval & device lock (`id`, `name`, `employee_id`, `mobile`, `designation`, `avatar_url`, `show_mobile`, `device_id`, `approval_status`, `status_note`)                          |
| `admins`                 | Admin allowlist (`id`, `email`)                                                                                                                                                                           |
| `superadmins`            | Superadmin allowlist (`id`)                                                                                                                                                                               |
| `app_settings`           | Key-value live CMS & access controls (`key`, `value`)                                                                                                                                                     |
| `feedback_items`         | Bug reports & feature ideas (`id`, `user_id`, `type`, `category`, `severity`, `title`, `description`, `status`, `attachment_path`, `device_meta`, `admin_response`, `reviewed_by`, `resolved_in_version`) |
| `feedback_votes`         | Upvotes / "Me Too" votes (`feedback_id`, `user_id`)                                                                                                                                                       |
| `user_learning_progress` | Cloud-synced Leitner card state & leaderboard aggregates (`user_id`, `progress_json`, `mastered_count`, `streak_days`, `accuracy_pct`, `xp`, `leaderboard_opt_in`)                                        |
| `superadmin_audit_logs`  | Immutable Superadmin action trail (`actor_id`, `action`, `target_table`, `target_id`, `old_data`, `new_data`, `created_at`)                                                                               |

### Storage Buckets

- **`avatars` (Public, 2 MB limit, JPG/PNG/WebP):** Stores user profile photos at `<user_id>/avatar_<timestamp>.jpg`. RLS restricts write/update/delete to `auth.uid()`'s own folder. Cached offline by `sw.js`.
- **`feedback-attachments` (Private):** Stores compressed feedback screenshots at `<user_id>/<timestamp>_<rand>.<ext>`, loaded via 1-hour signed URLs.

### RPC Functions & Edge Functions

- **Postal & Staff RPCs:** `admin_direct_submit`, `submit_approval`, `reject_request`, `search_edit_requests`, `update_post_office_staff_details`, `update_address_priorities`, `is_approved_user`.
- **Profile & Employees RPCs:** `get_public_profiles_by_ids`, `get_members_directory`, `get_user_public_profile`.
- **Feedback & Learn RPCs:** `get_feedback_open_count`, `search_feedback_items`, `toggle_feedback_vote`, `delete_feedback_item`, `admin_update_feedback`, `get_learning_leaderboard`.
- **Superadmin RPCs:** `superadmin_update_setting`, `superadmin_get_users`, `superadmin_set_admin_status`, `superadmin_reset_device_lock`, `superadmin_set_user_approval`, `superadmin_get_schema_overview`, `superadmin_query_table`, `superadmin_mutate_row`, `superadmin_get_audit_logs`.
- **Edge Function `ai-postal-search`:** Authenticated Gemini AI lookup returning JSON postal routing estimates.
- **Edge Function `superadmin-auth-ops`:** Service-role auth ops (`approve_and_verify`, `verify_email`, `reset_password`, `delete_user` with FK detachment and Storage cleanup).

---

## 6. LocalStorage Inventory

| Key                                              | Format                              | Role                                                          |
| :----------------------------------------------- | :---------------------------------- | :------------------------------------------------------------ |
| `app-theme`                                      | `"light"` \| `"dark"` \| `"system"` | Theme preference (read pre-paint in `index.html`)             |
| `dakmitra_app_version`                           | String (e.g. `"1.0.7"`)             | Detects version upgrades & triggers SW update                 |
| `dakmitra_app_config`                            | JSON Object                         | Cached `app_settings` CMS & export flags                      |
| `dakmitra_device_id`                             | String (`dev_...`)                  | Single-device login binding                                   |
| `dakmitra_cached_profile`                        | JSON Object                         | Cached user profile + `email` + `is_admin` + `is_superadmin`  |
| `dakmitra_offline_db`                            | JSON Array                          | Full active `post_offices` snapshot                           |
| `dakmitra_offline_office_staff`                  | JSON Array                          | Cached `office_staff` parent delivery office contacts         |
| `dakmitra_favorites`                             | JSON Array                          | Personal bookmarks saved on this device                       |
| `dakmitra_search_history`                        | JSON Array (max 5)                  | Recent search terms (shared by Search & Directory)            |
| `dakmitra_default_view`                          | `"list"` \| `"table"`               | Default Search layout                                         |
| `dakmitra_export_mode`                           | `"show"` \| `"hide"`                | Visibility of Copy/CSV toolbar buttons                        |
| `dakmitra_approvals_cache_pending` / `_resolved` | HTML String                         | First page cached for offline Approvals (cleared on sign-out) |
| `dakmitra_history_<id>`                          | HTML String                         | Cached audit timeline per record                              |
| `dakmitra_members_cache`                         | JSON Array                          | Cached Employees Directory snapshot                           |
| `dakmitra_feedback_cache` / `_draft`             | HTML String / JSON                  | Offline Feedback board snapshot & form auto-save draft        |
| `dakmitra_learning_progress_<uid>`               | JSON Object                         | User-scoped Leitner cards, streak, daily goal & XP            |
| `dakmitra_learning_leaderboard_cache`            | JSON Object                         | Cached Division Leaderboard rows + timestamp                  |
| `dakmitra_learn_smart_mix`                       | `"true"` \| `"false"`               | Smart Mix neighbor-trap preference                            |
| `sb-*-auth-token`                                | JSON (Supabase managed)             | Read synchronously by `getInstantLocalSession()` for 0ms boot |

---

## 7. Rules & Conventions for AI Assistants Making Edits

1. **Maintain Global Scope:** Do **not** add `type="module"` or `import`/`export` syntax unless refactoring the entire app and every inline `onclick="..."` handler.
2. **Preserve Script & CSS Ordering:** Keep `css/01`–`05` in order and keep `js/10-settings-boot.js` loaded **last** in `index.html`.
3. **Always Sanitize Dynamic HTML:**
   - Use `escapeHTML(val)` for all interpolated HTML text and attribute values.
   - Use `escapeForOnclick(val)` for any string injected inside single-quoted inline JS handlers.
4. **Guard All Network Mutations:** Call `if (!(await ensureOnline("..."))) return;` at the start of any write, sync, or approval function (`ensureOnline()` also guarantees `ensureSupabaseReady()`).
5. **Keep Caches Synchronized & Clean on Sign-Out:**
   - After mutating `edit_requests` or executing `admin_direct_submit`, call `invalidateApprovalsCache()`.
   - For instant UI updates on `post_offices`, use `upsertLocalPostOffice()` or `removeLocalPostOffice()`.
   - Any new user-specific cache added to `localStorage` or memory must be cleared inside `clearSessionCachesAndState()` in `js/05-auth-profile.js` and `clearAppCache()` in `js/10-settings-boot.js`.
6. **Respect Role Permissions (Staff vs. Admin vs. Superadmin):**
   - Standard staff submit `ADD`/`EDIT`/`DELETE` into `edit_requests`; Admins apply immediately via `admin_direct_submit` and can reject requests, triage feedback, and bulk-upload Excel.
   - _Exceptions:_ Office Staff Details (`BO`/`SO`/`HO` & parent `office_staff`) and 1-tap/Bulk Priority updates apply directly for all authenticated staff.
   - Superadmins bypass Maintenance Mode, export restrictions, and `device_id` lock, and control `app_settings`, user approvals/roles, and the visual DB explorer.
7. **Service Worker Cache Busting:** Whenever modifying files in `css/`, `js/`, or `index.html` for deployment:
   - Add any newly created file paths to `LOCAL_ASSETS` in `sw.js`.
   - Bump `CACHE_NAME` in `sw.js` (currently `"po-directory-v46"`).
   - Optionally bump `APP_VERSION` / `APP_BUILD_CODE` in `js/01-config.js` and `manifest.json`.

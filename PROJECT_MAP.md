# DakMitra — Project Map (v1.0.7)

Offline-first, mobile-first Postal Directory PWA (Vanilla HTML/CSS/JS + Supabase + Fuse.js + SheetJS).

## Root Files

- `index.html` — App shell, all views, modals, deferred SDKs, and modular CSS/JS imports.
- `manifest.json` — PWA metadata, icons, and standalone display config.
- `sw.js` — Service Worker (`po-directory-v46`: cache-first shell + stale-while-revalidate static assets & public Storage avatars).
- `architecture.md` — Full architecture, module contracts, and localStorage inventory.
- `dakmitra_design.md` — Design tokens, component specs, z-index map, and animation rules.

## Stylesheets (`css/` — Loaded in Exact Order)

- `css/01-base-layout.css` — Theme variables (Light & OLED Dark), reset, app bar, sidebar, bottom nav, scroll lock, keyboard-open & reduced-motion rules.
- `css/02-components.css` — Reusable primitives (`.dm-surface`, `.dm-btn`, forms, autocomplete dropdowns, badges, toasts, modals, skeletons, splash screen).
- `css/03-views.css` — View layouts (Search, AI cards, Delivery Office cards, Directory, Staff modal, Priority system, Employees Directory, Approvals, Upload/Bulk, Feedback Hub, Profile, Auth, Cropper, Lightbox).
- `css/04-learn.css` — Learn & Quiz styles (3D flip flashcards, swipe physics, 3 quiz modes, mastery analytics, division leaderboard).
- `css/05-superadmin.css` — Superadmin Console, CMS controls, announcement banner, user cards, and visual database explorer.

## Scripts (`js/` — Loaded in Exact Order)

- `js/01-config.js` — `APP_VERSION` (`1.0.7`), Supabase/Fuse deduplicated loaders, live `appConfig` flags, storage keys, and shared global state.
- `js/02-utils.js` — Lazy SheetJS (`XLSX`) loader, HTML/onclick escaping, connectivity probe, frosted toasts, `setButtonState()`, dialogs, `postalPhoneticKey()`, priority helpers, and shared bulk address parser/preview.
- `js/03-ui-shell.js` — Splash screen, theme sync, SW update check, sidebar/view switching, Android back-button stack (with Maintenance lock guard), keyboard manager, scroll lock, collapsible heroes, swipe & Enter navigation.
- `js/04-data-sync.js` — Offline DB (`dakmitra_offline_db`) & parent office staff (`office_staff`) caches, cached `Fuse` instances, 3-digit PIN suffix index, Supabase Realtime sync, and offline-to-online hydration.
- `js/05-auth-profile.js` — Sign in/up, strict `device_id` enforcement (Password, Passkey & live reset), Supabase Storage `avatars` upload/cleanup, pinch-to-zoom cropper (`512×512`), photo lightbox, Employees Directory, and public user profile modal.
- `js/06-search-ai.js` — Shared phonetic + fuzzy search engine, Delivery Office cards, active filter pills, history, voice search & Indian-accent TTS, online AI fallback, copy/CSV export.
- `js/07-directory-staff.js` — Office-grouped directory with full search & category filters, floating action popover, BO/SO/HO + parent `office_staff` CRUD modal, 1-tap Priority toggle, Quick-Add, Quick-Delete & Bulk Priority modals.
- `js/08-records-upload.js` — In-place edit modal, single delete, audit history modal, manual rows & bulk same-office upload, unified office autocomplete, chunked admin Excel upload.
- `js/09-approvals-favs.js` — Saved favorites and server-side searchable/filterable community approvals (`search_edit_requests` RPC, Pending/Resolved tabs, voting, admin approve/reject).
- `js/11-feedback.js` — Report & Suggest Feedback Hub (bugs, feature ideas, upvotes, compressed screenshot attachments, admin triage & official responses).
- `js/12-learn-quiz.js` — Offline-first Leitner spaced-repetition flashcards with Smart Mix neighbor traps, 3-mode Quiz engine (Standard Sort, PIN Sniper, Spot Intruder), Mastery analytics, background cloud sync, and opt-in Division Leaderboard.
- `js/13-superadmin.js` — Superadmin Console (access/export toggles, live CMS, user approvals/roles/device reset, paginated visual DB explorer with diffed edits & full exports, audit logs).
- `js/10-settings-boot.js` — Loaded last: Settings/preferences, live `app_settings` CMS application, cache clear, manual sync, admin/superadmin checks, full Excel export, 0ms instant boot & session sync.

## Supabase Backend, Storage & Edge Functions

- **Tables:** `post_offices`, `post_offices_history`, `office_staff`, `edit_requests`, `request_approvals`, `profiles`, `admins`, `superadmins`, `app_settings`, `feedback_items`, `feedback_votes`, `user_learning_progress`, `superadmin_audit_logs`
- **Storage Buckets:** `avatars` (public, user-scoped `<uid>/`), `feedback-attachments` (private, signed URLs)
- **Edge Functions:**
  - `Edge Functions/ai-postal-search.ts` — Gemini AI-estimated SO/HO routing for Mirzapur & Sonbhadra.
  - `Edge Functions/superadmin-auth-ops.ts` — Superadmin auth operations (approve & verify email, password reset, safe user deletion preserving postal records).

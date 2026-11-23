# DakMitra — Project Map

Offline-first, mobile-first Postal Directory PWA (Vanilla HTML/CSS/JS + Supabase + Fuse.js + SheetJS).

## Root Files
- `index.html` — App shell, all views, modals, deferred SDKs, and modular CSS/JS imports.
- `manifest.json` — PWA metadata, icons, and standalone display config.
- `sw.js` — Service Worker (cache-first shell + stale-while-revalidate static assets).
- `dakmitra_unified_design_system_animation_guide.md` — Design tokens, component specs, and animation rules.

## Stylesheets (`css/`)
- `css/01-base-layout.css` — Theme variables (Light & OLED Dark), reset, app bar, sidebar, bottom nav, scroll lock, keyboard-open & reduced-motion rules.
- `css/02-components.css` — Reusable primitives (`.dm-surface`, `.dm-btn`, forms, autocomplete dropdowns, badges, toasts, modals, skeletons, splash screen).
- `css/03-views.css` — View-specific layouts (Search, AI cards, Directory, Staff modal, Approvals, Upload/Bulk, Profile, Auth, Cropper, Lightbox).

## Scripts (`js/` — Loaded in Exact Order)
- `js/01-config.js` — `APP_VERSION`, Supabase client init, storage keys, and shared global state.
- `js/02-utils.js` — Lazy SheetJS (`XLSX`) loader, HTML/onclick escaping, lie-fi network detector, frosted toasts, `setButtonState()`, confirm/alert dialogs.
- `js/03-ui-shell.js` — Splash screen, theme sync, PWA updates, sidebar/view switching, Android back-button stack, keyboard manager, scroll lock, collapsible heroes, swipe & Enter navigation.
- `js/04-data-sync.js` — Offline DB cache (`dakmitra_offline_db`), background fetch, 3-digit PIN suffix index, Fuse.js setup, Supabase Realtime sync, offline-to-online hydration.
- `js/05-auth-profile.js` — Sign in/up, device ID lock, WebAuthn Passkeys, profile editing, pinch-to-zoom avatar cropper, swipe-down photo lightbox.
- `js/06-search-ai.js` — Fuzzy search, active filter pills, search history, voice search & Indian-accent TTS, online AI fallback, copy/CSV export.
- `js/07-directory-staff.js` — Office-grouped directory, floating action popover, BO/SO/HO staff CRUD modal, quick-add & quick-delete modals.
- `js/08-records-upload.js` — In-place edit modal, single delete, audit history modal, manual rows & bulk same-office upload, office autocomplete, admin Excel upload.
- `js/09-approvals-favs.js` — Saved favorites, community approval queue (Pending/Resolved), voting, admin approve/reject, withdraw own request.
- `js/10-settings-boot.js` — Settings/preferences, cache clear, manual sync, admin role check, full Excel export, 0ms instant boot & session sync.

## Supabase Backend & Edge Functions
- **Tables:** `post_offices`, `post_offices_history`, `edit_requests`, `request_approvals`, `profiles`, `admins`
- **RPCs:** `admin_direct_submit`, `submit_approval`, `reject_request`
- **Edge Function (`supabase/functions/ai-postal-search/`):** Receives postal routing prompts from `06-search-ai.js` and returns Gemini AI-estimated SO/HO routing JSON for Mirzapur & Sonbhadra.
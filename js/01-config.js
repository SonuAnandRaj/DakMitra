// =========================================================
// 01-CONFIG.JS — Version, Supabase Client, Constants & State
// =========================================================

// --- CENTRAL APP VERSION CONTROL ---
const APP_VERSION = "1.0.1"; // <-- Change ONLY this when releasing a new version
const APP_BUILD_CODE = "100"; // <-- Increment for each build (e.g., 101, 102)

// --- SPLASH TIMING ---
const SPLASH_START_TIME = performance.now();
const SPLASH_MIN_DURATION_MS = 280; // Prevents harsh 1-frame flicker on fast cache loads

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = "https://nvviolzdujgwkmnrnaww.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_vwlbAzFCF0zMMqeiPWyu7Q_ruSZ1WwM";
let supabaseClient = null;

function initSupabaseClient() {
  if (!supabaseClient && window.supabase) {
    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        auth: {
          experimental: { passkey: true },
        },
      },
    );
  }
  return supabaseClient;
}

function loadScriptDynamically(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function ensureSupabaseReady() {
  if (!window.supabase) {
    await loadScriptDynamically(
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    );
  }
  if (!window.Fuse) {
    await loadScriptDynamically(
      "https://cdn.jsdelivr.net/npm/fuse.js/dist/fuse.js",
    );
  }
  return initSupabaseClient();
}

// --- STORAGE KEYS & ICONS ---
const HISTORY_KEY = "dakmitra_search_history";
const FAV_KEY = "dakmitra_favorites";

const ICON_STAR_FILLED = `<svg height="18px" viewBox="0 0 24 24" width="18px" fill="#f59e0b"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
const ICON_STAR_OUTLINE = `<svg height="18px" viewBox="0 0 24 24" width="18px" fill="currentColor"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"/></svg>`;

// --- SHARED APPLICATION STATE ---
let currentMode = "signin";
let isCurrentUserAdmin = false;
let currentUserId = null;

let cachedPostOffices = [];
let currentFilteredData = [];
let fuse = null;
let viewMode = "list";

// Navigation order for swipe gestures
const viewOrder = ["settings", "directory", "search", "approvals", "upload"];

// Directory state
let directoryGroupedData = [];
let directoryFilteredData = [];
let directoryCurrentPage = 0;
const DIRECTORY_PAGE_SIZE = 3;
let directoryObserver = null;

// Approvals state & in-memory cache
const APPROVALS_PAGE_SIZE = 5;
let currentApprovalTab = "pending";
let approvalsObserver = null;
let isApprovalsLoading = false;

let approvalsCache = {
  pending: {
    html: "",
    page: 0,
    hasMore: true,
    initialHasMore: true,
    loaded: false,
  },
  resolved: {
    html: "",
    page: 0,
    hasMore: true,
    initialHasMore: true,
    loaded: false,
  },
};

function invalidateApprovalsCache() {
  approvalsCache.pending = {
    html: "",
    page: 0,
    hasMore: true,
    initialHasMore: true,
    loaded: false,
  };
  approvalsCache.resolved = {
    html: "",
    page: 0,
    hasMore: true,
    initialHasMore: true,
    loaded: false,
  };
}

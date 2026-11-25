// =========================================================
// 01-CONFIG.JS — Version, Supabase Client, Constants & State
// =========================================================

// --- CENTRAL APP VERSION CONTROL ---
const APP_VERSION = "1.0.7"; // <-- Change ONLY this when releasing a new version
const APP_BUILD_CODE = "103"; // <-- Increment for each build (e.g., 101, 102)

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
      }
    );
  }
  return supabaseClient;
}

let _supabaseSdkPromise = null;
let _fuseSdkPromise = null;

function loadScriptDynamically(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing && existing.dataset.loaded === "1") {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => {
      s.dataset.loaded = "1";
      resolve();
    };
    s.onerror = () => {
      s.remove();
      reject(new Error("Failed to load script: " + src));
    };
    document.head.appendChild(s);
  });
}

async function ensureSupabaseReady() {
  if (!window.supabase) {
    if (!_supabaseSdkPromise) {
      _supabaseSdkPromise = loadScriptDynamically(
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
      ).catch((err) => {
        _supabaseSdkPromise = null;
        throw err;
      });
    }
    await _supabaseSdkPromise;
  }

  // Load Fuse.js in background so a CDN hiccup never blocks Supabase DB writes
  if (!window.Fuse && !_fuseSdkPromise) {
    _fuseSdkPromise = loadScriptDynamically(
      "https://cdn.jsdelivr.net/npm/fuse.js/dist/fuse.js"
    )
      .then(() => {
        if (typeof clearFuseCache === "function") clearFuseCache();
      })
      .catch(() => {
        _fuseSdkPromise = null;
      });
  }

  return initSupabaseClient();
}

// --- STORAGE KEYS & ICONS ---
const HISTORY_KEY = "dakmitra_search_history";
const FAV_KEY = "dakmitra_favorites";
const OFFICE_STAFF_CACHE_KEY = "dakmitra_offline_office_staff";

const ICON_STAR_FILLED = `<svg height="18px" viewBox="0 0 24 24" width="18px" fill="#f59e0b"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
const ICON_STAR_OUTLINE = `<svg height="18px" viewBox="0 0 24 24" width="18px" fill="currentColor"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"/></svg>`;

// --- SHARED APPLICATION STATE ---
const APP_CONFIG_CACHE_KEY = "dakmitra_app_config";
const DEFAULT_APP_CONFIG = {
  require_user_approval: false,
  export_csv_enabled: true,
  export_excel_enabled: true,
  app_title: "DakMitra",
  app_tagline: "The Modern Postal Database",
  announcement_banner: { enabled: false, text: "", type: "info" },
  maintenance_mode: {
    enabled: false,
    message: "DakMitra is undergoing maintenance. Please check back shortly.",
  },
  community_vote_threshold: 5,
};

let appConfig = { ...DEFAULT_APP_CONFIG };
try {
  const savedCfg = JSON.parse(localStorage.getItem(APP_CONFIG_CACHE_KEY));
  if (savedCfg && typeof savedCfg === "object") {
    appConfig = {
      ...DEFAULT_APP_CONFIG,
      ...savedCfg,
      announcement_banner: {
        ...DEFAULT_APP_CONFIG.announcement_banner,
        ...(savedCfg.announcement_banner || {}),
      },
      maintenance_mode: {
        ...DEFAULT_APP_CONFIG.maintenance_mode,
        ...(savedCfg.maintenance_mode || {}),
      },
    };
  }
} catch (_) {}

function isConfigFlagEnabled(val, defaultVal = true) {
  if (val === undefined || val === null) return defaultVal;
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    if (s === "false" || s === "0" || s === "off" || s === "no") return false;
    if (s === "true" || s === "1" || s === "on" || s === "yes") return true;
  }
  return Boolean(val);
}

function canExportCSV() {
  return (
    isCurrentUserSuperadmin ||
    isConfigFlagEnabled(appConfig.export_csv_enabled, true)
  );
}

function canCopyResults() {
  return canExportCSV();
}

function canExportExcel() {
  return (
    isCurrentUserSuperadmin ||
    isConfigFlagEnabled(appConfig.export_excel_enabled, true)
  );
}

function getCommunityVoteThreshold() {
  return Math.max(1, Number(appConfig.community_vote_threshold) || 5);
}

let currentMode = "signin";
let isCurrentUserAdmin = false;
let isCurrentUserSuperadmin = false;
let currentUserId = null;

let cachedPostOffices = [];
let currentFilteredData = [];
let cachedOfficeStaff = [];
let officeStaffByKeyMap = new Map();
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

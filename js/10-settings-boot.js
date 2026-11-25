// =========================================================
// 10-SETTINGS-BOOT.JS — Settings, Admin UI, Export & App Boot
// =========================================================

// --- SETTINGS & PREFERENCES ---
function saveDefaultView(mode) {
  localStorage.setItem("dakmitra_default_view", mode);
  setViewMode(mode);
  showToast("👁️ Default view saved!");
}

function saveExportMode(mode) {
  localStorage.setItem("dakmitra_export_mode", mode);
  applyExportMode(mode);
  showToast("⚙️ Export button preference saved!");
}

function applyExportMode(mode) {
  const exportGroup = document.getElementById("export-toolbar-group");
  if (!exportGroup) return;

  const allowAnyToolbarExport = canCopyResults() || canExportCSV();
  if (!allowAnyToolbarExport) {
    exportGroup.style.display = "none";
    return;
  }
  exportGroup.style.display = mode === "hide" ? "none" : "flex";
}

function clearAppCache() {
  showCustomConfirm(
    "Clear Cache?",
    "This will reset your recent searches and cached copies. Your database records on the server are safe.",
    "Clear Cache",
    () => {
      localStorage.removeItem(HISTORY_KEY);
      localStorage.removeItem("dakmitra_default_view");
      localStorage.removeItem("dakmitra_offline_db");
      localStorage.removeItem(OFFICE_STAFF_CACHE_KEY);
      cachedOfficeStaff = [];
      officeStaffByKeyMap.clear();
      localStorage.removeItem("dakmitra_members_cache");
      localStorage.removeItem("dakmitra_feedback_cache");
      localStorage.removeItem("dakmitra_learning_leaderboard_cache");
      localStorage.removeItem("dakmitra_approvals_cache_pending");
      localStorage.removeItem("dakmitra_approvals_cache_resolved");

      // Clear per-record cached history timelines
      const historyKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("dakmitra_history_")) historyKeys.push(k);
      }
      historyKeys.forEach((k) => localStorage.removeItem(k));

      if (typeof membersDirectoryData !== "undefined") {
        membersDirectoryData = [];
        membersDirectoryLoaded = false;
      }
      if (typeof userProfileCache !== "undefined") userProfileCache.clear();
      if (typeof invalidateFeedbackCache === "function") {
        invalidateFeedbackCache();
      }

      loadSearchHistory();
      invalidateApprovalsCache();

      if (navigator.onLine) {
        showToast("🧹 Cache cleared! Refreshing offline copy...");
        fetchAllPostOffices(true);
      } else {
        showToast("🧹 Cache cleared!");
      }
    }
  );
}

async function syncDatabase() {
  if (!(await ensureOnline("Connect to internet to sync database."))) return;
  const syncBtn = document.getElementById("sync-db-btn");
  if (!syncBtn) return;

  setButtonState(syncBtn, "loading", "Syncing...");
  const [success] = await Promise.all([
    fetchAllPostOffices(true),
    fetchAndApplyAppConfig(),
  ]);

  if (success) {
    setButtonState(syncBtn, "success", "Synced");
    showToast("🔄 Database synced successfully!");
    invalidateApprovalsCache();
    setTimeout(() => setButtonState(syncBtn, "idle"), 1800);
  } else {
    setButtonState(syncBtn, "idle");
    showToast("⚠️ Sync failed. Try again later.");
  }
}

// --- ADMIN & SUPERADMIN ROLE CHECK + LIVE CMS CONFIG ---
async function checkIfSuperadmin(userId) {
  try {
    const { data } = await supabaseClient
      .from("superadmins")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    return !!data;
  } catch (err) {
    return false;
  }
}

async function checkIfAdmin(userId) {
  try {
    const { data } = await supabaseClient
      .from("admins")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    return !!data;
  } catch (err) {
    return false;
  }
}

function applyAdminUI() {
  const adminOnlyExcelCard = document.getElementById("admin-excel-upload");
  if (adminOnlyExcelCard) {
    adminOnlyExcelCard.style.display =
      isCurrentUserAdmin || isCurrentUserSuperadmin ? "block" : "none";
  }

  const superadminNav = document.getElementById("nav-superadmin");
  if (superadminNav) {
    superadminNav.classList.toggle("hidden", !isCurrentUserSuperadmin);
  }

  applyAppConfigUI();
}

function applyAppConfigUI() {
  const title = String(appConfig.app_title || "DakMitra").trim() || "DakMitra";
  const tagline =
    String(appConfig.app_tagline || "The Modern Postal Database").trim() ||
    "The Modern Postal Database";

  document.title = title;
  const appBarTitle = document.querySelector(".app-bar h1");
  const authTitle = document.querySelector("#auth-view h1");
  const splashTitle = document.querySelector(".splash-title");
  const taglineEl = document.querySelector(".auth-tagline-pill");
  if (appBarTitle) appBarTitle.textContent = title;
  if (authTitle) authTitle.textContent = title;
  if (splashTitle) splashTitle.textContent = title;
  if (taglineEl) taglineEl.textContent = tagline;

  // Enforce Copy & CSV export visibility (Superadmin always allowed)
  const copyBtn = document.querySelector(
    '#export-toolbar-group button[onclick*="copyResults"]'
  );
  if (copyBtn) {
    copyBtn.style.display = canCopyResults() ? "" : "none";
  }

  const csvBtn = document.querySelector(
    '#export-toolbar-group button[onclick*="exportCSV"]'
  );
  if (csvBtn) {
    csvBtn.style.display = canExportCSV() ? "" : "none";
  }

  const exportModeSelect = document.getElementById("export-mode-select");
  if (exportModeSelect?.parentElement) {
    exportModeSelect.parentElement.style.display =
      canCopyResults() || canExportCSV() ? "flex" : "none";
  }
  applyExportMode(localStorage.getItem("dakmitra_export_mode") || "show");

  // Enforce Full Database Excel export row visibility (Superadmin always allowed)
  const excelBtn = document.getElementById("export-excel-btn");
  if (excelBtn?.parentElement) {
    excelBtn.parentElement.style.display = canExportExcel() ? "flex" : "none";
  }

  // Global Announcement Banner
  const bannerEl = document.getElementById("global-announcement-banner");
  const bannerTextEl = document.getElementById("global-announcement-text");
  const banner = appConfig.announcement_banner || {};
  if (bannerEl && bannerTextEl) {
    const showBanner = Boolean(
      banner.enabled && String(banner.text || "").trim()
    );
    bannerEl.classList.toggle("hidden", !showBanner);
    if (showBanner) {
      bannerEl.dataset.type = banner.type || "info";
      bannerTextEl.textContent = String(banner.text).trim();
    }
  }

  // Maintenance Mode Lock (Superadmin bypasses)
  const maintOverlay = document.getElementById("maintenance-overlay");
  const maintMsg = document.getElementById("maintenance-message");
  const maint = appConfig.maintenance_mode || {};
  const isLoggedIn = !document
    .getElementById("dashboard-view")
    ?.classList.contains("hidden");
  if (maintOverlay) {
    const showMaint =
      isLoggedIn && Boolean(maint.enabled) && !isCurrentUserSuperadmin;
    maintOverlay.classList.toggle("show", showMaint);
    if (maintMsg) {
      maintMsg.textContent =
        maint.message ||
        "DakMitra is undergoing maintenance. Please check back shortly.";
    }
  }
}

async function fetchAndApplyAppConfig() {
  if (!navigator.onLine || !supabaseClient) {
    applyAppConfigUI();
    return appConfig;
  }
  try {
    const { data, error } = await supabaseClient
      .from("app_settings")
      .select("key, value");
    if (error) {
      console.warn("app_settings read error (check RLS):", error.message);
      applyAppConfigUI();
      return appConfig;
    }
    if (!Array.isArray(data) || data.length === 0) {
      console.warn("app_settings returned 0 rows (check SELECT RLS policy).");
      applyAppConfigUI();
      return appConfig;
    }

    const next = { ...DEFAULT_APP_CONFIG };
    data.forEach((row) => {
      if (row && row.key) next[row.key] = row.value;
    });
    next.announcement_banner = {
      ...DEFAULT_APP_CONFIG.announcement_banner,
      ...(next.announcement_banner || {}),
    };
    next.maintenance_mode = {
      ...DEFAULT_APP_CONFIG.maintenance_mode,
      ...(next.maintenance_mode || {}),
    };

    appConfig = next;
    try {
      localStorage.setItem(APP_CONFIG_CACHE_KEY, JSON.stringify(appConfig));
    } catch (_) {}

    applyAppConfigUI();
    if (
      isCurrentUserSuperadmin &&
      document
        .getElementById("view-superadmin")
        ?.classList.contains("active") &&
      typeof syncSuperadminControlsUI === "function"
    ) {
      syncSuperadminControlsUI();
    }
  } catch (err) {
    console.warn("App config fetch failed:", err?.message || err);
  }
  return appConfig;
}

// --- FULL DATABASE EXCEL EXPORT ---
async function exportFullTableToExcel(includeDeleted = true) {
  if (navigator.onLine && supabaseClient) {
    await fetchAndApplyAppConfig();
  }
  if (!canExportExcel()) {
    return showToast(
      "🚫 Database export is disabled by Superadmin.",
      "warning"
    );
  }
  try {
    await ensureXLSXLoaded();
  } catch (e) {
    return showOfflineToast("Excel library needs internet the first time.");
  }
  const btn = document.getElementById("export-excel-btn");
  if (!supabaseClient || !window.XLSX) {
    return showToast("⚠️ Exporter still loading. Try again in a moment.");
  }

  const exportCachedFallback = () => {
    if (!cachedPostOffices || cachedPostOffices.length === 0) {
      return showOfflineToast("No cached data available to export.");
    }
    const formattedRows = cachedPostOffices.map((row) => ({
      Address: row.Address,
      Office: row.Office,
      Pin: row.Pin ?? "",
      Priority: Number(row.priority) >= 1 ? 1 : 0,
      Status: "Active (Cached)",
    }));
    const ws = XLSX.utils.json_to_sheet(formattedRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Post Offices");
    XLSX.writeFile(wb, "DakMitra_Cached_Database.xlsx");
    return showOfflineToast("Exported cached database instead.");
  };

  if (!navigator.onLine) {
    return exportCachedFallback();
  }

  const originalText = btn ? btn.textContent : "Export";
  if (btn) {
    btn.textContent = "Exporting...";
    btn.disabled = true;
  }
  showToast("⏳ Preparing Excel export...");

  try {
    let allRows = [];
    let from = 0;
    const batchSize = 1000;

    while (true) {
      let query = supabaseClient
        .from("post_offices")
        .select("Address, Office, Pin, priority, is_deleted")
        .order("Office", { ascending: true })
        .range(from, from + batchSize - 1);

      if (!includeDeleted) {
        query = query.eq("is_deleted", false);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) break;

      allRows = allRows.concat(data);
      if (data.length < batchSize) break;
      from += batchSize;
    }

    if (allRows.length === 0) {
      showToast("No records found to export.");
      return;
    }

    const formattedRows = allRows.map((row) => ({
      Address: row.Address,
      Office: row.Office,
      Pin: row.Pin ?? "",
      Priority: Number(row.priority) >= 1 ? 1 : 0,
      Status: row.is_deleted ? "Deleted" : "Active",
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedRows);
    worksheet["!cols"] = [
      { wch: 28 },
      { wch: 22 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Post Offices");
    XLSX.writeFile(workbook, "DakMitra_Database_With_History.xlsx");

    showToast(`📥 Exported ${formattedRows.length} rows to Excel!`);
  } catch (err) {
    if (isNetworkError(err)) {
      exportCachedFallback();
    } else {
      alert("Excel export failed: " + err.message);
    }
  } finally {
    if (btn) {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }
}

// --- RESTORE SAVED DISPLAY PREFERENCES ---
(function initSavedPreferences() {
  const savedView = localStorage.getItem("dakmitra_default_view") || "list";
  const defaultViewSelect = document.getElementById("default-view-select");
  if (defaultViewSelect) defaultViewSelect.value = savedView;
  setViewMode(savedView, false);

  const savedExportMode =
    localStorage.getItem("dakmitra_export_mode") || "show";
  const exportModeSelect = document.getElementById("export-mode-select");
  if (exportModeSelect) exportModeSelect.value = savedExportMode;
  applyExportMode(savedExportMode);
})();

// --- 0ms INSTANT BOOT & SESSION SYNC ---
function getInstantLocalSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = JSON.parse(localStorage.getItem(key));
        const session = raw?.session || raw;
        if (session && session.user) return session;
      }
    }
  } catch (e) {}
  return null;
}

function bootAppInstantly() {
  const authView = document.getElementById("auth-view");
  const dashboardView = document.getElementById("dashboard-view");
  const splashScreen = document.getElementById("splash-screen");

  const localSession = getInstantLocalSession();

  if (localSession) {
    currentUserId = localSession.user.id;
    authView.classList.add("hidden");
    dashboardView.classList.remove("hidden");

    const userEmail = localSession.user.email || "user@example.com";
    let profileData = null;
    try {
      profileData = JSON.parse(localStorage.getItem("dakmitra_cached_profile"));
    } catch (e) {}

    isCurrentUserSuperadmin = Boolean(profileData?.is_superadmin);
    isCurrentUserAdmin =
      isCurrentUserSuperadmin || Boolean(profileData?.is_admin);
    applyAdminUI();

    renderUserProfileUI(profileData, userEmail);

    switchDashboardView("search");

    if (typeof loadOfficeStaffFromCache === "function") {
      loadOfficeStaffFromCache();
    }

    const cachedDataString = localStorage.getItem("dakmitra_offline_db");
    if (cachedDataString) {
      try {
        cachedPostOffices = JSON.parse(cachedDataString);
        if (typeof buildSearchIndex === "function") buildSearchIndex();
        document.getElementById("stat-addresses").textContent =
          cachedPostOffices.length;
        document.getElementById("stat-offices").textContent = new Set(
          cachedPostOffices.map((o) => o.Office)
        ).size;
        currentFilteredData = cachedPostOffices
          .map((item) => ({
            item,
            matches: [],
          }))
          .sort((a, b) => compareByPriorityOnly(a.item, b.item));
        renderResults(false);
        if (typeof updateSidebarLearnBadge === "function") {
          updateSidebarLearnBadge();
        }
      } catch (e) {}
    }
  } else {
    currentUserId = null;
    authView.classList.remove("hidden");
    dashboardView.classList.add("hidden");
  }

  loadSearchHistory();

  requestAnimationFrame(() => {
    splashScreen.classList.add("hidden-splash");
  });
}

async function checkUserSession() {
  if (!navigator.onLine) {
    wasOffline = true;
  }

  initSupabaseClient();

  if (cachedPostOffices.length > 0 && window.Fuse && !fuse) {
    initializeSearchAndRender();
  }

  let session = null;
  if (supabaseClient) {
    const { data } = await supabaseClient.auth.getSession();
    session = data?.session || getInstantLocalSession();
  } else {
    session = getInstantLocalSession();
  }

  const authView = document.getElementById("auth-view");
  const dashboardView = document.getElementById("dashboard-view");
  const splashScreen = document.getElementById("splash-screen");

  if (session) {
    currentUserId = session.user.id;
    authView.classList.add("hidden");
    dashboardView.classList.remove("hidden");
    hideSplashScreen();
    splashScreen.classList.add("hidden-splash");

    const userEmail = session.user.email || "user@example.com";

    let cachedProf = null;
    try {
      cachedProf = JSON.parse(localStorage.getItem("dakmitra_cached_profile"));
    } catch (e) {}

    if (cachedProf) {
      isCurrentUserSuperadmin = Boolean(cachedProf.is_superadmin);
      isCurrentUserAdmin =
        isCurrentUserSuperadmin || Boolean(cachedProf.is_admin);
      applyAdminUI();
      renderUserProfileUI(cachedProf, userEmail);
    } else {
      applyAppConfigUI();
    }

    if (navigator.onLine && supabaseClient) {
      fetchAndApplyAppConfig();

      Promise.all([
        Promise.resolve(checkIfSuperadmin(session.user.id)).catch(
          () => isCurrentUserSuperadmin
        ),
        Promise.resolve(checkIfAdmin(session.user.id)).catch(
          () => isCurrentUserAdmin
        ),
        Promise.resolve(
          supabaseClient
            .from("profiles")
            .select(
              "device_id, name, designation, employee_id, mobile, avatar_url, show_mobile, approval_status, status_note"
            )
            .eq("id", session.user.id)
            .single()
        ).catch(() => ({ data: null })),
      ]).then(async ([isSuper, isAdmin, profRes]) => {
        const prof = profRes?.data;
        isCurrentUserSuperadmin = Boolean(isSuper);
        isCurrentUserAdmin = isCurrentUserSuperadmin || Boolean(isAdmin);

        if (prof) {
          const blocked =
            typeof getAccountBlockReason === "function"
              ? getAccountBlockReason(prof, isCurrentUserSuperadmin)
              : null;
          const devMismatch =
            !blocked && typeof getDeviceLockMismatchReason === "function"
              ? getDeviceLockMismatchReason(prof, isCurrentUserSuperadmin)
              : null;
          if (
            (blocked || devMismatch) &&
            typeof forceLogoutBlockedUser === "function"
          ) {
            await forceLogoutBlockedUser(blocked || devMismatch);
            return;
          }
        }

        applyAdminUI();

        let existing = {};
        try {
          existing =
            JSON.parse(localStorage.getItem("dakmitra_cached_profile")) || {};
        } catch (e) {}

        const merged = {
          ...existing,
          ...(prof || {}),
          email: userEmail,
          is_admin: isCurrentUserAdmin,
          is_superadmin: isCurrentUserSuperadmin,
        };
        localStorage.setItem("dakmitra_cached_profile", JSON.stringify(merged));
        if (prof) renderUserProfileUI(merged, userEmail);

        if (
          isCurrentUserSuperadmin &&
          typeof refreshSuperadminPendingBadge === "function"
        ) {
          refreshSuperadminPendingBadge();
        }
      });

      initRealtimeSync();
      if (typeof refreshFeedbackOpenCount === "function") {
        refreshFeedbackOpenCount();
      }
      if (typeof syncLearningProgressInBackground === "function") {
        syncLearningProgressInBackground();
      }
    }

    fetchAllPostOffices();
  } else {
    currentUserId = null;
    isCurrentUserAdmin = false;
    isCurrentUserSuperadmin = false;
    authView.classList.remove("hidden");
    dashboardView.classList.add("hidden");
    splashScreen.classList.add("hidden-splash");
    applyAppConfigUI();
    if (navigator.onLine && supabaseClient) {
      fetchAndApplyAppConfig();
    }
  }
}

// --- BOOTSTRAP ---
bootAppInstantly();

window.addEventListener("DOMContentLoaded", () => {
  initSupabaseClient();
  checkEmailVerificationRedirect();
  checkUserSession();
});

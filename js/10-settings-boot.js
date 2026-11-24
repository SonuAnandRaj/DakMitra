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
  if (exportGroup) {
    exportGroup.style.display = mode === "hide" ? "none" : "flex";
  }
}

function clearAppCache() {
  showCustomConfirm(
    "Clear Cache?",
    "This will reset your recent searches and preferences. You will not lose your database records.",
    "Clear Cache",
    () => {
      localStorage.removeItem(HISTORY_KEY);
      localStorage.removeItem("dakmitra_default_view");
      localStorage.removeItem("dakmitra_offline_db");
      localStorage.removeItem("dakmitra_members_cache");
      localStorage.removeItem("dakmitra_feedback_cache");
      if (typeof invalidateFeedbackCache === "function") {
        invalidateFeedbackCache();
      }
      showToast("🧹 Cache cleared successfully!");
      loadSearchHistory();
      invalidateApprovalsCache();
    },
  );
}

async function syncDatabase() {
  if (!(await ensureOnline("Connect to internet to sync database."))) return;
  const syncBtn = document.getElementById("sync-db-btn");
  if (!syncBtn) return;

  setButtonState(syncBtn, "loading", "Syncing...");
  const success = await fetchAllPostOffices(true);

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

// --- ADMIN ROLE CHECK & UI ---
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

async function applyAdminUI() {
  const adminOnlyExcelCard = document.getElementById("admin-excel-upload");
  if (!adminOnlyExcelCard) return;
  adminOnlyExcelCard.style.display = isCurrentUserAdmin ? "block" : "none";
}

// --- FULL DATABASE EXCEL EXPORT ---
async function exportFullTableToExcel(includeDeleted = true) {
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

    renderUserProfileUI(profileData, userEmail);
    switchDashboardView("search");

    const cachedDataString = localStorage.getItem("dakmitra_offline_db");
    if (cachedDataString) {
      try {
        cachedPostOffices = JSON.parse(cachedDataString);
        if (typeof buildSearchIndex === "function") buildSearchIndex();
        document.getElementById("stat-addresses").textContent =
          cachedPostOffices.length;
        document.getElementById("stat-offices").textContent = new Set(
          cachedPostOffices.map((o) => o.Office),
        ).size;
        currentFilteredData = cachedPostOffices
          .map((item) => ({
            item,
            matches: [],
          }))
          .sort((a, b) => compareByPriorityOnly(a.item, b.item));
        renderResults(false);
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
      if (typeof cachedProf.is_admin === "boolean") {
        isCurrentUserAdmin = cachedProf.is_admin;
        applyAdminUI();
      }
      renderUserProfileUI(cachedProf, userEmail);
    }

    if (navigator.onLine && supabaseClient) {
      Promise.all([
        Promise.resolve(checkIfAdmin(session.user.id)).catch(
          () => isCurrentUserAdmin,
        ),
        Promise.resolve(
          supabaseClient
            .from("profiles")
            .select(
              "name, designation, employee_id, mobile, avatar_url, show_mobile",
            )
            .eq("id", session.user.id)
            .single(),
        ).catch(() => ({ data: null })),
      ]).then(([isAdmin, profRes]) => {
        isCurrentUserAdmin = isAdmin;
        applyAdminUI();

        const prof = profRes?.data;
        let existing = {};
        try {
          existing =
            JSON.parse(localStorage.getItem("dakmitra_cached_profile")) || {};
        } catch (e) {}

        const merged = {
          ...existing,
          ...(prof || {}),
          email: userEmail,
          is_admin: isAdmin,
        };
        localStorage.setItem("dakmitra_cached_profile", JSON.stringify(merged));
        if (prof) renderUserProfileUI(merged, userEmail);
      });

      initRealtimeSync();
      if (typeof refreshFeedbackOpenCount === "function") {
        refreshFeedbackOpenCount();
      }
    }

    fetchAllPostOffices();
  } else {
    currentUserId = null;
    authView.classList.remove("hidden");
    dashboardView.classList.add("hidden");
    splashScreen.classList.add("hidden-splash");
  }
}

// --- BOOTSTRAP ---
bootAppInstantly();

window.addEventListener("DOMContentLoaded", () => {
  initSupabaseClient();
  checkEmailVerificationRedirect();
  checkUserSession();
});

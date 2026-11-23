// =========================================================
// 04-DATA-SYNC.JS — Data Fetching, Caching & Realtime Sync
// =========================================================

// --- DATA FETCHING & STATS ---
async function fetchAllPostOffices(forceSync = false) {
  if (!forceSync) {
    const cachedDataString = localStorage.getItem("dakmitra_offline_db");
    if (cachedDataString) {
      try {
        cachedPostOffices = JSON.parse(cachedDataString);
        initializeSearchAndRender();

        const runInBg =
          window.requestIdleCallback || ((cb) => setTimeout(cb, 300));
        runInBg(() => {
          fetchFromServerBackground();
          if (navigator.onLine) initRealtimeSync();
        });
        return true;
      } catch (e) {
        console.error("Cache corrupted, fetching fresh.");
      }
    }
  }

  return await fetchFromServerBackground();
}

async function fetchFromServerBackground() {
  if (!navigator.onLine) {
    console.log("Offline mode: Skipping background sync.");
    if (!cachedPostOffices || cachedPostOffices.length === 0) {
      document.getElementById(
        "results-display-area"
      ).innerHTML = `<ul class="list-container"><li class="list-empty" style="color: #ef4444;">Offline mode active. No cached data available.</li></ul>`;
    }
    return false;
  }

  try {
    let allRows = [];
    let from = 0;
    const batchSize = 1000;

    while (true) {
      const { data, error } = await supabaseClient
        .from("post_offices")
        .select("*")
        .eq("is_deleted", false)
        .order("id", { ascending: true })
        .range(from, from + batchSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      allRows = allRows.concat(data);
      if (data.length < batchSize) break;
      from += batchSize;
    }

    const newJson = JSON.stringify(allRows);
    const oldJson = localStorage.getItem("dakmitra_offline_db");

    if (newJson !== oldJson) {
      cachedPostOffices = allRows;
      localStorage.setItem("dakmitra_offline_db", newJson);
      initializeSearchAndRender(true);
    }
    return true;
  } catch (error) {
    console.error("Background sync failed:", error);
    return false;
  }
}

// --- SMART 3-DIGIT PIN SUFFIX OFFICE INDEX ---
let pinSuffixToOfficeMap = new Map();
window.activeCleanSearchQuery = "";
window.activeSmartOfficeFilter = null;

function buildPinSuffixIndex() {
  pinSuffixToOfficeMap.clear();
  if (!cachedPostOffices) return;

  cachedPostOffices.forEach((row) => {
    const pinStr = String(row.Pin || "").trim();
    const officeName = String(row.Office || "").trim();
    if (/^\d{6}$/.test(pinStr) && officeName) {
      const suffix = pinStr.slice(-3);
      if (!pinSuffixToOfficeMap.has(suffix)) {
        pinSuffixToOfficeMap.set(suffix, officeName);
      }
    }
  });
}

// --- PRECOMPUTED SEARCH & PRIORITY INDEX (ZERO-LAG MOBILE RANKING) ---
let searchIndexMap = new Map();

function createSearchMeta(row) {
  const addrRaw = String(row.Address || "").trim();
  const offRaw = String(row.Office || "").trim();
  const officeType = detectOfficeType(addrRaw);
  const isPriority = Number(row.priority) >= 1;
  const effectivePriority = getEffectivePriority(row);

  const addrCore = stripPostalSuffixes(addrRaw);
  const addrWords = addrCore ? addrCore.split(" ") : [];
  const addrWordPhonetics = [];
  for (let i = 0; i < addrWords.length; i++) {
    const pk = postalPhoneticKey(addrWords[i]);
    if (pk) addrWordPhonetics.push(pk);
  }

  const officeCore = stripPostalSuffixes(offRaw);
  const officeWords = officeCore ? officeCore.split(" ") : [];
  const officeWordPhonetics = [];
  for (let i = 0; i < officeWords.length; i++) {
    const pk = postalPhoneticKey(officeWords[i]);
    if (pk) officeWordPhonetics.push(pk);
  }

  return {
    officeType,
    isPriority,
    effectivePriority,
    addrLower: addrRaw.toLowerCase(),
    addrCore,
    addrWords,
    addrPhonetic: postalPhoneticKey(addrRaw),
    addrWordPhonetics,
    officeLower: offRaw.toLowerCase(),
    officeCore,
    officeWords,
    officePhonetic: postalPhoneticKey(offRaw),
    officeWordPhonetics,
  };
}

function buildSearchIndex() {
  searchIndexMap.clear();
  if (!cachedPostOffices) return;
  for (let i = 0; i < cachedPostOffices.length; i++) {
    const row = cachedPostOffices[i];
    if (row && row.id !== undefined && row.id !== null) {
      searchIndexMap.set(String(row.id), createSearchMeta(row));
    }
  }
}

function updateSearchIndexRow(row) {
  if (!row || row.id === undefined || row.id === null) return;
  searchIndexMap.set(String(row.id), createSearchMeta(row));
}

function getSearchMeta(row) {
  if (!row) return null;
  const key = String(row.id);
  let meta = searchIndexMap.get(key);
  if (!meta) {
    meta = createSearchMeta(row);
    if (row.id !== undefined && row.id !== null) {
      searchIndexMap.set(key, meta);
    }
  }
  return meta;
}

function compareByPriorityOnly(aRow, bRow) {
  const aMeta = getSearchMeta(aRow);
  const bMeta = getSearchMeta(bRow);
  const prioDiff =
    (bMeta?.effectivePriority || 0) - (aMeta?.effectivePriority || 0);
  if (prioDiff !== 0) return prioDiff;
  return (aMeta?.addrLower || "").localeCompare(bMeta?.addrLower || "");
}

function parseSmartSearchQuery(
  rawInput,
  searchMode,
  manualOfficeFilter,
  manualPinFilter
) {
  let text = String(rawInput || "").trim();

  if (!text || searchMode === "pin" || manualOfficeFilter || manualPinFilter) {
    return { cleanQuery: text, detectedSuffix: null, targetOffice: null };
  }

  text = text
    .replace(/(?:^|\s)(\d)\s+(\d)\s+(\d)$/, " $1$2$3")
    .replace(/^(\d)\s+(\d)\s+(\d)(?:\s|$)/, "$1$2$3 ")
    .trim();

  const patterns = [
    { regex: /^(.*?)\s*[@\-/]\s*(\d{3})\s*$/, queryIdx: 1, suffixIdx: 2 },
    { regex: /^(.+?[a-zA-Z])\s*(\d{3})$/, queryIdx: 1, suffixIdx: 2 },
    { regex: /^(\d{3})\s*([a-zA-Z].*)$/, queryIdx: 2, suffixIdx: 1 },
  ];

  for (const { regex, queryIdx, suffixIdx } of patterns) {
    const match = text.match(regex);
    if (match && pinSuffixToOfficeMap.has(match[suffixIdx])) {
      const suffix = match[suffixIdx];
      return {
        cleanQuery: match[queryIdx].trim(),
        detectedSuffix: suffix,
        targetOffice: pinSuffixToOfficeMap.get(suffix),
      };
    }
  }

  return { cleanQuery: text, detectedSuffix: null, targetOffice: null };
}

function initializeSearchAndRender(dataChanged = false) {
  buildPinSuffixIndex();
  buildSearchIndex();
  const totalRecords = cachedPostOffices.length;
  const uniqueOffices = new Set(cachedPostOffices.map((o) => o.Office)).size;

  document.getElementById("stat-addresses").textContent = totalRecords;
  document.getElementById("stat-offices").textContent = uniqueOffices;

  if (window.Fuse) {
    fuse = new Fuse(cachedPostOffices, {
      keys: ["Address", "Office", "Pin"],
      threshold: 0.3,
      includeScore: true,
      ignoreLocation: false,
      location: 0,
      distance: 100,
      includeMatches: true,
    });
  }

  syncFavoritesWithCache();

  const displayArea = document.getElementById("results-display-area");
  const alreadyRendered =
    displayArea && displayArea.querySelector(".list-item");

  if (dataChanged || !alreadyRendered) {
    refreshSearchInPlace();
    refreshDirectoryInPlace();
  }
}

function buildDirectoryGroupedData() {
  if (!cachedPostOffices || cachedPostOffices.length === 0) {
    directoryGroupedData = [];
    return;
  }
  const grouped = {};
  cachedPostOffices.forEach((row) => {
    const rawOffice = String(row.Office || "Unknown Office")
      .trim()
      .replace(/\s+/g, " ");
    const officeKey = rawOffice.toLowerCase();

    if (!grouped[officeKey]) {
      grouped[officeKey] = {
        office: rawOffice,
        pin: row.Pin || "N/A",
        addresses: [],
      };
    }

    grouped[officeKey].addresses.push({
      id: row.id,
      Address: row.Address || "",
      Office: grouped[officeKey].office,
      Pin: row.Pin || "",
      officeType: detectOfficeType(row.Address),
      priority: Number(row.priority) >= 1 ? 1 : 0,
      effectivePriority: getEffectivePriority(row),
    });
  });

  directoryGroupedData = Object.values(grouped)
    .sort((a, b) => a.office.localeCompare(b.office))
    .map((group) => ({
      office: group.office,
      pin: group.pin,
      addresses: group.addresses.sort(
        (a, b) =>
          b.effectivePriority - a.effectivePriority ||
          String(a.Address).localeCompare(String(b.Address)),
      ),
      searchString: (group.office + " " + group.pin).toLowerCase(),
    }));
}

// --- UNIFIED REALTIME & LOCAL CACHE STORE ---
let uiRefreshTimer = null;

function persistPostOfficeCache() {
  try {
    localStorage.setItem(
      "dakmitra_offline_db",
      JSON.stringify(cachedPostOffices)
    );
  } catch (e) {
    console.warn("Failed to persist offline DB:", e);
  }
}

function syncFavoritesWithCache() {
  const favorites = getSafeStorage(FAV_KEY);
  if (!favorites.length) return;

  const byId = new Map(cachedPostOffices.map((r) => [String(r.id), r]));
  let changed = false;

  const updatedFavs = [];
  favorites.forEach((fav) => {
    const live = byId.get(String(fav.id));
    if (!live) {
      changed = true;
      return;
    }
    const nextPin = live.Pin ?? "";
    if (
      fav.address !== live.Address ||
      fav.office !== live.Office ||
      String(fav.pin ?? "") !== String(nextPin)
    ) {
      changed = true;
      updatedFavs.push({
        id: live.id,
        address: live.Address,
        office: live.Office,
        pin: nextPin,
      });
    } else {
      updatedFavs.push(fav);
    }
  });

  if (changed) {
    localStorage.setItem(FAV_KEY, JSON.stringify(updatedFavs));
    if (
      document.getElementById("view-favorites")?.classList.contains("active")
    ) {
      renderFavorites();
    }
  }
}

function isRowDataUnchanged(existing, incoming) {
  if (!existing || !incoming) return false;
  const keys = Object.keys(incoming);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const oldVal = existing[k];
    const newVal = incoming[k];
    if (oldVal === newVal) continue;
    if (
      oldVal !== null &&
      newVal !== null &&
      typeof oldVal === "object" &&
      typeof newVal === "object"
    ) {
      if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;
    }
    return false;
  }
  return true;
}

function upsertLocalPostOffice(row) {
  if (!row || row.id === undefined || row.id === null) return;

  if (row.is_deleted === true) {
    removeLocalPostOffice(row.id);
    return;
  }

  const idx = cachedPostOffices.findIndex(
    (r) => String(r.id) === String(row.id)
  );
  if (idx > -1) {
    if (isRowDataUnchanged(cachedPostOffices[idx], row)) {
      return;
    }
    cachedPostOffices[idx] = { ...cachedPostOffices[idx], ...row };
    updateSearchIndexRow(cachedPostOffices[idx]);
  } else {
    cachedPostOffices.push(row);
    updateSearchIndexRow(row);
  }

  if (
    typeof activeOfficeRecord !== "undefined" &&
    activeOfficeRecord &&
    String(activeOfficeRecord.id) === String(row.id)
  ) {
    activeOfficeRecord =
      cachedPostOffices[idx > -1 ? idx : cachedPostOffices.length - 1];
    const isModalOpen = document
      .getElementById("office-details-modal-overlay")
      ?.classList.contains("show");
    const isViewMode = !document
      .getElementById("office-modal-view-actions")
      ?.classList.contains("hidden");
    if (
      isModalOpen &&
      isViewMode &&
      typeof renderOfficeStaffViewMode === "function"
    ) {
      renderOfficeStaffViewMode();
    }
  }

  persistPostOfficeCache();
  scheduleLocalUiRefresh();
}

function removeLocalPostOffice(id) {
  if (id === undefined || id === null) return;

  const beforeLen = cachedPostOffices.length;
  cachedPostOffices = cachedPostOffices.filter(
    (r) => String(r.id) !== String(id)
  );
  if (cachedPostOffices.length === beforeLen) return;

  if (
    typeof activeOfficeRecord !== "undefined" &&
    activeOfficeRecord &&
    String(activeOfficeRecord.id) === String(id)
  ) {
    if (typeof closeOfficeDetailsModal === "function") {
      closeOfficeDetailsModal();
    }
  }

  persistPostOfficeCache();
  scheduleLocalUiRefresh();
}

function scheduleLocalUiRefresh() {
  clearTimeout(uiRefreshTimer);
  uiRefreshTimer = setTimeout(() => {
    buildPinSuffixIndex();
    buildSearchIndex();
    const statAddrEl = document.getElementById("stat-addresses");
    const statOffEl = document.getElementById("stat-offices");
    if (statAddrEl) statAddrEl.textContent = cachedPostOffices.length;
    if (statOffEl) {
      statOffEl.textContent = new Set(
        cachedPostOffices.map((o) => o.Office)
      ).size;
    }

    if (window.Fuse) {
      fuse = new Fuse(cachedPostOffices, {
        keys: ["Address", "Office", "Pin"],
        threshold: 0.3,
        ignoreLocation: false,
        includeScore: true,
        location: 0,
        distance: 100,
        includeMatches: true,
      });
    }

    syncFavoritesWithCache();
    refreshSearchInPlace();
    refreshDirectoryInPlace();
  }, 80);
}

function refreshSearchInPlace(silent = true) {
  const displayArea = document.getElementById("results-display-area");
  const prevScroll = displayArea ? displayArea.scrollTop : 0;
  const prevLimit = window.searchDisplayLimit || 10;

  if (typeof triggerSearch === "function") {
    triggerSearch(false, { silent, preserveLimit: prevLimit });
  }

  if (displayArea) {
    displayArea.scrollTop = prevScroll;
  }
}

function refreshDirectoryInPlace() {
  buildDirectoryGroupedData();

  const dirView = document.getElementById("view-directory");
  if (!dirView || !dirView.classList.contains("active")) return;

  const pagesToRender = Math.max(1, directoryCurrentPage);
  if (typeof applyDirectoryFilters === "function") {
    applyDirectoryFilters({
      preserveScroll: true,
      minPages: pagesToRender,
    });
  }
}

// --- SUPABASE REALTIME SYNC ---
let realtimeChannel = null;

function initRealtimeSync() {
  if (!supabaseClient || realtimeChannel) return;

  realtimeChannel = supabaseClient
    .channel("dakmitra-live-sync")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "post_offices" },
      (payload) => {
        upsertLocalPostOffice(payload.new);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "post_offices" },
      (payload) => {
        upsertLocalPostOffice(payload.new);
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "post_offices" },
      (payload) => {
        if (payload.old?.id) removeLocalPostOffice(payload.old.id);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "edit_requests" },
      () => {
        invalidateApprovalsCache();
        if (
          document
            .getElementById("view-approvals")
            ?.classList.contains("active")
        ) {
          switchApprovalTab(currentApprovalTab, true);
        }
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        teardownRealtimeSync();
        setTimeout(() => {
          initRealtimeSync();
          fetchFromServerBackground();
        }, 3000);
      }
    });
}

function teardownRealtimeSync() {
  if (realtimeChannel && supabaseClient) {
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

// --- FULL OFFLINE-TO-ONLINE HYDRATION ENGINE ---
let wasOffline = !navigator.onLine;
let isHydratingOnline = false;
let onlineRetryTimer = null;

window.addEventListener("offline", () => {
  wasOffline = true;
  clearTimeout(onlineRetryTimer);
  teardownRealtimeSync();
  showOfflineToast("Switched to offline cache.");
});

async function hydrateOnlineState(attempt = 1) {
  if (isHydratingOnline) return;
  clearTimeout(onlineRetryTimer);

  const hasInternet = await checkActualInternet();
  if (!hasInternet) {
    if (attempt <= 4 && navigator.onLine) {
      const delays = [1500, 3000, 5000, 8000];
      onlineRetryTimer = setTimeout(
        () => hydrateOnlineState(attempt + 1),
        delays[attempt - 1]
      );
    }
    return;
  }

  isHydratingOnline = true;

  try {
    const client = await ensureSupabaseReady();
    if (!client) throw new Error("Supabase client failed to initialize.");

    let {
      data: { session },
    } = await client.auth.getSession();

    const nowSec = Math.floor(Date.now() / 1000);
    if (session && (!session.expires_at || session.expires_at - nowSec < 120)) {
      const { data: refreshed, error: refreshErr } =
        await client.auth.refreshSession();
      if (!refreshErr && refreshed?.session) {
        session = refreshed.session;
      }
    }

    if (!session || !session.user) {
      wasOffline = false;
      if (typeof checkUserSession === "function") checkUserSession();
      return;
    }

    currentUserId = session.user.id;

    isCurrentUserAdmin = await checkIfAdmin(session.user.id);
    applyAdminUI();

    const { data: profileData } = await client
      .from("profiles")
      .select("name, designation, employee_id, mobile, avatar_url")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profileData) {
      const merged = {
        ...profileData,
        email: session.user.email,
        is_admin: isCurrentUserAdmin,
      };
      localStorage.setItem("dakmitra_cached_profile", JSON.stringify(merged));
      renderUserProfileUI(merged, session.user.email);
    }

    teardownRealtimeSync();
    if (client.realtime && session.access_token) {
      client.realtime.setAuth(session.access_token);
    }
    initRealtimeSync();

    invalidateApprovalsCache();
    if (
      document.getElementById("view-approvals")?.classList.contains("active")
    ) {
      switchApprovalTab(currentApprovalTab, true);
    }

    await fetchFromServerBackground();

    if (wasOffline) {
      wasOffline = false;
      showToast("🌐 Back online — synced!");
    }
  } catch (err) {
    console.warn("Online hydration failed:", err);
    if (attempt <= 3 && navigator.onLine) {
      onlineRetryTimer = setTimeout(
        () => hydrateOnlineState(attempt + 1),
        3000
      );
    }
  } finally {
    isHydratingOnline = false;
  }
}

window.addEventListener("online", () => {
  hydrateOnlineState(1);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && navigator.onLine) {
    if (wasOffline || !supabaseClient || !realtimeChannel) {
      hydrateOnlineState(1);
    } else {
      const isLoggedIn = !document
        .getElementById("dashboard-view")
        ?.classList.contains("hidden");
      if (isLoggedIn) fetchFromServerBackground();
    }
  }
});

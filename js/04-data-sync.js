// =========================================================
// 04-DATA-SYNC.JS — Data Fetching, Caching & Realtime Sync
// =========================================================

// --- PARENT OFFICE STAFF CACHE & SYNC (public.office_staff) ---
function normalizeOfficeKey(name) {
  return String(name || "")
    .replace(/\./g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function rebuildOfficeStaffMap() {
  officeStaffByKeyMap.clear();
  if (!Array.isArray(cachedOfficeStaff)) return;
  for (let i = 0; i < cachedOfficeStaff.length; i++) {
    const row = cachedOfficeStaff[i];
    if (!row) continue;
    const key = row.office_key || normalizeOfficeKey(row.office_name);
    if (key) officeStaffByKeyMap.set(key, row);
  }
}

function getOfficeStaffByName(officeName) {
  const key = normalizeOfficeKey(officeName);
  return key ? officeStaffByKeyMap.get(key) || null : null;
}

function persistOfficeStaffCache() {
  try {
    localStorage.setItem(
      OFFICE_STAFF_CACHE_KEY,
      JSON.stringify(cachedOfficeStaff)
    );
  } catch (e) {
    console.warn("Failed to persist office staff cache:", e);
  }
}

function loadOfficeStaffFromCache() {
  try {
    const raw = localStorage.getItem(OFFICE_STAFF_CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      cachedOfficeStaff = parsed;
      rebuildOfficeStaffMap();
      return true;
    }
  } catch (e) {
    console.warn("Office staff cache corrupted, will refetch.");
  }
  return false;
}

const SYNC_META_CACHE_KEY = "dakmitra_sync_meta";
const POST_OFFICE_SELECT_COLUMNS =
  "id, Address, Office, Pin, priority, bpm_name, bpm_contact, abpm_name, abpm_contact, spm_name, spm_contact, pm_name, pm_contact, pa_list, mts_list";
const OFFICE_STAFF_SELECT_COLUMNS =
  "id, office_name, office_key, office_type, pm_name, pm_contact, spm_name, spm_contact, pa_list, mts_list";

let lastServerSyncCheckAt = 0;
let _syncInFlightPromise = null;

function getLocalSyncMeta() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_META_CACHE_KEY));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function saveLocalSyncMeta(meta) {
  try {
    localStorage.setItem(SYNC_META_CACHE_KEY, JSON.stringify(meta));
  } catch (_) {}
}

async function fetchServerSyncMeta() {
  if (!navigator.onLine || !supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient
      .from("sync_meta")
      .select("table_name, version");
    if (error || !Array.isArray(data)) return null;

    const map = {};
    data.forEach((row) => {
      if (row && row.table_name) {
        map[row.table_name] = Number(row.version);
      }
    });
    return map;
  } catch (_) {
    return null;
  }
}

async function fetchOfficeStaffBackground() {
  if (!navigator.onLine || !supabaseClient) return false;
  try {
    const { data, error } = await supabaseClient
      .from("office_staff")
      .select(OFFICE_STAFF_SELECT_COLUMNS)
      .order("office_name", { ascending: true });

    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const newJson = JSON.stringify(rows);
    const oldJson = localStorage.getItem(OFFICE_STAFF_CACHE_KEY);

    if (newJson !== oldJson || cachedOfficeStaff.length !== rows.length) {
      cachedOfficeStaff = rows;
      rebuildOfficeStaffMap();
      persistOfficeStaffCache();
      refreshDirectoryInPlace();
      if (
        document.getElementById("view-search")?.classList.contains("active")
      ) {
        refreshSearchInPlace(true);
      }
    }
    return true;
  } catch (err) {
    console.warn("Office staff background sync failed:", err?.message || err);
    return false;
  }
}
function upsertLocalOfficeStaff(row) {
  if (!row) return;
  const key = row.office_key || normalizeOfficeKey(row.office_name);
  if (!key) return;

  const idx = cachedOfficeStaff.findIndex(
    (r) =>
      (row.id && String(r.id) === String(row.id)) ||
      (r.office_key || normalizeOfficeKey(r.office_name)) === key
  );

  if (idx > -1) {
    if (isRowDataUnchanged(cachedOfficeStaff[idx], row)) return;
    cachedOfficeStaff[idx] = { ...cachedOfficeStaff[idx], ...row };
  } else {
    cachedOfficeStaff.push(row);
  }

  rebuildOfficeStaffMap();
  persistOfficeStaffCache();

  // Live-update open modal if user is viewing this parent office
  if (
    typeof activeOfficeMode !== "undefined" &&
    activeOfficeMode === "parent" &&
    typeof activeOfficeKey !== "undefined" &&
    activeOfficeKey === key
  ) {
    activeOfficeRecord = officeStaffByKeyMap.get(key) || row;
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

  refreshDirectoryInPlace();
  if (document.getElementById("view-search")?.classList.contains("active")) {
    refreshSearchInPlace(true);
  }
}

function removeLocalOfficeStaff(rowOrId) {
  const id = typeof rowOrId === "object" ? rowOrId?.id : rowOrId;
  const key =
    typeof rowOrId === "object"
      ? rowOrId?.office_key || normalizeOfficeKey(rowOrId?.office_name)
      : null;

  const beforeLen = cachedOfficeStaff.length;
  cachedOfficeStaff = cachedOfficeStaff.filter((r) => {
    if (id && String(r.id) === String(id)) return false;
    if (key && (r.office_key || normalizeOfficeKey(r.office_name)) === key) {
      return false;
    }
    return true;
  });

  if (cachedOfficeStaff.length === beforeLen) return;
  rebuildOfficeStaffMap();
  persistOfficeStaffCache();
  refreshDirectoryInPlace();
}

// --- DATA FETCHING & STATS ---
async function fetchAllPostOffices(forceSync = false) {
  if (!forceSync) {
    loadOfficeStaffFromCache();
    const cachedDataString = localStorage.getItem("dakmitra_offline_db");
    if (cachedDataString) {
      try {
        cachedPostOffices = JSON.parse(cachedDataString);
        initializeSearchAndRender();

        const runInBg =
          window.requestIdleCallback || ((cb) => setTimeout(cb, 300));
        runInBg(() => {
          fetchFromServerBackground(false);
          if (navigator.onLine) initRealtimeSync();
        });
        return true;
      } catch (e) {
        console.error("Cache corrupted, fetching fresh.");
      }
    }
  }

  return await fetchFromServerBackground(forceSync);
}

async function fetchFromServerBackground(force = false) {
  if (!navigator.onLine) {
    console.log("Offline mode: Skipping background sync.");
    if (!cachedPostOffices || cachedPostOffices.length === 0) {
      document.getElementById(
        "results-display-area"
      ).innerHTML = `<ul class="list-container"><li class="list-empty" style="color: #ef4444;">Offline mode active. No cached data available.</li></ul>`;
    }
    return false;
  }

  if (!supabaseClient) initSupabaseClient();
  if (!supabaseClient) return false;

  if (!force && _syncInFlightPromise) {
    return _syncInFlightPromise;
  }

  const runSync = async () => {
    try {
      const localMeta = getLocalSyncMeta();
      const serverMeta = await fetchServerSyncMeta();

      const hasLocalPoCache =
        Boolean(localStorage.getItem("dakmitra_offline_db")) &&
        cachedPostOffices.length > 0;
      const hasLocalStaffCache =
        localStorage.getItem(OFFICE_STAFF_CACHE_KEY) !== null;

      const needPostOffices =
        force ||
        !hasLocalPoCache ||
        !serverMeta ||
        serverMeta.post_offices === undefined ||
        localMeta.post_offices !== serverMeta.post_offices;

      const needOfficeStaff =
        force ||
        !hasLocalStaffCache ||
        !serverMeta ||
        serverMeta.office_staff === undefined ||
        localMeta.office_staff !== serverMeta.office_staff;

      const updatedMeta = { ...localMeta };

      if (needPostOffices) {
        let allRows = [];
        let from = 0;
        const batchSize = 1000;

        while (true) {
          const { data, error } = await supabaseClient
            .from("post_offices")
            .select(POST_OFFICE_SELECT_COLUMNS)
            .eq("is_deleted", false)
            .order("id", { ascending: true })
            .range(from, from + batchSize - 1);

          if (error) throw error;
          if (!data || data.length === 0) break;

          allRows = allRows.concat(data);
          if (data.length < batchSize) break;
          from += batchSize;
        }

        if (allRows.length === 0 && cachedPostOffices.length > 0) {
          const { data: sessionData } = await supabaseClient.auth.getSession();
          if (!sessionData?.session) {
            console.warn("Skipping empty DB overwrite: no active session.");
            return false;
          }
        }

        const newJson = JSON.stringify(allRows);
        const oldJson = localStorage.getItem("dakmitra_offline_db");

        if (newJson !== oldJson) {
          cachedPostOffices = allRows;
          localStorage.setItem("dakmitra_offline_db", newJson);
          initializeSearchAndRender(true);
        }

        if (serverMeta && serverMeta.post_offices !== undefined) {
          updatedMeta.post_offices = serverMeta.post_offices;
        }
      }

      if (needOfficeStaff) {
        const staffOk = await fetchOfficeStaffBackground();
        if (staffOk && serverMeta && serverMeta.office_staff !== undefined) {
          updatedMeta.office_staff = serverMeta.office_staff;
        }
      }

      if (serverMeta) {
        saveLocalSyncMeta(updatedMeta);
      }

      lastServerSyncCheckAt = Date.now();
      return true;
    } catch (error) {
      console.error("Background sync failed:", error);
      return false;
    } finally {
      _syncInFlightPromise = null;
    }
  };

  _syncInFlightPromise = runSync();
  return _syncInFlightPromise;
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

// --- CACHED FUSE.JS INSTANCES (ZERO REBUILD PER KEYSTROKE) ---
const fuseInstanceCache = new Map();

function clearFuseCache() {
  fuseInstanceCache.clear();
}

function getCachedFuseInstance(filterVal, isNumericSearch) {
  if (!window.Fuse) return null;
  const cacheKey = `${filterVal}|${isNumericSearch ? "num" : "txt"}`;
  let instance = fuseInstanceCache.get(cacheKey);
  if (instance) return instance;

  let keysToSearch = ["Address", "Office", "Pin"];
  if (filterVal === "address") keysToSearch = ["Address"];
  if (filterVal === "office") keysToSearch = ["Office"];
  if (filterVal === "pin") keysToSearch = ["Pin"];

  instance = new Fuse(cachedPostOffices, {
    keys: keysToSearch,
    threshold: isNumericSearch ? 0.0 : 0.3,
    ignoreLocation: isNumericSearch ? true : false,
    location: 0,
    distance: 100,
    includeMatches: true,
    includeScore: true,
    getFn: (obj, path) => {
      const value = obj[path];
      return value === null || value === undefined ? "" : String(value);
    },
  });
  fuseInstanceCache.set(cacheKey, instance);
  return instance;
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
  clearFuseCache();
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
  clearFuseCache();
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

  if (!text || manualOfficeFilter || manualPinFilter) {
    return { cleanQuery: text, detectedSuffix: null, targetOffice: null };
  }

  if (pinSuffixToOfficeMap.size === 0 && cachedPostOffices?.length > 0) {
    buildPinSuffixIndex();
  }

  text = text
    .replace(/(?:^|\s)(\d)\s+(\d)\s+(\d)$/, " $1$2$3")
    .replace(/^(\d)\s+(\d)\s+(\d)(?:\s|$)/, "$1$2$3 ")
    .trim();

  // Standalone 3-digit unique PIN suffix (e.g. "501" or voice "5 0 1" -> Kachhwa SO / 231501)
  if (/^\d{3}$/.test(text) && pinSuffixToOfficeMap.has(text)) {
    return {
      cleanQuery: "",
      detectedSuffix: text,
      targetOffice: pinSuffixToOfficeMap.get(text),
    };
  }

  if (searchMode === "pin") {
    return { cleanQuery: text, detectedSuffix: null, targetOffice: null };
  }

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
    clearFuseCache();
    fuse = getCachedFuseInstance("address", false);
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

let directoryGroupByKeyMap = new Map();

function buildDirectoryGroupedData() {
  directoryGroupByKeyMap.clear();
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
    .map((group) => {
      const built = {
        office: group.office,
        pin: group.pin,
        addresses: group.addresses.sort(
          (a, b) =>
            b.effectivePriority - a.effectivePriority ||
            String(a.Address).localeCompare(String(b.Address))
        ),
      };
      directoryGroupByKeyMap.set(group.office.toLowerCase(), built);
      return built;
    });
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
    (typeof activeOfficeMode === "undefined" ||
      activeOfficeMode !== "parent") &&
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
  clearFuseCache();

  if (
    (typeof activeOfficeMode === "undefined" ||
      activeOfficeMode !== "parent") &&
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
      clearFuseCache();
      fuse = getCachedFuseInstance("address", false);
    }

    syncFavoritesWithCache();
    refreshSearchInPlace();
    refreshDirectoryInPlace();
    if (typeof onLearnDatabaseUpdated === "function") {
      onLearnDatabaseUpdated();
    }
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
      { event: "INSERT", schema: "public", table: "office_staff" },
      (payload) => {
        upsertLocalOfficeStaff(payload.new);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "office_staff" },
      (payload) => {
        upsertLocalOfficeStaff(payload.new);
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "office_staff" },
      (payload) => {
        if (payload.old) removeLocalOfficeStaff(payload.old);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "edit_requests" },
      () => {
        if (typeof scheduleApprovalsRealtimeRefresh === "function") {
          scheduleApprovalsRealtimeRefresh();
        } else {
          invalidateApprovalsCache();
          if (
            document
              .getElementById("view-approvals")
              ?.classList.contains("active")
          ) {
            switchApprovalTab(currentApprovalTab, true);
          }
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "request_approvals" },
      () => {
        if (typeof scheduleApprovalsRealtimeRefresh === "function") {
          scheduleApprovalsRealtimeRefresh();
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "feedback_items" },
      () => {
        if (typeof scheduleFeedbackRealtimeRefresh === "function") {
          scheduleFeedbackRealtimeRefresh();
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "feedback_votes" },
      () => {
        if (typeof scheduleFeedbackRealtimeRefresh === "function") {
          scheduleFeedbackRealtimeRefresh();
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_settings" },
      () => {
        if (typeof fetchAndApplyAppConfig === "function") {
          fetchAndApplyAppConfig();
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "admins" },
      async () => {
        if (!currentUserId || typeof checkIfAdmin !== "function") return;
        const isAdm = await checkIfAdmin(currentUserId);
        isCurrentUserAdmin = isCurrentUserSuperadmin || isAdm;
        if (typeof applyAdminUI === "function") applyAdminUI();
        try {
          const prof =
            JSON.parse(localStorage.getItem("dakmitra_cached_profile")) || {};
          prof.is_admin = isCurrentUserAdmin;
          localStorage.setItem("dakmitra_cached_profile", JSON.stringify(prof));
        } catch (_) {}
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      (payload) => {
        if (
          payload.new?.id &&
          String(payload.new.id) === String(currentUserId)
        ) {
          const blocked =
            typeof getAccountBlockReason === "function"
              ? getAccountBlockReason(payload.new, isCurrentUserSuperadmin)
              : null;
          const devMismatch =
            !blocked &&
            "device_id" in payload.new &&
            typeof getDeviceLockMismatchReason === "function"
              ? getDeviceLockMismatchReason(
                  payload.new,
                  isCurrentUserSuperadmin
                )
              : null;
          if (
            (blocked || devMismatch) &&
            typeof forceLogoutBlockedUser === "function"
          ) {
            forceLogoutBlockedUser(blocked || devMismatch);
            return;
          }
        }
        if (
          isCurrentUserSuperadmin &&
          typeof refreshSuperadminPendingBadge === "function"
        ) {
          refreshSuperadminPendingBadge();
        }
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        teardownRealtimeSync();
        if (document.visibilityState === "visible" && navigator.onLine) {
          setTimeout(() => {
            if (document.visibilityState === "visible" && navigator.onLine) {
              initRealtimeSync();
              fetchFromServerBackground(false);
            }
          }, 3000);
        }
      }
    });
}

let realtimePauseTimer = null;
let realtimePausedAt = 0;
const REALTIME_BG_PAUSE_MS = 90 * 1000; // Pause idle Realtime after 90s in background
const VISIBILITY_SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5-minute cooldown when Realtime stayed live
const LONG_PAUSE_HYDRATE_MS = 15 * 60 * 1000; // Re-verify session/device lock after 15+ min away

function teardownRealtimeSync() {
  clearTimeout(realtimePauseTimer);
  realtimePauseTimer = null;
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

    const [isSuper, isAdm, profRes] = await Promise.all([
      typeof checkIfSuperadmin === "function"
        ? checkIfSuperadmin(session.user.id)
        : false,
      checkIfAdmin(session.user.id),
      client
        .from("profiles")
        .select(
          "device_id, name, designation, employee_id, mobile, avatar_url, show_mobile, approval_status, status_note"
        )
        .eq("id", session.user.id)
        .maybeSingle(),
    ]);

    isCurrentUserSuperadmin = Boolean(isSuper);
    isCurrentUserAdmin = isCurrentUserSuperadmin || Boolean(isAdm);

    const profileData = profRes?.data;
    if (profileData) {
      const blocked =
        typeof getAccountBlockReason === "function"
          ? getAccountBlockReason(profileData, isCurrentUserSuperadmin)
          : null;
      const devMismatch =
        !blocked && typeof getDeviceLockMismatchReason === "function"
          ? getDeviceLockMismatchReason(profileData, isCurrentUserSuperadmin)
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
    if (typeof fetchAndApplyAppConfig === "function") {
      fetchAndApplyAppConfig();
    }

    if (profileData) {
      const merged = {
        ...profileData,
        email: session.user.email,
        is_admin: isCurrentUserAdmin,
        is_superadmin: isCurrentUserSuperadmin,
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

    if (typeof invalidateFeedbackCache === "function") {
      invalidateFeedbackCache();
    }
    if (typeof refreshFeedbackOpenCount === "function") {
      refreshFeedbackOpenCount();
    }
    if (typeof syncLearningProgressInBackground === "function") {
      syncLearningProgressInBackground();
    }
    if (
      document.getElementById("view-feedback")?.classList.contains("active") &&
      typeof loadFeedbackBoardOrCache === "function"
    ) {
      loadFeedbackBoardOrCache(true);
    }

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
  if (document.visibilityState === "hidden") {
    if (realtimeChannel && !realtimePauseTimer) {
      realtimePauseTimer = setTimeout(() => {
        realtimePauseTimer = null;
        if (document.visibilityState === "hidden" && realtimeChannel) {
          teardownRealtimeSync();
          realtimePausedAt = Date.now();
        }
      }, REALTIME_BG_PAUSE_MS);
    }
    return;
  }

  // Tab / PWA became visible again
  clearTimeout(realtimePauseTimer);
  realtimePauseTimer = null;

  if (!navigator.onLine) return;

  const isLoggedIn = !document
    .getElementById("dashboard-view")
    ?.classList.contains("hidden");
  if (!isLoggedIn) return;

  if (wasOffline || !supabaseClient) {
    realtimePausedAt = 0;
    hydrateOnlineState(1);
    return;
  }

  if (!realtimeChannel) {
    const pausedDuration = realtimePausedAt ? Date.now() - realtimePausedAt : 0;
    realtimePausedAt = 0;

    if (pausedDuration >= LONG_PAUSE_HYDRATE_MS) {
      hydrateOnlineState(1);
    } else {
      initRealtimeSync();
      fetchFromServerBackground(false);
      if (typeof fetchAndApplyAppConfig === "function") {
        fetchAndApplyAppConfig();
      }
    }
    return;
  }

  // Realtime stayed connected — skip redundant checks within the 5-minute cooldown
  if (Date.now() - lastServerSyncCheckAt >= VISIBILITY_SYNC_COOLDOWN_MS) {
    fetchFromServerBackground(false);
    if (typeof fetchAndApplyAppConfig === "function") {
      fetchAndApplyAppConfig();
    }
  }
});

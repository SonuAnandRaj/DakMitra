// =========================================================
// 04-DATA-SYNC.JS — Data Fetching, Caching & Realtime Sync
// =========================================================

// --- DELIVERY OFFICES & SPARSE BRANCH STAFF CACHES (public.delivery_offices, public.branch_office_staff) ---
function normalizeOfficeKey(name) {
  return String(name || "")
    .replace(/\./g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function rebuildDeliveryOfficesMaps() {
  deliveryOfficeByIdMap.clear();
  deliveryOfficeByKeyMap.clear();
  cachedOfficeStaff = cachedDeliveryOffices;
  officeStaffByKeyMap = deliveryOfficeByKeyMap;

  if (!Array.isArray(cachedDeliveryOffices)) return;
  for (let i = 0; i < cachedDeliveryOffices.length; i++) {
    const row = cachedDeliveryOffices[i];
    if (!row) continue;
    if (row.id !== undefined && row.id !== null) {
      deliveryOfficeByIdMap.set(Number(row.id), row);
    }
    const key = row.office_key || normalizeOfficeKey(row.office_name);
    if (key) deliveryOfficeByKeyMap.set(key, row);
  }
}

function getDeliveryOfficeById(officeId) {
  if (officeId === undefined || officeId === null || officeId === "")
    return null;
  return deliveryOfficeByIdMap.get(Number(officeId)) || null;
}

function getDeliveryOfficeByName(officeName) {
  const key = normalizeOfficeKey(officeName);
  return key ? deliveryOfficeByKeyMap.get(key) || null : null;
}

function getOfficeStaffByName(officeName) {
  return getDeliveryOfficeByName(officeName);
}

function persistDeliveryOfficesCache() {
  try {
    localStorage.setItem(
      DELIVERY_OFFICES_CACHE_KEY,
      JSON.stringify(cachedDeliveryOffices)
    );
  } catch (e) {
    console.warn("Failed to persist delivery offices cache:", e);
  }
}

function loadDeliveryOfficesFromCache() {
  try {
    const raw = localStorage.getItem(DELIVERY_OFFICES_CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      cachedDeliveryOffices = parsed;
      rebuildDeliveryOfficesMaps();
      return true;
    }
  } catch (e) {
    console.warn("Delivery offices cache corrupted, will refetch.");
  }
  return false;
}

function rebuildBranchOfficeStaffMap() {
  branchOfficeStaffByPoIdMap.clear();
  if (!Array.isArray(cachedBranchOfficeStaff)) return;
  for (let i = 0; i < cachedBranchOfficeStaff.length; i++) {
    const row = cachedBranchOfficeStaff[i];
    if (
      row &&
      row.post_office_id !== undefined &&
      row.post_office_id !== null
    ) {
      branchOfficeStaffByPoIdMap.set(String(row.post_office_id), row);
    }
  }
}

function getBranchOfficeStaffByPoId(postOfficeId) {
  if (postOfficeId === undefined || postOfficeId === null) return null;
  return branchOfficeStaffByPoIdMap.get(String(postOfficeId)) || null;
}

function persistBranchOfficeStaffCache() {
  try {
    localStorage.setItem(
      BRANCH_OFFICE_STAFF_CACHE_KEY,
      JSON.stringify(cachedBranchOfficeStaff)
    );
  } catch (e) {
    console.warn("Failed to persist branch staff cache:", e);
  }
}

function loadBranchOfficeStaffFromCache() {
  try {
    const raw = localStorage.getItem(BRANCH_OFFICE_STAFF_CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      cachedBranchOfficeStaff = parsed;
      rebuildBranchOfficeStaffMap();
      return true;
    }
  } catch (e) {
    console.warn("Branch staff cache corrupted, will refetch.");
  }
  return false;
}

function loadOfficeStaffFromCache() {
  const loadedOffices = loadDeliveryOfficesFromCache();
  loadBranchOfficeStaffFromCache();
  return loadedOffices;
}

// Slim serialization (localStorage) & O(1) in-memory hydration (Office + Pin)
function serializePostOfficeRow(row) {
  return {
    id: row.id,
    Address: row.Address,
    office_id: row.office_id,
    priority: row.priority,
    inserted_at: row.inserted_at ?? null,
    address_updated_at: row.address_updated_at ?? null,
  };
}

function hydratePostOfficeRow(row) {
  if (!row || typeof row !== "object") return row;
  let officeRec = getDeliveryOfficeById(row.office_id);
  if (!officeRec && row.Office) {
    officeRec = getDeliveryOfficeByName(row.Office);
    if (officeRec) row.office_id = officeRec.id;
  }
  if (officeRec) {
    row.office_id = officeRec.id;
    row.Office = officeRec.office_name;
    row.Pin = officeRec.pin;
  } else {
    if (row.Office === undefined) row.Office = "";
    if (row.Pin === undefined) row.Pin = null;
  }
  return row;
}

function hydrateAllCachedPostOffices() {
  if (!Array.isArray(cachedPostOffices)) return;
  for (let i = 0; i < cachedPostOffices.length; i++) {
    hydratePostOfficeRow(cachedPostOffices[i]);
  }
}

const SYNC_META_CACHE_KEY = "dakmitra_sync_meta";
const POST_OFFICE_SELECT_COLUMNS =
  "id, Address, office_id, priority, inserted_at, address_updated_at";
const DELIVERY_OFFICES_SELECT_COLUMNS =
  "id, office_name, office_key, office_type, pin, pm_name, pm_contact, spm_name, spm_contact, pa_list, mts_list";
const BRANCH_OFFICE_STAFF_SELECT_COLUMNS =
  "post_office_id, office_type, bpm_name, bpm_contact, abpm_name, abpm_contact, spm_name, spm_contact, pm_name, pm_contact, pa_list, mts_list";

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

async function fetchDeliveryOfficesBackground(triggerRefresh = true) {
  if (!navigator.onLine || !supabaseClient) return false;
  try {
    const { data, error } = await supabaseClient
      .from("delivery_offices")
      .select(DELIVERY_OFFICES_SELECT_COLUMNS)
      .order("office_name", { ascending: true });

    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const newJson = JSON.stringify(rows);
    const oldJson = localStorage.getItem(DELIVERY_OFFICES_CACHE_KEY);

    if (newJson !== oldJson || cachedDeliveryOffices.length !== rows.length) {
      cachedDeliveryOffices = rows;
      rebuildDeliveryOfficesMaps();
      persistDeliveryOfficesCache();
      hydrateAllCachedPostOffices();
      if (triggerRefresh && cachedPostOffices.length > 0) {
        initializeSearchAndRender(true);
      }
    }
    return true;
  } catch (err) {
    console.warn("Delivery offices sync failed:", err?.message || err);
    return false;
  }
}

async function fetchBranchOfficeStaffBackground() {
  if (!navigator.onLine || !supabaseClient) return false;
  try {
    const { data, error } = await supabaseClient
      .from("branch_office_staff")
      .select(BRANCH_OFFICE_STAFF_SELECT_COLUMNS)
      .order("post_office_id", { ascending: true });

    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const newJson = JSON.stringify(rows);
    const oldJson = localStorage.getItem(BRANCH_OFFICE_STAFF_CACHE_KEY);

    if (newJson !== oldJson || cachedBranchOfficeStaff.length !== rows.length) {
      cachedBranchOfficeStaff = rows;
      rebuildBranchOfficeStaffMap();
      persistBranchOfficeStaffCache();
    }
    return true;
  } catch (err) {
    console.warn("Branch office staff sync failed:", err?.message || err);
    return false;
  }
}

async function fetchOfficeStaffBackground() {
  return await fetchDeliveryOfficesBackground(true);
}

function upsertLocalDeliveryOffice(row) {
  if (!row) return;
  const key = row.office_key || normalizeOfficeKey(row.office_name);
  if (!key) return;

  const idx = cachedDeliveryOffices.findIndex(
    (r) =>
      (row.id !== undefined &&
        row.id !== null &&
        Number(r.id) === Number(row.id)) ||
      (r.office_key || normalizeOfficeKey(r.office_name)) === key
  );

  let identityChanged = false;
  if (idx > -1) {
    if (isRowDataUnchanged(cachedDeliveryOffices[idx], row)) return;
    const prev = cachedDeliveryOffices[idx];
    identityChanged =
      prev.office_name !== row.office_name ||
      Number(prev.pin) !== Number(row.pin);
    cachedDeliveryOffices[idx] = { ...prev, ...row };
  } else {
    cachedDeliveryOffices.push(row);
    identityChanged = true;
  }

  rebuildDeliveryOfficesMaps();
  persistDeliveryOfficesCache();

  if (identityChanged) {
    hydrateAllCachedPostOffices();
  }

  // Live-update open modal if user is viewing this parent office
  if (
    typeof activeOfficeMode !== "undefined" &&
    activeOfficeMode === "parent" &&
    typeof activeOfficeKey !== "undefined" &&
    activeOfficeKey === key
  ) {
    activeOfficeRecord = deliveryOfficeByKeyMap.get(key) || row;
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

  if (identityChanged) {
    scheduleLocalUiRefresh();
  } else {
    refreshDirectoryInPlace();
    if (document.getElementById("view-search")?.classList.contains("active")) {
      refreshSearchInPlace(true);
    }
  }
}

function removeLocalDeliveryOffice(rowOrId) {
  const id = typeof rowOrId === "object" ? rowOrId?.id : rowOrId;
  const key =
    typeof rowOrId === "object"
      ? rowOrId?.office_key || normalizeOfficeKey(rowOrId?.office_name)
      : null;

  const beforeLen = cachedDeliveryOffices.length;
  cachedDeliveryOffices = cachedDeliveryOffices.filter((r) => {
    if (id !== undefined && id !== null && Number(r.id) === Number(id))
      return false;
    if (key && (r.office_key || normalizeOfficeKey(r.office_name)) === key) {
      return false;
    }
    return true;
  });

  if (cachedDeliveryOffices.length === beforeLen) return;
  rebuildDeliveryOfficesMaps();
  persistDeliveryOfficesCache();
  hydrateAllCachedPostOffices();
  scheduleLocalUiRefresh();
}

function upsertLocalBranchOfficeStaff(row) {
  if (!row || row.post_office_id === undefined || row.post_office_id === null) {
    return;
  }
  const poIdStr = String(row.post_office_id);
  const idx = cachedBranchOfficeStaff.findIndex(
    (r) => String(r.post_office_id) === poIdStr
  );

  if (idx > -1) {
    if (isRowDataUnchanged(cachedBranchOfficeStaff[idx], row)) return;
    cachedBranchOfficeStaff[idx] = { ...cachedBranchOfficeStaff[idx], ...row };
  } else {
    cachedBranchOfficeStaff.push(row);
  }

  rebuildBranchOfficeStaffMap();
  persistBranchOfficeStaffCache();

  if (
    typeof activeOfficeMode !== "undefined" &&
    activeOfficeMode === "child" &&
    typeof activeOfficeRecord !== "undefined" &&
    activeOfficeRecord &&
    String(activeOfficeRecord.id) === poIdStr
  ) {
    Object.assign(activeOfficeRecord, row);
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
}

function removeLocalBranchOfficeStaff(rowOrPoId) {
  const poId =
    typeof rowOrPoId === "object" ? rowOrPoId?.post_office_id : rowOrPoId;
  if (poId === undefined || poId === null) return;

  const poIdStr = String(poId);
  const beforeLen = cachedBranchOfficeStaff.length;
  cachedBranchOfficeStaff = cachedBranchOfficeStaff.filter(
    (r) => String(r.post_office_id) !== poIdStr
  );

  if (cachedBranchOfficeStaff.length === beforeLen) return;
  rebuildBranchOfficeStaffMap();
  persistBranchOfficeStaffCache();

  if (
    typeof activeOfficeMode !== "undefined" &&
    activeOfficeMode === "child" &&
    typeof activeOfficeRecord !== "undefined" &&
    activeOfficeRecord &&
    String(activeOfficeRecord.id) === poIdStr
  ) {
    Object.assign(activeOfficeRecord, {
      bpm_name: null,
      bpm_contact: null,
      abpm_name: null,
      abpm_contact: null,
      spm_name: null,
      spm_contact: null,
      pm_name: null,
      pm_contact: null,
      pa_list: [],
      mts_list: [],
    });
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
}

function upsertLocalOfficeStaff(row) {
  upsertLocalDeliveryOffice(row);
}

function removeLocalOfficeStaff(rowOrId) {
  removeLocalDeliveryOffice(rowOrId);
}

// --- DATA FETCHING & STATS ---
async function fetchAllPostOffices(forceSync = false) {
  if (!forceSync) {
    if (cachedPostOffices && cachedPostOffices.length > 0) {
      const runInBg =
        window.requestIdleCallback || ((cb) => setTimeout(cb, 300));
      runInBg(() => {
        fetchFromServerBackground(false);
        if (navigator.onLine) initRealtimeSync();
      });
      return true;
    }

    loadOfficeStaffFromCache();
    const cachedDataString = localStorage.getItem("dakmitra_offline_db");
    if (cachedDataString) {
      try {
        cachedPostOffices = JSON.parse(cachedDataString);
        hydrateAllCachedPostOffices();
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

      const hasNormalizedPoCache =
        cachedPostOffices.length > 0 &&
        cachedPostOffices.every(
          (row) =>
            row &&
            row.office_id !== undefined &&
            row.office_id !== null &&
            Object.prototype.hasOwnProperty.call(row, "inserted_at") &&
            Object.prototype.hasOwnProperty.call(row, "address_updated_at")
        );

      const hasLocalPoCache =
        Boolean(localStorage.getItem("dakmitra_offline_db")) &&
        hasNormalizedPoCache;
      const hasLocalOfficesCache =
        localStorage.getItem(DELIVERY_OFFICES_CACHE_KEY) !== null &&
        cachedDeliveryOffices.length > 0;
      const hasLocalBranchStaffCache =
        localStorage.getItem(BRANCH_OFFICE_STAFF_CACHE_KEY) !== null;

      const needDeliveryOffices =
        force ||
        !hasLocalOfficesCache ||
        !serverMeta ||
        serverMeta.delivery_offices === undefined ||
        localMeta.delivery_offices !== serverMeta.delivery_offices;

      const needPostOffices =
        force ||
        !hasLocalPoCache ||
        !serverMeta ||
        serverMeta.post_offices === undefined ||
        localMeta.post_offices !== serverMeta.post_offices;

      const needBranchStaff =
        force ||
        !hasLocalBranchStaffCache ||
        !serverMeta ||
        serverMeta.branch_office_staff === undefined ||
        localMeta.branch_office_staff !== serverMeta.branch_office_staff;

      const updatedMeta = { ...localMeta };

      // 1. Always sync delivery_offices BEFORE post_offices so office_id hydration has fresh Office/Pin
      if (needDeliveryOffices) {
        const officesOk = await fetchDeliveryOfficesBackground(
          !needPostOffices
        );
        if (
          officesOk &&
          serverMeta &&
          serverMeta.delivery_offices !== undefined
        ) {
          updatedMeta.delivery_offices = serverMeta.delivery_offices;
        }
      }

      // 2. Sync slim post_offices rows & hydrate Office/Pin in memory
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

        const slimRows = allRows.map(serializePostOfficeRow);
        const newJson = JSON.stringify(slimRows);
        const oldJson = localStorage.getItem("dakmitra_offline_db");

        if (newJson !== oldJson || !hasNormalizedPoCache) {
          cachedPostOffices = slimRows;
          hydrateAllCachedPostOffices();
          localStorage.setItem("dakmitra_offline_db", newJson);
          initializeSearchAndRender(true);
        }

        if (serverMeta && serverMeta.post_offices !== undefined) {
          updatedMeta.post_offices = serverMeta.post_offices;
        }
      }

      // 3. Sync sparse branch_office_staff (~293 rows instead of 4,556)
      if (needBranchStaff) {
        const branchOk = await fetchBranchOfficeStaffBackground();
        if (
          branchOk &&
          serverMeta &&
          serverMeta.branch_office_staff !== undefined
        ) {
          updatedMeta.branch_office_staff = serverMeta.branch_office_staff;
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

// --- SMART 3-DIGIT PIN SUFFIX & DELIVERY OFFICE INDEX ---
let pinSuffixToOfficeMap = new Map();
let cachedDeliveryOfficesSummary = [];
window.activeCleanSearchQuery = "";
window.activeSmartOfficeFilter = null;

function buildPinSuffixIndex() {
  pinSuffixToOfficeMap.clear();
  cachedDeliveryOfficesSummary = [];
  if (!cachedPostOffices || cachedPostOffices.length === 0) return;

  const officesMap = new Map();

  for (let i = 0; i < cachedPostOffices.length; i++) {
    const row = cachedPostOffices[i];
    const pinStr = String(row.Pin || "").trim();
    const rawOffice = String(row.Office || "")
      .trim()
      .replace(/\s+/g, " ");

    if (/^\d{6}$/.test(pinStr) && rawOffice) {
      const suffix = pinStr.slice(-3);
      if (!pinSuffixToOfficeMap.has(suffix)) {
        pinSuffixToOfficeMap.set(suffix, rawOffice);
      }
    }

    if (rawOffice) {
      const key = normalizeOfficeKey(rawOffice);
      let entry = officesMap.get(key);
      if (!entry) {
        entry = {
          office: rawOffice,
          officeLower: rawOffice.toLowerCase(),
          officeCore: stripPostalSuffixes(rawOffice),
          officePhonetic: postalPhoneticKey(rawOffice),
          pin: pinStr,
          pinLower: pinStr.toLowerCase(),
          count: 0,
        };
        officesMap.set(key, entry);
      }
      entry.count++;
      if (!entry.pin && pinStr) {
        entry.pin = pinStr;
        entry.pinLower = pinStr.toLowerCase();
      }
    }
  }

  cachedDeliveryOfficesSummary = Array.from(officesMap.values());
}

// --- CACHED FUSE.JS INSTANCES & DEFAULT SORTED LISTS ---
const fuseInstanceCache = new Map();
let cachedDefaultRecentResults = null;
let cachedDefaultPriorityResults = null;

function clearDefaultResultsCache() {
  cachedDefaultRecentResults = null;
  cachedDefaultPriorityResults = null;
}

function clearFuseCache() {
  fuseInstanceCache.clear();
  clearDefaultResultsCache();
}

function getDefaultSortedResults(sortByRecent = false) {
  if (sortByRecent) {
    if (!cachedDefaultRecentResults) {
      cachedDefaultRecentResults = (cachedPostOffices || [])
        .map((item) => ({ item, matches: [] }))
        .sort((a, b) => compareByRecentActivity(a.item, b.item));
    }
    return cachedDefaultRecentResults;
  }
  if (!cachedDefaultPriorityResults) {
    cachedDefaultPriorityResults = (cachedPostOffices || [])
      .map((item) => ({ item, matches: [] }))
      .sort((a, b) => compareByPriorityOnly(a.item, b.item));
  }
  return cachedDefaultPriorityResults;
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
    includeMatches: false,
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

function parseTimestampMs(val) {
  if (!val) return 0;
  const ms = Date.parse(val);
  return Number.isFinite(ms) ? ms : 0;
}

function createSearchMeta(row) {
  const addrRaw = String(row.Address || "").trim();
  const offRaw = String(row.Office || "").trim();
  const officeType = detectOfficeType(addrRaw);
  const isPriority = Number(row.priority) >= 1;
  const isUnverified = isUnverifiedRecord(row);
  const effectivePriority = getEffectivePriority(row);
  const recentActivityTs = Math.max(
    parseTimestampMs(row.inserted_at),
    parseTimestampMs(row.address_updated_at)
  );
  const numericId =
    row.id !== undefined && row.id !== null && row.id !== ""
      ? Number(row.id)
      : NaN;

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
    isUnverified,
    effectivePriority,
    recentActivityTs,
    numericId,
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

const _rowRecentTsCache = new WeakMap();
let _searchIndexWarmSeq = 0;

function getRowRecentTs(row) {
  if (!row) return 0;
  let ts = _rowRecentTsCache.get(row);
  if (ts !== undefined) return ts;
  ts = Math.max(
    parseTimestampMs(row.inserted_at),
    parseTimestampMs(row.address_updated_at)
  );
  _rowRecentTsCache.set(row, ts);
  return ts;
}

function warmSearchIndexInBackground() {
  const seq = ++_searchIndexWarmSeq;
  const rows = cachedPostOffices;
  if (!rows || rows.length === 0) return;

  let i = 0;
  const CHUNK_SIZE = 350;
  const schedule = window.requestIdleCallback
    ? (fn) => window.requestIdleCallback(fn, { timeout: 120 })
    : (fn) => setTimeout(fn, 16);

  function step() {
    if (seq !== _searchIndexWarmSeq || rows !== cachedPostOffices) return;
    const end = Math.min(i + CHUNK_SIZE, rows.length);
    for (; i < end; i++) {
      const row = rows[i];
      if (row && row.id !== undefined && row.id !== null) {
        const key = String(row.id);
        if (!searchIndexMap.has(key)) {
          searchIndexMap.set(key, createSearchMeta(row));
        }
      }
    }
    if (i < rows.length) schedule(step);
  }

  schedule(step);
}

function buildSearchIndex() {
  clearFuseCache();
  searchIndexMap.clear();
  warmSearchIndexInBackground();
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

function compareByRecentActivity(aRow, bRow) {
  const timeDiff = getRowRecentTs(bRow) - getRowRecentTs(aRow);
  if (timeDiff !== 0) return timeDiff;

  const aId = Number(aRow?.id);
  const bId = Number(bRow?.id);
  if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) {
    return bId - aId;
  }

  return String(aRow?.Address || "").localeCompare(String(bRow?.Address || ""));
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

  clearFuseCache();

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

    const rawPrio = Number(row.priority);
    const officeType = detectOfficeType(row.Address);
    const normalizedPrio = officeType
      ? rawPrio >= 1
        ? 1
        : 0
      : rawPrio >= 1
      ? 1
      : rawPrio === -1
      ? -1
      : 0;

    grouped[officeKey].addresses.push({
      id: row.id,
      Address: row.Address || "",
      Office: grouped[officeKey].office,
      Pin: row.Pin || "",
      officeType,
      priority: normalizedPrio,
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
    const slimRows = cachedPostOffices.map(serializePostOfficeRow);
    localStorage.setItem("dakmitra_offline_db", JSON.stringify(slimRows));
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

  const incoming = hydratePostOfficeRow({ ...row });
  const slimIncoming = serializePostOfficeRow(incoming);
  hydratePostOfficeRow(slimIncoming);

  const idx = cachedPostOffices.findIndex(
    (r) => String(r.id) === String(slimIncoming.id)
  );
  if (idx > -1) {
    const prevRow = cachedPostOffices[idx];
    const mergedRow = {
      ...prevRow,
      ...slimIncoming,
      inserted_at:
        "inserted_at" in row ? slimIncoming.inserted_at : prevRow.inserted_at,
      address_updated_at:
        "address_updated_at" in row
          ? slimIncoming.address_updated_at
          : prevRow.address_updated_at,
      priority: "priority" in row ? slimIncoming.priority : prevRow.priority,
    };
    hydratePostOfficeRow(mergedRow);

    if (isRowDataUnchanged(prevRow, mergedRow)) {
      return;
    }

    const coreAddressChanged =
      mergedRow.Address !== prevRow.Address ||
      Number(mergedRow.office_id) !== Number(prevRow.office_id) ||
      mergedRow.Office !== prevRow.Office;

    if (coreAddressChanged && !("address_updated_at" in row)) {
      mergedRow.address_updated_at = new Date().toISOString();
    }
    if (
      (coreAddressChanged &&
        !("priority" in row) &&
        Number(prevRow.priority) === -1) ||
      (detectOfficeType(mergedRow.Address) && Number(mergedRow.priority) === -1)
    ) {
      mergedRow.priority = 0;
    }
    cachedPostOffices[idx] = mergedRow;
    updateSearchIndexRow(cachedPostOffices[idx]);
  } else {
    const newRow = hydratePostOfficeRow({
      ...slimIncoming,
      priority: "priority" in row ? slimIncoming.priority : 0,
      inserted_at: slimIncoming.inserted_at ?? new Date().toISOString(),
      address_updated_at:
        "address_updated_at" in row ? slimIncoming.address_updated_at : null,
    });
    cachedPostOffices.push(newRow);
    updateSearchIndexRow(newRow);
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

    clearFuseCache();

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
  const dirView = document.getElementById("view-directory");
  if (!dirView || !dirView.classList.contains("active")) {
    directoryGroupedData = [];
    directoryGroupByKeyMap.clear();
    return;
  }

  buildDirectoryGroupedData();

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
let superadminAlertsChannel = null;

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
      { event: "INSERT", schema: "public", table: "delivery_offices" },
      (payload) => {
        upsertLocalDeliveryOffice(payload.new);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "delivery_offices" },
      (payload) => {
        upsertLocalDeliveryOffice(payload.new);
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "delivery_offices" },
      (payload) => {
        if (payload.old) removeLocalDeliveryOffice(payload.old);
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "branch_office_staff" },
      (payload) => {
        upsertLocalBranchOfficeStaff(payload.new);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "branch_office_staff" },
      (payload) => {
        upsertLocalBranchOfficeStaff(payload.new);
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "branch_office_staff" },
      (payload) => {
        if (payload.old) removeLocalBranchOfficeStaff(payload.old);
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
            const shouldAlert = Boolean(devMismatch && payload.new.device_id);
            forceLogoutBlockedUser(
              blocked || devMismatch,
              shouldAlert
                ? {
                    eventType: "SESSION_LOCKED",
                    email: payload.new.email || null,
                    source: "realtime",
                  }
                : null
            );
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
  initSuperadminAlertsRealtime();
}

let realtimePauseTimer = null;
let realtimePausedAt = 0;
const REALTIME_BG_PAUSE_MS = 90 * 1000; // Pause idle Realtime after 90s in background
const VISIBILITY_SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5-minute cooldown when Realtime stayed live
const LONG_PAUSE_HYDRATE_MS = 15 * 60 * 1000; // Re-verify session/device lock after 15+ min away

function initSuperadminAlertsRealtime() {
  if (
    !isCurrentUserSuperadmin ||
    !supabaseClient ||
    superadminAlertsChannel ||
    !navigator.onLine
  ) {
    return;
  }

  superadminAlertsChannel = supabaseClient
    .channel("dakmitra-superadmin-alerts")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "auth_alerts" },
      (payload) => {
        if (typeof handleSuperadminAlertRealtimeEvent === "function") {
          handleSuperadminAlertRealtimeEvent(payload);
        }
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        if (superadminAlertsChannel && supabaseClient) {
          supabaseClient.removeChannel(superadminAlertsChannel);
          superadminAlertsChannel = null;
        }
      }
    });
}

function teardownRealtimeSync() {
  clearTimeout(realtimePauseTimer);
  realtimePauseTimer = null;
  if (realtimeChannel && supabaseClient) {
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  if (superadminAlertsChannel && supabaseClient) {
    supabaseClient.removeChannel(superadminAlertsChannel);
    superadminAlertsChannel = null;
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
        const alertMeta = blocked
          ? {
              eventType: "ACCOUNT_BLOCKED",
              email: session.user.email,
              source: "reconnect",
            }
          : profileData.device_id
          ? {
              eventType: "SESSION_LOCKED",
              email: session.user.email,
              source: "reconnect",
            }
          : null;
        await forceLogoutBlockedUser(blocked || devMismatch, alertMeta);
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

    initRealtimeSync();
    if (isCurrentUserSuperadmin) {
      if (typeof refreshSuperadminAlertsBadge === "function") {
        refreshSuperadminAlertsBadge();
      }
      if (typeof refreshSuperadminPendingBadge === "function") {
        refreshSuperadminPendingBadge();
      }
    }

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
      if (
        isCurrentUserSuperadmin &&
        typeof refreshSuperadminAlertsBadge === "function"
      ) {
        refreshSuperadminAlertsBadge();
      }
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

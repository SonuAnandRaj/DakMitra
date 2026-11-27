// =========================================================
// 02-UTILS.JS — Helpers, Storage, Network, Toasts & Dialogs
// =========================================================

// --- LAZY XLSX LOADER ---
let xlsxLoadPromise = null;
function ensureXLSXLoaded() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxLoadPromise) {
    xlsxLoadPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js";
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => {
        xlsxLoadPromise = null;
        reject(new Error("Failed to load Excel library."));
      };
      document.head.appendChild(s);
    });
  }
  return xlsxLoadPromise;
}

// --- SAFE STORAGE & ESCAPING ---
function getSafeStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch (e) {
    console.warn(`Resetting corrupted storage for ${key}`);
    return [];
  }
}

function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeForOnclick(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// --- BACKGROUND "LIE-FI" DETECTOR (Use ONLY for silent reconnect / wake-up) ---
async function checkActualInternet(timeoutMs = 2500) {
  if (!navigator.onLine) return false;

  const probe = async (url) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await fetch(url, {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-store",
        signal: controller.signal,
      });
      return true;
    } catch (_) {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  if (await probe("https://clients3.google.com/generate_204")) return true;
  if (typeof SUPABASE_URL === "string" && SUPABASE_URL) {
    return await probe(SUPABASE_URL);
  }
  return false;
}

function isNetworkError(err) {
  if (!navigator.onLine) return true;
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("err_internet") ||
    msg.includes("err_name_not_resolved") ||
    msg.includes("aborted")
  );
}

// --- UNIFIED OFFLINE TOAST & CHECK HELPER ---
let lastOfflineToastTime = 0;
let hasShownPassiveOfflineToast = false;

window.addEventListener("online", () => {
  hasShownPassiveOfflineToast = false;
});

function showOfflineToast(
  extraMsg = "Using cached version.",
  isActiveAction = false
) {
  if (!isActiveAction && hasShownPassiveOfflineToast) return;

  const now = Date.now();
  if (now - lastOfflineToastTime < 2000) return;
  lastOfflineToastTime = now;

  if (!isActiveAction) hasShownPassiveOfflineToast = true;
  showToast(`📴 No internet connection. ${extraMsg}`);
}

// For DB writes/actions: block if offline, and ensure Supabase SDK is ready after an offline boot
async function ensureOnline(
  offlineMsg = "Using cached version.",
  isActiveAction = true
) {
  if (!navigator.onLine) {
    showOfflineToast(offlineMsg, isActiveAction);
    return false;
  }
  hasShownPassiveOfflineToast = false;
  try {
    const client = await ensureSupabaseReady();
    if (!client) {
      showOfflineToast(offlineMsg, isActiveAction);
      return false;
    }
  } catch (_) {
    showOfflineToast(offlineMsg, isActiveAction);
    return false;
  }
  return true;
}

// --- SEMANTIC FROSTED-GLASS TOASTS ---

let toastTimer = null;
let toastRafId = null;
let toastClickBound = false;

function hideToast() {
  clearTimeout(toastTimer);
  toastTimer = null;
  if (toastRafId !== null) {
    cancelAnimationFrame(toastRafId);
    toastRafId = null;
  }
  const toastEl = document.getElementById("toast");
  if (toastEl) toastEl.classList.remove("show");
}

function detectToastType(message) {
  const msg = String(message || "");
  if (
    /[✅🎉✨📥📋✉️]|\b(success|saved|updated|copied|exported|added|created|up to date)\b/i.test(
      msg
    )
  ) {
    return "success";
  }
  if (
    /[❌🗑️]|\b(error|failed|deleted|removed|denied|expired|invalid)\b/i.test(
      msg
    )
  ) {
    return "error";
  }
  if (
    /[⚠️📴⭐⏹️]|\b(offline|no internet|warning|stopped|please|not found)\b/i.test(
      msg
    )
  ) {
    return "warning";
  }
  return "info";
}

function showToast(message, type = null) {
  const toastEl = document.getElementById("toast");
  if (!toastEl) return;

  if (!toastClickBound) {
    toastClickBound = true;
    toastEl.addEventListener("click", hideToast);
  }

  clearTimeout(toastTimer);
  toastTimer = null;
  if (toastRafId !== null) {
    cancelAnimationFrame(toastRafId);
    toastRafId = null;
  }

  const resolvedType = type || detectToastType(message);
  toastEl.className = `toast toast-${resolvedType}`;
  toastEl.textContent = message;

  toastRafId = requestAnimationFrame(() => {
    toastRafId = null;
    toastEl.classList.add("show");
    toastTimer = setTimeout(hideToast, 3000);
  });

  if (navigator.vibrate) {
    navigator.vibrate(resolvedType === "error" ? [40, 40, 40] : 50);
  }
}

// --- UNIFIED BUTTON LOADING / SUCCESS STATE HELPER ---
function setButtonState(btn, state, label = "") {
  if (!btn) return;
  if (!btn.dataset.originalHtml) {
    btn.dataset.originalHtml = btn.innerHTML;
  }

  btn.classList.remove("is-loading", "is-success");

  if (state === "loading") {
    btn.disabled = true;
    btn.classList.add("is-loading");
    btn.innerHTML = `<div class="btn-spinner"></div><span>${escapeHTML(
      label || "Working..."
    )}</span>`;
  } else if (state === "success") {
    btn.disabled = true;
    btn.classList.add("is-success");
    btn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline class="checkmark-path" points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>${escapeHTML(label || "Done!")}</span>
    `;
  } else {
    btn.disabled = false;
    btn.innerHTML = label || btn.dataset.originalHtml;
  }
}

// --- SHARED FAVORITE BUTTON STYLE HELPER ---
function getFavoriteBtnStyles(isFav, isTable = false) {
  const starIcon = isFav
    ? `${ICON_STAR_FILLED} Saved`
    : `${ICON_STAR_OUTLINE} Save`;
  const iconOnly = isFav ? ICON_STAR_FILLED : ICON_STAR_OUTLINE;

  return {
    icon: isTable ? iconOnly : starIcon,
    style: isFav
      ? `color: #f59e0b; background-color: rgba(245, 158, 11, 0.1); display: ${
          isTable ? "inline-flex" : "flex"
        }; align-items: center; justify-content: center; gap: 4px;`
      : `color: var(--text-light); background-color: var(--input-bg); display: ${
          isTable ? "inline-flex" : "flex"
        }; align-items: center; justify-content: center; gap: 4px;`,
  };
}

// --- CUSTOM CONFIRM & ALERT MODALS ---
function showCustomConfirm(title, message, confirmText, onConfirmCallback) {
  document.getElementById("confirm-modal-title").textContent = title;
  document.getElementById("confirm-modal-message").textContent = message;
  const submitBtn = document.getElementById("confirm-modal-submit");
  submitBtn.textContent = confirmText;

  const newSubmitBtn = submitBtn.cloneNode(true);
  submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);

  newSubmitBtn.addEventListener("click", () => {
    closeConfirmModal();
    onConfirmCallback();
  });
  document.getElementById("confirm-modal-overlay").classList.add("show");
}

function closeConfirmModal() {
  document.getElementById("confirm-modal-overlay").classList.remove("show");
}

function showCustomAlert(title, message, icon = "⚠️") {
  document.getElementById("alert-modal-icon").textContent = icon;
  document.getElementById("alert-modal-title").textContent = title;
  document.getElementById("alert-modal-message").textContent = message;
  document.getElementById("alert-modal-overlay").classList.add("show");

  if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
}

function closeAlertModal() {
  document.getElementById("alert-modal-overlay").classList.remove("show");
}

// Override browser's default alert with the custom modal
window.alert = function (message) {
  showCustomAlert("System Alert", message, "🔔");
};

// --- SHARED AUTOCOMPLETE DROPDOWN TIMERS ---
let dropdownCloseTimer = null;

function scheduleCloseDropdowns(delay = 200) {
  clearTimeout(dropdownCloseTimer);
  dropdownCloseTimer = setTimeout(() => {
    closeAllDropdowns();
  }, delay);
}

function cancelCloseDropdowns() {
  clearTimeout(dropdownCloseTimer);
  dropdownCloseTimer = null;
}

function closeAllDropdowns() {
  document
    .querySelectorAll(".autocomplete-dropdown.show")
    .forEach((el) => el.classList.remove("show"));
}
// --- UNIFIED POSTAL PHONETIC KEY (EXACT 1:1 PORT OF SUPABASE public.postal_phonetic_key) ---
const _phoneticKeyCache = new Map();

function postalPhoneticKey(addr) {
  if (addr === null || addr === undefined) return "";
  const input = String(addr);
  if (_phoneticKeyCache.has(input)) return _phoneticKeyCache.get(input);

  // 1. Lowercase, remove dots, and strip standalone BO/SO/HO/PO/Village tags
  let s = input.replace(/\./g, "").toLowerCase();
  s = s.replace(/\b(bo|so|ho|po|village|vill|gram)\b/gi, "");

  // 2. Normalize common suffix spellings (Kalan/Kalna -> Kala, Gawn/Gawan/Ganw -> Gaon)
  s = s.replace(/\b(kalan|kalna)\b/gi, "kala");
  s = s.replace(/(gawn|gawan|ganw|gaon)\b/gi, "gaon");

  // 3. Remove all spaces, hyphens, and non-alphanumeric characters
  s = s.replace(/[^a-z0-9]/g, "");

  // 4. Normalize Hindi consonant transliterations
  s = s
    .replace(/chh/g, "c")
    .replace(/ch/g, "c")
    .replace(/kh/g, "k")
    .replace(/gh/g, "g")
    .replace(/th/g, "t")
    .replace(/dh/g, "d")
    .replace(/sh/g, "s")
    .replace(/w/g, "v")
    .replace(/d/g, "r");

  // 5. Normalize vowel variations
  s = s
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/aa/g, "a")
    .replace(/iya/g, "ia")
    .replace(/ue/g, "i")
    .replace(/ui/g, "i")
    .replace(/ai/g, "e")
    .replace(/au/g, "o");

  // 6. Normalize trailing nasal 'n' or silent 'h' after 'a'
  s = s.replace(/a[nh]$/, "a");

  // 7. Remove internal schwa 'a' vowels while preserving first and last character
  if (s.length > 2) {
    s = s[0] + s.slice(1, -1).replace(/a/g, "") + s[s.length - 1];
  }

  // 8. Collapse consecutive duplicate letters (e.g. Bichchhi -> Bici)
  s = s.replace(/(.)\1+/g, "$1");

  if (_phoneticKeyCache.size > 5000) _phoneticKeyCache.clear();
  _phoneticKeyCache.set(input, s);
  return s;
}

// --- SHARED OFFICE TYPE & EFFECTIVE PRIORITY HELPERS ---
function detectOfficeType(address) {
  if (!address) return null;
  const clean = String(address).replace(/\./g, "");
  if (/\b(HO|GPO)\b/i.test(clean)) return "HO";
  if (/\bSO\b/i.test(clean)) return "SO";
  if (/\b(BO|EDBO)\b/i.test(clean)) return "BO";
  return null;
}

function isSelfParentOfficeRow(address, office) {
  const ot = detectOfficeType(address);
  if (ot !== "HO" && ot !== "SO") return false;
  const norm = (v) =>
    String(v || "")
      .replace(/\./g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  const a = norm(address);
  const o = norm(office);
  return Boolean(a && o && a === o);
}

function stripPostalSuffixes(text) {
  if (!text) return "";
  return String(text)
    .replace(/\./g, "")
    .toLowerCase()
    .replace(/\b(edbo|gpo|bo|so|ho|po|village|vill|gram)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isUnverifiedRecord(row) {
  if (!row) return false;
  if (detectOfficeType(row.Address)) return false;
  return Number(row.priority) === -1;
}

/**
 * Effective Priority Tiers (higher = ranks first):
 * 5 = HO / SO (Automatic top, always verified)
 * 4 = BO + manually marked Priority (breaks ties between same-name BOs)
 * 3 = BO (Automatic above regular villages, always verified)
 * 2 = Non-BO village manually marked Priority (always verified)
 * 1 = Verified Regular village (priority = 0)
 * 0 = Unverified Regular village (priority = -1)
 */
function getEffectivePriority(row) {
  if (!row) return 0;
  const officeType = detectOfficeType(row.Address);
  const prio = Number(row.priority);
  if (officeType === "HO" || officeType === "SO") return 5;
  if (officeType === "BO") return prio >= 1 ? 4 : 3;
  if (prio >= 1) return 2;
  if (prio === -1) return 0;
  return 1;
}

function generateUploadBatchId(uploadType = "bulk_same_office") {
  const prefix =
    uploadType === "excel_bulk"
      ? "EXL"
      : uploadType === "quick_add"
      ? "QAD"
      : "BLK";
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  let rand = "";
  if (window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint8Array(2);
    window.crypto.getRandomValues(bytes);
    rand = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  } else {
    rand = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "X");
  }
  return `${prefix}-${y}${m}${d}-${rand}`;
}

async function createUploadBatchRecord({
  uploadType,
  description = "",
  fileName = null,
  targetOffice = null,
  rowCount = 0,
  userId,
}) {
  const cleanDesc =
    String(description || "")
      .trim()
      .slice(0, 160) || null;
  const batchId = generateUploadBatchId(uploadType);

  const { error } = await supabaseClient.from("upload_batches").insert({
    id: batchId,
    upload_type: uploadType,
    description: cleanDesc,
    file_name: fileName || null,
    target_office: targetOffice || null,
    row_count: Math.max(0, Number(rowCount) || 0),
    created_by: userId,
  });

  if (error) throw error;
  return { id: batchId, description: cleanDesc };
}

// --- SHARED BULK ADDRESS PARSER & LIVE DUPLICATE PREVIEW ---
function parseDelimitedAddresses(rawText) {
  const seen = new Set();
  const list = [];

  String(rawText || "")
    .split(/[\n,]+| {2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((addr) => {
      const key = addr.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push(addr);
      }
    });

  return list;
}

function renderBulkAddressPreview({
  addresses,
  officeName,
  priority = 0,
  boxId,
  countElId,
  chipsElId,
  removeFnName,
}) {
  const box = document.getElementById(boxId);
  const countEl = document.getElementById(countElId);
  const chipsEl = document.getElementById(chipsElId);

  if (!addresses || addresses.length === 0) {
    box?.classList.add("hidden");
    return { count: 0, dupCount: 0 };
  }

  const officeLower = String(officeName || "")
    .trim()
    .toLowerCase();
  const existingExact = new Map();
  const existingPhonetic = new Map();

  if (officeLower && Array.isArray(cachedPostOffices)) {
    cachedPostOffices.forEach((r) => {
      if (
        String(r.Office || "")
          .trim()
          .toLowerCase() === officeLower
      ) {
        const rawAddr = String(r.Address || "").trim();
        existingExact.set(rawAddr.toLowerCase(), rawAddr);
        const pKey = postalPhoneticKey(rawAddr);
        if (pKey && !existingPhonetic.has(pKey)) {
          existingPhonetic.set(pKey, rawAddr);
        }
      }
    });
  }

  let dupCount = 0;
  if (chipsEl) {
    chipsEl.innerHTML = addresses
      .map((addr, idx) => {
        const matchedName =
          existingExact.get(addr.toLowerCase()) ||
          existingPhonetic.get(postalPhoneticKey(addr)) ||
          null;
        const isDup = Boolean(matchedName);
        if (isDup) dupCount++;
        const prefix = isDup ? "⚠️ " : priority === 1 ? "⚡ " : "";
        return `
          <span class="bulk-chip ${isDup ? "is-duplicate" : ""}" title="${
          isDup ? `Similar to existing: ${escapeHTML(matchedName)}` : ""
        }">
            ${prefix}${escapeHTML(addr)}
            <button type="button" onclick="${removeFnName}(${idx})" title="Remove">✕</button>
          </span>`;
      })
      .join("");
  }

  if (countEl) {
    countEl.textContent = `${addresses.length} ${
      addresses.length === 1 ? "address" : "addresses"
    } ready${priority === 1 ? " (⚡ Priority)" : ""}${
      dupCount > 0 ? ` • ${dupCount} already in DB` : ""
    }`;
  }

  box?.classList.remove("hidden");
  return { count: addresses.length, dupCount };
}

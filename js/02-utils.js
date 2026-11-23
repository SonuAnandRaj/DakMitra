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
  if (!str) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;");
}

// --- ULTRA-FAST "LIE-FI" INTERNET DETECTOR ---
async function checkActualInternet() {
  if (!navigator.onLine) return false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    await fetch("https://clients3.google.com/generate_204", {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return true;
  } catch (e) {
    return false;
  }
}

// --- UNIFIED OFFLINE TOAST & CHECK HELPER ---
let lastOfflineToastTime = 0;
let hasShownPassiveOfflineToast = false;

window.addEventListener("online", () => {
  hasShownPassiveOfflineToast = false;
});

function showOfflineToast(
  extraMsg = "Using cached version.",
  isActiveAction = false,
) {
  if (!isActiveAction && hasShownPassiveOfflineToast) return;

  const now = Date.now();
  if (now - lastOfflineToastTime < 2000) return;
  lastOfflineToastTime = now;

  if (!isActiveAction) hasShownPassiveOfflineToast = true;
  showToast(`📴 No internet connection. ${extraMsg}`);
}

async function ensureOnline(
  offlineMsg = "Using cached version.",
  isActiveAction = true,
) {
  const online = await checkActualInternet();
  if (!online) {
    showOfflineToast(offlineMsg, isActiveAction);
    return false;
  }
  hasShownPassiveOfflineToast = false;
  return true;
}

// --- SEMANTIC FROSTED-GLASS TOASTS ---
let toastTimer = null;

function detectToastType(message) {
  const msg = String(message || "");
  if (
    /[✅🎉✨📥📋✉️]|\b(success|saved|updated|copied|exported|added|created|up to date)\b/i.test(
      msg,
    )
  ) {
    return "success";
  }
  if (
    /[❌🗑️]|\b(error|failed|deleted|removed|denied|expired|invalid)\b/i.test(
      msg,
    )
  ) {
    return "error";
  }
  if (
    /[⚠️📴⭐⏹️]|\b(offline|no internet|warning|stopped|please|not found)\b/i.test(
      msg,
    )
  ) {
    return "warning";
  }
  return "info";
}

function showToast(message, type = null) {
  const toastEl = document.getElementById("toast");
  if (!toastEl) return;
  clearTimeout(toastTimer);

  const resolvedType = type || detectToastType(message);
  toastEl.className = `toast toast-${resolvedType}`;
  toastEl.textContent = message;

  requestAnimationFrame(() => toastEl.classList.add("show"));
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3000);

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
      label || "Working...",
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

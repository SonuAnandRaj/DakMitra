// =========================================================
// 06-SEARCH-AI.JS — Search, Filters, Voice/TTS, AI & Export
// =========================================================

// --- VIEW MODE & FILTER CONTROLS ---
function setViewMode(mode, shouldRender = true) {
  viewMode = mode;
  document
    .getElementById("view-list-btn")
    .classList.toggle("active", mode === "list");
  document
    .getElementById("view-table-btn")
    .classList.toggle("active", mode === "table");
  document
    .getElementById("view-mode-switch")
    ?.classList.toggle("is-table", mode === "table");
  if (shouldRender) renderResults();
}

function toggleAdvancedFilters() {
  document.getElementById("advanced-filters-panel").classList.toggle("hidden");
}

function toggleClearBtn(inputId, btnId) {
  const input = document.getElementById(inputId);
  const clearBtn = document.getElementById(btnId);
  if (input.value.length > 0) clearBtn.classList.remove("hidden");
  else clearBtn.classList.add("hidden");
}

function clearFilterInput(inputId, btnId) {
  const input = document.getElementById(inputId);
  input.value = "";
  document.getElementById(btnId).classList.add("hidden");
  triggerSearch();

  if (inputId === "filter-office") {
    input.focus();
    handleSearchOfficeFilterInput(input);
  }
}

// --- ACTIVE SEARCH FILTER VISUAL INDICATORS ---
function updateActiveFilterIndicators() {
  const filterVal =
    document.querySelector('input[name="searchFilter"]:checked')?.value ||
    "address";
  const filterOffice =
    document.getElementById("filter-office")?.value.trim() || "";
  const filterPin = document.getElementById("filter-pin")?.value.trim() || "";

  const activeFilters = [];

  if (filterVal !== "address") {
    const labels = {
      all: "All Fields",
      office: "Office Only",
      pin: "PIN Only",
    };
    activeFilters.push({
      type: "mode",
      label: `🔍 ${labels[filterVal] || filterVal}`,
    });
  }
  if (filterOffice) {
    activeFilters.push({ type: "office", label: `🏢 ${filterOffice}` });
  }
  if (filterPin) {
    activeFilters.push({ type: "pin", label: `📍 ${filterPin}` });
  }
  if (window.activeSmartOfficeFilter) {
    activeFilters.push({
      type: "smart-office",
      label: `🏢 ${window.activeSmartOfficeFilter.office} (${window.activeSmartOfficeFilter.suffix})`,
    });
  }

  const toggleBtn = document.getElementById("advanced-filter-toggle-btn");
  const bar = document.getElementById("active-filters-bar");
  const searchWrapper = document.querySelector(
    "#view-search .search-bar-modern .search-input-wrapper"
  );

  const count = activeFilters.length;

  if (count === 0) {
    if (toggleBtn) {
      toggleBtn.classList.remove("has-active-filters");
      toggleBtn.innerHTML = "⚙️ Search Options";
    }
    if (bar) {
      bar.classList.add("hidden");
      bar.innerHTML = "";
    }
    if (searchWrapper) searchWrapper.classList.remove("has-active-filters");
    return;
  }

  if (toggleBtn) {
    toggleBtn.classList.add("has-active-filters");
    toggleBtn.innerHTML = `
        <span class="filter-pulse-dot"></span>
        <span>⚙️ Filtered</span>
        <span class="filter-count-badge">${count}</span>
      `;
  }

  if (searchWrapper) searchWrapper.classList.add("has-active-filters");

  if (bar) {
    let html = activeFilters
      .map(
        (f) => `
            <span class="active-filter-pill">
              <span>${escapeHTML(f.label)}</span>
              <button type="button" onclick="removeSingleFilter('${
                f.type
              }')" title="Remove filter">✕</button>
            </span>
          `
      )
      .join("");

    if (count > 1) {
      html += `<button type="button" class="clear-all-filters-pill" onclick="clearAllSearchFilters()">Clear all</button>`;
    }

    bar.innerHTML = html;
    bar.classList.remove("hidden");
  }
}

function removeSingleFilter(type) {
  if (type === "mode") {
    const defaultRadio = document.querySelector(
      'input[name="searchFilter"][value="address"]'
    );
    if (defaultRadio) defaultRadio.checked = true;
  } else if (type === "office") {
    const el = document.getElementById("filter-office");
    if (el) el.value = "";
    document.getElementById("clear-office-btn")?.classList.add("hidden");
  } else if (type === "pin") {
    const el = document.getElementById("filter-pin");
    if (el) el.value = "";
    document.getElementById("clear-pin-btn")?.classList.add("hidden");
  } else if (type === "smart-office") {
    const searchEl = document.getElementById("search-input");
    if (searchEl && window.activeCleanSearchQuery !== undefined) {
      searchEl.value = window.activeCleanSearchQuery;
      toggleClearBtn("search-input", "clear-search-btn");
    }
    window.activeSmartOfficeFilter = null;
  }

  triggerSearch();
}

function clearAllSearchFilters() {
  const defaultRadio = document.querySelector(
    'input[name="searchFilter"][value="address"]'
  );
  if (defaultRadio) defaultRadio.checked = true;

  const offEl = document.getElementById("filter-office");
  const pinEl = document.getElementById("filter-pin");
  if (offEl) offEl.value = "";
  if (pinEl) pinEl.value = "";

  document.getElementById("clear-office-btn")?.classList.add("hidden");
  document.getElementById("clear-pin-btn")?.classList.add("hidden");

  if (window.activeSmartOfficeFilter) {
    const searchEl = document.getElementById("search-input");
    if (searchEl) {
      searchEl.value = window.activeCleanSearchQuery || "";
      toggleClearBtn("search-input", "clear-search-btn");
    }
    window.activeSmartOfficeFilter = null;
  }

  triggerSearch();
  showToast("🧹 All search filters cleared");
}

// --- RECENT SEARCH HISTORY ---
function loadSearchHistory() {
  const history = getSafeStorage(HISTORY_KEY);
  const targets = [
    {
      toggleBtn: document.getElementById("history-toggle-btn"),
      chipsDiv: document.getElementById("search-history-chips"),
      handler: "applyHistorySearch",
    },
    {
      toggleBtn: document.getElementById("dir-history-toggle-btn"),
      chipsDiv: document.getElementById("dir-search-history-chips"),
      handler: "applyDirectoryHistorySearch",
    },
  ];

  targets.forEach(({ toggleBtn, chipsDiv, handler }) => {
    if (history.length === 0) {
      toggleBtn?.classList.add("hidden");
      if (chipsDiv) chipsDiv.innerHTML = "";
      return;
    }

    toggleBtn?.classList.remove("hidden");
    if (chipsDiv) {
      chipsDiv.innerHTML = history
        .map(
          (term) =>
            `<button type="button" class="badge" style="cursor: pointer;" onclick="${handler}('${escapeForOnclick(
              term
            )}')">${escapeHTML(term)}</button>`
        )
        .join("");
    }
  });
}

function toggleSearchHistory() {
  document.getElementById("search-history-panel").classList.toggle("hidden");
}

function applyHistorySearch(term) {
  document.getElementById("search-input").value = term;
  document.getElementById("clear-search-btn").classList.remove("hidden");
  document.getElementById("search-history-panel").classList.add("hidden");
  triggerSearch();
}

function saveSearchTerm(term) {
  if (!term || term.trim().length < 3) return;
  let history = getSafeStorage(HISTORY_KEY);
  const newTermLower = term.toLowerCase().trim();

  history = history.filter((t) => t.toLowerCase() !== newTermLower);
  if (history.length > 0) {
    const lastTermLower = history[0].toLowerCase();
    if (
      newTermLower.startsWith(lastTermLower) ||
      lastTermLower.startsWith(newTermLower)
    ) {
      history[0] = term.trim();
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      loadSearchHistory();
      return;
    }
  }

  history.unshift(term.trim());
  if (history.length > 5) history.pop();
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  loadSearchHistory();
}

// --- VOICE SEARCH & INDIAN-ACCENT TTS ---
let preferredIndianVoice = null;

function loadIndianVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return;
  preferredIndianVoice =
    voices.find((v) => v.lang.includes("en-IN") || v.name.includes("India")) ||
    voices.find((v) => v.lang.includes("hi-IN"));
}
loadIndianVoice();
if (window.speechSynthesis.onvoiceschanged !== undefined) {
  window.speechSynthesis.onvoiceschanged = loadIndianVoice;
}

function convertToHindiWords(numStr) {
  const num = parseInt(numStr, 10);
  if (isNaN(num)) return numStr;

  const ones = [
    "",
    "ek",
    "do",
    "teen",
    "chaar",
    "paanch",
    "chhe",
    "saat",
    "aath",
    "nau",
    "das",
    "gyarah",
    "baarah",
    "terah",
    "chaudah",
    "pandraH",
    "solah",
    "satraH",
    "atharah",
    "unnis",
  ];
  const tens = [
    "",
    "",
    "bees",
    "tees",
    "chaalis",
    "pachaas",
    "saath",
    "sattar",
    "assi",
    "nabbe",
  ];

  if (num < 20) return ones[num];
  if (num < 100) {
    return (
      tens[Math.floor(num / 10)] + (num % 10 !== 0 ? " " + ones[num % 10] : "")
    );
  }
  if (num < 1000) {
    const s = Math.floor(num / 100);
    const rem = num % 100;
    return ones[s] + " sau" + (rem !== 0 ? " " + convertToHindiWords(rem) : "");
  }
  return numStr;
}

let activeVoiceMeta = null;

function stopActiveVoiceSearch() {
  window.speechSynthesis.cancel();
  if (window.activeRecognition) {
    try {
      window.activeRecognition.abort();
    } catch (_) {}
    window.activeRecognition = null;
  }
  if (activeVoiceMeta) {
    const btn = document.getElementById(activeVoiceMeta.micBtnId);
    const input = document.getElementById(activeVoiceMeta.inputId);
    if (btn) {
      btn.classList.remove("listening");
      btn.style.color = "";
    }
    if (input && activeVoiceMeta.defaultPlaceholder) {
      input.placeholder = activeVoiceMeta.defaultPlaceholder;
    }
    activeVoiceMeta = null;
  }
}

function toggleVoiceInput({
  micBtnId,
  inputId,
  clearBtnId,
  defaultPlaceholder,
  onTranscript,
}) {
  const micBtn = document.getElementById(micBtnId);
  const inputEl = document.getElementById(inputId);
  if (!micBtn || !inputEl) return;

  const isSpeaking =
    window.speechSynthesis.speaking || window.speechSynthesis.pending;
  const isListeningSame =
    Boolean(window.activeRecognition) && activeVoiceMeta?.micBtnId === micBtnId;

  if (isSpeaking || isListeningSame) {
    stopActiveVoiceSearch();
    return;
  }

  // Stop any other mic instance before starting this one
  if (window.activeRecognition) {
    stopActiveVoiceSearch();
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return alert("Browser doesn't support voice search.");

  const recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  window.activeRecognition = recognition;
  activeVoiceMeta = { micBtnId, inputId, defaultPlaceholder };

  recognition.onstart = () => {
    micBtn.classList.add("listening");
    inputEl.placeholder = "Listening...";
    inputEl.value = "";
  };
  recognition.onresult = (event) => {
    if (event.results?.[0]?.[0]) {
      const transcript = event.results[0][0].transcript.replace(/\.$/, "");
      inputEl.value = transcript;
      document.getElementById(clearBtnId)?.classList.remove("hidden");
      if (typeof onTranscript === "function") onTranscript(transcript);
    }
  };
  recognition.onend = () => {
    micBtn.classList.remove("listening");
    micBtn.style.color = "";
    inputEl.placeholder = defaultPlaceholder;
    if (window.activeRecognition === recognition) {
      window.activeRecognition = null;
      activeVoiceMeta = null;
    }
  };
  recognition.start();
}

function startVoiceSearch() {
  toggleVoiceInput({
    micBtnId: "mic-btn",
    inputId: "search-input",
    clearBtnId: "clear-search-btn",
    defaultPlaceholder: "Type address, office, or Pin...",
    onTranscript: () => {
      window.isVoiceSearch = true;
      triggerSearch();
    },
  });
}

// --- CORE SEARCH EXECUTION & RENDERING ---
// Helper: Computes highlight indices so phonetic matches underline cleanly in List/Table views
function findPhoneticMatchIndices(originalText, qKey) {
  const text = String(originalText || "");
  if (!text || !qKey) return [];

  const coreText = text.replace(
    /\s+\b(?:e\.?d\.?b\.?o\.?|g\.?p\.?o\.?|b\.?o\.?|s\.?o\.?|h\.?o\.?|p\.?o\.?)\b\.?$/i,
    ""
  );

  // Full address/office phonetic match -> highlight full core name (excluding BO/SO/HO)
  if (coreText && postalPhoneticKey(coreText) === qKey) {
    return [[0, coreText.length - 1]];
  }

  // Word-level phonetic match -> highlight the matching word
  const wordRegex = /\S+/g;
  let m;
  while ((m = wordRegex.exec(text)) !== null) {
    const wKey = postalPhoneticKey(m[0]);
    if (wKey && (wKey === qKey || wKey.startsWith(qKey))) {
      return [[m.index, m.index + m[0].length - 1]];
    }
  }

  return coreText ? [[0, coreText.length - 1]] : [];
}

// Evaluates direct word/core match (Pool 0) vs loose fuzzy/mid-word match (Pool 1)
function evaluateFieldMatch(
  rawLower,
  core,
  words,
  phonetic,
  wordPhonetics,
  qLower,
  qCore,
  qWords,
  qPhon,
  qWordPhons
) {
  // Handle literal suffix-only queries like "bo", "so", "ho"
  if (!qCore) {
    const cleanRaw = rawLower.replace(/\./g, "");
    const re = new RegExp(
      "\\b" + qLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
      "i"
    );
    return re.test(cleanRaw)
      ? { pool: 0, tightness: 0 }
      : { pool: 1, tightness: 9 };
  }

  if (core === qCore) return { pool: 0, tightness: 0 };
  if (qPhon.length >= 2 && phonetic === qPhon) return { pool: 0, tightness: 1 };
  if (core.startsWith(qCore + " ")) return { pool: 0, tightness: 2 };
  if (qCore.length >= 2 && core.startsWith(qCore)) {
    return { pool: 0, tightness: 3 };
  }

  if (qWords.length > 0) {
    let allTokensMatched = true;
    for (let i = 0; i < qWords.length; i++) {
      const qw = qWords[i];
      const qwp = qWordPhons[i] || "";
      const wordHit = words.some(
        (w) => w === qw || (qw.length >= 2 && w.startsWith(qw))
      );
      const phonHit =
        qwp.length > 0 &&
        wordPhonetics.some(
          (wp) => wp === qwp || (qwp.length >= 3 && wp.startsWith(qwp))
        );
      if (!wordHit && !phonHit) {
        allTokensMatched = false;
        break;
      }
    }
    if (allTokensMatched) return { pool: 0, tightness: 4 };
  }

  if (qPhon.length >= 3 && phonetic.startsWith(qPhon)) {
    return { pool: 0, tightness: 5 };
  }

  return { pool: 1, tightness: 9 };
}

// Merges Fuse.js hits + precomputed phonetic matches and ranks by Relevance Pool -> Priority -> Tightness
function mergeAndRankSearchResults(
  fuseResults,
  dataset,
  cleanQuery,
  keysToSearch
) {
  const textKeys = keysToSearch.filter(
    (k) => k === "Address" || k === "Office"
  );
  if (textKeys.length === 0) return fuseResults;

  const qLower = cleanQuery.toLowerCase().trim();
  const qCore = stripPostalSuffixes(cleanQuery);
  const qWords = qCore ? qCore.split(" ") : [];
  const qPhon = postalPhoneticKey(cleanQuery);
  const qWordPhons = qWords.map((w) => postalPhoneticKey(w));

  const rankedMap = new Map();

  const scoreRow = (row, fuseScore) => {
    const meta = getSearchMeta(row);
    let bestPool = 1;
    let bestTightness = 9;

    for (let i = 0; i < textKeys.length; i++) {
      const key = textKeys[i];
      const res =
        key === "Address"
          ? evaluateFieldMatch(
              meta.addrLower,
              meta.addrCore,
              meta.addrWords,
              meta.addrPhonetic,
              meta.addrWordPhonetics,
              qLower,
              qCore,
              qWords,
              qPhon,
              qWordPhons
            )
          : evaluateFieldMatch(
              meta.officeLower,
              meta.officeCore,
              meta.officeWords,
              meta.officePhonetic,
              meta.officeWordPhonetics,
              qLower,
              qCore,
              qWords,
              qPhon,
              qWordPhons
            );

      if (
        res.pool < bestPool ||
        (res.pool === bestPool && res.tightness < bestTightness)
      ) {
        bestPool = res.pool;
        bestTightness = res.tightness;
      }
    }

    return {
      pool: bestPool,
      tightness: bestTightness,
      effectivePriority: meta.effectivePriority,
      fuseScore: typeof fuseScore === "number" ? fuseScore : 0.25,
      addrLower: meta.addrLower,
    };
  };

  // 1. Seed with Fuse.js results (preserving match highlights & score)
  for (let i = 0; i < fuseResults.length; i++) {
    const res = fuseResults[i];
    const row = res.item;
    rankedMap.set(String(row.id), {
      result: res,
      rank: scoreRow(row, res.score),
    });
  }

  // 2. Catch phonetic & word-boundary matches via O(1) precomputed metadata
  if (qPhon.length >= 2 || qCore.length >= 2) {
    for (let i = 0; i < dataset.length; i++) {
      const row = dataset[i];
      const idKey = String(row.id);
      if (rankedMap.has(idKey)) continue;

      const meta = getSearchMeta(row);
      const syntheticMatches = [];
      let matched = false;

      for (let k = 0; k < textKeys.length; k++) {
        const key = textKeys[k];
        const fieldPhon =
          key === "Address" ? meta.addrPhonetic : meta.officePhonetic;
        const fieldWordPhons =
          key === "Address" ? meta.addrWordPhonetics : meta.officeWordPhonetics;

        const isPhonHit =
          (qPhon.length >= 2 && fieldPhon === qPhon) ||
          (qPhon.length >= 3 && fieldPhon.includes(qPhon)) ||
          (qPhon.length >= 3 &&
            fieldWordPhons.some((wp) => wp === qPhon || wp.startsWith(qPhon)));

        if (isPhonHit) {
          matched = true;
          const indices = findPhoneticMatchIndices(row[key], qPhon);
          if (indices.length > 0) {
            syntheticMatches.push({ key, indices });
          }
        }
      }

      if (matched) {
        rankedMap.set(idKey, {
          result: { item: row, matches: syntheticMatches },
          rank: scoreRow(row, 0.22),
        });
      }
    }
  }

  // 3. Sort:
  //    Pool 0 (Direct matches): Effective Priority DESC -> Tightness ASC -> Fuse Score ASC -> A-Z
  //    Pool 1 (Fuzzy/Mid-word): Fuse Score Bucket ASC -> Effective Priority DESC -> A-Z
  return Array.from(rankedMap.values())
    .sort((a, b) => {
      const ra = a.rank;
      const rb = b.rank;

      if (ra.pool !== rb.pool) return ra.pool - rb.pool;

      if (ra.pool === 0) {
        if (rb.effectivePriority !== ra.effectivePriority) {
          return rb.effectivePriority - ra.effectivePriority;
        }
        if (ra.tightness !== rb.tightness) return ra.tightness - rb.tightness;
        if (Math.abs(ra.fuseScore - rb.fuseScore) > 0.02) {
          return ra.fuseScore - rb.fuseScore;
        }
        return ra.addrLower.localeCompare(rb.addrLower);
      }

      const bucketA = Math.round(ra.fuseScore * 20);
      const bucketB = Math.round(rb.fuseScore * 20);
      if (bucketA !== bucketB) return bucketA - bucketB;
      if (rb.effectivePriority !== ra.effectivePriority) {
        return rb.effectivePriority - ra.effectivePriority;
      }
      return ra.addrLower.localeCompare(rb.addrLower);
    })
    .map((entry) => entry.result);
}

// --- CORE SEARCH EXECUTION & RENDERING ---
// Shared core search engine used by BOTH Search Page & Directory Page
function runPostalSearchEngine({
  rawInput = "",
  filterVal = "all",
  filterOffice = "",
  filterPin = "",
}) {
  const trimmedInput = String(rawInput || "").trim();
  const officeFilterLower = String(filterOffice || "")
    .trim()
    .toLowerCase();
  const pinFilterLower = String(filterPin || "")
    .trim()
    .toLowerCase();

  const { cleanQuery, detectedSuffix, targetOffice } = parseSmartSearchQuery(
    trimmedInput,
    filterVal,
    officeFilterLower,
    pinFilterLower
  );

  const hasAnyCriteria = Boolean(
    trimmedInput || officeFilterLower || pinFilterLower
  );

  if (!hasAnyCriteria) {
    const allSorted = (cachedPostOffices || [])
      .map((item) => ({ item, matches: [] }))
      .sort((a, b) => compareByPriorityOnly(a.item, b.item));
    return {
      results: allSorted,
      cleanQuery: "",
      detectedSuffix: null,
      targetOffice: null,
      isNumericSearch: false,
      keysToSearch: ["Address", "Office", "Pin"],
      hasAnyCriteria: false,
    };
  }

  const searchDataset = targetOffice
    ? (cachedPostOffices || []).filter(
        (row) =>
          String(row.Office || "")
            .trim()
            .toLowerCase() === targetOffice.toLowerCase()
      )
    : cachedPostOffices || [];

  let keysToSearch = ["Address", "Office", "Pin"];
  if (filterVal === "address") keysToSearch = ["Address"];
  if (filterVal === "office") keysToSearch = ["Office"];
  if (filterVal === "pin") keysToSearch = ["Pin"];

  let isNumericSearch = false;
  let baseData = [];

  if (!cleanQuery) {
    baseData = searchDataset
      .map((item) => ({ item, matches: [] }))
      .sort((a, b) => compareByPriorityOnly(a.item, b.item));
  } else {
    isNumericSearch = /^\d+$/.test(cleanQuery);

    if (window.Fuse) {
      const localFuse = !targetOffice
        ? getCachedFuseInstance(filterVal, isNumericSearch)
        : new Fuse(searchDataset, {
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
      baseData = localFuse ? localFuse.search(cleanQuery) : [];
    } else {
      // Safe fallback if Fuse CDN hasn't finished loading yet
      const qLower = cleanQuery.toLowerCase();
      baseData = [];
      for (let i = 0; i < searchDataset.length; i++) {
        const row = searchDataset[i];
        const matches = [];
        for (let k = 0; k < keysToSearch.length; k++) {
          const key = keysToSearch[k];
          const valStr = String(row[key] ?? "");
          const idx = valStr.toLowerCase().indexOf(qLower);
          if (idx !== -1) {
            matches.push({ key, indices: [[idx, idx + qLower.length - 1]] });
          }
        }
        if (matches.length > 0) {
          baseData.push({ item: row, matches, score: 0.1 });
        }
      }
    }

    if (!isNumericSearch && filterVal !== "pin") {
      baseData = mergeAndRankSearchResults(
        baseData,
        searchDataset,
        cleanQuery,
        keysToSearch
      );
    } else {
      baseData.sort((a, b) => compareByPriorityOnly(a.item, b.item));
    }
  }

  if (officeFilterLower || pinFilterLower) {
    baseData = baseData.filter((result) => {
      const row = result.item;
      if (
        officeFilterLower &&
        !String(row.Office || "")
          .toLowerCase()
          .includes(officeFilterLower)
      ) {
        return false;
      }
      if (pinFilterLower) {
        const rowPin = String(row.Pin || "")
          .trim()
          .toLowerCase();
        const isUniqueSuffix =
          /^\d{3}$/.test(pinFilterLower) &&
          pinSuffixToOfficeMap.has(pinFilterLower);
        const pinMatched = isUniqueSuffix
          ? rowPin.endsWith(pinFilterLower)
          : rowPin.includes(pinFilterLower);
        if (!pinMatched) return false;
      }
      return true;
    });
  }

  return {
    results: baseData,
    cleanQuery,
    detectedSuffix,
    targetOffice,
    isNumericSearch,
    keysToSearch,
    hasAnyCriteria: true,
  };
}

function triggerSearch(hidePanels = false, options = {}) {
  const silent = Boolean(options?.silent);
  const preserveLimit =
    typeof options?.preserveLimit === "number" ? options.preserveLimit : null;
  if (hidePanels) {
    document.getElementById("advanced-filters-panel")?.classList.add("hidden");
    document.getElementById("search-history-panel")?.classList.add("hidden");
    closeAllDropdowns();
  }

  if (!cachedPostOffices || cachedPostOffices.length === 0) return;

  const searchInput = document.getElementById("search-input").value.trim();
  const filterVal = document.querySelector(
    'input[name="searchFilter"]:checked'
  ).value;
  const searchBox = document.getElementById("search-input");
  if (searchBox) searchBox.inputMode = filterVal === "pin" ? "numeric" : "text";
  const filterOffice = document.getElementById("filter-office").value.trim();
  const filterPin = document.getElementById("filter-pin").value.trim();

  const outcome = runPostalSearchEngine({
    rawInput: searchInput,
    filterVal,
    filterOffice,
    filterPin,
  });

  window.activeCleanSearchQuery = outcome.cleanQuery;
  window.activeSmartOfficeFilter = outcome.targetOffice
    ? { suffix: outcome.detectedSuffix, office: outcome.targetOffice }
    : null;

  updateActiveFilterIndicators();

  if (searchInput.length > 2) saveSearchTerm(searchInput);

  currentFilteredData = outcome.results;
  if (preserveLimit !== null) {
    window.searchDisplayLimit = Math.max(
      10,
      Math.min(preserveLimit, currentFilteredData.length || 10)
    );
  }
  renderResults(preserveLimit !== null, silent);

  if (window.isVoiceSearch) {
    window.isVoiceSearch = false;
    window.speechSynthesis.cancel();
    let speechText = "No matching post offices found.";
    if (currentFilteredData.length > 0) {
      const topMatch = currentFilteredData[0].item;
      let lastThreePin = topMatch.Pin ? String(topMatch.Pin).slice(-3) : "";
      let hindiPinWords = lastThreePin ? convertToHindiWords(lastThreePin) : "";
      let pinText = hindiPinWords
        ? `Pin code ${hindiPinWords}`
        : "Pin not available";

      speechText = `${topMatch.Address}. Office ${topMatch.Office}. ${pinText}.`;
      speechText = speechText.replace(
        /\b(BO|HO|SO|PO|GPO|RMS|TPS)\b/g,
        (match) => match.split("").join(" ")
      );
    } else {
      const matchedOffices = findMatchingDeliveryOfficesForSearch();
      if (matchedOffices.length > 0) {
        const topOff = matchedOffices[0];
        const lastThreePin = topOff.pin ? String(topOff.pin).slice(-3) : "";
        const hindiPinWords = lastThreePin
          ? convertToHindiWords(lastThreePin)
          : "";
        const pinText = hindiPinWords
          ? `Pin code ${hindiPinWords}`
          : "Pin not available";
        speechText = `${topOff.office}. ${pinText}.`.replace(
          /\b(BO|HO|SO|PO|GPO|RMS|TPS)\b/g,
          (match) => match.split("").join(" ")
        );
      }
    }
    const utterance = new SpeechSynthesisUtterance(speechText);
    if (preferredIndianVoice) {
      utterance.voice = preferredIndianVoice;
    } else {
      utterance.lang = "en-IN";
    }
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }
}

function clearSearchInput() {
  window.speechSynthesis.cancel();

  if (window.activeRecognition) {
    window.activeRecognition.abort();
    window.activeRecognition = null;
  }

  clearTimeout(aiSearchDebounceTimer);
  if (aiActiveAbortController) {
    aiActiveAbortController.abort();
    aiActiveAbortController = null;
  }

  const micBtn = document.getElementById("mic-btn");
  if (micBtn) {
    micBtn.classList.remove("listening");
    micBtn.style.color = "";
  }

  const searchInput = document.getElementById("search-input");
  searchInput.value = "";
  document.getElementById("clear-search-btn").classList.add("hidden");
  triggerSearch();
  searchInput.focus();
}

function findOrderedMatchPositions(t, q) {
  const n = t.length;
  const m = q.length;
  if (!n || !m) return [];

  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (t[i - 1] === q[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
      }
    }
  }

  const matched = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (t[i - 1] === q[j - 1] && dp[i][j] === dp[i - 1][j - 1] + 1) {
      if (dp[i - 1][j] === dp[i][j]) {
        i--;
      } else {
        matched.push(i - 1);
        i--;
        j--;
      }
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  matched.reverse();
  return matched;
}

function computeSmartHighlightRanges(text, query) {
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!t || !q) return [];

  // 1. Exact substring match (e.g. "kane" in "Kanethi BO")
  const exactIndex = t.indexOf(q);
  if (exactIndex !== -1) {
    return [[exactIndex, exactIndex + q.length - 1]];
  }

  // 2. Single-word query: align inside the single best-matching word first
  //    so stray letters in later words don't light up.
  let matched = [];
  if (!q.includes(" ")) {
    let bestPos = [];
    let bestSpan = Infinity;
    const wordRegex = /\S+/g;
    let m;

    while ((m = wordRegex.exec(t)) !== null) {
      const pos = findOrderedMatchPositions(m[0], q);
      if (pos.length === 0) continue;
      const span = pos[pos.length - 1] - pos[0];
      if (
        pos.length > bestPos.length ||
        (pos.length === bestPos.length && span < bestSpan)
      ) {
        bestPos = pos.map((p) => p + m.index);
        bestSpan = span;
      }
    }

    // Fall back to full text only for tight multi-word matches (e.g. "ramnagar" -> "Ram Nagar")
    const fullPos = findOrderedMatchPositions(t, q);
    if (
      fullPos.length > bestPos.length &&
      fullPos[fullPos.length - 1] - fullPos[0] <= q.length + 3
    ) {
      matched = fullPos;
    } else {
      matched = bestPos;
    }
  } else {
    matched = findOrderedMatchPositions(t, q);
  }

  if (matched.length === 0) return [];

  // Merge adjacent matched character indices into ranges
  const ranges = [];
  let start = matched[0];
  let prev = matched[0];
  for (let k = 1; k < matched.length; k++) {
    if (matched[k] === prev + 1) {
      prev = matched[k];
    } else {
      ranges.push([start, prev]);
      start = prev = matched[k];
    }
  }
  ranges.push([start, prev]);

  // Drop isolated single-character matches separated by > 2 skipped chars
  if (ranges.length <= 1) return ranges;
  const kept = ranges.filter(([s, e], idx) => {
    if (e - s + 1 > 1) return true;
    const distPrev = idx > 0 ? s - ranges[idx - 1][1] - 1 : Infinity;
    const distNext =
      idx < ranges.length - 1 ? ranges[idx + 1][0] - e - 1 : Infinity;
    return Math.min(distPrev, distNext) <= 2;
  });

  return kept.length > 0 ? kept : ranges;
}

function highlightText(text, matches, key, queryOverride = null) {
  if (text === null || text === undefined) return "";
  text = String(text);
  const safeText = escapeHTML(text);

  if (!matches || matches.length === 0) return safeText;
  const match = matches.find((m) => m.key === key);
  if (!match) return safeText;

  const searchInput = (
    queryOverride !== null
      ? String(queryOverride)
      : window.activeCleanSearchQuery ||
        document.getElementById("search-input").value
  ).trim();

  if (searchInput.length > 0) {
    const ranges = computeSmartHighlightRanges(text, searchInput);
    if (ranges.length > 0) {
      let out = "";
      let last = 0;
      for (const [start, end] of ranges) {
        out += escapeHTML(text.substring(last, start));
        out += `<span class="highlight-text">${escapeHTML(
          text.substring(start, end + 1)
        )}</span>`;
        last = end + 1;
      }
      out += escapeHTML(text.substring(last));
      return out;
    }
  }

  return safeText;
}

window.searchDisplayLimit = 10;
window.searchObserver = null;

function setupSearchObserver() {
  const sentinel = document.getElementById("search-sentinel");
  const displayArea = document.getElementById("results-display-area");

  if (window.searchObserver) window.searchObserver.disconnect();

  const searchSection = document.getElementById("view-search");
  if (!searchSection || !searchSection.classList.contains("active")) return;

  window.searchObserver = new IntersectionObserver(
    (entries) => {
      if (
        entries[0].isIntersecting &&
        searchSection.classList.contains("active")
      ) {
        if (window.searchDisplayLimit < currentFilteredData.length) {
          window.searchDisplayLimit += 10;
          renderResults(true);
        }
      }
    },
    { root: displayArea, rootMargin: "300px" }
  );

  if (sentinel) window.searchObserver.observe(sentinel);
}

// --- PINNED DELIVERY OFFICE CARD FOR SEARCH RESULTS ---
function findMatchingDeliveryOfficesForSearch() {
  const rawInput = document.getElementById("search-input")?.value.trim() || "";
  const filterVal =
    document.querySelector('input[name="searchFilter"]:checked')?.value ||
    "address";
  const filterOffice =
    document.getElementById("filter-office")?.value.trim().toLowerCase() || "";
  const filterPin =
    document.getElementById("filter-pin")?.value.trim().toLowerCase() || "";
  const cleanQuery = (window.activeCleanSearchQuery ?? rawInput).trim();
  const smartOffice = window.activeSmartOfficeFilter?.office || "";

  if (!rawInput && !filterOffice && !filterPin) return [];

  // Build unique parent office summary from cachedPostOffices
  const officesMap = new Map();
  for (let i = 0; i < cachedPostOffices.length; i++) {
    const row = cachedPostOffices[i];
    const offName = String(row.Office || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!offName) continue;
    const key =
      typeof normalizeOfficeKey === "function"
        ? normalizeOfficeKey(offName)
        : offName.toLowerCase();

    if (!officesMap.has(key)) {
      officesMap.set(key, {
        office: offName,
        pin: String(row.Pin || "").trim(),
        count: 0,
      });
    }
    const entry = officesMap.get(key);
    entry.count++;
    if (!entry.pin && row.Pin) entry.pin = String(row.Pin).trim();
  }

  const allOffices = Array.from(officesMap.values());
  const matches = [];

  const qLower = cleanQuery.toLowerCase();
  const qCore = stripPostalSuffixes(cleanQuery);
  const qPhon = postalPhoneticKey(cleanQuery);
  const isNumeric = /^\d+$/.test(cleanQuery);

  for (let i = 0; i < allOffices.length; i++) {
    const item = allOffices[i];
    const offLower = item.office.toLowerCase();
    const offPin = item.pin.toLowerCase();

    // Respect explicit secondary Office / PIN filters
    if (filterOffice && !offLower.includes(filterOffice)) continue;
    if (smartOffice && offLower !== smartOffice.toLowerCase()) continue;
    if (filterPin) {
      const isUniqueSuffix =
        /^\d{3}$/.test(filterPin) && pinSuffixToOfficeMap.has(filterPin);
      const pinOk = isUniqueSuffix
        ? offPin.endsWith(filterPin)
        : offPin.includes(filterPin);
      if (!pinOk) continue;
    }

    // Standalone 3-digit PIN suffix or filter-only view (e.g. typed "501" or selected Office filter)
    if (!cleanQuery) {
      if (smartOffice && offLower === smartOffice.toLowerCase()) {
        matches.push({ ...item, rank: 0 });
      } else if (!smartOffice && (filterOffice || filterPin)) {
        matches.push({ ...item, rank: 1 });
      }
      continue;
    }

    // When user types "village 501", they're hunting a village inside that office—skip card unless query also matches the office
    if (cleanQuery.length < 2) continue;

    let rank = 99;

    if (isNumeric || filterVal === "pin") {
      if (
        offPin === qLower ||
        (qLower.length === 3 && offPin.endsWith(qLower))
      ) {
        rank = 0;
      } else if (offPin.includes(qLower)) {
        rank = 2;
      }
    } else {
      const offCore = stripPostalSuffixes(item.office);
      const offPhon = postalPhoneticKey(item.office);

      if (qCore && offCore === qCore) rank = 0;
      else if (offLower === qLower) rank = 0;
      else if (qPhon.length >= 2 && offPhon === qPhon) rank = 1;
      else if (qCore && offCore.startsWith(qCore)) rank = 2;
      else if (offLower.startsWith(qLower)) rank = 2;
      else if (qCore.length >= 3 && offCore.includes(qCore)) rank = 3;
      else if (qPhon.length >= 3 && offPhon.startsWith(qPhon)) rank = 4;
    }

    if (rank < 99) {
      matches.push({ ...item, rank });
    }
  }

  return matches
    .sort((a, b) => a.rank - b.rank || a.office.localeCompare(b.office))
    .slice(0, 3);
}

function buildSearchDeliveryOfficeCardsHTML(matchedOffices, silent = false) {
  if (!matchedOffices || matchedOffices.length === 0) return "";

  const activeQuery = (
    window.activeCleanSearchQuery ||
    document.getElementById("search-input")?.value ||
    ""
  ).trim();

  const cardsHtml = matchedOffices
    .map((item) => {
      const officeType = detectOfficeType(item.office) === "HO" ? "HO" : "SO";
      const staffCount =
        typeof getOfficeStaffCount === "function"
          ? getOfficeStaffCount(item.office)
          : 0;
      const staffLabel =
        staffCount > 0 ? `👥 Staff (${staffCount})` : "👥 Staff";

      let titleHtml = escapeHTML(item.office);
      if (activeQuery && !/^\d+$/.test(activeQuery)) {
        const ranges = computeSmartHighlightRanges(item.office, activeQuery);
        if (ranges.length > 0) {
          let out = "";
          let last = 0;
          for (const [s, e] of ranges) {
            out += escapeHTML(item.office.substring(last, s));
            out += `<span class="highlight-text">${escapeHTML(
              item.office.substring(s, e + 1)
            )}</span>`;
            last = e + 1;
          }
          out += escapeHTML(item.office.substring(last));
          titleHtml = out;
        }
      }

      return `
        <div class="search-office-card${silent ? " no-anim" : ""}">
          <div class="search-office-card-main">
            <div class="search-office-card-title">
              <span>🏢</span>
              <span>${titleHtml}</span>
              <span class="search-office-type-tag">${officeType}</span>
            </div>
            <div class="search-office-card-meta">
              <span>📍 ${escapeHTML(item.pin || "N/A")}</span>
              <span class="meta-dot">•</span>
              <span>${item.count} ${
        item.count === 1 ? "Address" : "Addresses"
      }</span>
            </div>
          </div>
          <div class="search-office-card-actions">
            <button
              type="button"
              class="search-office-btn is-staff ${
                staffCount > 0 ? "has-staff" : ""
              }"
              onclick="showParentOfficeDetailsModal('${escapeForOnclick(
                item.office
              )}', '${escapeForOnclick(item.pin)}')"
              title="View or edit ${escapeHTML(item.office)} staff details"
            >
              ${staffLabel}
            </button>
            <button
              type="button"
              class="search-office-btn"
              onclick="goToDirectoryOffice('${escapeForOnclick(item.office)}')"
              title="Open ${escapeHTML(item.office)} in Directory"
            >
              📂 Directory
            </button>
          </div>
        </div>`;
    })
    .join("");

  return `<div class="search-office-cards-wrap">${cardsHtml}</div>`;
}

function renderResults(isLoadMore = false, silent = false) {
  const displayArea = document.getElementById("results-display-area");

  if (!isLoadMore && !silent) {
    displayArea.scrollTop = 0;
    window.searchDisplayLimit = 10;
  }

  const matchedDeliveryOffices = findMatchingDeliveryOfficesForSearch();
  const officeCardsHtml = buildSearchDeliveryOfficeCardsHTML(
    matchedDeliveryOffices,
    silent
  );

  if (currentFilteredData.length === 0) {
    const rawQuery = document.getElementById("search-input").value.trim();

    clearTimeout(aiSearchDebounceTimer);
    aiLatestRequestId++;
    if (aiActiveAbortController) {
      aiActiveAbortController.abort();
      aiActiveAbortController = null;
    }
    document.getElementById("force-ai-search-btn")?.classList.remove("loading");

    // If query matched a parent Delivery Office (HO/SO), show its card with manual Ask AI option
    if (matchedDeliveryOffices.length > 0) {
      let html = officeCardsHtml;
      if (rawQuery.length >= 3) {
        html += `
          <div class="ask-ai-bottom-box" id="ask-ai-footer-box">
            <div class="ask-ai-bottom-text">
              🤔 Looking for a village or beat instead of the main office?
            </div>
            <button
              type="button"
              class="ask-ai-bottom-btn"
              onclick="triggerInlineAiBelowResults('${escapeForOnclick(
                rawQuery
              )}')"
            >
              ✨ Ask AI for "${escapeHTML(rawQuery)}"
            </button>
          </div>
          <div id="ai-search-results-container"></div>`;
      }

      displayArea.innerHTML = html;
      return;
    }

    const emptyMessageHtml = rawQuery
      ? `No match found in local database for "<b>${escapeHTML(rawQuery)}</b>".`
      : `No matching records found for the active filters.`;

    const askAiBottomHtml =
      rawQuery.length >= 3
        ? `
          <div class="ask-ai-bottom-box" id="ask-ai-footer-box">
            <div class="ask-ai-bottom-text">
              Not in DakMitra's local records. Want an online AI estimate?
            </div>
            <button
              type="button"
              class="ask-ai-bottom-btn"
              onclick="triggerInlineAiBelowResults('${escapeForOnclick(
                rawQuery
              )}')"
            >
              ✨ Ask AI for "${escapeHTML(rawQuery)}"
            </button>
          </div>
          <div id="ai-search-results-container"></div>`
        : "";

    displayArea.innerHTML = `
        <ul class="list-container" style="margin: 0; list-style: none;">
          <li class="list-empty" style="margin: 4px 0;">
            <span>🔍 ${emptyMessageHtml}</span>
          </li>
        </ul>
        ${askAiBottomHtml}`;
    return;
  }

  clearTimeout(aiSearchDebounceTimer);
  if (aiActiveAbortController) {
    aiActiveAbortController.abort();
    aiActiveAbortController = null;
  }

  if (viewMode === "list") {
    let html =
      officeCardsHtml +
      `<ul class="list-container${
        silent ? " no-card-anim" : ""
      }" style="margin:0; list-style:none;">`;
    currentFilteredData
      .slice(0, window.searchDisplayLimit)
      .forEach((result) => {
        const row = result.item;
        const addressHtml = highlightText(
          row.Address,
          result.matches,
          "Address"
        );
        const officeHtml = highlightText(row.Office, result.matches, "Office");
        const PinHtml = highlightText(row.Pin, result.matches, "Pin");
        const isPriority = Number(row.priority) >= 1;
        const officeType = detectOfficeType(row.Address);
        const isAutoTopOffice = officeType === "HO" || officeType === "SO";

        const priorityToggleHtml = !isAutoTopOffice
          ? `<button
              type="button"
              class="card-priority-btn ${isPriority ? "is-active" : ""}"
              onclick="event.stopPropagation(); toggleRecordPriority('${escapeForOnclick(
                row.id
              )}', this)"
              title="${
                isPriority
                  ? "Priority ON (Shared with all staff) — Tap to remove"
                  : "Mark as Priority (Shared with all staff)"
              }"
              aria-label="Toggle Priority"
              aria-pressed="${isPriority ? "true" : "false"}"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="${
                isPriority ? "currentColor" : "none"
              }" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
            </button>`
          : "";

        html += `
            <li class="list-item"
                onclick="openDirectoryChipActions(this)"
                data-record-id="${escapeHTML(row.id)}"
                data-address="${escapeHTML(row.Address)}"
                data-office="${escapeHTML(row.Office)}"
                data-pin="${escapeHTML(row.Pin || "")}"
                style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                <div style="width: 100%;">
                  <div class="search-card-top">
                    <div class="office-title">${addressHtml}</div>
                    ${priorityToggleHtml}
                  </div>
                  <div class="sub-office">
                    <span class="badge badge-primary" style="cursor: pointer; transition: 0.2s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'" ondblclick="event.stopPropagation(); goToDirectoryOffice('${escapeForOnclick(
                      row.Office
                    )}')" title="Double-click to open in Directory">🏢 ${officeHtml}</span>
                    <span class="badge" style="cursor: pointer; transition: 0.2s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'" ondblclick="event.stopPropagation(); goToDirectoryOffice('${escapeForOnclick(
                      row.Office
                    )}')" title="Double-click to open in Directory">📍 ${
          PinHtml || "N/A"
        }</span>
                  </div>
                </div>
            </li>`;
      });
    html += `</ul>`;

    if (window.searchDisplayLimit < currentFilteredData.length) {
      html += `<div id="search-sentinel" style="height: 40px; text-align: center; padding: 10px; color: var(--text-light); font-size: 13px;">Loading more results...</div>`;
    }

    displayArea.innerHTML = html;
  } else {
    let html =
      officeCardsHtml +
      `<table class="data-table">
                    <thead><tr><th>Address</th><th>Office</th><th>Pin</th></tr></thead>
                    <tbody>`;

    currentFilteredData
      .slice(0, window.searchDisplayLimit)
      .forEach((result) => {
        const row = result.item;
        const addressHtml = highlightText(
          row.Address,
          result.matches,
          "Address"
        );
        const officeHtml = highlightText(row.Office, result.matches, "Office");
        const PinHtml = highlightText(row.Pin, result.matches, "Pin");
        const isPriority = Number(row.priority) >= 1;
        const officeType = detectOfficeType(row.Address);
        const isAutoTopOffice = officeType === "HO" || officeType === "SO";

        const tablePriorityBtn = !isAutoTopOffice
          ? `<button
              type="button"
              class="table-priority-btn ${isPriority ? "is-active" : ""}"
              onclick="event.stopPropagation(); toggleRecordPriority('${escapeForOnclick(
                row.id
              )}', this)"
              title="${
                isPriority
                  ? "Priority ON (Shared) — Tap to remove"
                  : "Mark as Priority (Shared)"
              }"
              aria-label="Toggle Priority"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="${
                isPriority ? "currentColor" : "none"
              }" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
            </button>`
          : "";

        html += `<tr class="list-item"
                      onclick="openDirectoryChipActions(this)"
                      data-record-id="${escapeHTML(row.id)}"
                      data-address="${escapeHTML(row.Address)}"
                      data-office="${escapeHTML(row.Office)}"
                      data-pin="${escapeHTML(row.Pin || "")}">
                      <td>
                        <div class="table-addr-cell">
                          <span>${addressHtml}</span>
                          ${tablePriorityBtn}
                        </div>
                      </td>
                      <td style="cursor: pointer; color: var(--primary);" ondblclick="event.stopPropagation(); goToDirectoryOffice('${escapeForOnclick(
                        row.Office
                      )}')" title="Double-click to open in Directory">
                         ${officeHtml}
                      </td>
                      <td style="cursor: pointer; color: var(--primary);" ondblclick="event.stopPropagation(); goToDirectoryOffice('${escapeForOnclick(
                        row.Office
                      )}')" title="Double-click to open in Directory">
                         ${PinHtml || "-"}
                      </td>
                   </tr>`;
      });
    html += `</tbody></table>`;

    if (window.searchDisplayLimit < currentFilteredData.length) {
      html += `<div id="search-sentinel" style="height: 40px; text-align: center; padding: 10px; color: var(--text-light); font-size: 13px;">Loading more results...</div>`;
    }

    displayArea.innerHTML = html;
  }

  const activeQuery = document.getElementById("search-input").value.trim();
  if (activeQuery.length >= 2) {
    displayArea.insertAdjacentHTML(
      "beforeend",
      `
          <div class="ask-ai-bottom-box" id="ask-ai-footer-box">
            <div class="ask-ai-bottom-text">
              🤔 Still not what you're looking for in these local matches?
            </div>
            <button
              type="button"
              class="ask-ai-bottom-btn"
              onclick="triggerInlineAiBelowResults('${escapeForOnclick(
                activeQuery
              )}')"
            >
              ✨ Ask AI for "${escapeHTML(activeQuery)}"
            </button>
          </div>
          <div id="ai-search-results-container"></div>
        `
    );
  }

  if (!isLoadMore && !silent) {
    displayArea.classList.remove("approvals-smooth-in");
    void displayArea.offsetWidth;
    displayArea.classList.add("approvals-smooth-in");
  }

  setupSearchObserver();
}

// --- SEARCH INPUT LISTENERS ---
(function initSearchInputListeners() {
  const searchInput = document.getElementById("search-input");
  if (!searchInput) return;

  searchInput.addEventListener("focus", function () {
    window.speechSynthesis.cancel();
    document.getElementById("advanced-filters-panel").classList.add("hidden");
    document.getElementById("search-history-panel").classList.add("hidden");
    closeAllDropdowns();
  });

  let searchTimeout;
  searchInput.addEventListener("input", function () {
    const clearBtn = document.getElementById("clear-search-btn");
    if (this.value.length > 0) {
      clearBtn.classList.remove("hidden");
      document.getElementById("advanced-filters-panel").classList.add("hidden");
      document.getElementById("search-history-panel").classList.add("hidden");
      closeAllDropdowns();
    } else {
      clearBtn.classList.add("hidden");
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(triggerSearch, 250);
  });
})();

// --- ONLINE AI FALLBACK SEARCH ---
let aiSearchDebounceTimer = null;
let aiActiveAbortController = null;
let aiMemoryCache = {};
let aiLatestRequestId = 0;

function triggerInlineAiBelowResults(query) {
  const footerBox = document.getElementById("ask-ai-footer-box");
  if (footerBox) {
    footerBox.innerHTML = `
        <div class="ai-fallback-banner-icon">⚠️</div>
        <div class="ai-fallback-banner-text" style="flex: 1;">
          <strong>AI Online Estimation (Requested Manually)</strong>
          <span>
            Local results didn't match "${escapeHTML(
              query
            )}". Showing <b>AI-estimated postal routing</b> below—please verify before sorting.
          </span>
        </div>
      `;
    footerBox.className = "ai-fallback-banner";
  }

  scheduleAutoAiSearch(query, true);

  const aiContainer = document.getElementById("ai-search-results-container");
  if (aiContainer) {
    setTimeout(() => {
      aiContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  }
}

function forceAiSearch() {
  const aiBtn = document.getElementById("force-ai-search-btn");

  if (aiBtn && aiBtn.classList.contains("loading")) {
    clearTimeout(aiSearchDebounceTimer);
    aiLatestRequestId++;
    if (aiActiveAbortController) {
      aiActiveAbortController.abort();
      aiActiveAbortController = null;
    }
    aiBtn.classList.remove("loading");

    if (currentFilteredData && currentFilteredData.length > 0) {
      renderResults(false);
    } else {
      const container = document.getElementById("ai-search-results-container");
      if (container) {
        container.innerHTML = `
            <ul class="list-container">
              <li class="list-empty" style="margin-top:0;">
                <span>⏹️ AI search stopped.</span>
              </li>
            </ul>`;
      }
    }

    showToast("⏹️ AI search stopped");
    return;
  }

  const searchInput = document.getElementById("search-input");
  const rawQuery = searchInput ? searchInput.value.trim() : "";

  if (rawQuery.length < 3) {
    if (searchInput) searchInput.focus();
    return showToast("✍️ Type at least 3 letters in the search bar to ask AI!");
  }

  saveSearchTerm(rawQuery);

  const displayArea = document.getElementById("results-display-area");
  displayArea.scrollTop = 0;

  const localCount = currentFilteredData ? currentFilteredData.length : 0;

  displayArea.innerHTML = `
      <div class="ai-fallback-banner">
        <div class="ai-fallback-banner-icon">✨</div>
        <div class="ai-fallback-banner-text" style="flex: 1;">
          <strong>Forced Online AI Postal Lookup</strong>
          <span>
            Showing <b>AI-estimated routing</b> for "${escapeHTML(rawQuery)}"${
    localCount > 0
      ? ` (bypassed ${localCount} local fuzzy ${
          localCount === 1 ? "match" : "matches"
        })`
      : " (no exact match in local database)"
  }. Please verify before sorting.
          </span>
        </div>
        ${
          localCount > 0
            ? `<button type="button" class="toolbar-btn" style="background: var(--card-bg); border: 1px solid var(--border); flex-shrink: 0;" onclick="renderResults(false)">↩️ Local (${localCount})</button>`
            : ""
        }
      </div>
      <div id="ai-search-results-container"></div>`;

  scheduleAutoAiSearch(rawQuery, true);
}

function scheduleAutoAiSearch(query, immediate = false) {
  clearTimeout(aiSearchDebounceTimer);
  if (aiActiveAbortController) {
    aiActiveAbortController.abort();
    aiActiveAbortController = null;
  }

  const container = document.getElementById("ai-search-results-container");
  if (!container) return;

  if (!navigator.onLine) {
    showOfflineToast("AI lookup requires internet.", true);
    container.innerHTML = `
        <ul class="list-container">
          <li class="list-empty" style="margin-top:0;">
            <span>📴 You are offline. Connect to the internet for AI postal estimation.</span>
          </li>
        </ul>`;
    return;
  }

  container.innerHTML = `
      <div style="text-align: center; padding: 20px 12px;">
        <div class="approvals-loader-pill">
          <div class="approvals-spinner"></div>
          <span>✨ AI is searching online for "${escapeHTML(query)}"...</span>
        </div>
      </div>`;

  aiSearchDebounceTimer = setTimeout(
    () => {
      executeAiOfficeEstimation(query);
    },
    immediate ? 0 : 700
  );
}

function buildDivisionOfficeDirectoryContext(query) {
  const officeGroups = new Map();

  cachedPostOffices.forEach((row) => {
    const off = String(row.Office || "").trim();
    const pin = String(row.Pin || "N/A").trim();
    const addr = String(row.Address || "").trim();
    if (!off) return;

    if (!officeGroups.has(off)) {
      officeGroups.set(off, { pin, localities: [] });
    }
    if (addr) {
      officeGroups.get(off).localities.push(addr);
    }
  });

  const qLower = query.toLowerCase().trim();
  const qPrefix = qLower.slice(0, 3);

  const summaryLines = [];
  officeGroups.forEach((info, officeName) => {
    const sortedLocs = [...info.localities].sort((a, b) => {
      const aMatch = a.toLowerCase().startsWith(qPrefix) ? -1 : 0;
      const bMatch = b.toLowerCase().startsWith(qPrefix) ? -1 : 0;
      return aMatch - bMatch;
    });
    const sampleStr = sortedLocs.slice(0, 18).join(", ");
    summaryLines.push(
      `- Delivery Office: "${officeName}" (PIN: ${info.pin}) -> Serves areas/BOs: [${sampleStr}]`
    );
  });

  return summaryLines.join("\n");
}

async function fetchVillageGeoContext(query, signal) {
  const cleanQuery = query
    .replace(/\b(BO|SO|HO|PO|vill|village|gram)\b/gi, "")
    .trim();

  const geoHints = [];

  try {
    const postRes = await fetch(
      `https://api.postalpincode.in/postoffice/${encodeURIComponent(
        cleanQuery
      )}`,
      { signal }
    );
    if (postRes.ok) {
      const postData = await postRes.json();
      const offices = postData?.[0]?.PostOffice || [];

      const localOffices = offices.filter(
        (o) =>
          /mirzapur|sonbhadra|sonebhadra|bhadohi|varanasi/i.test(
            o.District || ""
          ) || /^231/.test(String(o.Pincode || ""))
      );

      localOffices.forEach((o) => {
        geoHints.push(
          `Official India Post Database Match: Office/Branch "${o.Name}" (${o.BranchType}) | Block: ${o.Block} | District: ${o.District} | PIN Code: ${o.Pincode}`
        );
      });
    }
  } catch (e) {
    if (e.name === "AbortError") throw e;
  }

  const lowerQ = cleanQuery.toLowerCase();
  if (
    lowerQ.includes("lapsi") ||
    lowerQ.includes("nauha") ||
    lowerQ.includes("khutaha")
  ) {
    geoHints.push(
      `CRITICAL LOCAL KNOWLEDGE: Village "${cleanQuery}" is located in the Kachhwa / Majhawa block of Mirzapur district. Its sorting office is Kachhwa SO with PIN code 231501.`
    );
  }

  return geoHints;
}

async function executeAiOfficeEstimation(query) {
  const container = document.getElementById("ai-search-results-container");
  if (!container) return;

  const aiBtn = document.getElementById("force-ai-search-btn");
  if (aiBtn) aiBtn.classList.add("loading");

  const exactUserQuery = query.trim();
  const cacheKey = exactUserQuery.toLowerCase();

  if (aiMemoryCache[cacheKey]) {
    if (aiBtn) aiBtn.classList.remove("loading");
    renderAiEstimationCards(exactUserQuery, aiMemoryCache[cacheKey]);
    return;
  }

  const thisRequestId = ++aiLatestRequestId;
  aiActiveAbortController = new AbortController();

  try {
    const geoHints = await fetchVillageGeoContext(
      exactUserQuery,
      aiActiveAbortController.signal
    );

    const divisionDirectoryContext =
      buildDivisionOfficeDirectoryContext(exactUserQuery);

    const prompt = `You are an expert India Post mail sorting assistant for Mirzapur and Sonbhadra districts (Uttar Pradesh, PIN 231xxx).
  
  The user searched for a village, mohalla, locality, or post office that was NOT found in the local database:
  User Search: "${exactUserQuery}"
  
  Live Postal & Local Hints Found:
  ${
    geoHints.length > 0
      ? geoHints.join("\n")
      : "No direct online hints found. Use your geographic knowledge of Mirzapur and Sonbhadra districts."
  }
  
  Official Delivery Offices (SO/HO) in our DakMitra Database:
  ${divisionDirectoryContext}
  
  Rules:
  1. Identify the most likely serving Delivery Post Office (SO or HO) from the list above for "${exactUserQuery}" in Mirzapur or Sonbhadra district.
  2. Keep "searched_text" strictly as "${exactUserQuery}" (do not add "BO" or rename what the user typed).
  3. Put the nearest Branch Office (BO) or beat area in "serving_bo_or_beat" if known, otherwise leave it as "".
  4. Pick "recommended_office" using the EXACT office name from the Delivery Office list above whenever possible.
  5. Return ONLY a valid JSON array with 1 to 2 best matches (no markdown, no extra explanation outside JSON). If the place clearly does not exist in Mirzapur or Sonbhadra, return [].
  
  Exact JSON format:
  [
    {
      "searched_text": "${exactUserQuery}",
      "serving_bo_or_beat": "Nearest BO or Block Name (or empty string)",
      "recommended_office": "Exact SO/HO Name from list",
      "district": "Mirzapur or Sonbhadra",
      "pin": "6-digit PIN code",
      "confidence": "High, Medium, or Low",
      "reason": "Short 1-2 line explanation of why mail for this locality routes to this office."
    }
  ]`;

    await ensureSupabaseReady();
    const { data, error } = await supabaseClient.functions.invoke(
      "ai-postal-search",
      { body: { prompt } }
    );

    if (thisRequestId !== aiLatestRequestId) return;

    if (error) {
      let errMsg = error.message || "AI Lookup Error";
      try {
        const errBody = await error.context?.json();
        if (errBody?.error) errMsg = errBody.error;
      } catch (_) {}
      throw new Error(errMsg);
    }

    const rawText = data?.text || "[]";
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    const parsedResults = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    aiMemoryCache[cacheKey] = parsedResults;

    if (aiBtn) aiBtn.classList.remove("loading");
    renderAiEstimationCards(exactUserQuery, parsedResults);
  } catch (err) {
    if (aiBtn) aiBtn.classList.remove("loading");
    if (err.name === "AbortError" || thisRequestId !== aiLatestRequestId)
      return;
    if (container) {
      container.innerHTML = `
          <ul class="list-container">
            <li class="list-empty" style="margin-top:0; gap:8px;">
              <span style="color:#ef4444;">⚠️ AI Lookup Error: ${escapeHTML(
                err.message
              )}</span>
              <button type="button" class="toolbar-btn" style="background:var(--input-bg);" onclick="scheduleAutoAiSearch('${escapeForOnclick(
                exactUserQuery
              )}', true)">🔄 Retry AI Search</button>
            </li>
          </ul>`;
    }
  }
}

function renderAiEstimationCards(query, estimations) {
  const container = document.getElementById("ai-search-results-container");
  if (!container) return;

  if (!Array.isArray(estimations) || estimations.length === 0) {
    container.innerHTML = `
        <ul class="list-container">
          <li class="list-empty" style="margin-top:0;">
            <span>🤖 AI could not confidently identify a serving Post Office in Mirzapur or Sonbhadra for "${escapeHTML(
              query
            )}".</span>
          </li>
        </ul>`;
    return;
  }

  let html = "";
  estimations.forEach((est) => {
    const locality = est.searched_text || query;
    const servingBeat = est.serving_bo_or_beat || "";
    const office = est.recommended_office || "Unknown Office";
    const district = est.district || "";
    const pin = est.pin || "N/A";
    const confidence = est.confidence || "Medium";
    const reason =
      est.reason || "Estimated based on Mirzapur/Sonbhadra postal geography.";

    const existsInLocalDb = cachedPostOffices.some(
      (r) =>
        String(r.Office || "")
          .trim()
          .toLowerCase() === office.trim().toLowerCase()
    );

    html += `
        <div class="ai-result-card">
          <div class="ai-card-top-row">
            <span class="ai-badge">✨ AI Estimated Route (Not in Database)</span>
            <span class="ai-confidence-pill">🎯 Confidence: ${escapeHTML(
              confidence
            )}</span>
          </div>
  
          <div class="office-title" style="margin-bottom: 8px;">
            ${escapeHTML(locality)}
            ${
              servingBeat &&
              servingBeat.toLowerCase() !== locality.toLowerCase()
                ? `<span style="font-size: 13px; font-weight: 600; color: var(--text-light);"> (via ${escapeHTML(
                    servingBeat
                  )})</span>`
                : ""
            }
          </div>
  
          <div class="sub-office">
            <span class="badge badge-primary" style="cursor: pointer;" onclick="goToDirectoryOffice('${escapeForOnclick(
              office
            )}')">
              🏢 Sort to Office: ${escapeHTML(office)} ${
      existsInLocalDb ? "✓" : ""
    }
            </span>
            <span class="badge">📍 PIN: ${escapeHTML(pin)}</span>
            ${
              district
                ? `<span class="badge">🗺️ ${escapeHTML(district)}</span>`
                : ""
            }
          </div>
  
          <div class="ai-reason-box">
            💡 <b>Routing Reason:</b> ${escapeHTML(reason)}
          </div>
  
          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
            ${
              existsInLocalDb
                ? `<button type="button" class="toolbar-btn" style="background: var(--input-bg);" onclick="goToDirectoryOffice('${escapeForOnclick(
                    office
                  )}')">📂 View Office in Directory</button>`
                : ""
            }
            <button type="button" class="toolbar-btn" style="background: var(--primary); color: #ffffff;" onclick="prefillUploadFromAi('${escapeForOnclick(
              locality
            )}', '${escapeForOnclick(office)}', '${escapeForOnclick(pin)}')">
              ➕ Propose "${escapeHTML(locality)}" to DB
            </button>
          </div>
        </div>
      `;
  });

  container.innerHTML = html;
}

function prefillUploadFromAi(address, office, pin) {
  switchDashboardView("upload");
  if (typeof switchManualUploadTab === "function") {
    switchManualUploadTab("rows");
  }
  const container = document.getElementById("manual-entries-container");
  const safePin = !pin || pin === "N/A" ? "" : pin;

  container.innerHTML = getManualEntryRowHTML(true);
  const firstRow = container.querySelector(".manual-entry-row");
  if (firstRow) {
    firstRow.querySelector(".manual-address").value = address;
    firstRow.querySelector(".manual-office").value = office;
    firstRow.querySelector(".manual-Pin").value = safePin;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  showToast("✨ Pre-filled! Tap Submit All to send for approval.");
}

// --- COPY & CSV EXPORT ---
function copyResults() {
  if (!canCopyResults()) {
    return showToast(
      "🚫 Copying results is disabled by Superadmin.",
      "warning"
    );
  }
  if (!currentFilteredData.length) return showToast("No data to copy!");
  const text = currentFilteredData
    .map(
      (r) =>
        `Address: ${r.item.Address} | Office: ${r.item.Office} | Pin ${r.item.Pin}`
    )
    .join("\n");
  navigator.clipboard
    .writeText(text)
    .then(() => showToast("📋 List copied to clipboard!"));
}

function exportCSV() {
  if (!canExportCSV()) {
    return showToast("🚫 CSV export is disabled by Superadmin.", "warning");
  }
  if (!currentFilteredData.length) return showToast("No data to export!");

  const escapeCSV = (str) => {
    if (str === null || str === undefined) return "";
    return String(str).replace(/"/g, '""');
  };

  let csv = "Address,Office,Pin\n";
  currentFilteredData.forEach((row) => {
    csv += `"${escapeCSV(row.item.Address)}","${escapeCSV(
      row.item.Office
    )}","${escapeCSV(row.item.Pin)}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "DakMitra_Export.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("📥 CSV Exported successfully!");
}

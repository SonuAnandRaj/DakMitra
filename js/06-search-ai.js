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

// Evaluates match strength across 5 pools (0 = strongest, 4 = weakest):
// Pool 0: Exact core or exact phonetic match (regular village beats prefix-only BO)
// Pool 1: Strong match (exact 1st word, >=60% 1st-word prefix, or powerful 2nd/later-word match)
// Pool 2: Standard 1st-word start (incl. 1-letter) or powerful 5+/6+ char mid-word match
// Pool 3: Standard 2nd/later-word start or unordered multi-word start match
// Pool 4: Standard mid-word substring or Fuse.js fuzzy typo fallback
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
      ? { pool: 0, tightness: 0, coverage: 1, midPos: 0, startsSameChar: true }
      : {
          pool: 4,
          tightness: 9,
          coverage: 0,
          midPos: 1,
          startsSameChar: false,
        };
  }

  const firstWord = words[0] || "";
  const firstWordPhon = wordPhonetics[0] || "";
  const qLen = qCore.length;
  const startsSameChar = Boolean(firstWord && firstWord[0] === qCore[0]);

  // POOL 0: Exact / Perfect Match
  if (core === qCore) {
    return { pool: 0, tightness: 0, coverage: 1, midPos: 0, startsSameChar };
  }
  if (qPhon.length >= 2 && phonetic === qPhon) {
    return { pool: 0, tightness: 1, coverage: 1, midPos: 0, startsSameChar };
  }

  // POOL 1: Exact 1st Word / High-Coverage 1st-Word Prefix / Powerful Later-Word Match
  if (core.startsWith(qCore + " ")) {
    return {
      pool: 1,
      tightness: 0,
      coverage: qLen / Math.max(1, core.length),
      midPos: 0,
      startsSameChar,
    };
  }

  if (qWords.length === 1) {
    // High-coverage 1st-word prefix (e.g. "nauh" -> "Nauha" 80%, "laps" -> "Lapsi" 80%)
    if (qLen >= 3 && firstWord.startsWith(qCore)) {
      const cov = qLen / Math.max(1, firstWord.length);
      if (cov >= 0.6) {
        return {
          pool: 1,
          tightness: 1,
          coverage: cov,
          midPos: 0,
          startsSameChar,
        };
      }
    }

    // Powerful exact or high-coverage match at start of 2nd/later word
    if (words.length > 1) {
      let bestLaterCov = 0;
      let hasPowerfulLaterExact = false;

      for (let i = 1; i < words.length; i++) {
        const w = words[i];
        const wp = wordPhonetics[i] || "";
        if (qLen >= 4 && (w === qCore || (qPhon.length >= 2 && wp === qPhon))) {
          hasPowerfulLaterExact = true;
          bestLaterCov = 1;
          break;
        }
        if (qLen >= 5 && w.startsWith(qCore)) {
          const cov = qLen / Math.max(1, w.length);
          if (cov >= 0.7 && cov > bestLaterCov) {
            bestLaterCov = cov;
          }
        }
      }

      if (hasPowerfulLaterExact || bestLaterCov >= 0.7) {
        return {
          pool: 1,
          tightness: hasPowerfulLaterExact ? 2 : 3,
          coverage: bestLaterCov,
          midPos: 0,
          startsSameChar,
        };
      }
    }
  } else if (qWords.length > 1) {
    let allTokensMatched = true;
    for (let i = 0; i < qWords.length; i++) {
      const qw = qWords[i];
      const qwp = qWordPhons[i] || "";
      const wordHit = words.some((w) => w === qw || w.startsWith(qw));
      const phonHit =
        qwp.length >= 2 &&
        wordPhonetics.some(
          (wp) => wp === qwp || (qwp.length >= 3 && wp.startsWith(qwp))
        );
      if (!wordHit && !phonHit) {
        allTokensMatched = false;
        break;
      }
    }

    if (allTokensMatched) {
      const q0 = qWords[0];
      const q0p = qWordPhons[0] || "";
      const startsWithWord0 =
        firstWord.startsWith(q0) ||
        (q0p.length >= 2 && firstWordPhon.startsWith(q0p));

      if (startsWithWord0) {
        return {
          pool: 1,
          tightness: core.startsWith(qCore) ? 0 : 2,
          coverage: qLen / Math.max(1, core.length),
          midPos: 0,
          startsSameChar,
        };
      }
      return {
        pool: 3,
        tightness: 0,
        coverage: qLen / Math.max(1, core.length),
        midPos: 0,
        startsSameChar,
      };
    }
  }

  // POOL 2: Standard 1st-Word Start (incl. 1-letter) & Very Powerful Mid-Word Match
  if (core.startsWith(qCore)) {
    return {
      pool: 2,
      tightness: 0,
      coverage: qLen / Math.max(1, firstWord.length || core.length),
      midPos: 0,
      startsSameChar,
    };
  }
  if (
    qPhon.length >= 3 &&
    (firstWordPhon.startsWith(qPhon) || phonetic.startsWith(qPhon))
  ) {
    return {
      pool: 2,
      tightness: 1,
      coverage:
        qPhon.length / Math.max(1, firstWordPhon.length || phonetic.length),
      midPos: 0,
      startsSameChar,
    };
  }

  if (qLen >= 5) {
    const coreIdx = core.indexOf(qCore);
    if (coreIdx > 0) {
      let bestMidCov = 0;
      for (let i = 0; i < words.length; i++) {
        if (words[i].includes(qCore)) {
          const cov = qLen / Math.max(1, words[i].length);
          if (cov > bestMidCov) bestMidCov = cov;
        }
      }
      if (bestMidCov >= 0.5 || qLen >= 6) {
        return {
          pool: 2,
          tightness: 2,
          coverage: bestMidCov || qLen / Math.max(1, core.length),
          midPos: coreIdx / Math.max(1, core.length),
          startsSameChar,
        };
      }
    }
  }

  // POOL 3: Standard 2nd / Later-Word Start (incl. 1-letter)
  if (qWords.length === 1 && words.length > 1) {
    for (let i = 1; i < words.length; i++) {
      if (words[i].startsWith(qCore)) {
        return {
          pool: 3,
          tightness: 0,
          coverage: qLen / Math.max(1, words[i].length),
          midPos: 0,
          startsSameChar,
        };
      }
    }
    if (qPhon.length >= 3) {
      for (let i = 1; i < wordPhonetics.length; i++) {
        const wp = wordPhonetics[i];
        if (wp === qPhon || wp.startsWith(qPhon)) {
          return {
            pool: 3,
            tightness: 1,
            coverage: qPhon.length / Math.max(1, wp.length),
            midPos: 0,
            startsSameChar,
          };
        }
      }
    }
  }

  // POOL 4: Standard Middle-of-Word Substring or Fuse.js Fuzzy Typo Fallback
  const midIdx = core.indexOf(qCore);
  const rawIdx = midIdx >= 0 ? midIdx : rawLower.indexOf(qLower);
  const midPos =
    rawIdx >= 0 ? rawIdx / Math.max(1, core.length || rawLower.length) : 1;

  return {
    pool: 4,
    tightness: rawIdx >= 0 ? 0 : 1,
    coverage: rawIdx >= 0 ? qLen / Math.max(1, core.length) : 0,
    midPos,
    startsSameChar,
  };
}

// Helper: Picks matching keys for rare Fuse.js typo hits without computing full match indices
function buildFallbackMatches(meta, row, qLower, qPhon, keysToSearch) {
  if (keysToSearch.length === 1) return [{ key: keysToSearch[0] }];
  const out = [];
  for (let i = 0; i < keysToSearch.length; i++) {
    const key = keysToSearch[i];
    if (key === "Address") {
      if (
        meta.addrLower.includes(qLower) ||
        (qPhon.length >= 2 && meta.addrPhonetic.includes(qPhon))
      ) {
        out.push({ key });
      }
    } else if (key === "Office") {
      if (
        meta.officeLower.includes(qLower) ||
        (qPhon.length >= 2 && meta.officePhonetic.includes(qPhon))
      ) {
        out.push({ key });
      }
    } else if (key === "Pin") {
      if (
        String(row.Pin || "")
          .toLowerCase()
          .includes(qLower)
      ) {
        out.push({ key });
      }
    }
  }
  return out.length > 0 ? out : [{ key: keysToSearch[0] }];
}

// Fast 2-Stage Search: Precomputed exact/prefix/substring/phonetic first, lazy Fuse fallback only for typos
function runFastTextSearch(
  dataset,
  cleanQuery,
  filterVal,
  keysToSearch,
  isFilteredDataset
) {
  const textKeys = keysToSearch.filter(
    (k) => k === "Address" || k === "Office"
  );
  const checkPin = keysToSearch.includes("Pin");

  const qLower = cleanQuery.toLowerCase().trim();
  const qCore = stripPostalSuffixes(cleanQuery);
  const qWords = qCore ? qCore.split(" ") : [];
  const qPhon = postalPhoneticKey(cleanQuery);
  const qWordPhons = qWords.map((w) => postalPhoneticKey(w));
  const hasMultiWord = qWords.length > 1;

  const rankedMap = new Map();

  const scoreTextRow = (meta, fuseScore) => {
    let bestPool = 4;
    let bestFieldPenalty = 1;
    let bestTightness = 9;
    let bestCoverage = 0;
    let bestMidPos = 1;
    let bestStartsSameChar = false;

    for (let i = 0; i < textKeys.length; i++) {
      const key = textKeys[i];
      const fieldPenalty = key === "Address" ? 0 : 1;
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

      const isBetter =
        res.pool < bestPool ||
        (res.pool === bestPool && fieldPenalty < bestFieldPenalty) ||
        (res.pool === bestPool &&
          fieldPenalty === bestFieldPenalty &&
          res.tightness < bestTightness) ||
        (res.pool === bestPool &&
          fieldPenalty === bestFieldPenalty &&
          res.tightness === bestTightness &&
          res.coverage > bestCoverage);

      if (isBetter) {
        bestPool = res.pool;
        bestFieldPenalty = fieldPenalty;
        bestTightness = res.tightness;
        bestCoverage = res.coverage;
        bestMidPos = res.midPos;
        bestStartsSameChar = Boolean(res.startsSameChar);
      }
    }

    let adjustedFuseScore = typeof fuseScore === "number" ? fuseScore : 0.25;
    if (
      bestPool === 4 &&
      bestTightness === 1 &&
      qCore.length >= 2 &&
      bestStartsSameChar
    ) {
      adjustedFuseScore = Math.max(0, adjustedFuseScore - 0.06);
    }

    return {
      pool: bestPool,
      fieldPenalty: bestFieldPenalty,
      tightness: bestTightness,
      coverage: bestCoverage,
      midPos: bestMidPos,
      effectivePriority: meta.effectivePriority,
      fuseScore: adjustedFuseScore,
      addrLower: meta.addrLower,
    };
  };

  // Stage 1: Single fast scan over precomputed searchIndexMap metadata (~2-4ms for 4,340 rows)
  for (let i = 0; i < dataset.length; i++) {
    const row = dataset[i];
    const meta = getSearchMeta(row);
    let matches = null;
    let bestSyntheticScore = 0.28;

    for (let k = 0; k < textKeys.length; k++) {
      const key = textKeys[k];
      const rawLower = key === "Address" ? meta.addrLower : meta.officeLower;
      const core = key === "Address" ? meta.addrCore : meta.officeCore;
      const fieldPhon =
        key === "Address" ? meta.addrPhonetic : meta.officePhonetic;
      const fieldWordPhons =
        key === "Address" ? meta.addrWordPhonetics : meta.officeWordPhonetics;

      let hit = false;
      let hitScore = 0.28;

      const rawIdx = rawLower.indexOf(qLower);
      if (rawIdx !== -1) {
        hit = true;
        hitScore =
          rawIdx === 0
            ? 0.0
            : 0.12 + 0.16 * (rawIdx / Math.max(1, rawLower.length));
      } else if (qCore.length >= 2 && core.includes(qCore)) {
        const coreIdx = core.indexOf(qCore);
        hit = true;
        hitScore =
          coreIdx === 0
            ? 0.02
            : 0.14 + 0.14 * (coreIdx / Math.max(1, core.length));
      } else if (
        (qPhon.length >= 2 && fieldPhon === qPhon) ||
        (qPhon.length >= 3 &&
          (fieldPhon.includes(qPhon) ||
            fieldWordPhons.some((wp) => wp === qPhon || wp.startsWith(qPhon))))
      ) {
        hit = true;
        hitScore = fieldPhon === qPhon ? 0.05 : 0.18;
      } else if (hasMultiWord) {
        const words = key === "Address" ? meta.addrWords : meta.officeWords;
        let allTokens = true;
        for (let t = 0; t < qWords.length; t++) {
          const qw = qWords[t];
          const qwp = qWordPhons[t] || "";
          const ok =
            words.some(
              (w) => w === qw || (qw.length >= 2 && w.startsWith(qw))
            ) ||
            (qwp.length > 0 &&
              fieldWordPhons.some(
                (wp) => wp === qwp || (qwp.length >= 3 && wp.startsWith(qwp))
              ));
          if (!ok) {
            allTokens = false;
            break;
          }
        }
        if (allTokens) {
          hit = true;
          hitScore = 0.12;
        }
      }

      if (hit) {
        if (!matches) matches = [];
        matches.push({ key });
        if (hitScore < bestSyntheticScore) bestSyntheticScore = hitScore;
      }
    }

    if (
      checkPin &&
      String(row.Pin || "")
        .toLowerCase()
        .includes(qLower)
    ) {
      if (!matches) matches = [];
      matches.push({ key: "Pin" });
      if (0.08 < bestSyntheticScore) bestSyntheticScore = 0.08;
    }

    if (matches) {
      rankedMap.set(String(row.id), {
        result: { item: row, matches },
        rank: scoreTextRow(meta, bestSyntheticScore),
      });
    }
  }

  // Stage 2: Lazy Fuse.js typo fallback ONLY when Stage 1 found fewer than 12 matches
  if (rankedMap.size < 12 && cleanQuery.length >= 3 && window.Fuse) {
    const localFuse = !isFilteredDataset
      ? getCachedFuseInstance(filterVal, false)
      : new Fuse(dataset, {
          keys: keysToSearch,
          threshold: 0.3,
          ignoreLocation: false,
          location: 0,
          distance: 100,
          includeMatches: false,
          includeScore: true,
          getFn: (obj, path) => {
            const value = obj[path];
            return value === null || value === undefined ? "" : String(value);
          },
        });

    const fuseHits = localFuse
      ? localFuse.search(cleanQuery, { limit: 40 })
      : [];
    for (let i = 0; i < fuseHits.length; i++) {
      const res = fuseHits[i];
      const row = res.item;
      const idKey = String(row.id);
      if (rankedMap.has(idKey)) continue;
      const meta = getSearchMeta(row);
      rankedMap.set(idKey, {
        result: {
          item: row,
          matches: buildFallbackMatches(meta, row, qLower, qPhon, keysToSearch),
        },
        rank: scoreTextRow(meta, res.score),
      });
    }
  }

  // Sort across 5 pools:
  //   Pools 0-3: Pool ASC -> Address over Office -> Priority DESC -> Tightness ASC -> Coverage DESC -> A-Z
  //   Pool 4 (Mid-word & fuzzy): Score Bucket ASC -> Address over Office -> Priority DESC -> Mid Position ASC -> A-Z
  return Array.from(rankedMap.values())
    .sort((a, b) => {
      const ra = a.rank;
      const rb = b.rank;

      if (ra.pool !== rb.pool) return ra.pool - rb.pool;

      if (ra.pool <= 3) {
        if (ra.fieldPenalty !== rb.fieldPenalty) {
          return ra.fieldPenalty - rb.fieldPenalty;
        }
        if (rb.effectivePriority !== ra.effectivePriority) {
          return rb.effectivePriority - ra.effectivePriority;
        }
        if (ra.tightness !== rb.tightness) return ra.tightness - rb.tightness;
        if (Math.abs(rb.coverage - ra.coverage) > 0.08) {
          return rb.coverage - ra.coverage;
        }
        return ra.addrLower.localeCompare(rb.addrLower);
      }

      const bucketA = Math.round(ra.fuseScore * 15);
      const bucketB = Math.round(rb.fuseScore * 15);
      if (bucketA !== bucketB) return bucketA - bucketB;
      if (ra.fieldPenalty !== rb.fieldPenalty) {
        return ra.fieldPenalty - rb.fieldPenalty;
      }
      if (rb.effectivePriority !== ra.effectivePriority) {
        return rb.effectivePriority - ra.effectivePriority;
      }
      if (Math.abs(ra.midPos - rb.midPos) > 0.05) {
        return ra.midPos - rb.midPos;
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
  sortDefaultByRecent = false,
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
    return {
      results: getDefaultSortedResults(sortDefaultByRecent),
      cleanQuery: "",
      detectedSuffix: null,
      targetOffice: null,
      isNumericSearch: false,
      keysToSearch: ["Address", "Office", "Pin"],
      hasAnyCriteria: false,
    };
  }

  // Narrow dataset upfront by smart office, office filter, or PIN filter before scanning
  const hasDatasetFilter = Boolean(
    targetOffice || officeFilterLower || pinFilterLower
  );
  let searchDataset = cachedPostOffices || [];

  if (hasDatasetFilter) {
    const targetOfficeLower = targetOffice ? targetOffice.toLowerCase() : "";
    const isUniquePinSuffix =
      pinFilterLower &&
      /^\d{3}$/.test(pinFilterLower) &&
      pinSuffixToOfficeMap.has(pinFilterLower);

    searchDataset = searchDataset.filter((row) => {
      const rowOfficeLower = String(row.Office || "")
        .trim()
        .toLowerCase();
      if (targetOfficeLower && rowOfficeLower !== targetOfficeLower) {
        return false;
      }
      if (officeFilterLower && !rowOfficeLower.includes(officeFilterLower)) {
        return false;
      }
      if (pinFilterLower) {
        const rowPin = String(row.Pin || "")
          .trim()
          .toLowerCase();
        const pinMatched = isUniquePinSuffix
          ? rowPin.endsWith(pinFilterLower)
          : rowPin.includes(pinFilterLower);
        if (!pinMatched) return false;
      }
      return true;
    });
  }

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

    if (isNumericSearch || filterVal === "pin") {
      // Direct strict substring scan (identical to Fuse threshold 0.0, 20x faster)
      const qLower = cleanQuery.toLowerCase();
      for (let i = 0; i < searchDataset.length; i++) {
        const row = searchDataset[i];
        let matches = null;
        for (let k = 0; k < keysToSearch.length; k++) {
          const key = keysToSearch[k];
          if (
            String(row[key] ?? "")
              .toLowerCase()
              .includes(qLower)
          ) {
            if (!matches) matches = [];
            matches.push({ key });
          }
        }
        if (matches) baseData.push({ item: row, matches });
      }
      baseData.sort((a, b) => compareByPriorityOnly(a.item, b.item));
    } else {
      baseData = runFastTextSearch(
        searchDataset,
        cleanQuery,
        filterVal,
        keysToSearch,
        hasDatasetFilter
      );
    }
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
    sortDefaultByRecent: true,
  });

  window.activeCleanSearchQuery = outcome.cleanQuery;
  window.activeSmartOfficeFilter = outcome.targetOffice
    ? { suffix: outcome.detectedSuffix, office: outcome.targetOffice }
    : null;

  updateActiveFilterIndicators();

  if (!searchInput) {
    clearTimeout(searchHistorySaveTimer);
    lastCommittedSearchTerm = "";
  } else if (hidePanels || window.isVoiceSearch) {
    commitCurrentSearchToHistory();
  } else if (!silent) {
    scheduleSearchHistoryCommit(1200);
  }

  currentFilteredData = outcome.results;
  if (preserveLimit !== null) {
    window.searchDisplayLimit = Math.max(
      10,
      Math.min(preserveLimit, currentFilteredData.length || 10)
    );
  }
  renderResults(preserveLimit !== null, silent, Boolean(options?.isTyping));

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

  if (
    cachedDeliveryOfficesSummary.length === 0 &&
    cachedPostOffices?.length > 0
  ) {
    buildPinSuffixIndex();
  }

  const allOffices = cachedDeliveryOfficesSummary;
  const matches = [];

  const qLower = cleanQuery.toLowerCase();
  const qCore = stripPostalSuffixes(cleanQuery);
  const qPhon = postalPhoneticKey(cleanQuery);
  const isNumeric = /^\d+$/.test(cleanQuery);
  const smartOfficeLower = smartOffice.toLowerCase();
  const isUniquePinFilter =
    filterPin &&
    /^\d{3}$/.test(filterPin) &&
    pinSuffixToOfficeMap.has(filterPin);

  for (let i = 0; i < allOffices.length; i++) {
    const item = allOffices[i];
    const offLower = item.officeLower;
    const offPin = item.pinLower;

    // Respect explicit secondary Office / PIN filters
    if (filterOffice && !offLower.includes(filterOffice)) continue;
    if (smartOfficeLower && offLower !== smartOfficeLower) continue;
    if (filterPin) {
      const pinOk = isUniquePinFilter
        ? offPin.endsWith(filterPin)
        : offPin.includes(filterPin);
      if (!pinOk) continue;
    }

    // Standalone 3-digit PIN suffix or filter-only view (e.g. typed "501" or selected Office filter)
    if (!cleanQuery) {
      if (smartOfficeLower && offLower === smartOfficeLower) {
        matches.push({ ...item, rank: 0 });
      } else if (!smartOfficeLower && (filterOffice || filterPin)) {
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
      const offCore = item.officeCore;
      const offPhon = item.officePhonetic;

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
      const officeRec =
        typeof getDeliveryOfficeByName === "function"
          ? getDeliveryOfficeByName(item.office)
          : null;
      const officeType =
        officeRec?.office_type ||
        (detectOfficeType(item.office) === "HO"
          ? "HO"
          : /\bNSH\b/i.test(String(item.office || "").replace(/\./g, ""))
          ? "NSH"
          : "SO");
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

function renderResults(isLoadMore = false, silent = false, skipAnim = false) {
  const displayArea = document.getElementById("results-display-area");
  const noAnim = Boolean(silent || skipAnim || isLoadMore);

  if (!isLoadMore && !silent) {
    displayArea.scrollTop = 0;
    window.searchDisplayLimit = 10;
  }

  const matchedDeliveryOffices = findMatchingDeliveryOfficesForSearch();
  const officeCardsHtml = buildSearchDeliveryOfficeCardsHTML(
    matchedDeliveryOffices,
    noAnim
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
        noAnim ? " no-card-anim" : ""
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
        const isUnverified = isUnverifiedRecord(row);
        const officeType = detectOfficeType(row.Address);
        const isAutoTopOffice = officeType === "HO" || officeType === "SO";
        const unverifiedBadgeHtml = isUnverified
          ? `<span class="unverified-pill" title="Bulk uploaded — not yet verified">Unverified</span>`
          : "";

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

        const verifyToggleHtml = isUnverified
          ? `<button
              type="button"
              class="card-verify-btn"
              onclick="event.stopPropagation(); verifySingleRecord('${escapeForOnclick(
                row.id
              )}')"
              title="Mark as Verified (Shared with all staff)"
              aria-label="Verify Address"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>`
          : "";

        const sideActionsHtml =
          priorityToggleHtml || verifyToggleHtml
            ? `<div class="search-card-side-actions">${priorityToggleHtml}${verifyToggleHtml}</div>`
            : "";

        html += `
          <li class="list-item${isUnverified ? " is-unverified" : ""}"
              onclick="openDirectoryChipActions(this)"
              data-record-id="${escapeHTML(row.id)}"
              data-address="${escapeHTML(row.Address)}"
              data-office="${escapeHTML(row.Office)}"
              data-pin="${escapeHTML(row.Pin || "")}"
              style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
              <div class="search-card-layout">
                <div class="search-card-main">
                  <div class="office-title">${addressHtml}${unverifiedBadgeHtml}</div>
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
                ${sideActionsHtml}
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
        const isUnverified = isUnverifiedRecord(row);
        const officeType = detectOfficeType(row.Address);
        const isAutoTopOffice = officeType === "HO" || officeType === "SO";
        const tableUnverifiedHtml = isUnverified
          ? `<span class="unverified-pill" title="Bulk uploaded — not yet verified">Unverified</span>`
          : "";

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

        const tableVerifyBtn = isUnverified
          ? `<button
              type="button"
              class="table-verify-btn"
              onclick="event.stopPropagation(); verifySingleRecord('${escapeForOnclick(
                row.id
              )}')"
              title="Mark as Verified (Shared)"
              aria-label="Verify Address"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>`
          : "";

        const tableActionsHtml =
          tablePriorityBtn || tableVerifyBtn
            ? `<div class="table-row-actions">${tablePriorityBtn}${tableVerifyBtn}</div>`
            : "";

        html += `<tr class="list-item"
                      onclick="openDirectoryChipActions(this)"
                      data-record-id="${escapeHTML(row.id)}"
                      data-address="${escapeHTML(row.Address)}"
                      data-office="${escapeHTML(row.Office)}"
                      data-pin="${escapeHTML(row.Pin || "")}">
                      <td>
                        <div class="table-addr-cell">
                          <span>${addressHtml}${tableUnverifiedHtml}</span>
                          ${tableActionsHtml}
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

  setupSearchObserver();
}

// --- SMART RECENT SEARCH HISTORY COMMIT (Enter, Scroll, Tap, Voice, or 1.2s Pause) ---
let searchHistorySaveTimer = null;
let lastCommittedSearchTerm = "";

function commitCurrentSearchToHistory() {
  clearTimeout(searchHistorySaveTimer);
  searchHistorySaveTimer = null;
  const term = document.getElementById("search-input")?.value.trim() || "";
  if (term.length < 3) return;
  const termLower = term.toLowerCase();
  if (termLower === lastCommittedSearchTerm) return;
  lastCommittedSearchTerm = termLower;
  saveSearchTerm(term);
}

function scheduleSearchHistoryCommit(delayMs = 1200) {
  clearTimeout(searchHistorySaveTimer);
  const term = document.getElementById("search-input")?.value.trim() || "";
  if (term.length < 3) return;
  searchHistorySaveTimer = setTimeout(commitCurrentSearchToHistory, delayMs);
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
    searchTimeout = setTimeout(
      () => triggerSearch(false, { isTyping: true }),
      60
    );
  });

  // Save search term automatically when user scrolls or taps a result
  const resultsArea = document.getElementById("results-display-area");
  if (resultsArea) {
    resultsArea.addEventListener(
      "scroll",
      () => {
        if (resultsArea.scrollTop > 10) commitCurrentSearchToHistory();
      },
      { passive: true }
    );
    resultsArea.addEventListener(
      "pointerdown",
      (e) => {
        if (e.target.closest(".list-item, .search-office-card")) {
          commitCurrentSearchToHistory();
        }
      },
      { passive: true }
    );
  }
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

  container.innerHTML = getManualEntryRowHTML(1);
  const firstRow = container.querySelector(".manual-entry-row");
  if (firstRow) {
    firstRow.querySelector(".manual-address").value = address;
    firstRow.querySelector(".manual-office").value = office;
    firstRow.querySelector(".manual-Pin").value = safePin;
    firstRow.querySelector(".clear-btn")?.classList.toggle("hidden", !office);
  }
  if (typeof updateManualSubmitCount === "function") {
    updateManualSubmitCount();
  }
  const uploadArea = document.getElementById("upload-display-area");
  if (uploadArea) uploadArea.scrollTop = 0;
  showToast("✨ Pre-filled! Tap Submit to send for approval.");
}

// --- COPY & CSV EXPORT ---
function copyResults() {
  if (!canCopyResults()) {
    return showToast("🚫 Copying results is disabled by the admin.", "warning");
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
    return showToast("🚫 CSV export is disabled by the admin.", "warning");
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

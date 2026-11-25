// =========================================================
// 12-LEARN-QUIZ.JS — Spaced-Repetition Learn, Quiz & Mastery
// Part 1: Store, Background Cloud Sync, Filters & 3D Flashcards
// =========================================================

const LEARN_RING_CIRCUMFERENCE = 263.89;
const LEARN_DAILY_GOAL_DEFAULT = 15;
const LEARN_LEADERBOARD_CACHE_KEY = "dakmitra_learning_leaderboard_cache";
const LEARN_SMART_MIX_KEY = "dakmitra_learn_smart_mix";

// 5-Box Leitner Intervals (Box 0 = 2m, 1 = 4h, 2 = 1d, 3 = 3d, 4 = 7d, 5 = 21d)
const LEARN_BOX_INTERVALS_MS = [
  2 * 60 * 1000,
  4 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  21 * 24 * 60 * 60 * 1000,
];

const LEARN_BOX_LABELS = [
  "2 min",
  "4 hrs",
  "1 day",
  "3 days",
  "7 days",
  "21 days",
];

const learnState = {
  activeTab: "learn", // 'learn' | 'quiz' | 'mastery'
  officeScope: "all", // 'all' | exact Delivery Office name (e.g. 'Amwar SO')
  categoryFilter: "all", // 'all' | 'office' | 'priority' | 'regular' | 'weak'
  smartMix: localStorage.getItem(LEARN_SMART_MIX_KEY) !== "false",
  progress: null,
  loadedForUserId: null,
  fcCurrentRecord: null,
  fcCurrentIsTrap: false,
  fcFlipped: false,
  fcRecentIds: [],
  fcHistory: [],
  fcHistoryIndex: -1,
  fcConsecutiveTraps: 0,
  fcIsTransitioning: false,
  syncTimer: null,
  isSyncing: false,
  lastSyncedAt: null,
  cloudLoadedForUser: null,
  quiz: {
    active: false,
    mode: "standard",
    count: 15,
    timerEnabled: false,
    hidePin: false,
    autoNext: true,
    questions: [],
    index: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    xpEarned: 0,
    answered: false,
    questionStartMs: 0,
    totalMs: 0,
    missedRecords: [],
    timerInterval: null,
    timeLeft: 10,
    autoNextTimer: null,
    customPool: null,
  },
  masterySortLowest: true,
  masteryShowAllOffices: false,
};

// --- DATE & STORAGE HELPERS ---
function getLearnLocalDateKey(dateObj = new Date()) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getLearnYesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLearnLocalDateKey(d);
}

function getLearnStorageKey(uid = null) {
  const id = uid || currentUserId || "guest";
  return `dakmitra_learning_progress_${id}`;
}

function createEmptyLearnProgress() {
  return {
    version: 1,
    updatedAt: 0,
    leaderboardOptIn: false,
    stats: {
      streakDays: 0,
      lastPracticeDate: null,
      dailyDate: getLearnLocalDateKey(),
      dailyCount: 0,
      dailyGoal: LEARN_DAILY_GOAL_DEFAULT,
      totalAnswered: 0,
      totalCorrect: 0,
      xp: 0,
    },
    cards: {},
  };
}

function normalizeLearnProgress(raw) {
  const base = createEmptyLearnProgress();
  if (!raw || typeof raw !== "object") return base;

  base.updatedAt = Number(raw.updatedAt) || 0;
  base.leaderboardOptIn = Boolean(raw.leaderboardOptIn);

  if (raw.stats && typeof raw.stats === "object") {
    const s = raw.stats;
    base.stats.streakDays = Math.max(0, Number(s.streakDays) || 0);
    base.stats.lastPracticeDate =
      typeof s.lastPracticeDate === "string" ? s.lastPracticeDate : null;
    base.stats.dailyDate =
      typeof s.dailyDate === "string" ? s.dailyDate : getLearnLocalDateKey();
    base.stats.dailyCount = Math.max(0, Number(s.dailyCount) || 0);
    base.stats.dailyGoal = Math.max(
      5,
      Number(s.dailyGoal) || LEARN_DAILY_GOAL_DEFAULT
    );
    base.stats.totalAnswered = Math.max(0, Number(s.totalAnswered) || 0);
    base.stats.totalCorrect = Math.min(
      base.stats.totalAnswered,
      Math.max(0, Number(s.totalCorrect) || 0)
    );
    base.stats.xp = Math.max(0, Number(s.xp) || 0);
  }

  if (raw.cards && typeof raw.cards === "object") {
    Object.keys(raw.cards).forEach((idKey) => {
      const c = raw.cards[idKey];
      if (!c || typeof c !== "object") return;
      base.cards[String(idKey)] = {
        box: Math.min(5, Math.max(0, Number(c.box) || 0)),
        dueAt: Number(c.dueAt) || 0,
        hits: Math.max(0, Number(c.hits) || 0),
        misses: Math.max(0, Number(c.misses) || 0),
        avgMs: Math.max(0, Number(c.avgMs) || 0),
        lastSeen: Number(c.lastSeen) || 0,
      };
    });
  }

  // Reset daily counter cleanly if a new calendar day started
  const today = getLearnLocalDateKey();
  if (base.stats.dailyDate !== today) {
    base.stats.dailyDate = today;
    base.stats.dailyCount = 0;
  }

  return base;
}

function getLearnProgress() {
  const uid = currentUserId || "guest";
  if (learnState.progress && learnState.loadedForUserId === uid) {
    const today = getLearnLocalDateKey();
    if (learnState.progress.stats.dailyDate !== today) {
      learnState.progress.stats.dailyDate = today;
      learnState.progress.stats.dailyCount = 0;
    }
    return learnState.progress;
  }

  let parsed = null;
  try {
    const raw = localStorage.getItem(getLearnStorageKey(uid));
    if (raw) parsed = JSON.parse(raw);
  } catch (_) {}

  learnState.progress = normalizeLearnProgress(parsed);
  learnState.loadedForUserId = uid;
  return learnState.progress;
}

function getEffectiveStreakDays(prog) {
  const last = prog?.stats?.lastPracticeDate;
  if (!last) return 0;
  const today = getLearnLocalDateKey();
  const yesterday = getLearnYesterdayKey();
  if (last === today || last === yesterday) {
    return prog.stats.streakDays || 0;
  }
  return 0;
}

function saveLearnProgressLocal(prog, scheduleCloud = true) {
  prog.updatedAt = Date.now();
  learnState.progress = prog;
  learnState.loadedForUserId = currentUserId || "guest";

  try {
    localStorage.setItem(getLearnStorageKey(), JSON.stringify(prog));
  } catch (e) {
    console.warn("Could not save learning progress locally:", e);
  }

  updateSidebarLearnBadge();
  if (scheduleCloud) {
    scheduleLearnCloudSync();
  }
}

// --- METRICS & PRUNING ---
function isWeakLearnCard(card) {
  if (!card) return false;
  return card.misses >= 2 || (card.misses >= 1 && card.box === 0);
}

function computeLearnSummaryMetrics(prog = null, recordsOverride = null) {
  const p = prog || getLearnProgress();
  const records = Array.isArray(recordsOverride)
    ? recordsOverride
    : Array.isArray(cachedPostOffices)
    ? cachedPostOffices
    : [];
  const totalAddresses = records.length;

  let masteredCount = 0;
  let reviewingCount = 0;
  let studiedCount = 0;
  let dueCount = 0;
  let weakCount = 0;
  const now = Date.now();

  for (let i = 0; i < records.length; i++) {
    const c = p.cards[String(records[i].id)];
    if (!c) continue;
    studiedCount++;
    if (c.box >= 4) masteredCount++;
    else reviewingCount++;
    if (c.dueAt <= now) dueCount++;
    if (isWeakLearnCard(c)) weakCount++;
  }

  const masteryPct =
    totalAddresses > 0 ? Math.round((masteredCount / totalAddresses) * 100) : 0;
  const totalAns = p.stats.totalAnswered || 0;
  const accuracyPct =
    totalAns > 0
      ? Math.round(((p.stats.totalCorrect || 0) / totalAns) * 100)
      : 0;

  return {
    totalAddresses,
    masteredCount,
    reviewingCount,
    studiedCount,
    dueCount,
    weakCount,
    masteryPct,
    accuracyPct,
    streakDays: getEffectiveStreakDays(p),
    dailyCount: p.stats.dailyCount || 0,
    dailyGoal: p.stats.dailyGoal || LEARN_DAILY_GOAL_DEFAULT,
    xp: p.stats.xp || 0,
  };
}

function pruneDeletedLearnCards() {
  if (!Array.isArray(cachedPostOffices) || cachedPostOffices.length === 0)
    return;
  const prog = getLearnProgress();
  const validIds = new Set(cachedPostOffices.map((r) => String(r.id)));
  let changed = false;

  Object.keys(prog.cards).forEach((idKey) => {
    if (!validIds.has(idKey)) {
      delete prog.cards[idKey];
      changed = true;
    }
  });

  if (Array.isArray(learnState.fcHistory) && learnState.fcHistory.length > 0) {
    learnState.fcHistory = learnState.fcHistory.filter((entry) =>
      validIds.has(String(entry.recordId))
    );
    if (learnState.fcHistoryIndex >= learnState.fcHistory.length) {
      learnState.fcHistoryIndex = learnState.fcHistory.length - 1;
    }
  }

  if (changed) {
    saveLearnProgressLocal(prog, true);
  }
}

function updateSidebarLearnBadge() {
  const badge = document.getElementById("sidebar-learn-badge");
  if (!badge) return;
  if (
    !currentUserId ||
    !Array.isArray(cachedPostOffices) ||
    !cachedPostOffices.length
  ) {
    badge.classList.add("hidden");
    return;
  }

  const m = computeLearnSummaryMetrics();
  if (m.studiedCount > 0) {
    badge.textContent = `${m.masteryPct}%`;
    badge.title = `${m.masteredCount} of ${m.totalAddresses} addresses mastered`;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

// --- BACKGROUND CLOUD SYNC (OFFLINE-FIRST + MERGE) ---
function updateLearnSyncStatusText(text) {
  const el = document.getElementById("learn-sync-status");
  if (el) el.textContent = text;
}

function mergeLearnProgress(localProg, cloudProg) {
  const merged = createEmptyLearnProgress();
  const l = normalizeLearnProgress(localProg);
  const c = normalizeLearnProgress(cloudProg);

  merged.updatedAt = Math.max(l.updatedAt, c.updatedAt);
  merged.leaderboardOptIn =
    c.updatedAt > l.updatedAt ? c.leaderboardOptIn : l.leaderboardOptIn;

  // Merge cards per record ID (keep the more recently practiced state)
  const allIds = new Set([...Object.keys(l.cards), ...Object.keys(c.cards)]);
  allIds.forEach((idKey) => {
    const lc = l.cards[idKey];
    const cc = c.cards[idKey];
    if (lc && !cc) {
      merged.cards[idKey] = { ...lc };
    } else if (!lc && cc) {
      merged.cards[idKey] = { ...cc };
    } else if (lc && cc) {
      const lScore = lc.lastSeen || lc.hits + lc.misses;
      const cScore = cc.lastSeen || cc.hits + cc.misses;
      merged.cards[idKey] = lScore >= cScore ? { ...lc } : { ...cc };
    }
  });

  // Merge aggregate stats safely
  const today = getLearnLocalDateKey();
  merged.stats.totalAnswered = Math.max(
    l.stats.totalAnswered,
    c.stats.totalAnswered
  );
  merged.stats.totalCorrect = Math.min(
    merged.stats.totalAnswered,
    Math.max(l.stats.totalCorrect, c.stats.totalCorrect)
  );
  merged.stats.xp = Math.max(l.stats.xp, c.stats.xp);
  merged.stats.dailyGoal =
    c.updatedAt > l.updatedAt ? c.stats.dailyGoal : l.stats.dailyGoal;

  const lDate = l.stats.lastPracticeDate || "";
  const cDate = c.stats.lastPracticeDate || "";
  if (lDate === cDate) {
    merged.stats.lastPracticeDate = lDate || null;
    merged.stats.streakDays = Math.max(l.stats.streakDays, c.stats.streakDays);
  } else if (lDate > cDate) {
    merged.stats.lastPracticeDate = lDate;
    merged.stats.streakDays = l.stats.streakDays;
  } else {
    merged.stats.lastPracticeDate = cDate;
    merged.stats.streakDays = c.stats.streakDays;
  }

  merged.stats.dailyDate = today;
  const lToday = l.stats.dailyDate === today ? l.stats.dailyCount : 0;
  const cToday = c.stats.dailyDate === today ? c.stats.dailyCount : 0;
  merged.stats.dailyCount = Math.max(lToday, cToday);

  return merged;
}

function scheduleLearnCloudSync(delayMs = 2500) {
  clearTimeout(learnState.syncTimer);
  if (!navigator.onLine) {
    updateLearnSyncStatusText("📴 Saved offline — will sync online");
    return;
  }
  updateLearnSyncStatusText("⏳ Syncing in background...");
  learnState.syncTimer = setTimeout(() => {
    pushLearningProgressToCloud();
  }, delayMs);
}

async function pushLearningProgressToCloud() {
  if (!navigator.onLine || !currentUserId) {
    updateLearnSyncStatusText("📴 Saved offline — will sync online");
    return false;
  }

  try {
    await ensureSupabaseReady();
    if (!supabaseClient) return false;

    const prog = getLearnProgress();
    const metrics = computeLearnSummaryMetrics(prog);

    const payload = {
      user_id: currentUserId,
      progress_json: prog,
      mastered_count: metrics.masteredCount,
      streak_days: metrics.streakDays,
      total_answered: prog.stats.totalAnswered || 0,
      total_correct: prog.stats.totalCorrect || 0,
      accuracy_pct: metrics.accuracyPct,
      xp: prog.stats.xp || 0,
      leaderboard_opt_in: Boolean(prog.leaderboardOptIn),
    };

    const { error } = await supabaseClient
      .from("user_learning_progress")
      .upsert(payload, { onConflict: "user_id" });

    if (error) throw error;

    learnState.lastSyncedAt = Date.now();
    updateLearnSyncStatusText("☁️ Cloud synced");
    return true;
  } catch (err) {
    console.warn("Learning cloud push skipped:", err?.message || err);
    updateLearnSyncStatusText("📴 Saved locally (offline)");
    return false;
  }
}

async function syncLearningProgressInBackground() {
  if (learnState.isSyncing || !navigator.onLine || !currentUserId) return;
  learnState.isSyncing = true;

  try {
    await ensureSupabaseReady();
    if (!supabaseClient) return;

    const localProg = getLearnProgress();
    const { data, error } = await supabaseClient
      .from("user_learning_progress")
      .select("progress_json, leaderboard_opt_in, updated_at")
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (error) throw error;

    if (data && data.progress_json) {
      const cloudProg = normalizeLearnProgress(data.progress_json);
      cloudProg.leaderboardOptIn = Boolean(data.leaderboard_opt_in);
      if (!cloudProg.updatedAt && data.updated_at) {
        cloudProg.updatedAt = new Date(data.updated_at).getTime() || 0;
      }

      const merged = mergeLearnProgress(localProg, cloudProg);
      const localWasNewer = localProg.updatedAt > cloudProg.updatedAt;

      saveLearnProgressLocal(merged, false);
      learnState.cloudLoadedForUser = currentUserId;

      if (localWasNewer) {
        await pushLearningProgressToCloud();
      } else {
        learnState.lastSyncedAt = Date.now();
        updateLearnSyncStatusText("☁️ Cloud synced");
      }
    } else if (
      localProg.stats.totalAnswered > 0 ||
      Object.keys(localProg.cards).length > 0 ||
      localProg.leaderboardOptIn
    ) {
      await pushLearningProgressToCloud();
    } else {
      updateLearnSyncStatusText("☁️ Ready to sync");
    }

    if (document.getElementById("view-learn")?.classList.contains("active")) {
      renderLearnOverview();
      renderLearnFilterChips();
      if (
        learnState.activeTab === "mastery" &&
        typeof renderMasteryTab === "function"
      ) {
        renderMasteryTab();
      }
    }
  } catch (err) {
    console.warn("Background learning sync failed:", err?.message || err);
  } finally {
    learnState.isSyncing = false;
  }
}

// --- SPACED-REPETITION UPDATE ENGINE (SHARED BY FLASHCARDS & QUIZ) ---
function recordLearnCardOutcome(
  recordId,
  rating,
  responseMs = null,
  source = "flashcard"
) {
  if (recordId === undefined || recordId === null)
    return { xpDelta: 0, hitDailyGoal: false };

  const prog = getLearnProgress();
  const idKey = String(recordId);
  const now = Date.now();

  const card = prog.cards[idKey] || {
    box: 0,
    dueAt: 0,
    hits: 0,
    misses: 0,
    avgMs: 0,
    lastSeen: 0,
  };

  let isCorrect = rating === "good" || rating === "easy" || rating === true;
  let xpDelta = 0;

  if (rating === "again" || rating === false) {
    isCorrect = false;
    card.box = 0;
    card.misses += 1;
    card.dueAt = now + LEARN_BOX_INTERVALS_MS[0];
    xpDelta = 1;
  } else if (rating === "easy") {
    isCorrect = true;
    card.box = Math.min(5, card.box + 2);
    card.hits += 1;
    card.dueAt = now + LEARN_BOX_INTERVALS_MS[card.box];
    xpDelta = source === "quiz" ? 12 : 8;
  } else {
    isCorrect = true;
    card.box = Math.min(5, card.box + 1);
    card.hits += 1;
    card.dueAt = now + LEARN_BOX_INTERVALS_MS[card.box];
    xpDelta = source === "quiz" ? 10 : 5;
  }

  if (typeof responseMs === "number" && responseMs > 0 && responseMs < 60000) {
    const attempts = card.hits + card.misses;
    card.avgMs =
      attempts <= 1
        ? Math.round(responseMs)
        : Math.round((card.avgMs * (attempts - 1) + responseMs) / attempts);
  }
  card.lastSeen = now;
  prog.cards[idKey] = card;

  // Update daily goal & streak
  const today = getLearnLocalDateKey();
  const yesterday = getLearnYesterdayKey();
  const prevDaily = prog.stats.dailyDate === today ? prog.stats.dailyCount : 0;

  if (prog.stats.lastPracticeDate !== today) {
    if (prog.stats.lastPracticeDate === yesterday) {
      prog.stats.streakDays = (prog.stats.streakDays || 0) + 1;
    } else {
      prog.stats.streakDays = 1;
    }
    prog.stats.lastPracticeDate = today;
  }

  prog.stats.dailyDate = today;
  prog.stats.dailyCount = prevDaily + 1;
  prog.stats.totalAnswered = (prog.stats.totalAnswered || 0) + 1;
  if (isCorrect) prog.stats.totalCorrect = (prog.stats.totalCorrect || 0) + 1;
  prog.stats.xp = (prog.stats.xp || 0) + xpDelta;

  const hitDailyGoal =
    prevDaily < prog.stats.dailyGoal &&
    prog.stats.dailyCount >= prog.stats.dailyGoal;

  saveLearnProgressLocal(prog, source !== "quiz");
  return { xpDelta, hitDailyGoal, card };
}

// --- DECK FILTERING & 2-TIER SCOPE CHIPS ---
function isSingleOfficeLearnScope() {
  return Boolean(learnState.officeScope && learnState.officeScope !== "all");
}

function getLearnOfficeRecords(officeOverride = null) {
  const targetOffice =
    officeOverride !== null ? officeOverride : learnState.officeScope || "all";
  const records = Array.isArray(cachedPostOffices) ? cachedPostOffices : [];
  if (!targetOffice || targetOffice === "all") return records;

  const targetLower = String(targetOffice).trim().toLowerCase();
  return records.filter(
    (r) =>
      String(r.Office || "")
        .trim()
        .toLowerCase() === targetLower
  );
}

function matchesLearnCategory(row, category, progOverride = null) {
  if (!category || category === "all") return true;
  if (category === "weak") {
    const prog = progOverride || getLearnProgress();
    return isWeakLearnCard(prog.cards[String(row.id)]);
  }
  const flags =
    typeof getDirectoryItemFlags === "function"
      ? getDirectoryItemFlags(row)
      : {
          isOffice: Boolean(detectOfficeType(row.Address)),
          isPriority: Number(row.priority) >= 1,
          isRegular: !detectOfficeType(row.Address) && Number(row.priority) < 1,
        };
  if (category === "office") return flags.isOffice;
  if (category === "priority") return flags.isPriority;
  if (category === "regular") return flags.isRegular;
  return true;
}

function getFilteredLearnRecords(
  officeOverride = null,
  categoryOverride = null
) {
  const officeRows = getLearnOfficeRecords(officeOverride);
  const category =
    categoryOverride !== null
      ? categoryOverride
      : learnState.categoryFilter || "all";
  if (category === "all") return officeRows;

  const prog = getLearnProgress();
  return officeRows.filter((r) => matchesLearnCategory(r, category, prog));
}

function syncSmartMixTogglesUI() {
  const isSingle = isSingleOfficeLearnScope();
  const isOn = Boolean(learnState.smartMix);

  const learnBar = document.getElementById("learn-smart-mix-bar");
  const learnChk = document.getElementById("learn-opt-smart-mix");
  const learnSub = document.getElementById("learn-smart-mix-sub");

  if (learnBar) learnBar.classList.toggle("hidden", !isSingle);
  if (learnChk) learnChk.checked = isOn;
  if (learnSub) {
    learnSub.textContent = isOn
      ? "~25% neighbor traps"
      : `Pure ${learnState.officeScope} only`;
  }

  const quizRow = document.getElementById("quiz-opt-smart-mix-row");
  const quizChk = document.getElementById("quiz-opt-smart-mix");
  if (quizRow) quizRow.classList.toggle("hidden", !isSingle);
  if (quizChk) quizChk.checked = isOn;
}

function renderLearnFilterChips() {
  const officeContainers = [
    document.getElementById("learn-filter-chips"),
    document.getElementById("quiz-filter-chips"),
  ].filter(Boolean);

  const categoryContainers = [
    document.getElementById("learn-category-chips"),
    document.getElementById("quiz-category-chips"),
  ].filter(Boolean);

  const allRecords = Array.isArray(cachedPostOffices) ? cachedPostOffices : [];
  const prog = getLearnProgress();

  // Row 1: All Offices + every Delivery Office sorted A-Z
  const officeCounts = new Map();
  for (let i = 0; i < allRecords.length; i++) {
    const off = String(allRecords[i].Office || "").trim();
    if (off) officeCounts.set(off, (officeCounts.get(off) || 0) + 1);
  }

  const officeChips = [
    { key: "all", label: "All Offices", count: allRecords.length, cls: "" },
  ];
  Array.from(officeCounts.keys())
    .sort((a, b) => a.localeCompare(b))
    .forEach((offName) => {
      officeChips.push({
        key: offName,
        label: offName,
        count: officeCounts.get(offName),
        cls: "is-office",
      });
    });

  const officeHtml = officeChips
    .map((ch) => {
      const isActive =
        ch.key === "all"
          ? !isSingleOfficeLearnScope()
          : String(learnState.officeScope).toLowerCase() ===
            ch.key.toLowerCase();
      return `
        <button
          type="button"
          class="dir-filter-chip ${ch.cls} ${isActive ? "active" : ""}"
          onclick="setLearnOfficeScope('${escapeForOnclick(ch.key)}')"
        >
          <span>${escapeHTML(ch.label)}</span>
          <span class="dir-chip-count">${ch.count}</span>
        </button>`;
    })
    .join("");

  officeContainers.forEach((el) => {
    const prevLeft = el.scrollLeft;
    el.innerHTML = officeHtml;
    el.scrollLeft = prevLeft;
  });

  // Row 2: Directory-style categories calculated strictly for the selected office
  const officeRecords = getLearnOfficeRecords();
  let officeTypeCount = 0;
  let priorityCount = 0;
  let regularCount = 0;
  let weakCount = 0;

  for (let i = 0; i < officeRecords.length; i++) {
    const r = officeRecords[i];
    const flags =
      typeof getDirectoryItemFlags === "function"
        ? getDirectoryItemFlags(r)
        : {
            isOffice: Boolean(detectOfficeType(r.Address)),
            isPriority: Number(r.priority) >= 1,
            isRegular: !detectOfficeType(r.Address) && Number(r.priority) < 1,
          };
    if (flags.isOffice) officeTypeCount++;
    if (flags.isPriority) priorityCount++;
    if (flags.isRegular) regularCount++;
    if (isWeakLearnCard(prog.cards[String(r.id)])) weakCount++;
  }

  const catChips = [
    { key: "all", label: "All", count: officeRecords.length, cls: "" },
    {
      key: "office",
      label: "📮 Offices",
      count: officeTypeCount,
      cls: "is-office",
    },
    {
      key: "priority",
      label: "⚡ Priority",
      count: priorityCount,
      cls: "is-priority",
    },
    {
      key: "regular",
      label: "Regular",
      count: regularCount,
      cls: "is-regular",
    },
  ];

  if (weakCount > 0 || learnState.categoryFilter === "weak") {
    catChips.push({
      key: "weak",
      label: "⚠️ Weak",
      count: weakCount,
      cls: "is-danger",
    });
  }

  const catHtml = catChips
    .map((ch) => {
      const isActive = learnState.categoryFilter === ch.key;
      return `
        <button
          type="button"
          class="dir-filter-chip ${ch.cls} ${isActive ? "active" : ""}"
          onclick="setLearnCategoryFilter('${escapeForOnclick(ch.key)}')"
        >
          <span>${escapeHTML(ch.label)}</span>
          <span class="dir-chip-count">${ch.count}</span>
        </button>`;
    })
    .join("");

  categoryContainers.forEach((el) => {
    const prevLeft = el.scrollLeft;
    el.innerHTML = catHtml;
    el.scrollLeft = prevLeft;
  });

  syncSmartMixTogglesUI();
}

function resetLearnFlashcardDeck() {
  learnState.fcRecentIds = [];
  learnState.fcHistory = [];
  learnState.fcHistoryIndex = -1;
  learnState.fcCurrentRecord = null;
  learnState.fcCurrentIsTrap = false;
  learnState.fcConsecutiveTraps = 0;
}

function setLearnOfficeScope(newOffice) {
  const nextOffice = !newOffice || newOffice === "all" ? "all" : newOffice;
  learnState.officeScope = nextOffice;
  // Reset category to All when switching offices so you never land on an empty tab
  learnState.categoryFilter = "all";
  resetLearnFlashcardDeck();

  if (navigator.vibrate) navigator.vibrate(18);
  renderLearnOverview();
  renderLearnFilterChips();
  if (learnState.activeTab === "learn") {
    loadNextFlashcard("none");
  }
}

function setLearnCategoryFilter(category) {
  const next =
    category === "all" || learnState.categoryFilter === category
      ? "all"
      : category;
  learnState.categoryFilter = next;
  resetLearnFlashcardDeck();

  if (navigator.vibrate) navigator.vibrate(18);
  renderLearnFilterChips();
  if (learnState.activeTab === "learn") {
    loadNextFlashcard("none");
  }
}

function toggleLearnSmartMix(enabled) {
  learnState.smartMix = Boolean(enabled);
  try {
    localStorage.setItem(LEARN_SMART_MIX_KEY, String(learnState.smartMix));
  } catch (_) {}

  learnState.fcConsecutiveTraps = 0;
  syncSmartMixTogglesUI();
  if (navigator.vibrate) navigator.vibrate(18);
  showToast(
    learnState.smartMix
      ? "🔀 Smart Mix ON — ~25% neighbor traps mixed in"
      : `🎯 Pure Focus ON — only ${learnState.officeScope}`,
    "info"
  );
}

// --- OVERVIEW RING & STREAK RENDERER (DYNAMIC PER SELECTED OFFICE) ---
function renderLearnOverview() {
  const scopedRows = getLearnOfficeRecords();
  const m = computeLearnSummaryMetrics(null, scopedRows);

  const scopeRow = document.getElementById("learn-overview-scope-row");
  const scopeLabel = document.getElementById("learn-overview-scope-label");
  if (scopeRow && scopeLabel) {
    if (isSingleOfficeLearnScope()) {
      scopeLabel.textContent = `🏢 ${learnState.officeScope}`;
      scopeRow.classList.remove("hidden");
    } else {
      scopeRow.classList.add("hidden");
    }
  }

  const ringEl = document.getElementById("learn-ring-progress");
  if (ringEl) {
    const offset =
      LEARN_RING_CIRCUMFERENCE -
      (LEARN_RING_CIRCUMFERENCE * Math.min(100, m.masteryPct)) / 100;
    ringEl.style.strokeDashoffset = offset.toFixed(2);
  }

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt("learn-ring-pct", `${m.masteryPct}%`);
  setTxt("learn-streak-num", `${m.streakDays}-Day`);
  setTxt("learn-daily-label", `${m.dailyCount} / ${m.dailyGoal}`);
  setTxt(
    "learn-cards-studied",
    `${m.studiedCount} / ${m.totalAddresses} studied • ${m.dueCount} due`
  );

  const dailyFill = document.getElementById("learn-daily-fill");
  if (dailyFill) {
    const pct = Math.min(100, Math.round((m.dailyCount / m.dailyGoal) * 100));
    dailyFill.style.width = `${pct}%`;
  }
}

// --- INDIAN-ACCENT PRONUNCIATION HELPER (REUSES 06-SEARCH-AI VOICE) ---
function speakLearnText(address, office = null, pin = null) {
  if (!("speechSynthesis" in window)) {
    return showToast("Voice playback is not supported on this browser.");
  }
  window.speechSynthesis.cancel();

  let parts = [String(address || "").trim()];
  if (office) parts.push(`Office ${String(office).trim()}`);
  if (pin) {
    const lastThree = String(pin).slice(-3);
    const spokenPin =
      typeof convertToHindiWords === "function"
        ? convertToHindiWords(lastThree)
        : lastThree.split("").join(" ");
    parts.push(`Pin code ${spokenPin}`);
  }

  let text = parts.filter(Boolean).join(". ");
  text = text.replace(/\b(BO|HO|SO|PO|GPO|RMS|EDBO)\b/g, (m) =>
    m.split("").join(" ")
  );

  const utter = new SpeechSynthesisUtterance(text);
  if (typeof preferredIndianVoice !== "undefined" && preferredIndianVoice) {
    utter.voice = preferredIndianVoice;
  } else {
    utter.lang = "en-IN";
  }
  utter.rate = 0.92;
  window.speechSynthesis.speak(utter);
}

// --- 3D FLASHCARD PICKER, SMART MIX & HISTORY NAVIGATION ---
function canAdvanceLearnDeck() {
  const pool = getFilteredLearnRecords();
  if (pool.length > 1) return true;
  if (
    pool.length === 1 &&
    isSingleOfficeLearnScope() &&
    learnState.smartMix &&
    getAllUniqueOffices().length > 1
  ) {
    return true;
  }
  return false;
}

function getNeighborTrapRecords(targetOffice, category = "all", options = {}) {
  const targetLower = String(targetOffice || "")
    .trim()
    .toLowerCase();
  const allRows = Array.isArray(cachedPostOffices) ? cachedPostOffices : [];
  if (!targetLower || allRows.length === 0) return [];

  const targetRows = getLearnOfficeRecords(targetOffice);
  const targetPin = String(targetRows[0]?.Pin || "").trim();
  const targetAddrSet = new Set(
    targetRows.map((r) =>
      String(r.Address || "")
        .trim()
        .toLowerCase()
    )
  );
  const targetPhonSet = new Set(
    targetRows.map((r) => postalPhoneticKey(r.Address || "")).filter(Boolean)
  );
  const excludeIds = options.excludeIds || null;
  const distinctPin = Boolean(options.distinctPin);

  const neighborOffices = getSmartDistractorOffices(
    targetOffice,
    targetPin,
    6
  ).map((n) => n.office.toLowerCase());
  const neighborSet = new Set(neighborOffices);

  const isValidTrap = (r) => {
    const offLower = String(r.Office || "")
      .trim()
      .toLowerCase();
    if (!offLower || offLower === targetLower) return false;
    if (excludeIds && excludeIds.has(String(r.id))) return false;
    const addrLower = String(r.Address || "")
      .trim()
      .toLowerCase();
    if (!addrLower || targetAddrSet.has(addrLower)) return false;
    if (distinctPin) {
      const p = String(r.Pin || "").trim();
      if (!/^\d{6}$/.test(p) || (targetPin && p === targetPin)) return false;
    }
    return true;
  };

  const geoAll = [];
  const geoSameCat = [];
  const phoneticLookalikes = [];

  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i];
    if (!isValidTrap(r)) continue;

    const offLower = String(r.Office || "")
      .trim()
      .toLowerCase();
    const inNeighbor = neighborSet.has(offLower);

    if (inNeighbor) {
      geoAll.push(r);
      if (category !== "all" && category !== "weak") {
        if (matchesLearnCategory(r, category)) geoSameCat.push(r);
      }
    } else if (targetPhonSet.size > 0) {
      const pk = postalPhoneticKey(r.Address || "");
      if (pk && targetPhonSet.has(pk)) {
        phoneticLookalikes.push(r);
      }
    }
  }

  // Category anti-cheat: match Priority/Offices/Regular badges when enough traps exist
  let primaryPool =
    category !== "all" && category !== "weak" && geoSameCat.length >= 3
      ? geoSameCat
      : geoAll;

  if (phoneticLookalikes.length > 0) {
    const seen = new Set(primaryPool.map((r) => String(r.id)));
    const extras = phoneticLookalikes.filter((r) => !seen.has(String(r.id)));
    primaryPool = primaryPool.concat(extras.slice(0, 6));
  }

  if (primaryPool.length === 0) {
    primaryPool = allRows.filter(isValidTrap);
  }

  return primaryPool;
}

function pickWeightedFromList(list, prog, now) {
  if (!list || list.length === 0) return null;
  if (list.length === 1) return list[0];

  const overdueWeak = [];
  const overdueReview = [];
  const unseen = [];
  const upcoming = [];

  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    const card = prog.cards[String(row.id)];
    if (!card) {
      unseen.push(row);
    } else if (card.dueAt <= now) {
      if (isWeakLearnCard(card)) overdueWeak.push(row);
      else overdueReview.push(row);
    } else {
      upcoming.push({ row, dueAt: card.dueAt });
    }
  }

  if (overdueWeak.length > 0) {
    return overdueWeak[Math.floor(Math.random() * overdueWeak.length)];
  }
  if (overdueReview.length > 0) {
    return overdueReview[Math.floor(Math.random() * overdueReview.length)];
  }
  if (unseen.length > 0) {
    unseen.sort((a, b) => getEffectivePriority(b) - getEffectivePriority(a));
    const topSlice = Math.min(unseen.length, 6);
    return unseen[Math.floor(Math.random() * topSlice)];
  }

  upcoming.sort((a, b) => a.dueAt - b.dueAt);
  return upcoming[0]?.row || list[0];
}

function pickNextFlashcardRecord() {
  const pool = getFilteredLearnRecords();
  if (pool.length === 0) return null;

  const prog = getLearnProgress();
  const now = Date.now();

  // Smart Mix (~25% neighbor traps) when practicing a single Delivery Office
  const shouldConsiderTrap =
    isSingleOfficeLearnScope() &&
    learnState.smartMix &&
    learnState.fcHistory.length > 0 &&
    learnState.fcConsecutiveTraps < 1 &&
    Math.random() < 0.25;

  if (shouldConsiderTrap) {
    const recentTrapSet = new Set(learnState.fcRecentIds.slice(-30));
    const trapPool = getNeighborTrapRecords(
      learnState.officeScope,
      learnState.categoryFilter,
      { excludeIds: recentTrapSet }
    );
    const trapRec = pickWeightedFromList(trapPool, prog, now);
    if (trapRec) {
      learnState.fcConsecutiveTraps += 1;
      return { record: trapRec, isTrap: true };
    }
  }

  learnState.fcConsecutiveTraps = 0;
  if (pool.length === 1) return { record: pool[0], isTrap: false };

  const windowSize = Math.min(pool.length - 1, 25);
  const recentSet = new Set(learnState.fcRecentIds.slice(-windowSize));

  let candidates = pool.filter((r) => !recentSet.has(String(r.id)));
  if (candidates.length === 0) {
    candidates = pool.filter(
      (r) => String(r.id) !== String(learnState.fcCurrentRecord?.id)
    );
  }
  const list = candidates.length > 0 ? candidates : pool;
  const chosen = pickWeightedFromList(list, prog, now);
  return chosen ? { record: chosen, isTrap: false } : null;
}

function bounceFlashcardEdge(direction = "left") {
  const wrap = document.getElementById("learn-card-swipe-wrap");
  if (!wrap) return;
  const offset = direction === "left" ? -26 : 26;
  const tilt = direction === "left" ? -1.5 : 1.5;
  wrap.classList.remove("is-dragging");
  wrap.style.transform = `translate3d(${offset}px, 0, 0) rotate(${tilt}deg)`;
  setTimeout(() => {
    wrap.style.transform = "";
  }, 150);
}

function animateFlashcardExit(direction, callback) {
  const wrap = document.getElementById("learn-card-swipe-wrap");
  if (!wrap) {
    callback();
    return;
  }
  learnState.fcIsTransitioning = true;
  wrap.classList.remove("is-dragging", "is-entering-left", "is-entering-right");
  wrap.classList.add(
    direction === "right" ? "is-exiting-right" : "is-exiting-left"
  );
  setTimeout(() => {
    learnState.fcIsTransitioning = false;
    callback();
  }, 190);
}

function updateFlashcardActionBars() {
  const ratingBar = document.getElementById("learn-rating-bar");
  const navBar = document.getElementById("learn-nav-bar");
  const prevBtn = document.getElementById("learn-prev-btn");
  const nextBtn = document.getElementById("learn-next-btn");
  const counterEl = document.getElementById("learn-nav-counter");

  if (!learnState.fcCurrentRecord) {
    ratingBar?.classList.add("hidden");
    navBar?.classList.add("hidden");
    return;
  }

  if (learnState.fcFlipped) {
    navBar?.classList.add("hidden");
    ratingBar?.classList.remove("hidden");
  } else {
    ratingBar?.classList.add("hidden");
    navBar?.classList.remove("hidden");
  }

  const pool = getFilteredLearnRecords();
  const idx = learnState.fcHistoryIndex;
  const totalHist = learnState.fcHistory.length;

  if (prevBtn) prevBtn.disabled = idx <= 0;
  if (nextBtn) {
    nextBtn.disabled = !canAdvanceLearnDeck() && idx >= totalHist - 1;
  }
  if (counterEl) {
    if (idx < totalHist - 1) {
      counterEl.textContent = `Card ${idx + 1} of ${totalHist}`;
    } else if (pool.length <= 30) {
      const mixSuffix =
        isSingleOfficeLearnScope() && learnState.smartMix ? "+mix" : "";
      counterEl.textContent = `Card ${idx + 1} (${
        pool.length
      }${mixSuffix} in deck)`;
    } else {
      counterEl.textContent = `Card ${idx + 1}`;
    }
  }
}

function renderFlashcardEntry(entry, animDir = "none") {
  const stage = document.getElementById("learn-flashcard-stage");
  if (!stage) return;

  if (!entry) {
    learnState.fcCurrentRecord = null;
    learnState.fcCurrentIsTrap = false;
    learnState.fcFlipped = false;
    updateFlashcardActionBars();

    const isWeak = learnState.categoryFilter === "weak";
    const msg = isWeak
      ? "No weak spots in this selection! 🎉 Switch category or try a Quiz."
      : "No addresses available in this filter.";
    const resetAction =
      learnState.categoryFilter !== "all"
        ? `<button type="button" class="dm-btn dm-btn-secondary dm-btn-sm" onclick="setLearnCategoryFilter('all')">Show All in ${
            isSingleOfficeLearnScope()
              ? escapeHTML(learnState.officeScope)
              : "Division"
          }</button>`
        : isSingleOfficeLearnScope()
        ? `<button type="button" class="dm-btn dm-btn-secondary dm-btn-sm" onclick="setLearnOfficeScope('all')">Show All Offices</button>`
        : "";

    stage.innerHTML = `
        <div class="list-empty" style="gap: 12px; margin: 0;">
          <span>${msg}</span>
          ${resetAction}
        </div>`;
    return;
  }

  const liveRec =
    (cachedPostOffices || []).find(
      (r) => String(r.id) === String(entry.recordId)
    ) || entry.record;

  if (!liveRec) {
    learnState.fcHistory.splice(learnState.fcHistoryIndex, 1);
    learnState.fcHistoryIndex = Math.min(
      learnState.fcHistoryIndex,
      learnState.fcHistory.length - 1
    );
    if (learnState.fcHistoryIndex >= 0) {
      renderFlashcardEntry(
        learnState.fcHistory[learnState.fcHistoryIndex],
        animDir
      );
    } else {
      loadNextFlashcard(animDir);
    }
    return;
  }

  learnState.fcCurrentRecord = liveRec;
  learnState.fcCurrentIsTrap = Boolean(entry.isTrap);
  learnState.fcFlipped = false;

  const idKey = String(liveRec.id);
  learnState.fcRecentIds = learnState.fcRecentIds.filter((id) => id !== idKey);
  learnState.fcRecentIds.push(idKey);
  const maxRecent = Math.max(30, getFilteredLearnRecords().length + 10);
  if (learnState.fcRecentIds.length > maxRecent) {
    learnState.fcRecentIds.shift();
  }

  const prog = getLearnProgress();
  const card = prog.cards[idKey];
  const currentBox = card ? card.box : 0;
  const boxLabel = !card
    ? "New"
    : currentBox === 0
    ? "🔁 Relearning"
    : currentBox >= 4
    ? "⭐ Mastered"
    : `Stage ${currentBox}/3`;

  const officeType = detectOfficeType(liveRec.Address);
  const isPrio = Number(liveRec.priority) >= 1;
  const typeBadgeHtml = officeType
    ? `<span class="badge badge-primary" style="margin:0; padding:3px 9px; font-size:11px;">📮 ${escapeHTML(
        officeType
      )}</span>`
    : isPrio
    ? `<span class="badge learn-priority-badge">⚡ Priority</span>`
    : `<span class="badge" style="margin:0; padding:3px 9px; font-size:11px;">📍 Locality</span>`;

  const ratedLabels = { again: "Again", good: "Good", easy: "Easy" };
  const ratedBadgeHtml = entry.rating
    ? `<span class="learn-rated-pill is-${escapeHTML(entry.rating)}">Rated: ${
        ratedLabels[entry.rating] || ""
      }</span>`
    : "";

  const trapBackBadgeHtml =
    entry.isTrap && isSingleOfficeLearnScope()
      ? `<div class="learn-trap-pill">🔀 Neighbor Trap • Not ${escapeHTML(
          learnState.officeScope
        )}</div>`
      : "";

  const goodBox = Math.min(5, currentBox + 1);
  const easyBox = Math.min(5, currentBox + 2);
  const setInt = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };
  setInt("fc-int-again", LEARN_BOX_LABELS[0]);
  setInt("fc-int-good", LEARN_BOX_LABELS[goodBox]);
  setInt("fc-int-easy", LEARN_BOX_LABELS[easyBox]);

  document
    .querySelectorAll("#learn-rating-bar .learn-rate-btn")
    .forEach((b) => {
      b.classList.toggle(
        "is-selected",
        Boolean(entry.rating && b.getAttribute("data-rate") === entry.rating)
      );
    });

  updateFlashcardActionBars();

  const enterCls =
    animDir === "left"
      ? "is-entering-right"
      : animDir === "right"
      ? "is-entering-left"
      : "";

  const safeAddr = escapeHTML(liveRec.Address);
  const safeOff = escapeHTML(liveRec.Office);
  const safePin = escapeHTML(liveRec.Pin || "N/A");

  stage.innerHTML = `
      <div id="learn-card-swipe-wrap" class="learn-card-swipe-wrap ${enterCls}">
        <div
          id="learn-active-flashcard"
          class="learn-flashcard"
          role="button"
          tabindex="0"
          aria-label="Flashcard for ${safeAddr}. Tap to reveal sorting office, or swipe left and right."
        >
          <!-- FRONT FACE (Zero trap giveaway) -->
          <div class="dm-surface learn-card-face learn-card-front">
            <div class="learn-card-top-row">
              <div class="learn-card-badges">
                ${typeBadgeHtml}
                <span class="learn-box-pill">${boxLabel}</span>
                ${ratedBadgeHtml}
              </div>
              <button
                type="button"
                class="learn-speak-btn"
                onclick="event.stopPropagation(); speakLearnText('${escapeForOnclick(
                  liveRec.Address
                )}')"
                title="Hear address"
                aria-label="Hear address"
              >
                🔊
              </button>
            </div>
  
            <div class="learn-card-body">
              <div class="learn-card-address">${safeAddr}</div>
              <div class="learn-card-hint">Which Delivery Office &amp; PIN serves this?</div>
            </div>
  
            <div class="learn-card-footer">
              <span>👆 Tap to flip • Swipe ‹ ›</span>
            </div>
          </div>
  
          <!-- BACK FACE -->
          <div class="dm-surface learn-card-face learn-card-back">
            <div class="learn-card-top-row">
              <div class="learn-card-badges">
                <span class="learn-box-pill">${safeAddr}</span>
                ${ratedBadgeHtml}
              </div>
              <button
                type="button"
                class="learn-speak-btn"
                onclick="event.stopPropagation(); speakLearnText('${escapeForOnclick(
                  liveRec.Address
                )}', '${escapeForOnclick(liveRec.Office)}', '${escapeForOnclick(
    liveRec.Pin || ""
  )}')"
                title="Hear full routing"
                aria-label="Hear full routing"
              >
                🔊
              </button>
            </div>
  
            <div class="learn-card-body">
              ${trapBackBadgeHtml}
              <div class="learn-card-back-office">🏢 ${safeOff}</div>
              <div class="learn-card-back-badges">
                <span class="badge badge-primary" style="margin:0;">📍 PIN: ${safePin}</span>
                ${typeBadgeHtml}
              </div>
            </div>
  
            <div class="learn-card-footer">
              <span>Rate recall below or swipe ‹ ›</span>
            </div>
          </div>
        </div>
      </div>
    `;

  if (typeof bindFlashcardSwipeGestures === "function") {
    bindFlashcardSwipeGestures();
  }
}

function loadNextFlashcard(animDir = "none") {
  if (learnState.fcHistoryIndex < learnState.fcHistory.length - 1) {
    learnState.fcHistoryIndex += 1;
    renderFlashcardEntry(
      learnState.fcHistory[learnState.fcHistoryIndex],
      animDir
    );
    return;
  }

  const picked = pickNextFlashcardRecord();
  if (!picked || !picked.record) {
    renderFlashcardEntry(null, "none");
    return;
  }

  const entry = {
    recordId: String(picked.record.id),
    record: picked.record,
    isTrap: Boolean(picked.isTrap),
    prevCardSnapshot: null,
    prevStatsSnapshot: null,
    rating: null,
  };
  learnState.fcHistory.push(entry);
  learnState.fcHistoryIndex = learnState.fcHistory.length - 1;
  renderFlashcardEntry(entry, animDir);
}

function goToNextFlashcard(fromSwipe = false) {
  if (learnState.fcIsTransitioning || !learnState.fcCurrentRecord) return;

  if (learnState.fcHistoryIndex < learnState.fcHistory.length - 1) {
    if (navigator.vibrate) navigator.vibrate(15);
    animateFlashcardExit("left", () => {
      learnState.fcHistoryIndex += 1;
      renderFlashcardEntry(
        learnState.fcHistory[learnState.fcHistoryIndex],
        "left"
      );
    });
    return;
  }

  if (!canAdvanceLearnDeck()) {
    bounceFlashcardEdge("left");
    if (fromSwipe) showToast("Only 1 card in this deck", "info");
    return;
  }

  if (navigator.vibrate) navigator.vibrate(15);
  animateFlashcardExit("left", () => {
    loadNextFlashcard("left");
  });
}

function goToPrevFlashcard(fromSwipe = false) {
  if (learnState.fcIsTransitioning || !learnState.fcCurrentRecord) return;

  if (learnState.fcHistoryIndex <= 0) {
    bounceFlashcardEdge("right");
    if (fromSwipe) showToast("Already at first card", "info");
    return;
  }

  if (navigator.vibrate) navigator.vibrate(15);
  animateFlashcardExit("right", () => {
    learnState.fcHistoryIndex -= 1;
    renderFlashcardEntry(
      learnState.fcHistory[learnState.fcHistoryIndex],
      "right"
    );
  });
}

function flipLearnCard() {
  const cardEl = document.getElementById("learn-active-flashcard");
  if (!cardEl || !learnState.fcCurrentRecord || learnState.fcIsTransitioning) {
    return;
  }

  learnState.fcFlipped = !learnState.fcFlipped;
  cardEl.classList.toggle("is-flipped", learnState.fcFlipped);
  updateFlashcardActionBars();
  if (navigator.vibrate) navigator.vibrate(18);
}

function rateLearnCard(rating) {
  const rec = learnState.fcCurrentRecord;
  if (!rec || learnState.fcIsTransitioning) return;

  const prog = getLearnProgress();
  const idKey = String(rec.id);
  const entry = learnState.fcHistory[learnState.fcHistoryIndex];

  // Undo-safe re-rating if user swiped back to an already-rated card
  if (entry && entry.recordId === idKey) {
    if (
      entry.rating !== null &&
      entry.prevCardSnapshot &&
      entry.prevStatsSnapshot
    ) {
      if (entry.prevCardSnapshot === "__NEW__") {
        delete prog.cards[idKey];
      } else {
        prog.cards[idKey] = { ...entry.prevCardSnapshot };
      }

      const today = getLearnLocalDateKey();
      prog.stats.totalAnswered = entry.prevStatsSnapshot.totalAnswered;
      prog.stats.totalCorrect = entry.prevStatsSnapshot.totalCorrect;
      prog.stats.xp = entry.prevStatsSnapshot.xp;
      prog.stats.streakDays = entry.prevStatsSnapshot.streakDays;
      prog.stats.lastPracticeDate = entry.prevStatsSnapshot.lastPracticeDate;
      if (entry.prevStatsSnapshot.dailyDate === today) {
        prog.stats.dailyDate = today;
        prog.stats.dailyCount = entry.prevStatsSnapshot.dailyCount;
      }
    } else {
      entry.prevCardSnapshot = prog.cards[idKey]
        ? { ...prog.cards[idKey] }
        : "__NEW__";
      entry.prevStatsSnapshot = { ...prog.stats };
    }
    entry.rating = rating;
  }

  const { hitDailyGoal } = recordLearnCardOutcome(
    rec.id,
    rating,
    null,
    "flashcard"
  );

  if (navigator.vibrate) {
    navigator.vibrate(rating === "again" ? [35, 35, 35] : 25);
  }

  if (hitDailyGoal) {
    showToast("🎉 Daily learning goal reached!", "success");
  }

  renderLearnOverview();
  renderLearnFilterChips();

  animateFlashcardExit("left", () => {
    loadNextFlashcard("left");
  });
}

// --- TAB SWITCHING & LIFECYCLE HOOKS ---
function switchLearnTab(tab) {
  if (learnState.quiz.active && tab !== "quiz") {
    if (typeof confirmExitQuiz === "function") {
      confirmExitQuiz(() => switchLearnTab(tab));
      return;
    }
  }

  learnState.activeTab = ["learn", "quiz", "mastery"].includes(tab)
    ? tab
    : "learn";

  const tabsEl = document.getElementById("learn-segmented-tabs");
  const tabIndex =
    learnState.activeTab === "learn"
      ? 0
      : learnState.activeTab === "quiz"
      ? 1
      : 2;
  if (tabsEl) {
    tabsEl.classList.toggle("is-tab-1", tabIndex === 1);
    tabsEl.classList.toggle("is-tab-2", tabIndex === 2);
  }

  document
    .getElementById("tab-learn-cards")
    ?.classList.toggle("active", learnState.activeTab === "learn");
  document
    .getElementById("tab-learn-quiz")
    ?.classList.toggle("active", learnState.activeTab === "quiz");
  document
    .getElementById("tab-learn-mastery")
    ?.classList.toggle("active", learnState.activeTab === "mastery");

  document
    .getElementById("learn-panel-cards")
    ?.classList.toggle("hidden", learnState.activeTab !== "learn");
  document
    .getElementById("learn-panel-quiz")
    ?.classList.toggle("hidden", learnState.activeTab !== "quiz");
  document
    .getElementById("learn-panel-mastery")
    ?.classList.toggle("hidden", learnState.activeTab !== "mastery");

  if (learnState.activeTab === "learn") {
    renderLearnOverview();
    renderLearnFilterChips();
    if (!learnState.fcCurrentRecord) loadNextFlashcard();
  } else if (learnState.activeTab === "quiz") {
    renderLearnFilterChips();
    if (typeof renderQuizSetupView === "function") {
      renderQuizSetupView();
    }
  } else if (learnState.activeTab === "mastery") {
    if (typeof renderMasteryTab === "function") {
      renderMasteryTab();
    }
  }
}

function renderLearnView() {
  pruneDeletedLearnCards();
  renderLearnOverview();
  renderLearnFilterChips();
  switchLearnTab(learnState.activeTab);

  if (
    navigator.onLine &&
    currentUserId &&
    learnState.cloudLoadedForUser !== currentUserId
  ) {
    syncLearningProgressInBackground();
  }
}

function pauseOrLeaveLearnView() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (learnState.quiz.timerInterval) {
    clearInterval(learnState.quiz.timerInterval);
    learnState.quiz.timerInterval = null;
  }
  if (learnState.quiz.autoNextTimer) {
    clearTimeout(learnState.quiz.autoNextTimer);
    learnState.quiz.autoNextTimer = null;
  }
  if (learnState.quiz.active) {
    learnState.quiz.active = false;
    document.getElementById("learn-top-controls")?.classList.remove("hidden");
    document.getElementById("quiz-active-view")?.classList.add("hidden");
    document.getElementById("quiz-summary-view")?.classList.add("hidden");
    document.getElementById("quiz-setup-view")?.classList.remove("hidden");
  }
}

function handleLearnBackNavigation() {
  const viewEl = document.getElementById("view-learn");
  if (!viewEl || !viewEl.classList.contains("active")) return false;

  if (learnState.quiz.active) {
    if (typeof confirmExitQuiz === "function") {
      confirmExitQuiz();
    } else {
      pauseOrLeaveLearnView();
    }
    return true;
  }

  if (learnState.activeTab !== "learn") {
    switchLearnTab("learn");
    return true;
  }

  return false;
}

function onLearnDatabaseUpdated() {
  pruneDeletedLearnCards();
  updateSidebarLearnBadge();
  if (document.getElementById("view-learn")?.classList.contains("active")) {
    renderLearnOverview();
    renderLearnFilterChips();
    if (learnState.activeTab === "learn") {
      loadNextFlashcard();
    } else if (
      learnState.activeTab === "mastery" &&
      typeof renderMasteryTab === "function"
    ) {
      renderMasteryTab();
    }
  }
}

function resetLearnMemoryState() {
  pauseOrLeaveLearnView();
  clearTimeout(learnState.syncTimer);
  learnState.progress = null;
  learnState.loadedForUserId = null;
  learnState.cloudLoadedForUser = null;
  learnState.officeScope = "all";
  learnState.categoryFilter = "all";
  learnState.activeTab = "learn";
  resetLearnFlashcardDeck();
  learnLeaderboardMemCache = { ts: 0, rows: null };
  const badge = document.getElementById("sidebar-learn-badge");
  if (badge) badge.classList.add("hidden");
}

// =========================================================
// Part 2: Smart Distractors & 3-Mode Quiz Engine
// =========================================================

// Verified Mirzapur & Sonbhadra Delivery Office Coordinates (merged from Division CSV + centroid fixes)
const LEARN_SO_COORDS = [
  // Mirzapur District
  { office: "Mirzapur HO", pin: "231001", lat: 25.1601, lon: 82.5912 },
  { office: "Lalganj SO", pin: "231211", lat: 25.012, lon: 82.362 },
  { office: "Ahraura SO", pin: "231301", lat: 25.0165, lon: 83.016 },
  { office: "Adalhat SO", pin: "231302", lat: 25.1318, lon: 83.0351 },
  { office: "Bijaipur SO", pin: "231303", lat: 25.1327, lon: 82.4156 },
  { office: "Chunar SO", pin: "231304", lat: 25.085, lon: 82.7826 },
  { office: "Narainpur SO", pin: "231305", lat: 25.161, lon: 82.976 },
  { office: "Sikhar SO", pin: "231306", lat: 25.0742, lon: 82.4857 },
  { office: "Vindhyachal SO", pin: "231307", lat: 25.1629, lon: 82.4998 },
  { office: "Kubari Patehara SO", pin: "231309", lat: 25.0454, lon: 82.3401 },
  {
    office: "Chunar Cement Factory SO",
    pin: "231311",
    lat: 24.9555,
    lon: 82.8839,
  },
  { office: "Chilh SO", pin: "231312", lat: 25.2056, lon: 82.527 },
  { office: "Jigna RS SO", pin: "231313", lat: 25.1656, lon: 82.3202 },
  { office: "Jamua SO", pin: "231314", lat: 25.205, lon: 82.778 },
  { office: "Kachhwa SO", pin: "231501", lat: 25.211, lon: 82.716 },
  // Sonbhadra District
  { office: "Chopan SO", pin: "231205", lat: 24.5521, lon: 82.9673 },
  { office: "Churk SO", pin: "231206", lat: 24.6412, lon: 83.0988 },
  { office: "Dalla SO", pin: "231207", lat: 24.4391, lon: 83.0946 },
  { office: "Dudhi SO", pin: "231208", lat: 24.2132, lon: 83.2374 },
  { office: "Gurma Markundi SO", pin: "231209", lat: 24.3612, lon: 83.1236 },
  { office: "Ghorawal SO", pin: "231210", lat: 24.7522, lon: 82.7832 },
  { office: "Amwar SO", pin: "231212", lat: 24.0675, lon: 83.2294 },
  { office: "Ram Garh SO", pin: "231213", lat: 24.6647, lon: 83.2412 },
  { office: "Rajpur SO", pin: "231215", lat: 24.716, lon: 82.922 },
  { office: "Robertsganj HO", pin: "231216", lat: 24.6878, lon: 83.0656 },
  { office: "Renukoot SO", pin: "231217", lat: 24.2143, lon: 83.0353 },
  { office: "Renusagar SO", pin: "231218", lat: 24.1059, lon: 82.5508 },
  { office: "Obra SO", pin: "231219", lat: 24.4456, lon: 82.9737 },
  { office: "Beena Project SO", pin: "231220", lat: 24.1564, lon: 82.7952 },
  { office: "Turra SO", pin: "231221", lat: 24.2035, lon: 83.0205 },
  { office: "Shaktinagar SO", pin: "231222", lat: 24.0659, lon: 82.685 },
  { office: "Beej Pur SO", pin: "231223", lat: 24.0296, lon: 82.7906 },
  { office: "Kakari Project SO", pin: "231224", lat: 24.1057, lon: 82.4657 },
  { office: "Anpara Tps SO", pin: "231225", lat: 24.2692, lon: 82.9035 },
  { office: "Wyndhamganj SO", pin: "231226", lat: 24.201, lon: 83.394 },
];

function learnHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function learnShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function findOfficeCoord(officeName, pin) {
  const norm = String(officeName || "")
    .trim()
    .toLowerCase();
  const phon = postalPhoneticKey(officeName || "");
  const pinStr = String(pin || "").trim();

  return (
    LEARN_SO_COORDS.find((c) => c.office.toLowerCase() === norm) ||
    LEARN_SO_COORDS.find((c) => phon && postalPhoneticKey(c.office) === phon) ||
    LEARN_SO_COORDS.find((c) => pinStr && c.pin === pinStr) ||
    null
  );
}

function getAllUniqueOffices() {
  const map = new Map();
  const rows = Array.isArray(cachedPostOffices) ? cachedPostOffices : [];
  for (let i = 0; i < rows.length; i++) {
    const off = String(rows[i].Office || "").trim();
    if (!off) continue;
    const key = off.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { office: off, pin: String(rows[i].Pin || "").trim() });
    }
  }
  return Array.from(map.values());
}

// Picks 3 hard distractors: 2 geographically nearest SOs + 1 PIN/phonetically similar SO
function getSmartDistractorOffices(correctOffice, correctPin, count = 3) {
  const targetKey = String(correctOffice || "")
    .trim()
    .toLowerCase();
  const targetPinNum = parseInt(String(correctPin || ""), 10);
  const targetPhon = postalPhoneticKey(correctOffice || "");
  const targetCoord = findOfficeCoord(correctOffice, correctPin);

  const others = getAllUniqueOffices().filter(
    (o) => o.office.toLowerCase() !== targetKey
  );
  if (others.length <= count) return learnShuffle(others);

  const chosen = [];
  const chosenKeys = new Set();

  // 1. Geographic neighbors (closest 5 offices by Haversine distance)
  if (targetCoord) {
    const withDist = others
      .map((o) => {
        const c = findOfficeCoord(o.office, o.pin);
        const dist = c
          ? learnHaversineKm(targetCoord.lat, targetCoord.lon, c.lat, c.lon)
          : 9999;
        return { ...o, dist };
      })
      .filter((o) => o.dist < 9000)
      .sort((a, b) => a.dist - b.dist);

    const nearPool = learnShuffle(
      withDist.slice(0, Math.min(5, withDist.length))
    );
    const geoTarget = Math.max(1, count - 1);
    for (let i = 0; i < nearPool.length && chosen.length < geoTarget; i++) {
      const k = nearPool[i].office.toLowerCase();
      if (!chosenKeys.has(k)) {
        chosenKeys.add(k);
        chosen.push({ office: nearPool[i].office, pin: nearPool[i].pin });
      }
    }
  }

  // 2. PIN-proximity & phonetic similarity fallback / wild-card distractor
  const remaining = others
    .filter((o) => !chosenKeys.has(o.office.toLowerCase()))
    .map((o) => {
      const oPinNum = parseInt(o.pin, 10);
      const pinDiff =
        !isNaN(targetPinNum) && !isNaN(oPinNum)
          ? Math.abs(targetPinNum - oPinNum)
          : 500;
      const oPhon = postalPhoneticKey(o.office);
      const sameStart =
        targetPhon && oPhon && oPhon[0] === targetPhon[0] ? -40 : 0;
      const samePinPrefix =
        correctPin &&
        o.pin &&
        o.pin.slice(0, 4) === String(correctPin).slice(0, 4)
          ? -60
          : 0;
      return {
        ...o,
        score: pinDiff + sameStart + samePinPrefix + Math.random() * 25,
      };
    })
    .sort((a, b) => a.score - b.score);

  for (let i = 0; i < remaining.length && chosen.length < count; i++) {
    chosenKeys.add(remaining[i].office.toLowerCase());
    chosen.push({ office: remaining[i].office, pin: remaining[i].pin });
  }

  return chosen;
}

// --- QUIZ SETUP UI CONTROLS ---
function renderQuizSetupView() {
  const q = learnState.quiz;
  if (q.active) return;

  document.getElementById("learn-top-controls")?.classList.remove("hidden");
  document.getElementById("quiz-setup-view")?.classList.remove("hidden");
  document.getElementById("quiz-active-view")?.classList.add("hidden");
  document.getElementById("quiz-summary-view")?.classList.add("hidden");

  document.querySelectorAll("[data-quiz-mode]").forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.getAttribute("data-quiz-mode") === q.mode
    );
  });

  document.querySelectorAll("[data-quiz-count]").forEach((btn) => {
    btn.classList.toggle(
      "active",
      Number(btn.getAttribute("data-quiz-count")) === q.count
    );
  });

  // Hard Mode (Hide PINs) only applies to Standard Sort MCQ
  document
    .getElementById("quiz-opt-hide-pin-row")
    ?.classList.toggle("hidden", q.mode !== "standard");
  syncSmartMixTogglesUI();
}

function selectQuizMode(mode) {
  if (!["standard", "pin", "intruder"].includes(mode)) return;
  learnState.quiz.mode = mode;
  if (navigator.vibrate) navigator.vibrate(15);
  renderQuizSetupView();
}

function selectQuizCount(count) {
  learnState.quiz.count = [10, 15, 25].includes(Number(count))
    ? Number(count)
    : 15;
  if (navigator.vibrate) navigator.vibrate(15);
  renderQuizSetupView();
}

function showQuizSetup() {
  stopQuizTimers();
  learnState.quiz.active = false;
  learnState.quiz.customPool = null;
  renderQuizSetupView();
  renderLearnFilterChips();
}

// --- PRIORITY-WEIGHTED SESSION QUEUE BUILDER (60% Due/Weak, 30% Unseen, 10% Mastered) ---
function selectWeightedQuizRecords(pool, targetCount) {
  if (pool.length <= targetCount) return learnShuffle(pool);

  const prog = getLearnProgress();
  const now = Date.now();

  const dueOrWeak = [];
  const unseen = [];
  const refresher = [];

  for (let i = 0; i < pool.length; i++) {
    const r = pool[i];
    const c = prog.cards[String(r.id)];
    if (!c) {
      unseen.push(r);
    } else if (isWeakLearnCard(c) || c.dueAt <= now) {
      dueOrWeak.push(r);
    } else {
      refresher.push(r);
    }
  }

  const pick = [];
  const usedIds = new Set();
  const takeFrom = (arr, limit) => {
    const shuffled = learnShuffle(arr);
    for (
      let i = 0;
      i < shuffled.length && pick.length < targetCount && limit > 0;
      i++
    ) {
      const idStr = String(shuffled[i].id);
      if (usedIds.has(idStr)) continue;
      usedIds.add(idStr);
      pick.push(shuffled[i]);
      limit--;
    }
  };

  takeFrom(dueOrWeak, Math.ceil(targetCount * 0.6));
  takeFrom(unseen, Math.ceil(targetCount * 0.3));
  takeFrom(refresher, Math.max(1, Math.floor(targetCount * 0.1)));

  // Fill any remaining slots if one bucket had fewer items
  if (pick.length < targetCount) {
    takeFrom(
      [...dueOrWeak, ...unseen, ...refresher],
      targetCount - pick.length
    );
  }

  return learnShuffle(pick);
}

// --- QUESTION GENERATORS FOR ALL 3 MODES (WITH SMART MIX) ---
function buildSmartMixQuizPool(basePool, count, options = {}) {
  const useSmartMix =
    isSingleOfficeLearnScope() &&
    learnState.smartMix &&
    !learnState.quiz.customPool &&
    basePool.length > 0;

  if (!useSmartMix) {
    return selectWeightedQuizRecords(basePool, count).map((rec) => ({
      record: rec,
      isTrap: false,
    }));
  }

  const targetOffice = learnState.officeScope;
  const trapPool = getNeighborTrapRecords(
    targetOffice,
    learnState.categoryFilter,
    options
  );

  if (trapPool.length === 0) {
    return selectWeightedQuizRecords(basePool, count).map((rec) => ({
      record: rec,
      isTrap: false,
    }));
  }

  // Keep ~75% target office + ~25% neighbor traps, scaling cleanly for small filtered decks
  const primaryCap = Math.min(
    basePool.length,
    Math.max(1, Math.round(count * 0.75))
  );
  const primarySelected = selectWeightedQuizRecords(basePool, primaryCap);

  const proportionalTraps = Math.max(1, Math.round(primarySelected.length / 3));
  const remainingSlots = Math.max(1, count - primarySelected.length);
  const trapTarget = Math.min(
    trapPool.length,
    proportionalTraps,
    remainingSlots
  );
  const trapSelected = selectWeightedQuizRecords(trapPool, trapTarget);

  const combined = [
    ...primarySelected.map((record) => ({ record, isTrap: false })),
    ...trapSelected.map((record) => ({ record, isTrap: true })),
  ];

  // Spread traps so the user never gets 3 traps back-to-back
  const shuffled = learnShuffle(combined);
  for (let i = 2; i < shuffled.length; i++) {
    if (
      shuffled[i].isTrap &&
      shuffled[i - 1].isTrap &&
      shuffled[i - 2].isTrap
    ) {
      const swapIdx = shuffled.findIndex((x, idx) => idx > i && !x.isTrap);
      if (swapIdx !== -1) {
        [shuffled[i], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[i]];
      }
    }
  }
  return shuffled;
}

function buildStandardQuestions(basePool, count) {
  const chosenEntries = buildSmartMixQuizPool(basePool, count);
  const activeOffice = isSingleOfficeLearnScope()
    ? learnState.officeScope
    : null;
  const activeOfficeLower = activeOffice ? activeOffice.toLowerCase() : "";
  const activeOfficePin = activeOffice
    ? String(getLearnOfficeRecords(activeOffice)[0]?.Pin || "").trim()
    : "";

  return chosenEntries.map(({ record: rec, isTrap }) => {
    let distractors = getSmartDistractorOffices(rec.Office, rec.Pin, 3);

    // Anti-Tell Rule: on trap questions, always include the target office as a distractor
    if (
      isTrap &&
      activeOffice &&
      String(rec.Office || "")
        .trim()
        .toLowerCase() !== activeOfficeLower
    ) {
      const hasTarget = distractors.some(
        (d) => d.office.toLowerCase() === activeOfficeLower
      );
      if (!hasTarget) {
        distractors = [
          { office: activeOffice, pin: activeOfficePin },
          ...distractors.slice(0, 2),
        ];
      }
    }

    const options = learnShuffle([
      {
        office: rec.Office,
        pin: String(rec.Pin || "").trim(),
        isCorrect: true,
      },
      ...distractors.map((d) => ({
        office: d.office,
        pin: d.pin,
        isCorrect: false,
      })),
    ]);
    return { type: "standard", record: rec, options, isTrap };
  });
}

function buildPinSniperQuestions(basePool, count) {
  const validPinPool = basePool.filter((r) =>
    /^\d{6}$/.test(String(r.Pin || "").trim())
  );
  if (validPinPool.length === 0) return [];

  const chosenEntries = buildSmartMixQuizPool(validPinPool, count, {
    distinctPin: true,
  });

  return chosenEntries.map(({ record: rec, isTrap }) => {
    const pinStr = String(rec.Pin).trim();
    return {
      type: "pin",
      record: rec,
      pinPrefix: pinStr.slice(0, 3),
      pinSuffix: pinStr.slice(3),
      fullPin: pinStr,
      isTrap,
    };
  });
}

function buildIntruderQuestions(basePool, count) {
  const allRows = Array.isArray(cachedPostOffices) ? cachedPostOffices : [];

  // Group ALL records by office for accurate membership & intruder verification
  const byOfficeAll = new Map();
  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i];
    const off = String(r.Office || "").trim();
    if (!off) continue;
    const key = off.toLowerCase();
    if (!byOfficeAll.has(key)) {
      byOfficeAll.set(key, {
        office: off,
        pin: String(r.Pin || "").trim(),
        rows: [],
      });
    }
    byOfficeAll.get(key).rows.push(r);
  }

  // Group scoped records to find eligible offices (>= 3 addresses)
  const scopedOffices = new Map();
  for (let i = 0; i < basePool.length; i++) {
    const off = String(basePool[i].Office || "").trim();
    if (!off) continue;
    const key = off.toLowerCase();
    if (!scopedOffices.has(key)) scopedOffices.set(key, []);
    scopedOffices.get(key).push(basePool[i]);
  }

  let eligibleGroups = Array.from(scopedOffices.entries())
    .map(([key, rows]) => {
      const fullGroup = byOfficeAll.get(key);
      return {
        office: fullGroup ? fullGroup.office : rows[0].Office,
        pin: fullGroup ? fullGroup.pin : String(rows[0].Pin || "").trim(),
        rows: rows.length >= 3 ? rows : fullGroup ? fullGroup.rows : rows,
      };
    })
    .filter((g) => g.rows.length >= 3);

  if (eligibleGroups.length === 0) {
    eligibleGroups = Array.from(byOfficeAll.values()).filter(
      (g) => g.rows.length >= 3
    );
  }

  if (eligibleGroups.length === 0 || byOfficeAll.size < 2) return [];

  // In single-office Smart Mix, ~25% of Spot Intruder rounds flip to a Neighbor SO
  // with 1 target-office address as the intruder so staff can't just scan for unfamiliar names
  const useFlippedRounds =
    isSingleOfficeLearnScope() &&
    learnState.smartMix &&
    !learnState.quiz.customPool &&
    eligibleGroups.length === 1;

  const primaryGroup = eligibleGroups[0];
  let neighborFlipGroups = [];
  if (useFlippedRounds) {
    neighborFlipGroups = getSmartDistractorOffices(
      primaryGroup.office,
      primaryGroup.pin,
      5
    )
      .map((n) => byOfficeAll.get(n.office.toLowerCase()))
      .filter((g) => g && g.rows.length >= 3);
  }

  const questions = [];
  const shuffledGroups = learnShuffle(eligibleGroups);

  for (let i = 0; i < count; i++) {
    const isFlippedRound =
      useFlippedRounds && neighborFlipGroups.length > 0 && i % 4 === 3;

    const group = isFlippedRound
      ? neighborFlipGroups[
          Math.floor(Math.random() * neighborFlipGroups.length)
        ]
      : shuffledGroups[i % shuffledGroups.length];

    const memberSet = new Set(
      (byOfficeAll.get(group.office.toLowerCase())?.rows || group.rows).map(
        (r) =>
          String(r.Address || "")
            .trim()
            .toLowerCase()
      )
    );

    const threeMembers = selectWeightedQuizRecords(group.rows, 3);
    if (threeMembers.length < 3) continue;

    let intruderCandidates = [];
    if (isFlippedRound) {
      intruderCandidates = primaryGroup.rows.filter(
        (r) =>
          !memberSet.has(
            String(r.Address || "")
              .trim()
              .toLowerCase()
          )
      );
    } else {
      const neighbors = getSmartDistractorOffices(group.office, group.pin, 5);
      for (let n = 0; n < neighbors.length; n++) {
        const nGroup = byOfficeAll.get(neighbors[n].office.toLowerCase());
        if (!nGroup) continue;
        const clean = nGroup.rows.filter(
          (r) =>
            !memberSet.has(
              String(r.Address || "")
                .trim()
                .toLowerCase()
            )
        );
        intruderCandidates = intruderCandidates.concat(clean);
        if (intruderCandidates.length >= 12) break;
      }
    }

    if (intruderCandidates.length === 0) {
      intruderCandidates = allRows.filter(
        (r) =>
          String(r.Office || "")
            .trim()
            .toLowerCase() !== group.office.toLowerCase() &&
          !memberSet.has(
            String(r.Address || "")
              .trim()
              .toLowerCase()
          )
      );
    }
    if (intruderCandidates.length === 0) continue;

    const intruder =
      intruderCandidates[Math.floor(Math.random() * intruderCandidates.length)];

    const options = learnShuffle([
      ...threeMembers.map((r) => ({ record: r, isIntruder: false })),
      { record: intruder, isIntruder: true },
    ]);

    questions.push({
      type: "intruder",
      targetOffice: group.office,
      targetPin: group.pin,
      record: intruder,
      options,
      isTrap: isFlippedRound,
    });
  }

  return questions;
}

// --- START, RENDER & MANAGE ACTIVE QUIZ ---
function stopQuizTimers() {
  if (learnState.quiz.timerInterval) {
    clearInterval(learnState.quiz.timerInterval);
    learnState.quiz.timerInterval = null;
  }
  if (learnState.quiz.autoNextTimer) {
    clearTimeout(learnState.quiz.autoNextTimer);
    learnState.quiz.autoNextTimer = null;
  }
}

function startLearnQuiz(customOptions = null) {
  const q = learnState.quiz;
  stopQuizTimers();

  if (customOptions?.mode) q.mode = customOptions.mode;
  if (customOptions?.count) q.count = customOptions.count;
  q.customPool = Array.isArray(customOptions?.pool) ? customOptions.pool : null;

  q.timerEnabled = Boolean(document.getElementById("quiz-opt-timer")?.checked);
  q.hidePin = Boolean(document.getElementById("quiz-opt-hide-pin")?.checked);
  q.autoNext = document.getElementById("quiz-opt-auto-next")?.checked !== false;

  const basePool = q.customPool || getFilteredLearnRecords();
  if (basePool.length === 0) {
    return showToast("⚠️ No addresses available in this scope.");
  }

  const allOfficesCount = getAllUniqueOffices().length;
  if ((q.mode === "standard" || q.mode === "intruder") && allOfficesCount < 2) {
    return showToast(
      "⚠️ Add at least 2 Delivery Offices to run this quiz mode."
    );
  }

  let questions = [];
  if (q.mode === "standard") {
    questions = buildStandardQuestions(basePool, q.count);
  } else if (q.mode === "pin") {
    questions = buildPinSniperQuestions(basePool, q.count);
    if (questions.length === 0) {
      return showToast("⚠️ No 6-digit PIN records found in this filter.");
    }
  } else if (q.mode === "intruder") {
    questions = buildIntruderQuestions(basePool, q.count);
    if (questions.length === 0) {
      return showToast(
        "⚠️ Need an office with at least 3 addresses for Spot Intruder."
      );
    }
  }

  if (questions.length === 0) {
    return showToast("⚠️ Could not build quiz questions for this selection.");
  }

  q.active = true;
  q.questions = questions;
  q.index = 0;
  q.score = 0;
  q.streak = 0;
  q.bestStreak = 0;
  q.xpEarned = 0;
  q.totalMs = 0;
  q.missedRecords = [];
  q.answered = false;

  // Hide top segmented tabs during active drill for distraction-free focus
  document.getElementById("learn-top-controls")?.classList.add("hidden");
  document.getElementById("quiz-setup-view")?.classList.add("hidden");
  document.getElementById("quiz-summary-view")?.classList.add("hidden");
  document.getElementById("quiz-active-view")?.classList.remove("hidden");

  // Push a history step so Android Back button prompts Exit Quiz cleanly
  if (typeof window.pushPwaNavStep === "function") {
    window.pushPwaNavStep("learn-quiz", "learn");
  }

  const modeLabels = {
    standard: "📮 Standard Sort",
    pin: "🎯 PIN Sniper",
    intruder: "🕵️ Spot Intruder",
  };
  const modePill = document.getElementById("quiz-mode-pill");
  if (modePill) modePill.textContent = modeLabels[q.mode] || "Quiz";

  renderQuizQuestion();
}

function renderQuizQuestion() {
  const q = learnState.quiz;
  stopQuizTimers();
  q.answered = false;
  q.questionStartMs = performance.now();

  const item = q.questions[q.index];
  if (!item) {
    finishLearnQuiz();
    return;
  }

  const total = q.questions.length;
  const pct = Math.round((q.index / total) * 100);

  const hudText = document.getElementById("quiz-hud-progress-text");
  const progFill = document.getElementById("quiz-progress-fill");
  const streakPill = document.getElementById("quiz-streak-pill");
  const nextWrap = document.getElementById("quiz-next-wrap");
  const nextBtn = document.getElementById("quiz-next-btn");
  const answerArea = document.getElementById("quiz-answer-area");

  if (hudText) hudText.textContent = `Question ${q.index + 1} of ${total}`;
  if (progFill) progFill.style.width = `${pct}%`;
  if (streakPill) streakPill.textContent = `🔥 ${q.streak}x Streak`;
  if (nextWrap) nextWrap.classList.add("hidden");
  if (nextBtn) {
    nextBtn.textContent =
      q.index + 1 >= total ? "View Results 🎉" : "Next Address →";
  }

  const kickerEl = document.getElementById("quiz-parcel-kicker");
  const titleEl = document.getElementById("quiz-parcel-title");
  const subEl = document.getElementById("quiz-parcel-subtitle");

  if (item.type === "standard") {
    if (kickerEl) kickerEl.textContent = "POSTAL ADDRESS TAG";
    if (titleEl) titleEl.textContent = item.record.Address;
    if (subEl) subEl.textContent = "Sort to which Delivery Office?";

    if (answerArea) {
      answerArea.innerHTML = item.options
        .map(
          (opt, idx) => `
            <button
              type="button"
              class="quiz-option-btn"
              data-opt-idx="${idx}"
              onclick="handleStandardAnswer(${idx})"
            >
              <span class="quiz-option-main">
                <span class="quiz-option-title">🏢 ${escapeHTML(
                  opt.office
                )}</span>
                ${
                  !q.hidePin && opt.pin
                    ? `<span class="quiz-option-sub">PIN: ${escapeHTML(
                        opt.pin
                      )}</span>`
                    : ""
                }
              </span>
              <span class="quiz-option-icon">›</span>
            </button>`
        )
        .join("");
    }
  } else if (item.type === "pin") {
    if (kickerEl) kickerEl.textContent = "PIN SNIPER";
    if (titleEl) titleEl.textContent = item.record.Address;
    if (subEl) subEl.textContent = "Enter last 3 PIN digits";

    if (answerArea) {
      answerArea.innerHTML = `
          <div class="quiz-pin-box">
            <div class="quiz-pin-input-row">
              <span class="quiz-pin-prefix">${escapeHTML(item.pinPrefix)}</span>
              <input
                type="tel"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength="3"
                id="learn-pin-input"
                class="quiz-pin-input"
                placeholder="___"
                autocomplete="off"
                oninput="handlePinSniperInput(this)"
              />
            </div>
            <button
              type="button"
              id="learn-pin-submit-btn"
              class="dm-btn dm-btn-primary dm-btn-full"
              onclick="submitPinSniperAnswer()"
            >
              Check PIN
            </button>
          </div>`;

      setTimeout(() => {
        const pinEl = document.getElementById("learn-pin-input");
        if (pinEl) pinEl.focus();
      }, 60);
    }
  } else if (item.type === "intruder") {
    if (kickerEl) kickerEl.textContent = "SPOT THE INTRUDER";
    if (titleEl) titleEl.textContent = `🏢 ${item.targetOffice}`;
    if (subEl) {
      subEl.textContent = `${
        item.targetPin ? `PIN ${item.targetPin} • ` : ""
      }Tap the 1 address that does NOT belong here`;
    }

    if (answerArea) {
      answerArea.innerHTML = item.options
        .map(
          (opt, idx) => `
            <button
              type="button"
              class="quiz-option-btn"
              data-opt-idx="${idx}"
              onclick="handleIntruderAnswer(${idx})"
            >
              <span class="quiz-option-main">
                <span class="quiz-option-title">${escapeHTML(
                  opt.record.Address
                )}</span>
              </span>
              <span class="quiz-option-icon">›</span>
            </button>`
        )
        .join("");
    }
  }

  // Start Rapid-Fire Timer if enabled
  const timerPill = document.getElementById("quiz-timer-pill");
  if (q.timerEnabled) {
    q.timeLeft = 10;
    if (timerPill) {
      timerPill.classList.remove("hidden", "is-urgent");
      timerPill.textContent = `⏱ ${q.timeLeft}s`;
    }
    q.timerInterval = setInterval(() => {
      q.timeLeft--;
      if (timerPill) {
        timerPill.textContent = `⏱ ${Math.max(0, q.timeLeft)}s`;
        timerPill.classList.toggle("is-urgent", q.timeLeft <= 3);
      }
      if (q.timeLeft <= 0) {
        handleQuizTimeout();
      }
    }, 1000);
  } else if (timerPill) {
    timerPill.classList.add("hidden");
  }

  const viewEl = document.getElementById("view-learn");
  if (viewEl) viewEl.scrollTop = 0;
}

function speakCurrentQuizPrompt() {
  const item = learnState.quiz.questions[learnState.quiz.index];
  if (!item) return;
  if (item.type === "intruder") {
    speakLearnText(item.targetOffice);
  } else {
    speakLearnText(item.record.Address);
  }
}

function handlePinSniperInput(inputEl) {
  if (!inputEl) return;
  inputEl.value = inputEl.value.replace(/\D/g, "").slice(0, 3);
}

function handleStandardAnswer(selectedIdx) {
  const q = learnState.quiz;
  if (!q.active || q.answered) return;

  const item = q.questions[q.index];
  const chosen = item.options[selectedIdx];
  const isCorrect = Boolean(chosen && chosen.isCorrect);

  document
    .querySelectorAll("#quiz-answer-area .quiz-option-btn")
    .forEach((btn, idx) => {
      btn.disabled = true;
      const opt = item.options[idx];
      const icon = btn.querySelector(".quiz-option-icon");
      if (opt.isCorrect) {
        btn.classList.add("is-correct");
        if (icon) icon.textContent = "✓";
      } else if (idx === selectedIdx && !isCorrect) {
        btn.classList.add("is-wrong");
        if (icon) icon.textContent = "✕";
      }
    });

  const note = isCorrect
    ? `✅ Correct! ${item.record.Address} → ${item.record.Office}${
        item.record.Pin ? ` (${item.record.Pin})` : ""
      }`
    : `❌ ${item.record.Address} routes to ${item.record.Office}${
        item.record.Pin ? ` (${item.record.Pin})` : ""
      }`;

  finishQuizAnswer(isCorrect, item.record, note);
}

function submitPinSniperAnswer() {
  const q = learnState.quiz;
  if (!q.active || q.answered) return;

  const inputEl = document.getElementById("learn-pin-input");
  const submitBtn = document.getElementById("learn-pin-submit-btn");
  const typed = (inputEl?.value || "").replace(/\D/g, "");

  if (typed.length < 3) {
    showToast("✏️ Enter all 3 last digits of the PIN");
    inputEl?.focus();
    return;
  }

  const item = q.questions[q.index];
  const isCorrect = typed === item.pinSuffix;

  if (inputEl) {
    inputEl.disabled = true;
    inputEl.blur();
  }
  if (submitBtn) submitBtn.disabled = true;

  const note = isCorrect
    ? `✅ Bullseye! ${item.record.Office} PIN is ${item.fullPin}`
    : `❌ You entered ${item.pinPrefix}${typed}. Correct PIN is ${item.fullPin} (${item.record.Office})`;

  finishQuizAnswer(isCorrect, item.record, note);
}

function handleIntruderAnswer(selectedIdx) {
  const q = learnState.quiz;
  if (!q.active || q.answered) return;

  const item = q.questions[q.index];
  const chosen = item.options[selectedIdx];
  const isCorrect = Boolean(chosen && chosen.isIntruder);

  document
    .querySelectorAll("#quiz-answer-area .quiz-option-btn")
    .forEach((btn, idx) => {
      btn.disabled = true;
      const opt = item.options[idx];
      const icon = btn.querySelector(".quiz-option-icon");
      if (opt.isIntruder) {
        btn.classList.add("is-correct");
        if (icon) icon.textContent = "✓";
      } else if (idx === selectedIdx && !isCorrect) {
        btn.classList.add("is-wrong");
        if (icon) icon.textContent = "✕";
      }
    });

  const intr = item.record;
  const note = isCorrect
    ? `✅ Spotted! "${intr.Address}" belongs to ${intr.Office}${
        intr.Pin ? ` (${intr.Pin})` : ""
      }`
    : `❌ "${chosen.record.Address}" belongs to ${item.targetOffice}. Intruder was "${intr.Address}" → ${intr.Office}`;

  // If user wrongly tapped a real member, also record a miss on that member
  if (!isCorrect && chosen?.record) {
    recordLearnCardOutcome(chosen.record.id, "again", null, "quiz");
  }

  finishQuizAnswer(isCorrect, intr, note);
}

function handleQuizTimeout() {
  const q = learnState.quiz;
  if (!q.active || q.answered) return;
  const item = q.questions[q.index];

  if (item.type === "standard") {
    document
      .querySelectorAll("#quiz-answer-area .quiz-option-btn")
      .forEach((btn, idx) => {
        btn.disabled = true;
        if (item.options[idx].isCorrect) {
          btn.classList.add("is-correct");
          const icon = btn.querySelector(".quiz-option-icon");
          if (icon) icon.textContent = "✓";
        }
      });
    finishQuizAnswer(
      false,
      item.record,
      `⏱ Time's up! ${item.record.Address} → ${item.record.Office}`
    );
  } else if (item.type === "pin") {
    const inputEl = document.getElementById("learn-pin-input");
    const submitBtn = document.getElementById("learn-pin-submit-btn");
    if (inputEl) {
      inputEl.disabled = true;
      inputEl.blur();
    }
    if (submitBtn) submitBtn.disabled = true;
    finishQuizAnswer(
      false,
      item.record,
      `⏱ Time's up! Correct PIN for ${item.record.Office} is ${item.fullPin}`
    );
  } else if (item.type === "intruder") {
    document
      .querySelectorAll("#quiz-answer-area .quiz-option-btn")
      .forEach((btn, idx) => {
        btn.disabled = true;
        if (item.options[idx].isIntruder) {
          btn.classList.add("is-correct");
          const icon = btn.querySelector(".quiz-option-icon");
          if (icon) icon.textContent = "✓";
        }
      });
    finishQuizAnswer(
      false,
      item.record,
      `⏱ Time's up! Intruder was "${item.record.Address}" → ${item.record.Office}`
    );
  }
}

function finishQuizAnswer(isCorrect, targetRecord, noteText) {
  const q = learnState.quiz;
  stopQuizTimers();
  q.answered = true;

  const elapsedMs = Math.max(
    200,
    Math.round(performance.now() - q.questionStartMs)
  );
  q.totalMs += elapsedMs;

  if (isCorrect) {
    q.score += 1;
    q.streak += 1;
    if (q.streak > q.bestStreak) q.bestStreak = q.streak;
    if (navigator.vibrate) navigator.vibrate(28);
  } else {
    q.streak = 0;
    if (
      targetRecord &&
      !q.missedRecords.some((r) => String(r.id) === String(targetRecord.id))
    ) {
      q.missedRecords.push(targetRecord);
    }
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
  }

  const outcome = recordLearnCardOutcome(
    targetRecord?.id,
    isCorrect ? "good" : "again",
    elapsedMs,
    "quiz"
  );
  q.xpEarned += outcome.xpDelta;

  const streakPill = document.getElementById("quiz-streak-pill");
  if (streakPill) streakPill.textContent = `🔥 ${q.streak}x Streak`;

  const noteEl = document.getElementById("quiz-feedback-note");
  const nextWrap = document.getElementById("quiz-next-wrap");
  if (noteEl) {
    noteEl.textContent = noteText;
    noteEl.className = `quiz-feedback-note ${
      isCorrect ? "is-correct" : "is-wrong"
    }`;
  }
  if (nextWrap) nextWrap.classList.remove("hidden");

  if (outcome.hitDailyGoal) {
    showToast("🎉 Daily learning goal reached!", "success");
  }

  // Auto-advance only on correct answers when enabled (always pause on mistakes so user learns)
  if (isCorrect && q.autoNext) {
    q.autoNextTimer = setTimeout(() => {
      advanceQuizQuestion();
    }, 2000);
  }
}

function advanceQuizQuestion() {
  const q = learnState.quiz;
  stopQuizTimers();
  if (!q.active) return;

  q.index += 1;
  if (q.index >= q.questions.length) {
    finishLearnQuiz();
  } else {
    renderQuizQuestion();
  }
}

function finishLearnQuiz() {
  const q = learnState.quiz;
  stopQuizTimers();
  q.active = false;

  const total = q.questions.length || 1;
  const acc = Math.round((q.score / total) * 100);
  const avgSec = (q.totalMs / total / 1000).toFixed(1);

  document.getElementById("learn-top-controls")?.classList.remove("hidden");
  document.getElementById("quiz-active-view")?.classList.add("hidden");
  document.getElementById("quiz-summary-view")?.classList.remove("hidden");

  const gradeText =
    acc >= 90
      ? "🏆 Sorting Master!"
      : acc >= 75
      ? "🎉 Great Sorting!"
      : acc >= 50
      ? "👍 Good Practice!"
      : "💪 Keep Drilling!";

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt("quiz-sum-grade", gradeText);
  setTxt("quiz-sum-score", `${q.score} / ${total}`);
  setTxt(
    "quiz-sum-sub",
    `Best streak: ${q.bestStreak}x • ${
      navigator.onLine ? "Syncing to cloud..." : "Saved offline"
    }`
  );
  setTxt("quiz-sum-acc", `${acc}%`);
  setTxt("quiz-sum-speed", `${avgSec}s`);
  setTxt("quiz-sum-xp", `+${q.xpEarned}`);

  const missedWrap = document.getElementById("quiz-sum-missed-wrap");
  const missedList = document.getElementById("quiz-sum-missed-list");
  const retryBtn = document.getElementById("quiz-retry-missed-btn");

  if (q.missedRecords.length > 0 && missedWrap && missedList && retryBtn) {
    missedList.innerHTML = q.missedRecords
      .map(
        (r) => `
          <div class="mastery-weak-row">
            <div class="mastery-weak-info">
              <strong>${escapeHTML(r.Address)}</strong>
              <span>🏢 ${escapeHTML(r.Office)} • 📍 ${escapeHTML(
          r.Pin || "N/A"
        )}</span>
            </div>
          </div>`
      )
      .join("");
    missedWrap.classList.remove("hidden");
    retryBtn.textContent = `🎯 Drill ${q.missedRecords.length} Missed ${
      q.missedRecords.length === 1 ? "Address" : "Addresses"
    }`;
    retryBtn.classList.remove("hidden");
  } else {
    missedWrap?.classList.add("hidden");
    retryBtn?.classList.add("hidden");
  }

  // Single background cloud write for the entire quiz session
  scheduleLearnCloudSync(400);
  renderLearnOverview();
  renderLearnFilterChips();
}

function drillMissedFromSummary() {
  const missed = [...learnState.quiz.missedRecords];
  if (missed.length === 0) return;
  const targetMode =
    learnState.quiz.mode === "intruder" ? "standard" : learnState.quiz.mode;
  startLearnQuiz({
    mode: targetMode,
    count: missed.length,
    pool: missed,
  });
}

function confirmExitQuiz(afterExitCallback = null) {
  const q = learnState.quiz;
  if (!q.active) {
    if (typeof afterExitCallback === "function") afterExitCallback();
    return;
  }

  const doExit = () => {
    const hadAnswers = q.index > 0 || q.answered;
    stopQuizTimers();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    q.active = false;
    q.customPool = null;
    if (hadAnswers) scheduleLearnCloudSync(400);
    renderQuizSetupView();
    renderLearnOverview();
    if (typeof afterExitCallback === "function") afterExitCallback();
  };

  if (q.index === 0 && !q.answered) {
    doExit();
    return;
  }

  showCustomConfirm(
    "Exit Quiz?",
    "Your answers so far are saved, but this quiz session will end.",
    "Exit Quiz",
    doExit
  );
}

// =========================================================
// Part 3: Mastery Analytics, Weak Spots, Leaderboard & Directory Hook
// =========================================================

let learnLeaderboardMemCache = { ts: 0, rows: null };
const LEARN_LEADERBOARD_TTL_MS = 45 * 1000;

function renderMasteryTab() {
  const prog = getLearnProgress();
  const m = computeLearnSummaryMetrics(prog);

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt("mastery-kpi-mastered", String(m.masteredCount));
  setTxt("mastery-kpi-reviewing", String(m.reviewingCount));
  setTxt("mastery-kpi-accuracy", `${m.accuracyPct}%`);

  const optInToggle = document.getElementById("learn-leaderboard-optin");
  if (optInToggle) {
    optInToggle.checked = Boolean(prog.leaderboardOptIn);
  }

  if (!learnState.isSyncing) {
    if (!navigator.onLine) {
      updateLearnSyncStatusText("📴 Offline mode — saved on device");
    } else if (learnState.lastSyncedAt) {
      updateLearnSyncStatusText("☁️ Cloud synced");
    } else {
      updateLearnSyncStatusText("☁️ Synced locally");
    }
  }

  renderMasteryOfficeList(prog);
  renderMasteryWeakList(prog);
  loadLearningLeaderboard(false);
}

// --- OFFICE-WISE MASTERY BARS ---
function renderMasteryOfficeList(progOverride = null) {
  const listEl = document.getElementById("mastery-office-list");
  const expandBtn = document.getElementById("mastery-office-expand-btn");
  const sortBtn = document.getElementById("mastery-sort-btn");
  if (!listEl) return;

  const prog = progOverride || getLearnProgress();
  const records = Array.isArray(cachedPostOffices) ? cachedPostOffices : [];

  if (records.length === 0) {
    listEl.innerHTML = `<div class="list-empty" style="margin:0; padding:20px;">No database records loaded yet.</div>`;
    expandBtn?.classList.add("hidden");
    return;
  }

  const officeMap = new Map();
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const off = String(r.Office || "Unknown Office").trim();
    const key = off.toLowerCase();
    if (!officeMap.has(key)) {
      officeMap.set(key, {
        office: off,
        pin: String(r.Pin || "").trim(),
        total: 0,
        mastered: 0,
        studied: 0,
      });
    }
    const entry = officeMap.get(key);
    entry.total += 1;
    const card = prog.cards[String(r.id)];
    if (card) {
      entry.studied += 1;
      if (card.box >= 4) entry.mastered += 1;
    }
  }

  const offices = Array.from(officeMap.values()).map((o) => ({
    ...o,
    pct: o.total > 0 ? Math.round((o.mastered / o.total) * 100) : 0,
  }));

  if (learnState.masterySortLowest) {
    offices.sort(
      (a, b) =>
        a.pct - b.pct || b.total - a.total || a.office.localeCompare(b.office)
    );
  } else {
    offices.sort(
      (a, b) =>
        b.pct - a.pct ||
        b.mastered - a.mastered ||
        a.office.localeCompare(b.office)
    );
  }

  if (sortBtn) {
    sortBtn.textContent = learnState.masterySortLowest
      ? "↕ Lowest"
      : "↕ Highest";
  }

  const visible = learnState.masteryShowAllOffices
    ? offices
    : offices.slice(0, 6);

  listEl.innerHTML = visible
    .map(
      (o) => `
      <button
        type="button"
        class="mastery-office-row"
        onclick="practiceOfficeFromLearn('${escapeForOnclick(o.office)}')"
        title="Tap to practice ${escapeHTML(o.office)}"
      >
        <div class="mastery-office-meta">
          <span>🏢 ${escapeHTML(o.office)}</span>
          <span class="mastery-office-pct">${o.pct}% (${o.mastered}/${
        o.total
      })</span>
        </div>
        <div class="mastery-bar-track">
          <div class="mastery-bar-fill" style="width: ${o.pct}%"></div>
        </div>
      </button>`
    )
    .join("");

  if (expandBtn) {
    if (offices.length > 6) {
      expandBtn.classList.remove("hidden");
      expandBtn.textContent = learnState.masteryShowAllOffices
        ? "Show Fewer"
        : `Show All ${offices.length} Offices`;
    } else {
      expandBtn.classList.add("hidden");
    }
  }
}

function toggleMasteryOfficeSort() {
  learnState.masterySortLowest = !learnState.masterySortLowest;
  if (navigator.vibrate) navigator.vibrate(15);
  renderMasteryOfficeList();
}

function toggleMasteryShowAllOffices() {
  learnState.masteryShowAllOffices = !learnState.masteryShowAllOffices;
  renderMasteryOfficeList();
}

function practiceOfficeFromLearn(officeName) {
  if (!officeName) return;
  learnState.officeScope = officeName;
  learnState.categoryFilter = "all";
  resetLearnFlashcardDeck();
  switchLearnTab("learn");
  showToast(`🎯 Deck set to ${officeName} — flip cards or tap Quiz!`);
}

// --- TRICKY ADDRESSES (WEAK SPOTS) ---
function getWeakRecordsSorted(progOverride = null) {
  const prog = progOverride || getLearnProgress();
  const records = Array.isArray(cachedPostOffices) ? cachedPostOffices : [];
  const weak = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const c = prog.cards[String(r.id)];
    if (isWeakLearnCard(c)) {
      weak.push({ record: r, card: c });
    }
  }

  weak.sort(
    (a, b) =>
      b.card.misses - a.card.misses ||
      a.card.box - b.card.box ||
      (b.card.lastSeen || 0) - (a.card.lastSeen || 0)
  );
  return weak;
}

function renderMasteryWeakList(progOverride = null) {
  const listEl = document.getElementById("mastery-weak-list");
  const drillBtn = document.getElementById("mastery-drill-weak-btn");
  if (!listEl) return;

  const weak = getWeakRecordsSorted(progOverride);

  if (weak.length === 0) {
    listEl.innerHTML = `<div class="list-empty" style="margin:0; padding:22px 14px; font-size:13.5px;">✨ No tricky addresses right now. Keep drilling!</div>`;
    drillBtn?.classList.add("hidden");
    return;
  }

  listEl.innerHTML = weak
    .slice(0, 8)
    .map(({ record, card }) => {
      const missText = card.misses === 1 ? "1 miss" : `${card.misses} misses`;
      return `
        <div class="mastery-weak-row">
          <div class="mastery-weak-info">
            <strong>${escapeHTML(record.Address)}</strong>
            <span>🏢 ${escapeHTML(record.Office)} • 📍 ${escapeHTML(
        record.Pin || "N/A"
      )}</span>
          </div>
          <span class="mastery-miss-pill">${missText}</span>
        </div>`;
    })
    .join("");

  if (drillBtn) {
    const drillCount = Math.min(weak.length, 15);
    drillBtn.textContent = `⚡ Drill ${drillCount} Weak ${
      drillCount === 1 ? "Spot" : "Spots"
    }`;
    drillBtn.classList.remove("hidden");
  }
}

function drillWeakSpotsNow() {
  const weak = getWeakRecordsSorted().map((w) => w.record);
  if (weak.length === 0) {
    return showToast("✨ No weak spots to drill!");
  }

  learnState.officeScope = "all";
  learnState.categoryFilter = "weak";
  switchLearnTab("quiz");
  startLearnQuiz({
    mode: "standard",
    count: Math.min(weak.length, 15),
    pool: weak,
  });
}

// --- OPT-IN DIVISION LEADERBOARD ---
function renderLearningLeaderboardRows(rows, isOfflineCache = false) {
  const listEl = document.getElementById("learn-leaderboard-list");
  if (!listEl) return;

  if (!Array.isArray(rows) || rows.length === 0) {
    listEl.innerHTML = `
      <div class="list-empty" style="margin:0; padding:22px 14px; font-size:13px;">
        ${
          isOfflineCache
            ? "📴 Connect to the internet to load the Division Leaderboard."
            : "🏆 No colleagues have opted in yet. Turn on the switch above to be #1!"
        }
      </div>`;
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];

  listEl.innerHTML = rows
    .map((row, idx) => {
      const isMe =
        currentUserId && String(row.user_id) === String(currentUserId);
      const rankBadge = idx < 3 ? medals[idx] : String(idx + 1);
      const name = row.name || "DakMitra User";
      const desig = row.designation || "Employee";
      const acc = Number(row.accuracy_pct || 0);
      const streak = Number(row.streak_days || 0);
      const mastered = Number(row.mastered_count || 0);
      const xp = Number(row.xp || 0);

      return `
        <div
          class="learn-lb-row ${isMe ? "is-me" : ""}"
          onclick="if (typeof openUserProfileModal === 'function') openUserProfileModal('${escapeForOnclick(
            row.user_id
          )}', '${escapeForOnclick(name)}')"
          style="cursor: pointer;"
          title="Tap to view profile"
        >
          <span class="learn-lb-rank ${
            idx < 3 ? "is-top" : ""
          }">${rankBadge}</span>
          <div class="learn-lb-info">
            <strong>
              ${escapeHTML(name)}
              ${
                isMe
                  ? `<span class="member-you-badge" style="margin-left:4px;">You</span>`
                  : ""
              }
              ${
                row.is_admin
                  ? `<span class="member-admin-badge" style="margin-left:4px;">Admin</span>`
                  : ""
              }
            </strong>
            <span>${escapeHTML(desig)} • ${acc}% acc • 🔥 ${streak}d</span>
          </div>
          <div class="learn-lb-score">
            <strong>${mastered} mastered</strong>
            <span>${xp} XP</span>
          </div>
        </div>`;
    })
    .join("");
}

async function loadLearningLeaderboard(forceRefresh = false) {
  const listEl = document.getElementById("learn-leaderboard-list");
  if (!listEl) return;

  // 1. Instant paint from memory or localStorage cache
  if (!learnLeaderboardMemCache.rows) {
    try {
      const saved = JSON.parse(
        localStorage.getItem(LEARN_LEADERBOARD_CACHE_KEY)
      );
      if (saved && Array.isArray(saved.rows)) {
        learnLeaderboardMemCache = saved;
      }
    } catch (_) {}
  }

  if (Array.isArray(learnLeaderboardMemCache.rows)) {
    renderLearningLeaderboardRows(
      learnLeaderboardMemCache.rows,
      !navigator.onLine
    );
  } else if (navigator.onLine) {
    listEl.innerHTML = `
      <div class="skeleton-card" style="margin:0; padding:12px;">
        <div class="skeleton-line medium" style="margin-bottom:8px;"></div>
        <div class="skeleton-line short" style="margin-bottom:0;"></div>
      </div>`;
  }

  if (!navigator.onLine) {
    if (!learnLeaderboardMemCache.rows) {
      renderLearningLeaderboardRows([], true);
    }
    return;
  }

  const isFresh =
    !forceRefresh &&
    learnLeaderboardMemCache.rows &&
    Date.now() - learnLeaderboardMemCache.ts < LEARN_LEADERBOARD_TTL_MS;
  if (isFresh) return;

  try {
    await ensureSupabaseReady();
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient.rpc(
      "get_learning_leaderboard",
      {
        p_limit: 25,
      }
    );
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    learnLeaderboardMemCache = { ts: Date.now(), rows };
    try {
      localStorage.setItem(
        LEARN_LEADERBOARD_CACHE_KEY,
        JSON.stringify(learnLeaderboardMemCache)
      );
    } catch (_) {}

    renderLearningLeaderboardRows(rows, false);
  } catch (err) {
    console.warn("Leaderboard fetch failed:", err?.message || err);
    if (!learnLeaderboardMemCache.rows) {
      listEl.innerHTML = `<div class="list-empty" style="margin:0; padding:20px; font-size:13px;">Could not load leaderboard right now.</div>`;
    }
  }
}

async function toggleLeaderboardOptIn(enabled) {
  const prog = getLearnProgress();
  prog.leaderboardOptIn = Boolean(enabled);
  saveLearnProgressLocal(prog, false);

  if (navigator.vibrate) navigator.vibrate(20);
  showToast(
    prog.leaderboardOptIn
      ? "🏆 Joined the Division Leaderboard!"
      : "🙈 Hidden from Division Leaderboard",
    prog.leaderboardOptIn ? "success" : "info"
  );

  if (navigator.onLine) {
    await pushLearningProgressToCloud();
    loadLearningLeaderboard(true);
  } else {
    updateLearnSyncStatusText("📴 Saved offline — will sync online");
  }
}

// --- RESET PROGRESS ---
function confirmResetLearnProgress() {
  showCustomConfirm(
    "Reset Learning Progress?",
    "This clears your mastery count, daily streak, XP, and weak-spot history on this device and in the cloud.",
    "Reset All",
    async () => {
      const keepOptIn = Boolean(getLearnProgress().leaderboardOptIn);
      const fresh = createEmptyLearnProgress();
      fresh.leaderboardOptIn = keepOptIn;
      saveLearnProgressLocal(fresh, false);

      learnState.fcCurrentRecord = null;
      learnState.fcFlipped = false;
      learnState.fcRecentIds = [];
      learnState.fcHistory = [];
      learnState.fcHistoryIndex = -1;

      renderLearnOverview();
      renderLearnFilterChips();
      renderMasteryTab();
      loadNextFlashcard("none");
      showToast("🗑️ Learning progress reset.");

      if (navigator.onLine) {
        await pushLearningProgressToCloud();
        if (keepOptIn) loadLearningLeaderboard(true);
      }
    }
  );
}

// --- DIRECTORY "PRACTICE THIS OFFICE" ENTRY POINT ---
function practiceOfficeFromDirectory(officeName) {
  if (!officeName) return;
  if (typeof closeAllDirectoryActionTrays === "function") {
    closeAllDirectoryActionTrays();
  }

  learnState.officeScope = officeName;
  learnState.categoryFilter = "all";
  learnState.activeTab = "learn";
  resetLearnFlashcardDeck();

  if (typeof switchDashboardView === "function") {
    switchDashboardView("learn");
  }
  showToast(`🎯 Practicing ${officeName}`);
}

// --- FLASHCARD SWIPE PHYSICS (TOUCH & MOUSE) ---
function bindFlashcardSwipeGestures() {
  const wrap = document.getElementById("learn-card-swipe-wrap");
  if (!wrap || wrap.dataset.swipeBound === "1") return;
  wrap.dataset.swipeBound = "1";

  let activePointerId = null;
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let dx = 0;
  let dy = 0;
  let axis = null; // null | "x" | "y"
  let captured = false;

  wrap.addEventListener("dragstart", (e) => e.preventDefault());

  wrap.addEventListener("pointerdown", (e) => {
    if (learnState.fcIsTransitioning) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest("button, a, input")) return;

    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startTime = performance.now();
    dx = 0;
    dy = 0;
    axis = null;
    captured = false;
  });

  wrap.addEventListener("pointermove", (e) => {
    if (e.pointerId !== activePointerId) return;

    dx = e.clientX - startX;
    dy = e.clientY - startY;

    if (axis === null) {
      if (Math.hypot(dx, dy) < 8) return;

      if (Math.abs(dx) > Math.abs(dy) * 1.15) {
        axis = "x";
        wrap.classList.remove("is-entering-left", "is-entering-right");
        wrap.classList.add("is-dragging");
        try {
          wrap.setPointerCapture(e.pointerId);
          captured = true;
        } catch (_) {}
      } else {
        // Vertical drag -> yield immediately to page scroll
        axis = "y";
        activePointerId = null;
        return;
      }
    }

    if (axis !== "x") return;

    const canPrev = learnState.fcHistoryIndex > 0;
    const canNext =
      learnState.fcHistoryIndex < learnState.fcHistory.length - 1 ||
      canAdvanceLearnDeck();
    const isBlockedEdge = (dx > 0 && !canPrev) || (dx < 0 && !canNext);

    if (isBlockedEdge) {
      const damped = Math.max(-52, Math.min(52, dx * 0.24));
      const tilt = damped * 0.04;
      wrap.style.transform = `translate3d(${damped}px, 0, 0) rotate(${tilt}deg)`;
      wrap.style.opacity = "";
    } else {
      const tilt = Math.max(-10, Math.min(10, dx * 0.045));
      const opacity = Math.max(0.55, 1 - Math.abs(dx) / 420);
      wrap.style.transform = `translate3d(${dx}px, 0, 0) rotate(${tilt}deg)`;
      wrap.style.opacity = String(opacity);
    }
  });

  function finishPointerGesture(e, cancelled = false) {
    if (e.pointerId !== activePointerId) return;

    const finalAxis = axis;
    const finalDx = dx;
    const finalDy = dy;
    const elapsed = Math.max(1, performance.now() - startTime);

    activePointerId = null;
    axis = null;

    if (captured) {
      try {
        wrap.releasePointerCapture(e.pointerId);
      } catch (_) {}
      captured = false;
    }

    wrap.classList.remove("is-dragging");

    if (cancelled) {
      wrap.style.transform = "";
      wrap.style.opacity = "";
      return;
    }

    // Clean tap -> flip flashcard
    if (finalAxis === null && Math.hypot(finalDx, finalDy) <= 10) {
      flipLearnCard();
      return;
    }

    if (finalAxis !== "x") return;

    const cardWidth = wrap.offsetWidth || 320;
    const distanceThreshold = Math.min(95, cardWidth * 0.26);
    const velocity = Math.abs(finalDx) / elapsed;
    const triggered =
      Math.abs(finalDx) >= distanceThreshold ||
      (Math.abs(finalDx) >= 42 && velocity >= 0.35);

    const canPrev = learnState.fcHistoryIndex > 0;
    const canNext =
      learnState.fcHistoryIndex < learnState.fcHistory.length - 1 ||
      canAdvanceLearnDeck();

    if (triggered && finalDx < 0) {
      if (canNext) {
        wrap.style.transform = "";
        wrap.style.opacity = "";
        goToNextFlashcard(true);
        return;
      }
      if (Math.abs(finalDx) > 32) showToast("Only 1 card in this deck", "info");
    } else if (triggered && finalDx > 0) {
      if (canPrev) {
        wrap.style.transform = "";
        wrap.style.opacity = "";
        goToPrevFlashcard(true);
        return;
      }
      if (finalDx > 32) showToast("Already at first card", "info");
    }

    // Snap back smoothly
    wrap.style.transform = "";
    wrap.style.opacity = "";
  }

  wrap.addEventListener("pointerup", (e) => finishPointerGesture(e, false));
  wrap.addEventListener("pointercancel", (e) => finishPointerGesture(e, true));
}

// --- DESKTOP / TABLET KEYBOARD SHORTCUTS FOR FLASHCARDS ---
(function initLearnKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    const viewEl = document.getElementById("view-learn");
    if (!viewEl || !viewEl.classList.contains("active")) return;
    if (learnState.activeTab !== "learn" || learnState.quiz.active) return;
    if (document.querySelector(".modal-overlay.show")) return;
    if (document.getElementById("sidebar")?.classList.contains("open")) return;

    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.tagName === "SELECT" ||
        activeEl.isContentEditable)
    ) {
      return;
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      goToNextFlashcard(false);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goToPrevFlashcard(false);
    } else if (e.key === " ") {
      if (
        activeEl &&
        activeEl.tagName === "BUTTON" &&
        activeEl.id !== "learn-active-flashcard"
      ) {
        return;
      }
      e.preventDefault();
      flipLearnCard();
    } else if (
      e.key === "Enter" &&
      activeEl &&
      activeEl.id === "learn-active-flashcard"
    ) {
      e.preventDefault();
      flipLearnCard();
    } else if (learnState.fcFlipped) {
      if (e.key === "1") {
        e.preventDefault();
        rateLearnCard("again");
      } else if (e.key === "2") {
        e.preventDefault();
        rateLearnCard("good");
      } else if (e.key === "3") {
        e.preventDefault();
        rateLearnCard("easy");
      }
    }
  });
})();

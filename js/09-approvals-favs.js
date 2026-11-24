// =========================================================
// 09-APPROVALS-FAVS.JS — Favorites & Community Approvals
// =========================================================

// --- SAVED FAVORITES ---
function toggleFavorite(id, address, office, pin, btnElement) {
  let favorites = getSafeStorage(FAV_KEY);
  const existingIndex = favorites.findIndex((f) => String(f.id) === String(id));
  const isFavNow = existingIndex === -1;

  if (existingIndex > -1) {
    favorites.splice(existingIndex, 1);
    showToast("Removed from favorites");
  } else {
    favorites.push({ id, address, office, pin });
    showToast("⭐ Added to favorites");
  }

  localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
  renderFavorites();

  if (btnElement) {
    if (isFavNow) {
      btnElement.innerHTML = `${ICON_STAR_FILLED} Saved`;
      btnElement.style.color = "#f59e0b";
      btnElement.style.backgroundColor = "rgba(245, 158, 11, 0.1)";
    } else {
      btnElement.innerHTML = `${ICON_STAR_OUTLINE} Save`;
      btnElement.style.color = "var(--text-light)";
      btnElement.style.backgroundColor = "var(--input-bg)";
    }
  } else if (typeof renderResults === "function") {
    renderResults();
  }
}

function renderFavorites() {
  const favorites = getSafeStorage(FAV_KEY);
  const displayArea = document.getElementById("favorites-display-area");
  if (!displayArea) return;

  if (favorites.length === 0) {
    displayArea.innerHTML = `
        <ul class="list-container">
          <li class="list-empty">
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <span>No favorites saved yet.</span>
          </li>
        </ul>`;
    return;
  }

  let html = `<ul class="list-container" style="margin:0; list-style:none;">`;
  favorites.forEach((row) => {
    const favStyle = getFavoriteBtnStyles(true);

    html += `
        <li class="list-item" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px;">
          <div style="flex: 1 1 200px;">
            <div class="office-title">${escapeHTML(row.address)}</div>
            <div class="sub-office">
              <span class="badge badge-primary">🏢 ${escapeHTML(
                row.office,
              )}</span>
              <span class="badge">📍 ${escapeHTML(row.pin) || "N/A"}</span>
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end;">
            <button onclick="toggleFavorite('${
              row.id
            }', '${escapeForOnclick(row.address)}', '${escapeForOnclick(
              row.office,
            )}', '${escapeForOnclick(
              row.pin,
            )}', null)" class="toolbar-btn" style="padding: 6px 12px; font-size: 13px; font-weight: 600; border: 1px solid transparent; border-radius: 8px; cursor: pointer; transition: 0.2s; ${
              favStyle.style
            }">
              ${favStyle.icon}
            </button>
          </div>
        </li>`;
  });
  html += `</ul>`;
  displayArea.innerHTML = html;
}

// --- APPROVALS WORKFLOW (FULL SEARCH, PHONETIC & FILTER SUITE) ---
const APPROVALS_ACTION_TYPES = ["ADD", "EDIT", "DELETE"];

const approvalsFilters = {
  search: "",
  actionTypes: new Set(), // empty = ALL; subset of ADD / EDIT / DELETE
  userId: null,
  userName: "",
  userEmpId: "",
  userRole: "requested", // 'requested' | 'reviewed' | 'voted' | 'any'
  datePreset: "any", // 'any' | 'today' | 'yesterday' | '7d' | 'month' | 'specific' | 'range'
  dateSingle: "",
  dateFrom: "",
  dateTo: "",
  office: "",
  pin: "",
  pendingScope: "all", // 'all' | 'needs_my_vote' | 'my_requests' | 'i_voted'
  voteProgress: "all", // 'all' | 'zero' | 'near_approval'
  resolvedStatus: "all", // 'all' | 'APPROVED' | 'REJECTED'
  approvalSource: "all", // 'all' | 'admin_approved' | 'admin_direct' | 'community'
  resolvedOnlyMine: false,
  sort: "newest", // 'newest' | 'oldest' | 'most_votes'
};

let approvalsPage = 0;
let approvalsHasMore = true;
let approvalsTotalCount = 0;
let approvalsRequestSeq = 0;
let approvalsSearchDebounce = null;
let approvalsPinDebounce = null;
let approvalsOfficeDebounce = null;
let approvalsRealtimeTimer = null;
let approvalsUsersLoadingPromise = null;
let approvalsSkipNextViewSwitchLoad = false;

function hasActiveApprovalFilters(tab = currentApprovalTab) {
  if (approvalsFilters.search.trim().length > 0) return true;
  if (approvalsFilters.actionTypes.size > 0) return true;
  if (approvalsFilters.userId) return true;
  if (approvalsFilters.datePreset !== "any") return true;
  if (approvalsFilters.office.trim().length > 0) return true;
  if (approvalsFilters.pin.trim().length > 0) return true;
  if (approvalsFilters.sort !== "newest") return true;

  if (tab === "pending") {
    if (approvalsFilters.pendingScope !== "all") return true;
    if (approvalsFilters.voteProgress !== "all") return true;
  } else {
    if (approvalsFilters.resolvedStatus !== "all") return true;
    if (approvalsFilters.approvalSource !== "all") return true;
    if (approvalsFilters.resolvedOnlyMine) return true;
  }
  return false;
}

function getAdvancedApprovalFilterCount(tab = currentApprovalTab) {
  let count = 0;
  if (approvalsFilters.userId) count++;
  if (approvalsFilters.datePreset !== "any") count++;
  if (approvalsFilters.office.trim().length > 0) count++;
  if (approvalsFilters.pin.trim().length > 0) count++;
  if (approvalsFilters.sort !== "newest") count++;
  if (tab === "pending" && approvalsFilters.voteProgress !== "all") count++;
  if (tab === "resolved" && approvalsFilters.approvalSource !== "all") count++;
  return count;
}

function parseLocalDateISO(dateStr, addDays = 0) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d + addDays, 0, 0, 0, 0).toISOString();
}

function computeApprovalsDateBounds() {
  const preset = approvalsFilters.datePreset;
  if (preset === "any") return { from: null, to: null };

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  if (preset === "today") {
    return {
      from: new Date(y, m, d, 0, 0, 0, 0).toISOString(),
      to: new Date(y, m, d + 1, 0, 0, 0, 0).toISOString(),
    };
  }
  if (preset === "yesterday") {
    return {
      from: new Date(y, m, d - 1, 0, 0, 0, 0).toISOString(),
      to: new Date(y, m, d, 0, 0, 0, 0).toISOString(),
    };
  }
  if (preset === "7d") {
    return {
      from: new Date(y, m, d - 6, 0, 0, 0, 0).toISOString(),
      to: new Date(y, m, d + 1, 0, 0, 0, 0).toISOString(),
    };
  }
  if (preset === "month") {
    return {
      from: new Date(y, m, 1, 0, 0, 0, 0).toISOString(),
      to: new Date(y, m, d + 1, 0, 0, 0, 0).toISOString(),
    };
  }
  if (preset === "specific") {
    if (!approvalsFilters.dateSingle) return { from: null, to: null };
    return {
      from: parseLocalDateISO(approvalsFilters.dateSingle, 0),
      to: parseLocalDateISO(approvalsFilters.dateSingle, 1),
    };
  }
  if (preset === "range") {
    let fromStr = approvalsFilters.dateFrom;
    let toStr = approvalsFilters.dateTo;
    if (fromStr && toStr && fromStr > toStr) {
      [fromStr, toStr] = [toStr, fromStr];
    }
    return {
      from: parseLocalDateISO(fromStr, 0),
      to: parseLocalDateISO(toStr, 1),
    };
  }
  return { from: null, to: null };
}

function highlightApprovalText(text, query) {
  const str = text === null || text === undefined ? "" : String(text);
  const q = String(query || "").trim();
  if (!str || q.length < 2) return escapeHTML(str);

  const lowerStr = str.toLowerCase();
  const lowerQ = q.toLowerCase();
  let out = "";
  let pos = 0;
  let idx = lowerStr.indexOf(lowerQ, pos);

  if (idx === -1) return escapeHTML(str);

  while (idx !== -1) {
    out += escapeHTML(str.slice(pos, idx));
    out += `<span class="highlight-text">${escapeHTML(
      str.slice(idx, idx + q.length),
    )}</span>`;
    pos = idx + q.length;
    idx = lowerStr.indexOf(lowerQ, pos);
  }
  out += escapeHTML(str.slice(pos));
  return out;
}

// --- FILTER CONTROLS & UI SYNC ---
function syncApprovalsFilterUI() {
  const isPending = currentApprovalTab === "pending";

  // Keep sort valid on Resolved tab
  if (!isPending && approvalsFilters.sort === "most_votes") {
    approvalsFilters.sort = "newest";
  }

  // Keep user role valid on Pending tab
  if (isPending && approvalsFilters.userRole === "reviewed") {
    approvalsFilters.userRole = "requested";
  }

  // Toggle tab-specific sections inside Filters drawer
  document
    .getElementById("appr-vote-progress-section")
    ?.classList.toggle("hidden", !isPending);
  document
    .getElementById("appr-approval-source-section")
    ?.classList.toggle("hidden", isPending);
  document
    .getElementById("appr-sort-votes-btn")
    ?.classList.toggle("hidden", !isPending);
  document
    .getElementById("appr-role-reviewed-btn")
    ?.classList.toggle("hidden", isPending);

  // Toggle tab-specific pinned quick chips
  document
    .getElementById("appr-chip-needs-vote")
    ?.classList.toggle("hidden", !isPending);
  document
    .getElementById("appr-chip-my-pending")
    ?.classList.toggle("hidden", !isPending);
  document
    .getElementById("appr-chip-i-voted")
    ?.classList.toggle("hidden", !isPending);

  document
    .getElementById("appr-chip-approved")
    ?.classList.toggle("hidden", isPending);
  document
    .getElementById("appr-chip-rejected")
    ?.classList.toggle("hidden", isPending);
  document
    .getElementById("appr-chip-my-resolved")
    ?.classList.toggle("hidden", isPending);

  // Sync Change Type chips
  const isAllActions = approvalsFilters.actionTypes.size === 0;
  document
    .getElementById("appr-chip-all")
    ?.classList.toggle("active", isAllActions);
  APPROVALS_ACTION_TYPES.forEach((act) => {
    document
      .getElementById(`appr-chip-${act}`)
      ?.classList.toggle("active", approvalsFilters.actionTypes.has(act));
  });

  // Sync Pending contextual chips
  document
    .getElementById("appr-chip-needs-vote")
    ?.classList.toggle(
      "active",
      approvalsFilters.pendingScope === "needs_my_vote",
    );
  document
    .getElementById("appr-chip-my-pending")
    ?.classList.toggle(
      "active",
      approvalsFilters.pendingScope === "my_requests",
    );
  document
    .getElementById("appr-chip-i-voted")
    ?.classList.toggle("active", approvalsFilters.pendingScope === "i_voted");

  // Sync Resolved contextual chips
  document
    .getElementById("appr-chip-approved")
    ?.classList.toggle("active", approvalsFilters.resolvedStatus === "APPROVED");
  document
    .getElementById("appr-chip-rejected")
    ?.classList.toggle("active", approvalsFilters.resolvedStatus === "REJECTED");
  document
    .getElementById("appr-chip-my-resolved")
    ?.classList.toggle("active", approvalsFilters.resolvedOnlyMine);

  // Sync User role row
  const roleRow = document.getElementById("appr-user-role-row");
  if (roleRow) {
    roleRow.classList.toggle("hidden", !approvalsFilters.userId);
    roleRow.querySelectorAll("[data-user-role]").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.getAttribute("data-user-role") === approvalsFilters.userRole,
      );
    });
  }

  // Sync Date presets & pickers
  document.querySelectorAll("[data-date-preset]").forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.getAttribute("data-date-preset") === approvalsFilters.datePreset,
    );
  });
  document
    .getElementById("appr-specific-date-wrap")
    ?.classList.toggle("hidden", approvalsFilters.datePreset !== "specific");
  document
    .getElementById("appr-range-date-wrap")
    ?.classList.toggle("hidden", approvalsFilters.datePreset !== "range");

  // Sync Vote Progress, Approval Source & Sort pills
  document.querySelectorAll("[data-vote-progress]").forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.getAttribute("data-vote-progress") === approvalsFilters.voteProgress,
    );
  });
  document.querySelectorAll("[data-approval-source]").forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.getAttribute("data-approval-source") ===
        approvalsFilters.approvalSource,
    );
  });
  document.querySelectorAll("[data-appr-sort]").forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.getAttribute("data-appr-sort") === approvalsFilters.sort,
    );
  });

  // Sync Filters toggle button badge & Search wrapper highlight
  const advCount = getAdvancedApprovalFilterCount();
  const toggleBtn = document.getElementById("approvals-filter-toggle-btn");
  const searchWrap = document.getElementById("approvals-search-wrapper");

  if (toggleBtn) {
    if (advCount > 0) {
      toggleBtn.classList.add("has-active-filters");
      toggleBtn.innerHTML = `<span class="filter-pulse-dot"></span><span>⚙️ Filters</span><span class="filter-count-badge">${advCount}</span>`;
    } else {
      toggleBtn.classList.remove("has-active-filters");
      toggleBtn.innerHTML = "⚙️ Filters";
    }
  }
  if (searchWrap) {
    searchWrap.classList.toggle("has-active-filters", advCount > 0);
  }

  renderApprovalsActiveFilterPills();
}

function renderApprovalsActiveFilterPills() {
  const bar = document.getElementById("approvals-active-filters-bar");
  if (!bar) return;

  const pills = [];

  if (approvalsFilters.userId) {
    const roleLabels = {
      requested: "By",
      reviewed: "Reviewed by",
      voted: "Voted by",
      any: "User",
    };
    const prefix = roleLabels[approvalsFilters.userRole] || "User";
    pills.push({
      key: "user",
      label: `👤 ${prefix}: ${approvalsFilters.userName}`,
    });
  }

  if (approvalsFilters.datePreset !== "any") {
    const dateLabels = {
      today: "Today",
      yesterday: "Yesterday",
      "7d": "Last 7 Days",
      month: "This Month",
      specific: approvalsFilters.dateSingle || "Specific Date",
      range:
        approvalsFilters.dateFrom || approvalsFilters.dateTo
          ? `${approvalsFilters.dateFrom || "..."} → ${
              approvalsFilters.dateTo || "..."
            }`
          : "Date Range",
    };
    pills.push({
      key: "date",
      label: `📅 ${dateLabels[approvalsFilters.datePreset]}`,
    });
  }

  if (approvalsFilters.office.trim()) {
    pills.push({
      key: "office",
      label: `🏢 ${approvalsFilters.office.trim()}`,
    });
  }

  if (approvalsFilters.pin.trim()) {
    pills.push({
      key: "pin",
      label: `📍 ${approvalsFilters.pin.trim()}`,
    });
  }

  if (
    currentApprovalTab === "pending" &&
    approvalsFilters.voteProgress !== "all"
  ) {
    pills.push({
      key: "voteProgress",
      label:
        approvalsFilters.voteProgress === "near_approval"
          ? "🔥 Near Approval (3–4)"
          : "🗳️ 0 Votes",
    });
  }

  if (
    currentApprovalTab === "resolved" &&
    approvalsFilters.approvalSource !== "all"
  ) {
    const srcLabels = {
      admin_approved: "🛡️ Admin Approved",
      admin_direct: "⚡ Admin Direct",
      community: "👥 Community",
    };
    pills.push({
      key: "approvalSource",
      label: srcLabels[approvalsFilters.approvalSource],
    });
  }

  if (approvalsFilters.sort !== "newest") {
    pills.push({
      key: "sort",
      label:
        approvalsFilters.sort === "oldest"
          ? "↕️ Oldest First"
          : "↕️ Most Votes",
    });
  }

  if (pills.length === 0) {
    bar.classList.add("hidden");
    bar.innerHTML = "";
    return;
  }

  let html = pills
    .map(
      (p) => `
      <span class="active-filter-pill">
        <span>${escapeHTML(p.label)}</span>
        <button type="button" onclick="removeSingleApprovalFilter('${p.key}')" title="Remove filter">✕</button>
      </span>`,
    )
    .join("");

  if (pills.length > 1) {
    html += `<button type="button" class="clear-all-filters-pill" onclick="resetApprovalsFilters()">Clear all</button>`;
  }

  bar.innerHTML = html;
  bar.classList.remove("hidden");
}

function updateApprovalsSummaryStrip(totalCount) {
  const summaryEl = document.getElementById("approvals-filter-summary");
  const textEl = document.getElementById("approvals-filter-summary-text");
  if (!summaryEl || !textEl) return;

  if (!hasActiveApprovalFilters()) {
    summaryEl.classList.add("hidden");
    textEl.textContent = "";
    return;
  }

  const label = totalCount === 1 ? "request" : "requests";
  textEl.textContent = `Showing ${totalCount} matching ${label}`;
  summaryEl.classList.remove("hidden");
}

function toggleApprovalsFiltersPanel() {
  const panel = document.getElementById("approvals-filters-panel");
  if (!panel) return;
  const willOpen = panel.classList.contains("hidden");
  panel.classList.toggle("hidden");
  if (willOpen) {
    ensureApprovalsUsersLoaded();
  } else {
    closeAllDropdowns();
  }
}

function handleApprovalsSearchInput(inputEl) {
  const val = inputEl ? inputEl.value : "";
  approvalsFilters.search = val;
  document
    .getElementById("clear-approvals-search-btn")
    ?.classList.toggle("hidden", val.length === 0);

  clearTimeout(approvalsSearchDebounce);
  approvalsSearchDebounce = setTimeout(() => {
    applyApprovalsFilters(true);
  }, 280);
}

function clearApprovalsSearchInput() {
  const input = document.getElementById("approvals-search-input");
  if (input) {
    input.value = "";
    input.focus();
  }
  approvalsFilters.search = "";
  document
    .getElementById("clear-approvals-search-btn")
    ?.classList.add("hidden");
  applyApprovalsFilters(true);
}

function toggleApprovalsActionChip(action) {
  if (action === "ALL") {
    approvalsFilters.actionTypes.clear();
  } else if (APPROVALS_ACTION_TYPES.includes(action)) {
    if (approvalsFilters.actionTypes.has(action)) {
      approvalsFilters.actionTypes.delete(action);
    } else {
      approvalsFilters.actionTypes.add(action);
    }
    if (approvalsFilters.actionTypes.size === APPROVALS_ACTION_TYPES.length) {
      approvalsFilters.actionTypes.clear();
    }
  }
  if (navigator.vibrate) navigator.vibrate(18);
  applyApprovalsFilters(true);
}

function setApprovalsPendingScope(scope) {
  approvalsFilters.pendingScope =
    approvalsFilters.pendingScope === scope ? "all" : scope;

  // Avoid conflicting user filter when toggling "My Requests"
  if (
    approvalsFilters.pendingScope === "my_requests" &&
    approvalsFilters.userId &&
    String(approvalsFilters.userId) !== String(currentUserId)
  ) {
    clearApprovalsUserFilter(false);
  }
  if (navigator.vibrate) navigator.vibrate(18);
  applyApprovalsFilters(true);
}

function setApprovalsResolvedStatus(status) {
  approvalsFilters.resolvedStatus =
    approvalsFilters.resolvedStatus === status ? "all" : status;

  // Approval source only applies to APPROVED requests
  if (approvalsFilters.resolvedStatus === "REJECTED") {
    approvalsFilters.approvalSource = "all";
  }
  if (navigator.vibrate) navigator.vibrate(18);
  applyApprovalsFilters(true);
}

function toggleApprovalsResolvedMine() {
  approvalsFilters.resolvedOnlyMine = !approvalsFilters.resolvedOnlyMine;
  if (
    approvalsFilters.resolvedOnlyMine &&
    approvalsFilters.userId &&
    String(approvalsFilters.userId) !== String(currentUserId)
  ) {
    clearApprovalsUserFilter(false);
  }
  if (navigator.vibrate) navigator.vibrate(18);
  applyApprovalsFilters(true);
}

// --- SPECIFIC USER AUTOCOMPLETE (REUSES MEMBERS DIRECTORY RPC) ---
async function ensureApprovalsUsersLoaded() {
  if (
    typeof membersDirectoryData !== "undefined" &&
    Array.isArray(membersDirectoryData) &&
    membersDirectoryData.length > 0
  ) {
    return membersDirectoryData;
  }

  try {
    const cached = JSON.parse(localStorage.getItem(MEMBERS_CACHE_KEY));
    if (Array.isArray(cached) && cached.length > 0) {
      membersDirectoryData = cached;
      return membersDirectoryData;
    }
  } catch (_) {}

  if (!navigator.onLine) return [];

  if (!approvalsUsersLoadingPromise) {
    approvalsUsersLoadingPromise = (async () => {
      try {
        await ensureSupabaseReady();
        const { data, error } = await supabaseClient.rpc(
          "get_members_directory",
        );
        if (!error && Array.isArray(data)) {
          membersDirectoryData = data;
          try {
            localStorage.setItem(MEMBERS_CACHE_KEY, JSON.stringify(data));
          } catch (_) {}
        }
      } catch (_) {
      } finally {
        approvalsUsersLoadingPromise = null;
      }
      return membersDirectoryData || [];
    })();
  }
  return approvalsUsersLoadingPromise;
}

async function handleApprovalsUserInput(inputEl) {
  cancelCloseDropdowns();
  const val = (inputEl?.value || "").trim();
  const dropdown = document.getElementById("appr-filter-user-dropdown");
  const clearBtn = document.getElementById("clear-appr-user-btn");

  clearBtn?.classList.toggle(
    "hidden",
    val.length === 0 && !approvalsFilters.userId,
  );

  // If user edits text away from selected user, clear selected ID until they pick
  if (
    approvalsFilters.userId &&
    val.toLowerCase() !== approvalsFilters.userName.toLowerCase()
  ) {
    approvalsFilters.userId = null;
    approvalsFilters.userName = "";
    approvalsFilters.userEmpId = "";
    syncApprovalsFilterUI();
  }

  const members = await ensureApprovalsUsersLoaded();
  if (!dropdown) return;

  const q = val.toLowerCase();
  const matches = members
    .filter((m) => {
      if (!q) return true;
      const hay = `${m.name || ""} ${m.employee_id || ""} ${
        m.designation || ""
      }`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, 10);

  if (matches.length === 0) {
    dropdown.classList.remove("show");
    return;
  }

  dropdown.innerHTML = matches
    .map((m) => {
      const mName = m.name || "DakMitra User";
      const empId = m.employee_id || "No ID";
      const initial = mName.trim().charAt(0).toUpperCase() || "U";
      return `
        <div
          class="autocomplete-item"
          onpointerdown="event.preventDefault()"
          onclick="selectApprovalsUser('${escapeForOnclick(
            m.id,
          )}', '${escapeForOnclick(mName)}', '${escapeForOnclick(empId)}')"
        >
          <div class="ac-item-main">
            <span class="ac-item-icon" style="font-weight: 800; font-size: 12px;">${escapeHTML(
              initial,
            )}</span>
            <span class="ac-item-name">${escapeHTML(mName)}${
              m.is_admin ? " 🛡️" : ""
            }</span>
          </div>
          <span class="ac-item-pin">${escapeHTML(empId)}</span>
        </div>`;
    })
    .join("");
  dropdown.classList.add("show");
}

function selectApprovalsUser(userId, userName, userEmpId = "") {
  approvalsFilters.userId = String(userId);
  approvalsFilters.userName = userName || "User";
  approvalsFilters.userEmpId = userEmpId || "";

  // Clear conflicting "My Requests" toggle if another colleague was chosen
  if (String(userId) !== String(currentUserId)) {
    if (approvalsFilters.pendingScope === "my_requests") {
      approvalsFilters.pendingScope = "all";
    }
    approvalsFilters.resolvedOnlyMine = false;
  }

  const input = document.getElementById("appr-filter-user");
  if (input) input.value = approvalsFilters.userName;
  document.getElementById("clear-appr-user-btn")?.classList.remove("hidden");
  closeAllDropdowns();
  applyApprovalsFilters(true);
}

function clearApprovalsUserFilter(shouldRefresh = true) {
  approvalsFilters.userId = null;
  approvalsFilters.userName = "";
  approvalsFilters.userEmpId = "";
  approvalsFilters.userRole = "requested";

  const input = document.getElementById("appr-filter-user");
  if (input) input.value = "";
  document.getElementById("clear-appr-user-btn")?.classList.add("hidden");
  closeAllDropdowns();
  if (shouldRefresh) applyApprovalsFilters(true);
}

function setApprovalsUserRole(role) {
  approvalsFilters.userRole = role || "requested";
  if (navigator.vibrate) navigator.vibrate(15);
  applyApprovalsFilters(true);
}

// --- DATE, OFFICE, PIN, VOTE, SOURCE & SORT HANDLERS ---
function setApprovalsDatePreset(preset) {
  approvalsFilters.datePreset = preset || "any";

  const todayISO = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  })();

  if (preset === "specific") {
    if (!approvalsFilters.dateSingle) {
      approvalsFilters.dateSingle = todayISO;
      const el = document.getElementById("appr-date-single");
      if (el) el.value = todayISO;
    }
  } else if (preset === "range") {
    if (!approvalsFilters.dateFrom && !approvalsFilters.dateTo) {
      approvalsFilters.dateTo = todayISO;
      const toEl = document.getElementById("appr-date-to");
      if (toEl) toEl.value = todayISO;
    }
  } else if (preset === "any") {
    approvalsFilters.dateSingle = "";
    approvalsFilters.dateFrom = "";
    approvalsFilters.dateTo = "";
    const s = document.getElementById("appr-date-single");
    const f = document.getElementById("appr-date-from");
    const t = document.getElementById("appr-date-to");
    if (s) s.value = "";
    if (f) f.value = "";
    if (t) t.value = "";
  }

  if (navigator.vibrate) navigator.vibrate(15);
  applyApprovalsFilters(true);
}

function handleApprovalsDateInputChange() {
  approvalsFilters.dateSingle =
    document.getElementById("appr-date-single")?.value || "";
  approvalsFilters.dateFrom =
    document.getElementById("appr-date-from")?.value || "";
  approvalsFilters.dateTo =
    document.getElementById("appr-date-to")?.value || "";
  applyApprovalsFilters(true);
}

function handleApprovalsOfficeInput(inputEl) {
  cancelCloseDropdowns();
  const val = inputEl?.value || "";
  approvalsFilters.office = val;

  document
    .getElementById("clear-appr-office-btn")
    ?.classList.toggle("hidden", val.length === 0);

  const dropdown = document.getElementById("appr-filter-office-dropdown");
  if (dropdown && typeof getOfficePinMap === "function") {
    const officeMap = getOfficePinMap();
    let matched = Array.from(officeMap.keys());
    if (val.trim()) {
      const lower = val.trim().toLowerCase();
      matched = matched.filter((o) => o.toLowerCase().includes(lower));
    }
    matched.sort();

    if (matched.length === 0) {
      dropdown.classList.remove("show");
    } else {
      dropdown.innerHTML = matched
        .slice(0, 10)
        .map((office) => {
          const pin = officeMap.get(office);
          return `
            <div
              class="autocomplete-item"
              onpointerdown="event.preventDefault()"
              onclick="selectApprovalsOffice('${escapeForOnclick(office)}')"
            >
              <div class="ac-item-main">
                <span class="ac-item-icon">🏢</span>
                <span class="ac-item-name">${escapeHTML(office)}</span>
              </div>
              ${
                pin
                  ? `<span class="ac-item-pin">${escapeHTML(pin)}</span>`
                  : ""
              }
            </div>`;
        })
        .join("");
      dropdown.classList.add("show");
    }
  }

  clearTimeout(approvalsOfficeDebounce);
  approvalsOfficeDebounce = setTimeout(() => {
    applyApprovalsFilters(true);
  }, 280);
}

function selectApprovalsOffice(officeName) {
  approvalsFilters.office = officeName || "";
  const input = document.getElementById("appr-filter-office");
  if (input) input.value = approvalsFilters.office;
  document.getElementById("clear-appr-office-btn")?.classList.remove("hidden");
  closeAllDropdowns();
  clearTimeout(approvalsOfficeDebounce);
  applyApprovalsFilters(true);
}

function clearApprovalsOfficeFilter() {
  approvalsFilters.office = "";
  const input = document.getElementById("appr-filter-office");
  if (input) input.value = "";
  document.getElementById("clear-appr-office-btn")?.classList.add("hidden");
  closeAllDropdowns();
  applyApprovalsFilters(true);
}

function handleApprovalsPinInput(inputEl) {
  const val = inputEl?.value || "";
  approvalsFilters.pin = val;
  document
    .getElementById("clear-appr-pin-btn")
    ?.classList.toggle("hidden", val.length === 0);

  clearTimeout(approvalsPinDebounce);
  approvalsPinDebounce = setTimeout(() => {
    applyApprovalsFilters(true);
  }, 280);
}

function clearApprovalsPinFilter() {
  approvalsFilters.pin = "";
  const input = document.getElementById("appr-filter-pin");
  if (input) input.value = "";
  document.getElementById("clear-appr-pin-btn")?.classList.add("hidden");
  applyApprovalsFilters(true);
}

function setApprovalsVoteProgress(val) {
  approvalsFilters.voteProgress = val || "all";
  if (navigator.vibrate) navigator.vibrate(15);
  applyApprovalsFilters(true);
}

function setApprovalsApprovalSource(val) {
  approvalsFilters.approvalSource = val || "all";
  if (approvalsFilters.approvalSource !== "all") {
    approvalsFilters.resolvedStatus = "APPROVED";
  }
  if (navigator.vibrate) navigator.vibrate(15);
  applyApprovalsFilters(true);
}

function setApprovalsSort(val) {
  approvalsFilters.sort = val || "newest";
  if (navigator.vibrate) navigator.vibrate(15);
  applyApprovalsFilters(true);
}

function removeSingleApprovalFilter(key) {
  if (key === "user") {
    clearApprovalsUserFilter(false);
  } else if (key === "date") {
    setApprovalsDatePreset("any");
    return;
  } else if (key === "office") {
    clearApprovalsOfficeFilter();
    return;
  } else if (key === "pin") {
    clearApprovalsPinFilter();
    return;
  } else if (key === "voteProgress") {
    approvalsFilters.voteProgress = "all";
  } else if (key === "approvalSource") {
    approvalsFilters.approvalSource = "all";
  } else if (key === "sort") {
    approvalsFilters.sort = "newest";
  }
  applyApprovalsFilters(true);
}

function resetApprovalsFiltersStateOnly() {
  approvalsFilters.search = "";
  approvalsFilters.actionTypes.clear();
  approvalsFilters.userId = null;
  approvalsFilters.userName = "";
  approvalsFilters.userEmpId = "";
  approvalsFilters.userRole = "requested";
  approvalsFilters.datePreset = "any";
  approvalsFilters.dateSingle = "";
  approvalsFilters.dateFrom = "";
  approvalsFilters.dateTo = "";
  approvalsFilters.office = "";
  approvalsFilters.pin = "";
  approvalsFilters.pendingScope = "all";
  approvalsFilters.voteProgress = "all";
  approvalsFilters.resolvedStatus = "all";
  approvalsFilters.approvalSource = "all";
  approvalsFilters.resolvedOnlyMine = false;
  approvalsFilters.sort = "newest";

  const clearIds = [
    "approvals-search-input",
    "appr-filter-user",
    "appr-date-single",
    "appr-date-from",
    "appr-date-to",
    "appr-filter-office",
    "appr-filter-pin",
  ];
  clearIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  [
    "clear-approvals-search-btn",
    "clear-appr-user-btn",
    "clear-appr-office-btn",
    "clear-appr-pin-btn",
  ].forEach((id) => document.getElementById(id)?.classList.add("hidden"));

  closeAllDropdowns();
}

function resetApprovalsFilters() {
  resetApprovalsFiltersStateOnly();
  document.getElementById("approvals-filters-panel")?.classList.add("hidden");
  applyApprovalsFilters(true);
  showToast("🧹 Approval filters cleared");
}

function applyApprovalsFilters(resetScroll = true) {
  syncApprovalsFilterUI();
  approvalsPage = 0;
  approvalsHasMore = true;
  approvalsTotalCount = 0;

  const displayArea = document.getElementById("approvals-display-area");
  if (resetScroll && displayArea) displayArea.scrollTop = 0;

  const isFiltered = hasActiveApprovalFilters(currentApprovalTab);
  const cache = approvalsCache[currentApprovalTab];

  // Use instant in-memory cache when unfiltered and already loaded
  if (!isFiltered && cache.loaded && cache.html) {
    approvalsRequestSeq++;
    isApprovalsLoading = false;
    const contentDiv = document.getElementById("approvals-content");
    const sentinel = document.getElementById("approvals-sentinel");
    approvalsPage = 1;
    approvalsHasMore = cache.initialHasMore;
    approvalsTotalCount = cache.totalCount || 0;
    if (contentDiv) contentDiv.innerHTML = cache.html;
    if (sentinel) {
      sentinel.style.display = cache.html.includes("list-empty")
        ? "none"
        : "flex";
      sentinel.innerHTML = !approvalsHasMore
        ? `<span style="color: var(--text-light); font-size: 13px;">End of requests</span>`
        : "";
    }
    updateApprovalsSummaryStrip(approvalsTotalCount);
    setupApprovalsObserver();
    return;
  }

  const contentDiv = document.getElementById("approvals-content");
  const sentinel = document.getElementById("approvals-sentinel");
  if (contentDiv) contentDiv.innerHTML = getApprovalsSkeletonHTML(3);
  if (sentinel) {
    sentinel.style.display = "flex";
    sentinel.innerHTML = "";
  }

  setupApprovalsObserver();
  loadApprovalsBatch(true);
}

// --- DIRECT JUMP SHORTCUT FROM USER PROFILE MODAL ---
function openApprovalsForUser(
  userId,
  userName = "",
  userEmpId = "",
  targetTab = "resolved",
  userRole = "requested",
) {
  if (!userId) return;

  if (typeof closeUserProfileModal === "function") closeUserProfileModal();
  if (typeof closeHistoryModal === "function") closeHistoryModal();

  resetApprovalsFiltersStateOnly();
  approvalsFilters.userId = String(userId);
  approvalsFilters.userName = userName || "User";
  approvalsFilters.userEmpId = userEmpId || "";
  approvalsFilters.userRole = userRole || "requested";

  const userInput = document.getElementById("appr-filter-user");
  if (userInput) userInput.value = approvalsFilters.userName;
  document.getElementById("clear-appr-user-btn")?.classList.remove("hidden");
  document.getElementById("approvals-filters-panel")?.classList.add("hidden");

  approvalsSkipNextViewSwitchLoad = true;
  if (typeof switchDashboardView === "function") {
    switchDashboardView("approvals");
  }
  approvalsSkipNextViewSwitchLoad = false;

  switchApprovalTab(targetTab === "pending" ? "pending" : "resolved", true);

  const roleText =
    userRole === "voted"
      ? "voted on by"
      : userRole === "reviewed"
        ? "reviewed by"
        : "by";
  showToast(`📋 Showing approvals ${roleText} ${approvalsFilters.userName}`);
}

// --- DEBOUNCED REALTIME REFRESH (PRESERVES ACTIVE FILTERS) ---
function scheduleApprovalsRealtimeRefresh() {
  invalidateApprovalsCache();
  clearTimeout(approvalsRealtimeTimer);
  approvalsRealtimeTimer = setTimeout(() => {
    if (
      document.getElementById("view-approvals")?.classList.contains("active")
    ) {
      switchApprovalTab(currentApprovalTab, true);
    }
  }, 260);
}

// --- SKELETON & TAB SWITCHING ---
function getApprovalsSkeletonHTML(count = 3) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
        <div class="approval-skeleton-card">
          <div class="skeleton-line skeleton-pill"></div>
          <div class="skeleton-line medium" style="height: 15px; margin-bottom: 8px;"></div>
          <div class="skeleton-line short" style="height: 14px; margin-bottom: 8px;"></div>
          <div class="skeleton-line" style="width: 28%; height: 14px; margin-bottom: 0;"></div>
          <div class="skeleton-meta-box">
            <div class="skeleton-line medium" style="height: 12px; margin-bottom: 8px;"></div>
            <div class="skeleton-line short" style="height: 12px; margin-bottom: 0;"></div>
          </div>
          ${
            currentApprovalTab === "pending"
              ? `<div class="skeleton-action-row">
                   <div class="skeleton-line skeleton-btn"></div>
                 </div>`
              : `<div style="display: flex; justify-content: flex-end; margin-top: 12px;">
                   <div class="skeleton-line" style="width: 170px; height: 14px; margin-bottom: 0;"></div>
                 </div>`
          }
        </div>
      `;
  }
  return html;
}

function switchApprovalTab(tab, forceLoad = false) {
  if (approvalsSkipNextViewSwitchLoad && !forceLoad) return;

  const isSameTab = currentApprovalTab === tab;
  const isFiltered = hasActiveApprovalFilters(tab);
  const cache = approvalsCache[tab];
  const contentDiv = document.getElementById("approvals-content");

  if (
    isSameTab &&
    !forceLoad &&
    contentDiv &&
    contentDiv.innerHTML.trim() !== "" &&
    ((!isFiltered && cache.loaded) || isFiltered)
  ) {
    syncApprovalsFilterUI();
    return;
  }

  currentApprovalTab = tab;
  isApprovalsLoading = false;

  if (tab === "pending") {
    document.getElementById("tab-appr-pending")?.classList.add("active");
    document.getElementById("tab-appr-resolved")?.classList.remove("active");
  } else {
    document.getElementById("tab-appr-resolved")?.classList.add("active");
    document.getElementById("tab-appr-pending")?.classList.remove("active");
  }

  syncApprovalsFilterUI();

  const displayArea = document.getElementById("approvals-display-area");
  if (displayArea) displayArea.scrollTop = 0;

  if (!contentDiv && displayArea) {
    displayArea.innerHTML = `
      <div id="approvals-content" style="padding: 4px;"></div>
      <div id="approvals-sentinel" style="min-height: 54px; display: flex; align-items: center; justify-content: center; padding: 10px;"></div>
    `;
  }

  const activeContent = document.getElementById("approvals-content");
  const sentinel = document.getElementById("approvals-sentinel");

  if (!isFiltered && cache.loaded && !forceLoad) {
    approvalsRequestSeq++;
    isApprovalsLoading = false;
    approvalsPage = 1;
    approvalsHasMore = cache.initialHasMore;
    approvalsTotalCount = cache.totalCount || 0;
    if (activeContent) activeContent.innerHTML = cache.html;
    if (sentinel) {
      sentinel.style.display = cache.html.includes("list-empty")
        ? "none"
        : "flex";
      sentinel.innerHTML = !approvalsHasMore
        ? `<span style="color: var(--text-light); font-size: 13px;">End of requests</span>`
        : "";
    }
    updateApprovalsSummaryStrip(approvalsTotalCount);
    setupApprovalsObserver();
    return;
  }

  approvalsPage = 0;
  approvalsHasMore = true;
  approvalsTotalCount = 0;

  if (activeContent) activeContent.innerHTML = getApprovalsSkeletonHTML(3);
  if (sentinel) {
    sentinel.style.display = "flex";
    sentinel.innerHTML = "";
  }

  setupApprovalsObserver();
  loadApprovalsBatch(true);
}

// --- CARD RENDERER ---
function buildApprovalCardHTML(req, searchQuery) {
  const formatApprovalField = (
    oldVal,
    newVal,
    prefix = "",
    fallback = "N/A",
  ) => {
    const rawOld =
      oldVal === undefined || oldVal === null ? "" : String(oldVal).trim();
    const rawNew =
      newVal === undefined || newVal === null ? "" : String(newVal).trim();
    const sOld = rawOld === "" ? fallback : rawOld;
    const sNew = rawNew === "" ? fallback : rawNew;

    if (sOld !== sNew) {
      return `<div style="margin-bottom: 4px;">${prefix} <span style="text-decoration:line-through; color:var(--text-light);">${highlightApprovalText(
        sOld,
        searchQuery,
      )}</span> ➡️ <b>${highlightApprovalText(sNew, searchQuery)}</b></div>`;
    }
    return `<div style="margin-bottom: 4px;">${prefix} ${highlightApprovalText(
      sNew,
      searchQuery,
    )}</div>`;
  };

  let changesHtml = "";

  if (req.action_type === "ADD") {
    const badge = `<span class="badge" style="background:#dcfce7;color:#166534; padding: 4px 8px; font-size: 12px; margin-bottom: 8px;">➕ ADD</span>`;
    const prop = req.proposed_data || {};
    changesHtml = `
      ${badge}
      <div style="margin-bottom: 4px;"><b>${highlightApprovalText(
        prop.Address || prop.address || "Unknown",
        searchQuery,
      )}</b></div>
      <div style="margin-bottom: 4px;">🏢 ${highlightApprovalText(
        prop.Office || prop.office || "Unknown",
        searchQuery,
      )}</div>
      <div>📍 ${highlightApprovalText(
        prop.Pin ?? prop.pin ?? "N/A",
        searchQuery,
      )}</div>
    `;
  } else if (req.action_type === "EDIT") {
    const badge = `<span class="badge" style="background:#fef9c3;color:#854d0e; padding: 4px 8px; font-size: 12px; margin-bottom: 8px;">✏️ EDIT</span>`;
    const oldD = req.original_data || {
      Address: req.po_address,
      Office: req.po_office,
      Pin: req.po_pin,
    };
    const newD = req.proposed_data || {};

    changesHtml =
      badge +
      formatApprovalField(
        oldD.Address || oldD.address,
        newD.Address || newD.address,
        "📮",
        "Unknown Address",
      ) +
      formatApprovalField(
        oldD.Office || oldD.office,
        newD.Office || newD.office,
        "🏢",
        "Unknown Office",
      ) +
      formatApprovalField(
        oldD.Pin ?? oldD.pin,
        newD.Pin ?? newD.pin,
        "📍",
        "N/A",
      );
  } else if (req.action_type === "DELETE") {
    const badge = `<span class="badge" style="background:#fee2e2;color:#991b1b; padding: 4px 8px; font-size: 12px; margin-bottom: 8px;">🗑️ DELETE</span>`;
    const fallbackOld = req.original_data || {};
    const delAddr = req.po_address || fallbackOld.Address || "Unknown";
    const delOff = req.po_office || fallbackOld.Office || "Unknown";
    const delPin = req.po_pin ?? fallbackOld.Pin ?? "N/A";
    changesHtml = `
      ${badge}
      <div style="text-decoration: line-through; color: var(--text-light); margin-bottom: 4px;"><b>${highlightApprovalText(
        delAddr,
        searchQuery,
      )}</b></div>
      <div style="text-decoration: line-through; color: var(--text-light); margin-bottom: 4px;">🏢 ${highlightApprovalText(
        delOff,
        searchQuery,
      )}</div>
      <div style="text-decoration: line-through; color: var(--text-light);">📍 ${highlightApprovalText(
        delPin,
        searchQuery,
      )}</div>
    `;
  }

  const voteCount = Number(req.vote_count || 0);
  const dateStr = new Date(req.created_at).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const requesterName = req.requester_name || "Unknown User";
  const requesterId = req.requester_emp_id || "No ID";

  let approverDetailsHtml = "";
  if (req.status === "APPROVED" && req.finalizer_id && req.finalizer_name) {
    const approverLink = renderUserProfileLink(
      req.finalizer_id,
      req.finalizer_name,
    );
    const finEmp = escapeHTML(req.finalizer_emp_id || "No ID");
    if (req.is_admin_direct) {
      approverDetailsHtml = `<div style="font-size: 12px; color: var(--success-text); margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border);">⚡ <b>Admin Direct</b> (Applied by: ${approverLink} - ${finEmp})</div>`;
    } else if (req.approved_by_admin) {
      approverDetailsHtml = `<div style="font-size: 12px; color: var(--success-text); margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border);">✅ <b>Admin Approved</b> (Approved by: ${approverLink} - ${finEmp})</div>`;
    } else {
      approverDetailsHtml = `<div style="font-size: 12px; color: var(--primary); margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border);">👥 <b>Community Approved</b> (Final vote by: ${approverLink} - ${finEmp})</div>`;
    }
  }

  let actionBarHtml = "";
  if (req.status === "PENDING") {
    const isOwnRequest =
      currentUserId && String(req.requested_by) === String(currentUserId);
    const hasAlreadyVoted = Boolean(req.has_user_voted);

    actionBarHtml = `
      <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 14px; flex-wrap: wrap;">
        ${
          isOwnRequest
            ? `<span style="font-size: 12px; color: var(--text-light); font-weight: 600; margin-right: auto;">⏳ Your request (awaiting votes)</span>
               <button onclick="deleteOwnRequest('${req.id}')" class="dm-btn dm-btn-danger-soft dm-btn-sm">🗑️ Delete Request</button>`
            : ""
        }
        ${
          isCurrentUserAdmin && !isOwnRequest
            ? `<button onclick="rejectRequest('${req.id}')" class="dm-btn dm-btn-danger-soft dm-btn-sm">👎 Reject</button>`
            : ""
        }
        ${
          !isOwnRequest && !hasAlreadyVoted
            ? `<button onclick="approveRequest('${req.id}')" class="dm-btn dm-btn-primary dm-btn-sm">👍 Approve</button>`
            : ""
        }
        ${
          !isOwnRequest && hasAlreadyVoted
            ? `<span style="font-size: 13px; color: var(--success-text); font-weight: 700; padding: 6px 12px; background: var(--success-bg); border: 1px solid var(--success-border); border-radius: 10px;">✓ You Voted</span>`
            : ""
        }
      </div>`;
  } else if (req.status === "APPROVED") {
    actionBarHtml = `<div style="text-align: right; color: var(--success-text); font-weight: 600; font-size: 13px; margin-top: 12px;">✅ Request Approved & Merged</div>`;
  } else if (req.status === "REJECTED") {
    let rejecterText = "";
    if (req.finalizer_id && req.finalizer_name) {
      const rejLink = renderUserProfileLink(
        req.finalizer_id,
        req.finalizer_name,
      );
      rejecterText = ` (Rejected by: ${rejLink} - ${escapeHTML(
        req.finalizer_emp_id || "No ID",
      )})`;
    }
    actionBarHtml = `<div style="text-align: right; color: #b91c1c; font-weight: 600; font-size: 13px; margin-top: 12px;">❌ Request Rejected${rejecterText}</div>`;
  }

  return `
    <div id="approval-card-${req.id}" class="approval-card ${
      req.action_type === "DELETE" ? "is-delete" : ""
    }">
      <div style="font-size: 14px; margin-bottom: 12px; color: var(--text); line-height: 1.4;">${changesHtml}</div>
      <div class="approval-meta-box">
        <div>👤 Requested by: ${renderUserProfileLink(
          req.requested_by,
          requesterName,
        )} (${escapeHTML(requesterId)})</div>
        <div>📅 ${dateStr}</div>
        ${
          req.status === "PENDING"
            ? `<div style="margin-top: 4px;">🗳️ Community Votes: <b style="color: var(--primary);">${voteCount} / 5</b></div>`
            : ""
        }
        ${approverDetailsHtml}
      </div>
      ${actionBarHtml}
    </div>`;
}

// --- SERVER-SIDE RPC BATCH LOADER ---
async function loadApprovalsBatch(forceStart = false) {
  const activeTab = currentApprovalTab;
  const cache = approvalsCache[activeTab];
  const isFiltered = hasActiveApprovalFilters(activeTab);

  if (!forceStart && (isApprovalsLoading || !approvalsHasMore)) return;

  const thisSeq = ++approvalsRequestSeq;
  isApprovalsLoading = true;

  const renderCachedApprovalsFallback = () => {
    const contentEl = document.getElementById("approvals-content");
    const sentinelEl = document.getElementById("approvals-sentinel");

    if (isFiltered) {
      showOfflineToast(
        "Connect to internet to search & filter approvals.",
        true,
      );
      if (contentEl) {
        contentEl.innerHTML = `
          <div class="list-empty" style="gap: 10px;">
            <span>📡 You are offline. Connect to the internet to search & filter approvals.</span>
            <button type="button" class="dm-btn dm-btn-secondary dm-btn-sm" onclick="resetApprovalsFilters()">Show Cached View</button>
          </div>`;
      }
      if (sentinelEl) sentinelEl.style.display = "none";
    } else {
      showOfflineToast("Showing cached approvals.", false);
      const savedHtml = localStorage.getItem(
        "dakmitra_approvals_cache_" + activeTab,
      );
      if (contentEl) {
        contentEl.innerHTML =
          savedHtml ||
          `<div class="list-empty">📴 No internet connection and no cached ${activeTab} approvals saved yet.</div>`;
      }
      if (sentinelEl) {
        sentinelEl.style.display = "flex";
        sentinelEl.innerHTML = `<span style="color: var(--text-light); font-size: 13px;">📴 Offline cached view</span>`;
      }
    }
    approvalsHasMore = false;
    isApprovalsLoading = false;
  };

  if (!navigator.onLine) {
    renderCachedApprovalsFallback();
    return;
  }

  const displayArea = document.getElementById("approvals-display-area");
  let contentDiv = document.getElementById("approvals-content");
  let sentinel = document.getElementById("approvals-sentinel");

  if (!contentDiv && displayArea) {
    displayArea.innerHTML = `
      <div id="approvals-content" style="padding: 4px;">
        ${getApprovalsSkeletonHTML(3)}
      </div>
      <div id="approvals-sentinel" style="min-height: 54px; display: flex; align-items: center; justify-content: center; padding: 10px;"></div>
    `;
    contentDiv = document.getElementById("approvals-content");
    sentinel = document.getElementById("approvals-sentinel");
    setupApprovalsObserver();
  }

  const pageToFetch = approvalsPage;

  if (pageToFetch === 0) {
    if (contentDiv && !contentDiv.querySelector(".approval-skeleton-card")) {
      contentDiv.innerHTML = getApprovalsSkeletonHTML(3);
    }
    if (sentinel) {
      sentinel.style.display = "flex";
      sentinel.innerHTML = "";
    }
  } else if (sentinel) {
    sentinel.style.display = "flex";
    sentinel.innerHTML = `
      <div class="approvals-loader-pill">
        <div class="approvals-spinner"></div>
        <span>Fetching more requests...</span>
      </div>`;
  }

  try {
    await ensureSupabaseReady();

    if (!currentUserId) {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      currentUserId = session?.user?.id || null;
    }

    const { from: dateFromIso, to: dateToIso } = computeApprovalsDateBounds();
    const actionTypesParam =
      approvalsFilters.actionTypes.size > 0
        ? Array.from(approvalsFilters.actionTypes)
        : null;

    const rpcParams = {
      p_tab: activeTab,
      p_search: approvalsFilters.search.trim() || null,
      p_action_types: actionTypesParam,
      p_user_id: approvalsFilters.userId || null,
      p_user_role: approvalsFilters.userRole || "requested",
      p_date_from: dateFromIso,
      p_date_to: dateToIso,
      p_office: approvalsFilters.office.trim() || null,
      p_pin: approvalsFilters.pin.trim() || null,
      p_pending_scope:
        activeTab === "pending" ? approvalsFilters.pendingScope : "all",
      p_vote_progress:
        activeTab === "pending" ? approvalsFilters.voteProgress : "all",
      p_resolved_status:
        activeTab === "resolved" ? approvalsFilters.resolvedStatus : "all",
      p_approval_source:
        activeTab === "resolved" ? approvalsFilters.approvalSource : "all",
      p_only_mine:
        activeTab === "resolved" ? approvalsFilters.resolvedOnlyMine : false,
      p_sort: approvalsFilters.sort || "newest",
      p_limit: APPROVALS_PAGE_SIZE,
      p_offset: pageToFetch * APPROVALS_PAGE_SIZE,
    };

    const { data, error } = await supabaseClient.rpc(
      "search_edit_requests",
      rpcParams,
    );
    if (error) throw error;

    // Discard stale responses from superseded searches/filters
    if (thisSeq !== approvalsRequestSeq || currentApprovalTab !== activeTab) {
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    const totalCount = rows.length > 0 ? Number(rows[0].total_count || 0) : 0;
    approvalsTotalCount = totalCount;
    updateApprovalsSummaryStrip(totalCount);

    if (rows.length === 0) {
      approvalsHasMore = false;
      if (pageToFetch === 0) {
        const emptyHtml = isFiltered
          ? `<div class="list-empty" style="gap: 10px;">
               <span>No ${activeTab} requests match your active filters.</span>
               <button type="button" class="dm-btn dm-btn-secondary dm-btn-sm" onclick="resetApprovalsFilters()">Reset Filters</button>
             </div>`
          : `<div class="list-empty">${
              activeTab === "pending"
                ? "No pending approvals! 🎉"
                : "No resolved requests yet."
            }</div>`;

        if (contentDiv) contentDiv.innerHTML = emptyHtml;

        if (!isFiltered) {
          cache.html = emptyHtml;
          cache.page = 1;
          cache.initialHasMore = false;
          cache.totalCount = 0;
          cache.loaded = true;
        }
      }
      if (sentinel) sentinel.style.display = "none";
      isApprovalsLoading = false;
      return;
    }

    const fetchedSoFar = pageToFetch * APPROVALS_PAGE_SIZE + rows.length;
    if (rows.length < APPROVALS_PAGE_SIZE || fetchedSoFar >= totalCount) {
      approvalsHasMore = false;
      if (sentinel) {
        sentinel.style.display = "flex";
        sentinel.innerHTML = `<span style="color: var(--text-light); font-size: 13px;">End of requests</span>`;
      }
    } else if (sentinel) {
      sentinel.style.display = "flex";
      sentinel.innerHTML = "";
    }

    const searchQ = approvalsFilters.search.trim();
    const html = rows
      .map((req) => buildApprovalCardHTML(req, searchQ))
      .join("");

    if (pageToFetch === 0) {
      if (contentDiv) {
        contentDiv.classList.remove("approvals-smooth-in");
        contentDiv.innerHTML = html;
        void contentDiv.offsetWidth;
        contentDiv.classList.add("approvals-smooth-in");
      }
      approvalsPage = 1;

      // Only cache unfiltered default view so offline snapshot stays clean
      if (!isFiltered) {
        cache.html = html;
        cache.loaded = true;
        cache.initialHasMore = approvalsHasMore;
        cache.totalCount = totalCount;
        cache.page = 1;
        localStorage.setItem("dakmitra_approvals_cache_" + activeTab, html);
      }
    } else {
      if (contentDiv) contentDiv.insertAdjacentHTML("beforeend", html);
      approvalsPage++;
    }

    isApprovalsLoading = false;
  } catch (err) {
    if (thisSeq !== approvalsRequestSeq) return;
    if (isNetworkError(err)) {
      renderCachedApprovalsFallback();
      return;
    }
    isApprovalsLoading = false;
    if (contentDiv) {
      contentDiv.innerHTML = `<div class="list-empty" style="color: red;">Error loading requests: ${escapeHTML(
        err.message,
      )}</div>`;
    }
  }
}

function setupApprovalsObserver() {
  const sentinel = document.getElementById("approvals-sentinel");
  const displayArea = document.getElementById("approvals-display-area");

  if (approvalsObserver) approvalsObserver.disconnect();

  approvalsObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && approvalsHasMore && !isApprovalsLoading) {
        loadApprovalsBatch(false);
      }
    },
    { root: displayArea, rootMargin: "200px", threshold: 0.1 },
  );

  if (sentinel) approvalsObserver.observe(sentinel);
}

async function approveRequest(reqId) {
  if (!(await ensureOnline("Connect to internet to save changes."))) return;
  const card = document.getElementById("approval-card-" + reqId);
  if (card) card.style.display = "none";

  try {
    const { data, error } = await supabaseClient.rpc("submit_approval", {
      req_id: reqId,
    });
    if (error) throw error;

    if (data === "APPROVED") {
      showToast("✅ Request approved and executed!");
      await fetchAllPostOffices(true);
    } else {
      showToast("👍 Vote recorded!");
    }
    invalidateApprovalsCache();
    switchApprovalTab(currentApprovalTab, true);
  } catch (err) {
    if (card) card.style.display = "block";
    alert(err.message);
  }
}

async function rejectRequest(reqId) {
  showCustomConfirm(
    "Reject Request?",
    "Are you sure you want to reject and close this community request?",
    "Reject",
    async () => {
      if (!(await ensureOnline("Connect to internet to save changes."))) return;
      const card = document.getElementById("approval-card-" + reqId);
      if (card) card.style.display = "none";

      try {
        const { error } = await supabaseClient.rpc("reject_request", {
          req_id: reqId,
        });
        if (error) throw error;
        showToast("❌ Request rejected and closed.");
        invalidateApprovalsCache();
        switchApprovalTab(currentApprovalTab, true);
      } catch (err) {
        if (card) card.style.display = "block";
        alert(err.message);
      }
    },
  );
}

async function deleteOwnRequest(reqId) {
  showCustomConfirm(
    "Delete Your Request?",
    "Are you sure you want to withdraw and delete this pending request?",
    "Delete Request",
    async () => {
      if (!(await ensureOnline("Connect to internet to save changes."))) return;
      const card = document.getElementById("approval-card-" + reqId);
      if (card) card.style.display = "none";

      try {
        const { error } = await supabaseClient
          .from("edit_requests")
          .delete()
          .eq("id", reqId)
          .eq("status", "PENDING");

        if (error) throw error;

        showToast("🗑️ Your request has been deleted.");
        invalidateApprovalsCache();
        switchApprovalTab(currentApprovalTab, true);
      } catch (err) {
        if (card) card.style.display = "block";
        alert("Error deleting request: " + err.message);
      }
    },
  );
}
// =========================================================
// 11-FEEDBACK.JS — Report & Suggest Hub (Bugs, Features, Votes, Screenshots)
// =========================================================

const FEEDBACK_PAGE_SIZE = 8;
const FEEDBACK_CACHE_KEY = "dakmitra_feedback_cache";
const FEEDBACK_DRAFT_KEY = "dakmitra_feedback_draft";
const FEEDBACK_BUCKET = "feedback-attachments";

const FEEDBACK_STATUS_META = {
  OPEN: { label: "🟡 Open" },
  REVIEWING: { label: "🔍 Reviewing" },
  PLANNED: { label: "🗓️ Planned" },
  IN_PROGRESS: { label: "🛠️ In Progress" },
  RESOLVED: { label: "✅ Resolved" },
  DECLINED: { label: "⛔ Declined" },
};

const FEEDBACK_SORT_CYCLE = [
  { key: "newest", label: "🕒 Newest" },
  { key: "most_voted", label: "🔥 Most Voted" },
  { key: "oldest", label: "⏳ Oldest" },
];

let feedbackCurrentTab = "board";
let feedbackPage = 0;
let feedbackHasMore = true;
let isFeedbackLoading = false;
let feedbackRequestSeq = 0;
let feedbackObserver = null;
let feedbackSearchDebounce = null;
let feedbackRealtimeTimer = null;

let feedbackCache = {
  html: "",
  loaded: false,
  initialHasMore: true,
  totalCount: 0,
};

const feedbackFilters = {
  type: "ALL", // 'ALL' | 'BUG' | 'FEATURE'
  status: "ALL", // 'ALL' | 'ACTIVE' | 'DONE'
  search: "",
  onlyMine: false,
  sort: "newest", // 'newest' | 'most_voted' | 'oldest'
};

const feedbackFormState = {
  type: "BUG",
  severity: "MEDIUM",
  fileBlob: null,
  fileName: "",
  previewUrl: null,
  sizeKB: 0,
};

const feedbackItemsById = new Map();
const feedbackSignedUrlCache = new Map(); // path -> { url, expiresAt }
let activeAdminFeedbackId = null;

// --- CACHE & SIDEBAR BADGE ---
function invalidateFeedbackCache() {
  feedbackCache = {
    html: "",
    loaded: false,
    initialHasMore: true,
    totalCount: 0,
  };
}

function updateSidebarFeedbackBadge(openCount, activeCount = openCount) {
  const badge = document.getElementById("sidebar-feedback-badge");
  if (!badge) return;

  const count = Number(openCount || 0);
  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.title = `${count} open ${count === 1 ? "ticket" : "tickets"}${
      activeCount > count ? ` (${activeCount} active)` : ""
    }`;
    badge.classList.remove("hidden");
  } else {
    badge.textContent = "0";
    badge.classList.add("hidden");
  }
}

async function refreshFeedbackOpenCount() {
  if (!navigator.onLine || !supabaseClient || !currentUserId) return;
  try {
    const { data, error } = await supabaseClient.rpc("get_feedback_open_count");
    if (error) return;
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      updateSidebarFeedbackBadge(row.open_count, row.active_count);
    }
  } catch (_) {}
}

// --- VIEW ENTRY & TAB SWITCHING ---
function renderFeedbackView() {
  restoreFeedbackDraft();
  updateFeedbackDiagPreview();
  syncFeedbackFilterUI();

  if (feedbackCurrentTab === "board") {
    loadFeedbackBoardOrCache(false);
  }
  refreshFeedbackOpenCount();
}

function switchFeedbackTab(tab) {
  feedbackCurrentTab = tab === "submit" ? "submit" : "board";

  document
    .getElementById("tab-fb-board")
    ?.classList.toggle("active", feedbackCurrentTab === "board");
  document
    .getElementById("tab-fb-submit")
    ?.classList.toggle("active", feedbackCurrentTab === "submit");

  document
    .getElementById("feedback-board-hero-controls")
    ?.classList.toggle("hidden", feedbackCurrentTab !== "board");
  document
    .getElementById("feedback-board-panel")
    ?.classList.toggle("hidden", feedbackCurrentTab !== "board");
  document
    .getElementById("feedback-submit-panel")
    ?.classList.toggle("hidden", feedbackCurrentTab !== "submit");

  if (typeof feedbackHeroController !== "undefined") {
    feedbackHeroController.setCollapsed(false, true);
  }

  if (feedbackCurrentTab === "submit") {
    const submitPanel = document.getElementById("feedback-submit-panel");
    if (submitPanel) submitPanel.scrollTop = 0;
    updateFeedbackDiagPreview();
    setTimeout(() => document.getElementById("fb-title")?.focus(), 80);
  } else {
    loadFeedbackBoardOrCache(false);
  }
}

// --- FORM CONTROLS, DRAFT AUTO-SAVE & DIAGNOSTICS ---
function getFeedbackSubmitBtnDefaultHTML() {
  const label =
    feedbackFormState.type === "BUG"
      ? "Submit Bug Report"
      : "Submit Feature Idea";
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"></line>
      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg>
    <span>${label}</span>
  `;
}

function setFeedbackFormType(type, saveDraft = true) {
  feedbackFormState.type = type === "FEATURE" ? "FEATURE" : "BUG";
  const isBug = feedbackFormState.type === "BUG";

  document.getElementById("fb-type-bug")?.classList.toggle("active", isBug);
  document
    .getElementById("fb-type-feature")
    ?.classList.toggle("active", !isBug);
  document
    .getElementById("fb-type-segmented")
    ?.classList.toggle("is-signup", !isBug);

  document
    .getElementById("fb-severity-group")
    ?.classList.toggle("hidden", !isBug);
  document.getElementById("fb-diag-row")?.classList.toggle("hidden", !isBug);

  const titleEl = document.getElementById("fb-title");
  const descEl = document.getElementById("fb-description");
  if (titleEl) {
    titleEl.placeholder = isBug
      ? "e.g. Voice search cuts off on PIN codes"
      : "e.g. Add quick PIN code filter in Directory";
  }
  if (descEl) {
    descEl.placeholder = isBug
      ? "What happened vs. what you expected? Include steps to reproduce."
      : "What daily workflow problem would this solve for staff?";
  }

  const submitBtn = document.getElementById("fb-submit-btn");
  const submitContent = document.getElementById("fb-submit-btn-content");
  if (
    submitBtn &&
    submitContent &&
    !submitBtn.classList.contains("is-loading") &&
    !submitBtn.classList.contains("is-success")
  ) {
    submitContent.innerHTML = getFeedbackSubmitBtnDefaultHTML();
  }

  if (saveDraft) saveFeedbackDraft();
}

function setFeedbackSeverity(sev, saveDraft = true) {
  feedbackFormState.severity = ["LOW", "MEDIUM", "HIGH"].includes(sev)
    ? sev
    : "MEDIUM";
  document.querySelectorAll("[data-fb-severity]").forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.getAttribute("data-fb-severity") === feedbackFormState.severity,
    );
  });
  if (saveDraft) saveFeedbackDraft();
}

function handleFeedbackDescInput() {
  const descEl = document.getElementById("fb-description");
  const countEl = document.getElementById("fb-desc-count");
  if (descEl && countEl) {
    countEl.textContent = `${descEl.value.length} / 2000`;
  }
  saveFeedbackDraft();
}

function saveFeedbackDraft() {
  try {
    const draft = {
      type: feedbackFormState.type,
      severity: feedbackFormState.severity,
      category: document.getElementById("fb-category")?.value || "General",
      title: document.getElementById("fb-title")?.value || "",
      description: document.getElementById("fb-description")?.value || "",
    };
    localStorage.setItem(FEEDBACK_DRAFT_KEY, JSON.stringify(draft));
  } catch (_) {}
}

function restoreFeedbackDraft() {
  try {
    const raw = localStorage.getItem(FEEDBACK_DRAFT_KEY);
    if (!raw) {
      setFeedbackFormType(feedbackFormState.type, false);
      setFeedbackSeverity(feedbackFormState.severity, false);
      return;
    }
    const draft = JSON.parse(raw);
    setFeedbackFormType(draft.type || "BUG", false);
    setFeedbackSeverity(draft.severity || "MEDIUM", false);

    const catEl = document.getElementById("fb-category");
    const titleEl = document.getElementById("fb-title");
    const descEl = document.getElementById("fb-description");
    const countEl = document.getElementById("fb-desc-count");

    if (catEl && draft.category) catEl.value = draft.category;
    if (titleEl && typeof draft.title === "string") titleEl.value = draft.title;
    if (descEl && typeof draft.description === "string") {
      descEl.value = draft.description;
      if (countEl) countEl.textContent = `${draft.description.length} / 2000`;
    }
  } catch (_) {}
}

function clearFeedbackDraft() {
  try {
    localStorage.removeItem(FEEDBACK_DRAFT_KEY);
  } catch (_) {}
}

function collectFeedbackDeviceMeta() {
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  return {
    app_version:
      typeof APP_VERSION !== "undefined" ? `v${APP_VERSION}` : "unknown",
    build_code:
      typeof APP_BUILD_CODE !== "undefined" ? `#${APP_BUILD_CODE}` : "",
    last_view: window.lastDashboardView || "search",
    theme: document.documentElement.getAttribute("data-theme") || "light",
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    standalone: isStandalone,
    online: navigator.onLine,
    ua_short: String(navigator.userAgent || "").slice(0, 160),
  };
}

function updateFeedbackDiagPreview() {
  const el = document.getElementById("fb-diag-preview");
  if (!el) return;
  const m = collectFeedbackDeviceMeta();
  el.textContent = `${m.app_version} • ${m.theme} • ${m.viewport} • from ${m.last_view} (Admins only)`;
}

// --- CLIENT-SIDE SCREENSHOT COMPRESSION & PREVIEW ---
function compressFeedbackImage(file, maxEdge = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxEdge || h > maxEdge) {
          const scale = maxEdge / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) return reject(new Error("Image compression failed."));
            resolve({ blob, width: w, height: h });
          },
          "image/jpeg",
          quality,
        );
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read selected image."));
    };

    img.src = objectUrl;
  });
}

async function handleFeedbackScreenshotPick(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    event.target.value = "";
    return showToast("⚠️ Please select an image file (JPG, PNG, or WebP).");
  }

  try {
    const { blob, width, height } = await compressFeedbackImage(file);
    if (blob.size > 2 * 1024 * 1024) {
      event.target.value = "";
      return showToast(
        "⚠️ Image is still over 2 MB. Try a smaller screenshot.",
      );
    }

    if (feedbackFormState.previewUrl) {
      URL.revokeObjectURL(feedbackFormState.previewUrl);
    }

    feedbackFormState.fileBlob = blob;
    feedbackFormState.fileName = file.name || "screenshot.jpg";
    feedbackFormState.previewUrl = URL.createObjectURL(blob);
    feedbackFormState.sizeKB = Math.max(1, Math.round(blob.size / 1024));

    const prevImg = document.getElementById("fb-screenshot-preview-img");
    const nameEl = document.getElementById("fb-screenshot-name");
    const metaEl = document.getElementById("fb-screenshot-meta");
    if (prevImg) prevImg.src = feedbackFormState.previewUrl;
    if (nameEl) nameEl.textContent = feedbackFormState.fileName;
    if (metaEl) {
      metaEl.textContent = `${width}×${height} • ${feedbackFormState.sizeKB} KB`;
    }

    document
      .getElementById("fb-screenshot-picker-btn")
      ?.classList.add("hidden");
    document
      .getElementById("fb-screenshot-preview-wrap")
      ?.classList.remove("hidden");
  } catch (err) {
    event.target.value = "";
    showToast("❌ " + (err.message || "Failed to process image."));
  }
}

function clearFeedbackScreenshot() {
  if (feedbackFormState.previewUrl) {
    URL.revokeObjectURL(feedbackFormState.previewUrl);
  }
  feedbackFormState.fileBlob = null;
  feedbackFormState.fileName = "";
  feedbackFormState.previewUrl = null;
  feedbackFormState.sizeKB = 0;

  const input = document.getElementById("fb-screenshot-input");
  if (input) input.value = "";

  document
    .getElementById("fb-screenshot-preview-wrap")
    ?.classList.add("hidden");
  document
    .getElementById("fb-screenshot-picker-btn")
    ?.classList.remove("hidden");
}

function openFeedbackImageLightbox(src, title) {
  if (!src || typeof openProfilePhotoModal !== "function") return;
  openProfilePhotoModal({
    src,
    name: title || "Screenshot",
    readOnly: true,
    isScreenshot: true,
  });
  document
    .getElementById("avatar-lightbox-frame")
    ?.classList.add("is-screenshot");
}

function previewPendingFeedbackScreenshot() {
  if (!feedbackFormState.previewUrl) return;
  openFeedbackImageLightbox(
    feedbackFormState.previewUrl,
    feedbackFormState.fileName || "Attached Screenshot",
  );
}

// --- SUBMIT FEEDBACK ITEM ---
async function submitFeedbackForm() {
  if (!(await ensureOnline("Connect to internet to submit feedback."))) return;

  const title = (document.getElementById("fb-title")?.value || "").trim();
  const description = (
    document.getElementById("fb-description")?.value || ""
  ).trim();
  const category = document.getElementById("fb-category")?.value || "General";

  if (title.length < 3) {
    document.getElementById("fb-title")?.focus();
    return showToast("⚠️ Please enter a short title (at least 3 characters).");
  }
  if (description.length < 5) {
    document.getElementById("fb-description")?.focus();
    return showToast(
      "⚠️ Please add a few more details (at least 5 characters).",
    );
  }

  await ensureSupabaseReady();
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (!session || !session.user) {
    if (typeof checkUserSession === "function") checkUserSession();
    return alert("Your session has expired. Please sign in again.");
  }

  const submitBtn = document.getElementById("fb-submit-btn");
  const submitContent = document.getElementById("fb-submit-btn-content");
  submitBtn.classList.add("is-loading");
  submitBtn.disabled = true;
  submitContent.innerHTML = `<div class="btn-spinner"></div><span>Submitting...</span>`;

  let uploadedPath = null;

  try {
    if (feedbackFormState.fileBlob) {
      const rand = Math.random().toString(36).slice(2, 8);
      uploadedPath = `${session.user.id}/${Date.now()}_${rand}.jpg`;
      const { error: uploadErr } = await supabaseClient.storage
        .from(FEEDBACK_BUCKET)
        .upload(uploadedPath, feedbackFormState.fileBlob, {
          contentType: "image/jpeg",
          upsert: false,
        });
      if (uploadErr) throw uploadErr;
    }

    const isBug = feedbackFormState.type === "BUG";
    const includeDiag =
      isBug && document.getElementById("fb-include-diag")?.checked !== false;

    const payload = {
      user_id: session.user.id,
      type: feedbackFormState.type,
      category,
      severity: isBug ? feedbackFormState.severity : null,
      title,
      description,
      status: "OPEN",
      attachment_path: uploadedPath,
      device_meta: includeDiag ? collectFeedbackDeviceMeta() : null,
    };

    const { error: insertErr } = await supabaseClient
      .from("feedback_items")
      .insert([payload]);

    if (insertErr) {
      if (uploadedPath) {
        supabaseClient.storage
          .from(FEEDBACK_BUCKET)
          .remove([uploadedPath])
          .catch(() => {});
      }
      throw insertErr;
    }

    clearFeedbackDraft();
    clearFeedbackScreenshot();
    const titleEl = document.getElementById("fb-title");
    const descEl = document.getElementById("fb-description");
    const countEl = document.getElementById("fb-desc-count");
    if (titleEl) titleEl.value = "";
    if (descEl) descEl.value = "";
    if (countEl) countEl.textContent = "0 / 2000";

    invalidateFeedbackCache();
    refreshFeedbackOpenCount();

    submitBtn.classList.remove("is-loading");
    submitBtn.classList.add("is-success");
    submitContent.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline class="checkmark-path" points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>Submitted!</span>
    `;
    showToast(
      isBug ? "🐛 Bug report submitted!" : "💡 Feature suggestion posted!",
    );

    setTimeout(() => {
      submitBtn.classList.remove("is-success");
      submitBtn.disabled = false;
      submitContent.innerHTML = getFeedbackSubmitBtnDefaultHTML();
      switchFeedbackTab("board");
      loadFeedbackBoardOrCache(true);
    }, 650);
  } catch (err) {
    submitBtn.classList.remove("is-loading", "is-success");
    submitBtn.disabled = false;
    submitContent.innerHTML = getFeedbackSubmitBtnDefaultHTML();
    alert("Failed to submit: " + err.message);
  }
}

// --- BOARD FILTERS & SEARCH ---
function hasActiveFeedbackFilters() {
  return (
    feedbackFilters.type !== "ALL" ||
    feedbackFilters.status !== "ALL" ||
    feedbackFilters.onlyMine ||
    feedbackFilters.search.trim().length > 0 ||
    feedbackFilters.sort !== "newest"
  );
}

function syncFeedbackFilterUI() {
  document
    .getElementById("fb-chip-all")
    ?.classList.toggle("active", feedbackFilters.type === "ALL");
  document
    .getElementById("fb-chip-BUG")
    ?.classList.toggle("active", feedbackFilters.type === "BUG");
  document
    .getElementById("fb-chip-FEATURE")
    ?.classList.toggle("active", feedbackFilters.type === "FEATURE");

  document
    .getElementById("fb-chip-status-ACTIVE")
    ?.classList.toggle("active", feedbackFilters.status === "ACTIVE");
  document
    .getElementById("fb-chip-status-DONE")
    ?.classList.toggle("active", feedbackFilters.status === "DONE");
  document
    .getElementById("fb-chip-mine")
    ?.classList.toggle("active", feedbackFilters.onlyMine);

  const sortBtn = document.getElementById("feedback-sort-toggle-btn");
  if (sortBtn) {
    const activeSort =
      FEEDBACK_SORT_CYCLE.find((s) => s.key === feedbackFilters.sort) ||
      FEEDBACK_SORT_CYCLE[0];
    sortBtn.textContent = activeSort.label;
    sortBtn.classList.toggle(
      "has-active-filters",
      feedbackFilters.sort !== "newest",
    );
  }
}

function updateFeedbackSummaryStrip(totalCount) {
  const strip = document.getElementById("feedback-filter-summary");
  const textEl = document.getElementById("feedback-filter-summary-text");
  if (!strip || !textEl) return;

  if (!hasActiveFeedbackFilters()) {
    strip.classList.add("hidden");
    textEl.textContent = "";
    return;
  }

  textEl.textContent = `Showing ${totalCount} matching ${
    totalCount === 1 ? "submission" : "submissions"
  }`;
  strip.classList.remove("hidden");
}

function handleFeedbackSearchInput(inputEl) {
  const val = inputEl ? inputEl.value : "";
  feedbackFilters.search = val;
  document
    .getElementById("clear-feedback-search-btn")
    ?.classList.toggle("hidden", val.length === 0);

  clearTimeout(feedbackSearchDebounce);
  feedbackSearchDebounce = setTimeout(() => {
    applyFeedbackFilters();
  }, 260);
}

function clearFeedbackSearchInput() {
  const input = document.getElementById("feedback-search-input");
  if (input) {
    input.value = "";
    input.focus();
  }
  feedbackFilters.search = "";
  document.getElementById("clear-feedback-search-btn")?.classList.add("hidden");
  applyFeedbackFilters();
}

function setFeedbackTypeFilter(type) {
  feedbackFilters.type =
    feedbackFilters.type === type && type !== "ALL" ? "ALL" : type;
  if (navigator.vibrate) navigator.vibrate(18);
  applyFeedbackFilters();
}

function setFeedbackStatusFilter(status) {
  feedbackFilters.status = feedbackFilters.status === status ? "ALL" : status;
  if (navigator.vibrate) navigator.vibrate(18);
  applyFeedbackFilters();
}

function toggleFeedbackOnlyMine() {
  feedbackFilters.onlyMine = !feedbackFilters.onlyMine;
  if (navigator.vibrate) navigator.vibrate(18);
  applyFeedbackFilters();
}

function cycleFeedbackSort() {
  const idx = FEEDBACK_SORT_CYCLE.findIndex(
    (s) => s.key === feedbackFilters.sort,
  );
  const next = FEEDBACK_SORT_CYCLE[(idx + 1) % FEEDBACK_SORT_CYCLE.length];
  feedbackFilters.sort = next.key;
  if (navigator.vibrate) navigator.vibrate(18);
  applyFeedbackFilters();
}

function resetFeedbackFilters() {
  feedbackFilters.type = "ALL";
  feedbackFilters.status = "ALL";
  feedbackFilters.search = "";
  feedbackFilters.onlyMine = false;
  feedbackFilters.sort = "newest";

  const input = document.getElementById("feedback-search-input");
  if (input) input.value = "";
  document.getElementById("clear-feedback-search-btn")?.classList.add("hidden");

  applyFeedbackFilters();
  showToast("🧹 Filters cleared");
}

function applyFeedbackFilters() {
  syncFeedbackFilterUI();
  loadFeedbackBoardOrCache(false);
}

// --- BOARD CARD RENDERING & BATCH SIGNED SCREENSHOTS ---
function highlightFeedbackStr(text, q) {
  if (typeof highlightApprovalText === "function") {
    return highlightApprovalText(text, q);
  }
  return escapeHTML(text);
}

function buildFeedbackCardHTML(item, searchQuery) {
  const isBug = item.type === "BUG";
  const statusInfo = FEEDBACK_STATUS_META[item.status] || {
    label: item.status,
  };
  const dateStr = new Date(item.created_at).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const reporterLink = renderUserProfileLink(
    item.user_id,
    item.reporter_name || "Unknown User",
  );
  const isOwn = currentUserId && String(item.user_id) === String(currentUserId);
  const canDelete = isCurrentUserAdmin || (isOwn && item.status === "OPEN");

  const severityPill =
    isBug && item.severity === "HIGH"
      ? `<span class="fb-pill fb-pill-high">🔥 Blocks Work</span>`
      : "";

  const versionPill = item.resolved_in_version
    ? `<span class="fb-pill fb-pill-cat">🏷️ ${escapeHTML(
        item.resolved_in_version,
      )}</span>`
    : "";

  const cachedSigned = item.attachment_path
    ? feedbackSignedUrlCache.get(item.attachment_path)
    : null;
  const thumbSrc =
    cachedSigned && cachedSigned.expiresAt > Date.now() ? cachedSigned.url : "";

  const attachmentHtml = item.attachment_path
    ? `<button
         type="button"
         class="feedback-thumb-btn"
         onclick="openFeedbackAttachment('${escapeForOnclick(
           item.attachment_path,
         )}', '${escapeForOnclick(item.title)}')"
       >
         <img
           data-fb-thumb-path="${escapeHTML(item.attachment_path)}"
           src="${escapeHTML(thumbSrc)}"
           alt="Attachment"
           class="${thumbSrc ? "" : "hidden"}"
         />
         <span>🖼️ View Screenshot</span>
       </button>`
    : "";

  let responseHtml = "";
  if (item.admin_response) {
    const revLink = item.reviewer_name
      ? renderUserProfileLink(item.reviewed_by, item.reviewer_name)
      : "<b>Admin</b>";
    responseHtml = `
      <div class="feedback-response-box">
        <div style="font-size: 11.5px; font-weight: 800; color: var(--primary); margin-bottom: 4px;">
          🛡️ Official Response • ${revLink}
        </div>
        <div style="white-space: pre-wrap;">${highlightFeedbackStr(
          item.admin_response,
          searchQuery,
        )}</div>
      </div>`;
  }

  const voteLabel = isBug ? "Me Too" : "Upvote";
  const voteCount = Number(item.vote_count || 0);

  return `
    <div id="feedback-card-${escapeHTML(item.id)}" class="feedback-card ${
      isBug ? "is-bug" : ""
    }">
      <div class="feedback-card-badges">
        <span class="fb-pill ${isBug ? "fb-pill-bug" : "fb-pill-feature"}">
          ${isBug ? "🐛 Bug" : "💡 Feature"}
        </span>
        <span class="fb-pill fb-pill-cat">${escapeHTML(
          item.category || "General",
        )}</span>
        ${severityPill}
        ${versionPill}
        <span class="fb-pill fb-status-${escapeHTML(item.status)}">
          ${escapeHTML(statusInfo.label)}
        </span>
      </div>

      <div class="feedback-card-title">${highlightFeedbackStr(
        item.title,
        searchQuery,
      )}</div>
      <div class="feedback-card-desc">${highlightFeedbackStr(
        item.description,
        searchQuery,
      )}</div>

      ${attachmentHtml}

      <div class="approval-meta-box" style="margin-top: 4px;">
        <div>👤 By: ${reporterLink} (${escapeHTML(
          item.reporter_emp_id || "No ID",
        )}) • 📅 ${dateStr}</div>
      </div>

      ${responseHtml}

      <div class="feedback-card-footer">
        <button
          type="button"
          class="feedback-vote-btn ${item.has_user_voted ? "voted" : ""}"
          onclick="toggleFeedbackVote('${escapeForOnclick(item.id)}', this)"
        >
          <span>▲</span>
          <span>${voteLabel}</span>
          <strong class="fb-vote-num">${voteCount}</strong>
        </button>

        <div style="display: flex; gap: 6px; align-items: center; margin-left: auto;">
          ${
            isCurrentUserAdmin
              ? `<button
                   type="button"
                   class="dm-btn dm-btn-secondary dm-btn-sm"
                   onclick="openFeedbackAdminModal('${escapeForOnclick(
                     item.id,
                   )}')"
                 >🛡️ Manage</button>`
              : ""
          }
          ${
            canDelete
              ? `<button
                   type="button"
                   class="dm-btn dm-btn-danger-soft dm-btn-sm"
                   onclick="deleteFeedbackSubmission('${escapeForOnclick(
                     item.id,
                   )}')"
                   title="Delete submission"
                 >🗑️</button>`
              : ""
          }
        </div>
      </div>
    </div>`;
}

async function hydrateFeedbackThumbnails(rows) {
  if (!navigator.onLine || !supabaseClient || !Array.isArray(rows)) return;
  const now = Date.now();
  const needed = [];

  rows.forEach((r) => {
    if (!r.attachment_path) return;
    const cached = feedbackSignedUrlCache.get(r.attachment_path);
    if (!cached || cached.expiresAt <= now) {
      needed.push(r.attachment_path);
    }
  });

  if (needed.length === 0) return;

  try {
    const { data, error } = await supabaseClient.storage
      .from(FEEDBACK_BUCKET)
      .createSignedUrls(needed, 3600);
    if (error || !Array.isArray(data)) return;

    const exp = Date.now() + 45 * 60 * 1000;
    data.forEach((entry) => {
      if (!entry.path || !entry.signedUrl) return;
      feedbackSignedUrlCache.set(entry.path, {
        url: entry.signedUrl,
        expiresAt: exp,
      });
      document
        .querySelectorAll(`img[data-fb-thumb-path="${CSS.escape(entry.path)}"]`)
        .forEach((imgEl) => {
          imgEl.src = entry.signedUrl;
          imgEl.classList.remove("hidden");
        });
    });
  } catch (_) {}
}

async function openFeedbackAttachment(path, title = "Screenshot") {
  if (!path) return;
  const cached = feedbackSignedUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    openFeedbackImageLightbox(cached.url, title);
    return;
  }

  if (!(await ensureOnline("Connect to internet to view full screenshot."))) {
    return;
  }

  showToast("🖼️ Loading screenshot...");
  try {
    await ensureSupabaseReady();
    const { data, error } = await supabaseClient.storage
      .from(FEEDBACK_BUCKET)
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw error || new Error("URL unavailable");

    feedbackSignedUrlCache.set(path, {
      url: data.signedUrl,
      expiresAt: Date.now() + 45 * 60 * 1000,
    });
    openFeedbackImageLightbox(data.signedUrl, title);
  } catch (err) {
    showToast("❌ Could not load screenshot: " + err.message);
  }
}

// --- PAGINATED BOARD LOADER ---
function getFeedbackSkeletonHTML(count = 3) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <div class="approval-skeleton-card">
        <div class="skeleton-line skeleton-pill"></div>
        <div class="skeleton-line medium" style="height: 16px; margin-bottom: 8px;"></div>
        <div class="skeleton-line short" style="height: 13px; margin-bottom: 10px;"></div>
        <div class="skeleton-meta-box">
          <div class="skeleton-line medium" style="height: 12px; margin-bottom: 0;"></div>
        </div>
      </div>`;
  }
  return html;
}

function loadFeedbackBoardOrCache(forceLoad = false) {
  const isFiltered = hasActiveFeedbackFilters();
  const displayArea = document.getElementById("feedback-display-area");
  const contentDiv = document.getElementById("feedback-content");
  const sentinel = document.getElementById("feedback-sentinel");

  if (displayArea) displayArea.scrollTop = 0;

  if (!isFiltered && !forceLoad && feedbackCache.loaded && feedbackCache.html) {
    feedbackRequestSeq++;
    isFeedbackLoading = false;
    feedbackPage = 1;
    feedbackHasMore = feedbackCache.initialHasMore;
    if (contentDiv) contentDiv.innerHTML = feedbackCache.html;
    if (sentinel) {
      sentinel.style.display = feedbackCache.html.includes("list-empty")
        ? "none"
        : "flex";
      sentinel.innerHTML = !feedbackHasMore
        ? `<span style="color: var(--text-light); font-size: 13px;">End of submissions</span>`
        : "";
    }
    updateFeedbackSummaryStrip(feedbackCache.totalCount);
    setupFeedbackObserver();
    return;
  }

  feedbackPage = 0;
  feedbackHasMore = true;
  if (contentDiv) contentDiv.innerHTML = getFeedbackSkeletonHTML(3);
  if (sentinel) {
    sentinel.style.display = "flex";
    sentinel.innerHTML = "";
  }

  setupFeedbackObserver();
  loadFeedbackBatch(true);
}

async function loadFeedbackBatch(forceStart = false) {
  const isFiltered = hasActiveFeedbackFilters();
  if (!forceStart && (isFeedbackLoading || !feedbackHasMore)) return;

  const thisSeq = ++feedbackRequestSeq;
  isFeedbackLoading = true;

  const contentDiv = document.getElementById("feedback-content");
  const sentinel = document.getElementById("feedback-sentinel");

  const renderOfflineFallback = () => {
    if (isFiltered) {
      showOfflineToast("Connect to internet to filter submissions.", true);
      if (contentDiv) {
        contentDiv.innerHTML = `
          <div class="list-empty" style="gap: 10px;">
            <span>📡 Offline. Connect to search or filter submissions.</span>
            <button type="button" class="dm-btn dm-btn-secondary dm-btn-sm" onclick="resetFeedbackFilters()">Show Cached View</button>
          </div>`;
      }
      if (sentinel) sentinel.style.display = "none";
    } else {
      showOfflineToast("Showing cached feedback board.", false);
      const savedHtml = localStorage.getItem(FEEDBACK_CACHE_KEY);
      if (contentDiv) {
        contentDiv.innerHTML =
          savedHtml ||
          `<div class="list-empty">📴 No internet connection and no cached submissions yet.</div>`;
      }
      if (sentinel) {
        sentinel.style.display = "flex";
        sentinel.innerHTML = `<span style="color: var(--text-light); font-size: 13px;">📴 Offline cached view</span>`;
      }
    }
    feedbackHasMore = false;
    isFeedbackLoading = false;
  };

  if (!navigator.onLine) {
    renderOfflineFallback();
    return;
  }

  const pageToFetch = feedbackPage;
  if (pageToFetch > 0 && sentinel) {
    sentinel.style.display = "flex";
    sentinel.innerHTML = `
      <div class="approvals-loader-pill">
        <div class="approvals-spinner"></div>
        <span>Loading more...</span>
      </div>`;
  }

  try {
    await ensureSupabaseReady();
    const { data, error } = await supabaseClient.rpc("search_feedback_items", {
      p_type: feedbackFilters.type,
      p_status: feedbackFilters.status,
      p_category: null,
      p_search: feedbackFilters.search.trim() || null,
      p_only_mine: feedbackFilters.onlyMine,
      p_sort: feedbackFilters.sort,
      p_limit: FEEDBACK_PAGE_SIZE,
      p_offset: pageToFetch * FEEDBACK_PAGE_SIZE,
    });
    if (error) throw error;
    if (thisSeq !== feedbackRequestSeq) return;

    const rows = Array.isArray(data) ? data : [];
    const totalCount = rows.length > 0 ? Number(rows[0].total_count || 0) : 0;
    updateFeedbackSummaryStrip(totalCount);
    
    if (
        pageToFetch === 0 &&
        totalCount <= 2 &&
        typeof feedbackHeroController !== "undefined"
      ) {
        feedbackHeroController.setCollapsed(false);
      }

    rows.forEach((r) => feedbackItemsById.set(String(r.id), r));

    if (rows.length === 0) {
      feedbackHasMore = false;
      if (pageToFetch === 0) {
        const emptyHtml = isFiltered
          ? `<div class="list-empty" style="gap: 10px;">
               <span>No submissions match your active filters.</span>
               <button type="button" class="dm-btn dm-btn-secondary dm-btn-sm" onclick="resetFeedbackFilters()">Reset Filters</button>
             </div>`
          : `<div class="list-empty" style="gap: 10px;">
               <span>No bugs or feature ideas posted yet. Be the first!</span>
               <button type="button" class="dm-btn dm-btn-primary dm-btn-sm" onclick="switchFeedbackTab('submit')">➕ New Submission</button>
             </div>`;
        if (contentDiv) contentDiv.innerHTML = emptyHtml;
        if (!isFiltered) {
          feedbackCache = {
            html: emptyHtml,
            loaded: true,
            initialHasMore: false,
            totalCount: 0,
          };
        }
      }
      if (sentinel) sentinel.style.display = "none";
      isFeedbackLoading = false;
      return;
    }

    const fetchedSoFar = pageToFetch * FEEDBACK_PAGE_SIZE + rows.length;
    if (rows.length < FEEDBACK_PAGE_SIZE || fetchedSoFar >= totalCount) {
      feedbackHasMore = false;
      if (sentinel) {
        sentinel.style.display = "flex";
        sentinel.innerHTML = `<span style="color: var(--text-light); font-size: 13px;">End of submissions</span>`;
      }
    } else if (sentinel) {
      sentinel.style.display = "flex";
      sentinel.innerHTML = "";
    }

    const q = feedbackFilters.search.trim();
    const html = rows.map((r) => buildFeedbackCardHTML(r, q)).join("");

    if (pageToFetch === 0) {
      if (contentDiv) {
        contentDiv.classList.remove("approvals-smooth-in");
        contentDiv.innerHTML = html;
        void contentDiv.offsetWidth;
        contentDiv.classList.add("approvals-smooth-in");
      }
      feedbackPage = 1;
      if (!isFiltered) {
        feedbackCache = {
          html,
          loaded: true,
          initialHasMore: feedbackHasMore,
          totalCount,
        };
        try {
          localStorage.setItem(FEEDBACK_CACHE_KEY, html);
        } catch (_) {}
      }
    } else {
      if (contentDiv) contentDiv.insertAdjacentHTML("beforeend", html);
      feedbackPage++;
    }

    hydrateFeedbackThumbnails(rows);
    isFeedbackLoading = false;
  } catch (err) {
    if (thisSeq !== feedbackRequestSeq) return;
    if (isNetworkError(err)) {
      renderOfflineFallback();
      return;
    }
    isFeedbackLoading = false;
    if (contentDiv) {
      contentDiv.innerHTML = `<div class="list-empty" style="color: #ef4444;">Error loading feedback: ${escapeHTML(
        err.message,
      )}</div>`;
    }
  }
}

function setupFeedbackObserver() {
  const sentinel = document.getElementById("feedback-sentinel");
  const displayArea = document.getElementById("feedback-display-area");
  if (feedbackObserver) feedbackObserver.disconnect();

  feedbackObserver = new IntersectionObserver(
    (entries) => {
      if (
        entries[0].isIntersecting &&
        feedbackHasMore &&
        !isFeedbackLoading &&
        feedbackCurrentTab === "board"
      ) {
        loadFeedbackBatch(false);
      }
    },
    { root: displayArea, rootMargin: "200px", threshold: 0.1 },
  );

  if (sentinel) feedbackObserver.observe(sentinel);
}

// --- OPTIMISTIC UPVOTE / "ME TOO" TOGGLE ---
async function toggleFeedbackVote(feedbackId, btnEl) {
  if (!(await ensureOnline("Connect to internet to vote."))) return;

  const item = feedbackItemsById.get(String(feedbackId));
  const numEl = btnEl?.querySelector(".fb-vote-num");
  const prevVoted = btnEl?.classList.contains("voted") || false;
  const prevCount = numEl ? parseInt(numEl.textContent, 10) || 0 : 0;

  // Optimistic update
  const nextVoted = !prevVoted;
  const nextCount = Math.max(0, prevCount + (nextVoted ? 1 : -1));
  if (btnEl) btnEl.classList.toggle("voted", nextVoted);
  if (numEl) numEl.textContent = String(nextCount);
  if (navigator.vibrate) navigator.vibrate(22);

  try {
    await ensureSupabaseReady();
    const { data, error } = await supabaseClient.rpc("toggle_feedback_vote", {
      p_feedback_id: feedbackId,
    });
    if (error) throw error;

    const res = Array.isArray(data) ? data[0] : data;
    if (res) {
      if (btnEl) btnEl.classList.toggle("voted", Boolean(res.voted));
      if (numEl) numEl.textContent = String(res.vote_count);
      if (item) {
        item.has_user_voted = Boolean(res.voted);
        item.vote_count = Number(res.vote_count);
      }
    }
    invalidateFeedbackCache();
  } catch (err) {
    // Rollback on failure
    if (btnEl) btnEl.classList.toggle("voted", prevVoted);
    if (numEl) numEl.textContent = String(prevCount);
    showToast("❌ Vote failed: " + err.message);
  }
}

// --- DELETE SUBMISSION ---
function deleteFeedbackSubmission(feedbackId) {
  showCustomConfirm(
    "Delete Submission?",
    "This will permanently remove this report and any attached screenshot.",
    "Delete",
    async () => {
      if (!(await ensureOnline("Connect to internet to delete."))) return;
      const card = document.getElementById("feedback-card-" + feedbackId);
      if (card) card.style.opacity = "0.4";

      try {
        await ensureSupabaseReady();
        const { data: attachmentPath, error } = await supabaseClient.rpc(
          "delete_feedback_item",
          { p_feedback_id: feedbackId },
        );
        if (error) throw error;

        if (attachmentPath) {
          supabaseClient.storage
            .from(FEEDBACK_BUCKET)
            .remove([attachmentPath])
            .catch(() => {});
          feedbackSignedUrlCache.delete(attachmentPath);
        }

        feedbackItemsById.delete(String(feedbackId));
        if (card) card.remove();
        invalidateFeedbackCache();
        refreshFeedbackOpenCount();
        showToast("🗑️ Submission deleted.");
      } catch (err) {
        if (card) card.style.opacity = "1";
        alert("Could not delete: " + err.message);
      }
    },
  );
}

// --- ADMIN TRIAGE & OFFICIAL RESPONSE MODAL ---
function openFeedbackAdminModal(feedbackId) {
  if (!isCurrentUserAdmin) return;
  const item = feedbackItemsById.get(String(feedbackId));
  if (!item) return;

  activeAdminFeedbackId = String(feedbackId);
  document.getElementById("fb-admin-modal-subtitle").textContent = item.title;
  document.getElementById("fb-admin-status").value = item.status || "OPEN";
  document.getElementById("fb-admin-version").value =
    item.resolved_in_version || "";
  document.getElementById("fb-admin-response").value =
    item.admin_response || "";

  const diagBox = document.getElementById("fb-admin-diag-box");
  if (diagBox) {
    if (item.device_meta && typeof item.device_meta === "object") {
      const m = item.device_meta;
      diagBox.innerHTML = `
        <strong style="display:block; color:var(--text); margin-bottom:4px;">📱 Device Diagnostics</strong>
        Version: ${escapeHTML(m.app_version || "-")} ${escapeHTML(
          m.build_code || "",
        )} • Theme: ${escapeHTML(m.theme || "-")} • Screen: ${escapeHTML(
          m.viewport || "-",
        )}<br/>
        From: ${escapeHTML(m.last_view || "-")} • Mode: ${
          m.standalone ? "Installed PWA" : "Browser"
        }<br/>
        UA: ${escapeHTML(m.ua_short || "-")}
      `;
      diagBox.classList.remove("hidden");
    } else {
      diagBox.classList.add("hidden");
      diagBox.innerHTML = "";
    }
  }

  const saveBtn = document.getElementById("fb-admin-save-btn");
  const saveContent = document.getElementById("fb-admin-save-btn-content");
  saveBtn.classList.remove("is-loading", "is-success");
  saveBtn.disabled = false;
  saveContent.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span>Save Update</span>
  `;

  document
    .getElementById("feedback-admin-modal-overlay")
    ?.classList.add("show");
}

function closeFeedbackAdminModal() {
  document
    .getElementById("feedback-admin-modal-overlay")
    ?.classList.remove("show");
  activeAdminFeedbackId = null;
}

async function saveFeedbackAdminUpdate() {
  if (!isCurrentUserAdmin || !activeAdminFeedbackId) return;
  if (!(await ensureOnline("Connect to internet to save changes."))) return;

  const status = document.getElementById("fb-admin-status")?.value || "OPEN";
  const resolvedVer = (
    document.getElementById("fb-admin-version")?.value || ""
  ).trim();
  const response = (
    document.getElementById("fb-admin-response")?.value || ""
  ).trim();

  const saveBtn = document.getElementById("fb-admin-save-btn");
  const saveContent = document.getElementById("fb-admin-save-btn-content");
  saveBtn.classList.add("is-loading");
  saveBtn.disabled = true;
  saveContent.innerHTML = `<div class="btn-spinner"></div><span>Saving...</span>`;

  try {
    await ensureSupabaseReady();
    const { error } = await supabaseClient.rpc("admin_update_feedback", {
      p_feedback_id: activeAdminFeedbackId,
      p_status: status,
      p_admin_response: response || null,
      p_resolved_in_version: resolvedVer || null,
    });
    if (error) throw error;

    invalidateFeedbackCache();
    refreshFeedbackOpenCount();

    saveBtn.classList.remove("is-loading");
    saveBtn.classList.add("is-success");
    saveContent.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline class="checkmark-path" points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>Updated!</span>
    `;
    showToast("✅ Submission updated!");

    setTimeout(() => {
      closeFeedbackAdminModal();
      loadFeedbackBoardOrCache(true);
    }, 550);
  } catch (err) {
    saveBtn.classList.remove("is-loading", "is-success");
    saveBtn.disabled = false;
    saveContent.innerHTML = `<span>Save Update</span>`;
    alert("Error updating submission: " + err.message);
  }
}

// --- REALTIME REFRESH ---
function scheduleFeedbackRealtimeRefresh() {
  invalidateFeedbackCache();
  clearTimeout(feedbackRealtimeTimer);
  feedbackRealtimeTimer = setTimeout(() => {
    refreshFeedbackOpenCount();
    if (
      document.getElementById("view-feedback")?.classList.contains("active") &&
      feedbackCurrentTab === "board"
    ) {
      loadFeedbackBoardOrCache(true);
    }
  }, 300);
}

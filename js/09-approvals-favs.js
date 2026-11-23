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

// --- APPROVALS WORKFLOW ---
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
  const cache = approvalsCache[tab];
  const contentDiv = document.getElementById("approvals-content");

  if (
    currentApprovalTab === tab &&
    !forceLoad &&
    cache.loaded &&
    contentDiv &&
    contentDiv.innerHTML.trim() !== ""
  ) {
    return;
  }

  currentApprovalTab = tab;
  isApprovalsLoading = false;

  if (tab === "pending") {
    document.getElementById("tab-appr-pending").classList.add("active");
    document.getElementById("tab-appr-resolved").classList.remove("active");
  } else {
    document.getElementById("tab-appr-resolved").classList.add("active");
    document.getElementById("tab-appr-pending").classList.remove("active");
  }

  const displayArea = document.getElementById("approvals-display-area");
  displayArea.scrollTop = 0;

  if (cache.loaded && !forceLoad) {
    cache.page = 1;
    cache.hasMore = cache.initialHasMore;
    displayArea.innerHTML = `
        <div id="approvals-content" style="padding: 4px;">${cache.html}</div>
        <div id="approvals-sentinel" style="min-height: 54px; display: ${
          cache.html.includes("list-empty") ? "none" : "flex"
        }; align-items: center; justify-content: center; padding: 10px;">
          ${
            !cache.hasMore
              ? `<span style="color: var(--text-light); font-size: 13px;">End of requests</span>`
              : ""
          }
        </div>
      `;
    setupApprovalsObserver();
    return;
  }

  cache.page = 0;
  cache.hasMore = true;

  displayArea.innerHTML = `
      <div id="approvals-content" style="padding: 4px;">
        ${getApprovalsSkeletonHTML(3)}
      </div>
      <div id="approvals-sentinel" style="min-height: 54px; display: flex; align-items: center; justify-content: center; padding: 10px;"></div>
    `;

  setupApprovalsObserver();
  loadApprovalsBatch();
}

async function loadApprovalsBatch() {
  const activeTab = currentApprovalTab;
  const cache = approvalsCache[activeTab];

  if (isApprovalsLoading || !cache.hasMore) return;
  isApprovalsLoading = true;

  const online = await checkActualInternet();
  if (!online) {
    showOfflineToast("Showing cached approvals.", false);
    const savedHtml = localStorage.getItem(
      "dakmitra_approvals_cache_" + activeTab,
    );
    const contentEl = document.getElementById("approvals-content");
    const sentinelEl = document.getElementById("approvals-sentinel");

    if (contentEl) {
      contentEl.innerHTML =
        savedHtml ||
        `<div class="list-empty">📴 No internet connection and no cached ${activeTab} approvals saved yet.</div>`;
    }
    if (sentinelEl) {
      sentinelEl.innerHTML = `<span style="color: var(--text-light); font-size: 13px;">📴 Offline cached view</span>`;
    }
    cache.hasMore = false;
    isApprovalsLoading = false;
    return;
  }

  const displayArea = document.getElementById("approvals-display-area");
  let contentDiv = document.getElementById("approvals-content");
  let sentinel = document.getElementById("approvals-sentinel");

  if (!contentDiv) {
    displayArea.innerHTML = `
        <div id="approvals-content" style="padding: 4px;">
          ${getApprovalsSkeletonHTML(3)}
        </div>
        <div id="approvals-sentinel" style="min-height: 54px; display: flex; align-items: center; justify-content: center; padding: 10px;"></div>
      `;
    setupApprovalsObserver();
    isApprovalsLoading = false;
    return setTimeout(loadApprovalsBatch, 0);
  }

  if (cache.page === 0) {
    if (!contentDiv.querySelector(".approval-skeleton-card")) {
      contentDiv.innerHTML = getApprovalsSkeletonHTML(3);
    }
    if (sentinel) sentinel.innerHTML = "";
  } else if (sentinel) {
    sentinel.innerHTML = `
        <div class="approvals-loader-pill">
          <div class="approvals-spinner"></div>
          <span>Fetching more requests...</span>
        </div>`;
  }

  try {
    if (!currentUserId) {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      currentUserId = session?.user?.id || null;
    }

    const fromIndex = cache.page * APPROVALS_PAGE_SIZE;
    const toIndex = fromIndex + APPROVALS_PAGE_SIZE - 1;

    let query = supabaseClient
      .from("edit_requests")
      .select(
        "*, post_offices(Address, Office, Pin), request_approvals(approved_by, is_admin)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(fromIndex, toIndex);

    if (activeTab === "pending") {
      query = query.eq("status", "PENDING");
    } else {
      query = query.neq("status", "PENDING");
    }

    const { data, error, count } = await query;
    if (error) throw error;

    if (currentApprovalTab !== activeTab) {
      isApprovalsLoading = false;
      return;
    }

    if (!data || data.length === 0) {
      cache.hasMore = false;
      if (cache.page === 0) {
        const emptyMsg =
          activeTab === "pending"
            ? "No pending approvals! 🎉"
            : "No resolved requests yet.";
        const emptyHtml = `<div class="list-empty">${emptyMsg}</div>`;
        contentDiv.innerHTML = emptyHtml;

        cache.html = emptyHtml;
        cache.page = 1;
        cache.initialHasMore = false;
        cache.loaded = true;
      }
      if (sentinel) sentinel.style.display = "none";
      isApprovalsLoading = false;
      return;
    }

    if (data.length < APPROVALS_PAGE_SIZE || fromIndex + data.length >= count) {
      cache.hasMore = false;
      if (sentinel) {
        sentinel.innerHTML = `<span style="color: var(--text-light); font-size: 13px;">End of requests</span>`;
      }
    } else if (sentinel) {
      sentinel.innerHTML = "";
    }

    let userIdsToFetch = new Set();
    data.forEach((req) => {
      if (req.requested_by) userIdsToFetch.add(req.requested_by);
      if (req.last_approved_by) userIdsToFetch.add(req.last_approved_by);
      if (req.request_approvals) {
        req.request_approvals.forEach((app) => {
          if (app.approved_by) userIdsToFetch.add(app.approved_by);
        });
      }
    });

    let profilesMap = {};
    if (userIdsToFetch.size > 0) {
      const { data: profileData, error: profileErr } =
        await supabaseClient.rpc("get_public_profiles_by_ids", {
          user_ids: Array.from(userIdsToFetch),
        });

      if (profileErr) {
        console.warn("Approvals profile lookup failed:", profileErr);
      } else if (Array.isArray(profileData)) {
        profileData.forEach((p) => {
          profilesMap[p.id] = p;
        });
      }
    }

    let html = ``;
    data.forEach((req) => {
      let changesHtml = "";

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
          return `<div style="margin-bottom: 4px;">${prefix} <span style="text-decoration:line-through; color:var(--text-light);">${escapeHTML(
            sOld,
          )}</span> ➡️ <b>${escapeHTML(sNew)}</b></div>`;
        }
        return `<div style="margin-bottom: 4px;">${prefix} ${escapeHTML(
          sNew,
        )}</div>`;
      };

      if (req.action_type === "ADD") {
        const badge = `<span class="badge" style="background:#dcfce7;color:#166534; padding: 4px 8px; font-size: 12px; margin-bottom: 8px;">➕ ADD</span>`;
        const prop = req.proposed_data || {};
        changesHtml = `
            ${badge}
            <div style="margin-bottom: 4px;"><b>${escapeHTML(
              prop.Address || "Unknown",
            )}</b></div>
            <div style="margin-bottom: 4px;">🏢 ${escapeHTML(
              prop.Office || "Unknown",
            )}</div>
            <div>📍 ${escapeHTML(prop.Pin || "N/A")}</div>
          `;
      } else if (req.action_type === "EDIT") {
        const badge = `<span class="badge" style="background:#fef9c3;color:#854d0e; padding: 4px 8px; font-size: 12px; margin-bottom: 8px;">✏️ EDIT</span>`;
        const oldD = req.original_data || req.post_offices || {};
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
            oldD.Pin || oldD.pin,
            newD.Pin || newD.pin,
            "📍",
            "N/A",
          );
      } else if (req.action_type === "DELETE") {
        const badge = `<span class="badge" style="background:#fee2e2;color:#991b1b; padding: 4px 8px; font-size: 12px; margin-bottom: 8px;">🗑️ DELETE</span>`;
        const oldD = req.post_offices || {};
        changesHtml = `
            ${badge}
            <div style="text-decoration: line-through; color: var(--text-light); margin-bottom: 4px;"><b>${escapeHTML(
              oldD.Address || "Unknown",
            )}</b></div>
            <div style="text-decoration: line-through; color: var(--text-light); margin-bottom: 4px;">🏢 ${escapeHTML(
              oldD.Office || "Unknown",
            )}</div>
            <div style="text-decoration: line-through; color: var(--text-light);">📍 ${escapeHTML(
              oldD.Pin || "N/A",
            )}</div>
          `;
      }

      const voteCount = req.request_approvals
        ? req.request_approvals.length
        : 0;
      const dateStr = new Date(req.created_at).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });

      const reqProfile = profilesMap[req.requested_by];
      const requesterName = reqProfile ? reqProfile.name : "Unknown User";
      const requesterId =
        reqProfile && reqProfile.employee_id ? reqProfile.employee_id : "No ID";

      let approverDetailsHtml = "";
      if (
        req.status === "APPROVED" &&
        req.request_approvals &&
        req.request_approvals.length > 0
      ) {
        const lastApproval =
          req.request_approvals[req.request_approvals.length - 1];
        const approverProfile = profilesMap[lastApproval.approved_by];
        if (approverProfile) {
          const approverLink = renderUserProfileLink(
            lastApproval.approved_by,
            approverProfile.name,
          );
          if (lastApproval.is_admin) {
            approverDetailsHtml = `<div style="font-size: 12px; color: var(--success-text); margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border);">✅ <b>Admin Approved</b> (Approved by: ${approverLink} - ${escapeHTML(
              approverProfile.employee_id,
            )})</div>`;
          } else {
            approverDetailsHtml = `<div style="font-size: 12px; color: var(--primary); margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border);">👥 <b>Community Approved</b> (Final vote by: ${approverLink} - ${escapeHTML(
              approverProfile.employee_id,
            )})</div>`;
          }
        }
      }

      let actionBarHtml = "";
      if (req.status === "PENDING") {
        const isOwnRequest =
          currentUserId && String(req.requested_by) === String(currentUserId);
        const hasAlreadyVoted =
          currentUserId &&
          req.request_approvals &&
          req.request_approvals.some(
            (app) => String(app.approved_by) === String(currentUserId),
          );

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
        if (req.last_approved_by && profilesMap[req.last_approved_by]) {
          const rej = profilesMap[req.last_approved_by];
          const rejLink = renderUserProfileLink(req.last_approved_by, rej.name);
          rejecterText = ` (Rejected by: ${rejLink} - ${escapeHTML(
            rej.employee_id,
          )})`;
        }
        actionBarHtml = `<div style="text-align: right; color: #b91c1c; font-weight: 600; font-size: 13px; margin-top: 12px;">❌ Request Rejected${rejecterText}</div>`;
      }

      html += `
          <div id="approval-card-${req.id}" class="approval-card ${
            req.action_type === "DELETE" ? "is-delete" : ""
          }">
            <div style="font-size: 14px; margin-bottom: 12px; color: var(--text); line-height: 1.4;">${changesHtml}</div>
            <div class="approval-meta-box">
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
    });

    if (cache.page === 0) {
      contentDiv.classList.remove("approvals-smooth-in");
      contentDiv.innerHTML = html;
      void contentDiv.offsetWidth;
      contentDiv.classList.add("approvals-smooth-in");
    } else {
      contentDiv.insertAdjacentHTML("beforeend", html);
    }

    if (cache.page === 0) {
      cache.html = html;
      cache.loaded = true;
      cache.initialHasMore = cache.hasMore;
      cache.page = 1;
      localStorage.setItem("dakmitra_approvals_cache_" + activeTab, html);
    } else {
      cache.page++;
    }

    isApprovalsLoading = false;
  } catch (err) {
    isApprovalsLoading = false;
    if (contentDiv) {
      contentDiv.innerHTML = `<div class="list-empty" style="color: red;">Error loading requests: ${err.message}</div>`;
    }
  }
}

function setupApprovalsObserver() {
  const sentinel = document.getElementById("approvals-sentinel");
  const displayArea = document.getElementById("approvals-display-area");

  if (approvalsObserver) approvalsObserver.disconnect();

  approvalsObserver = new IntersectionObserver(
    (entries) => {
      const cache = approvalsCache[currentApprovalTab];
      if (entries[0].isIntersecting && cache.hasMore && !isApprovalsLoading) {
        loadApprovalsBatch();
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

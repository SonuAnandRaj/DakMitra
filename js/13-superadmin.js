// =========================================================
// 13-SUPERADMIN.JS — Superadmin Controls, Users, DB Explorer & Audit
// =========================================================

const saState = {
  activeTab: "controls",
  users: [],
  userFilter: "all",
  schema: [],
  dbTable: "",
  dbRows: [],
  dbTotal: 0,
  dbPage: 0,
  dbPageSize: 25,
  dbSortCol: null,
  dbSortDir: "desc",
  dbSearchTimer: null,
  dbModalOp: "UPDATE",
  dbModalRow: null,
  userModalCallback: null,
};

// --- ENTRY & TAB SWITCHING ---
function renderSuperadminView() {
  if (!isCurrentUserSuperadmin) {
    showToast("🚫 Superadmin access required.", "error");
    switchDashboardView("search");
    return;
  }
  syncSuperadminControlsUI();
  switchSuperadminTab(saState.activeTab);
}

function switchSuperadminTab(tab) {
  saState.activeTab = tab;
  ["controls", "users", "database", "audit"].forEach((t) => {
    document
      .getElementById(`sa-tab-${t}`)
      ?.classList.toggle("active", t === tab);
    document
      .getElementById(`sa-panel-${t}`)
      ?.classList.toggle("hidden", t !== tab);
  });

  if (tab === "controls") {
    fetchAndApplyAppConfig().then(syncSuperadminControlsUI);
  } else if (tab === "users") {
    loadSuperadminUsers();
  } else if (tab === "database") {
    initSuperadminDbExplorer();
  } else if (tab === "audit") {
    loadSuperadminAuditLogs();
  }
}

// --- TAB 1: CONTROLS & SIMPLE CMS ---
function syncSuperadminControlsUI() {
  const setChk = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(val);
  };
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? "";
  };

  setChk("sa-toggle-user-approval", appConfig.require_user_approval);
  setChk("sa-toggle-csv-export", appConfig.export_csv_enabled !== false);
  setChk("sa-toggle-excel-export", appConfig.export_excel_enabled !== false);
  setVal("sa-input-vote-threshold", getCommunityVoteThreshold());

  setVal("sa-cms-title", appConfig.app_title || "DakMitra");
  setVal(
    "sa-cms-tagline",
    appConfig.app_tagline || "The Modern Postal Database"
  );

  const banner = appConfig.announcement_banner || {};
  setChk("sa-cms-banner-enabled", banner.enabled);
  setVal("sa-cms-banner-type", banner.type || "info");
  setVal("sa-cms-banner-text", banner.text || "");

  const maint = appConfig.maintenance_mode || {};
  setChk("sa-cms-maint-enabled", maint.enabled);
  setVal(
    "sa-cms-maint-msg",
    maint.message ||
      "DakMitra is undergoing maintenance. Please check back shortly."
  );
}

async function saveSuperadminSetting(key, value, silent = false) {
  if (!(await ensureOnline("Connect to internet to save settings."))) {
    syncSuperadminControlsUI();
    return false;
  }
  try {
    await ensureSupabaseReady();
    const { error } = await supabaseClient.rpc("superadmin_update_setting", {
      p_key: key,
      p_value: value,
    });
    if (error) throw error;

    appConfig[key] = value;
    localStorage.setItem(APP_CONFIG_CACHE_KEY, JSON.stringify(appConfig));
    applyAppConfigUI();
    if (!silent) showToast("✅ Setting updated live!", "success");
    return true;
  } catch (err) {
    syncSuperadminControlsUI();
    showToast("❌ " + err.message, "error");
    return false;
  }
}

async function saveSuperadminVoteThreshold() {
  const raw = parseInt(
    document.getElementById("sa-input-vote-threshold")?.value,
    10
  );
  if (isNaN(raw) || raw < 1 || raw > 20) {
    return showToast("⚠️ Enter a number between 1 and 20.", "warning");
  }
  await saveSuperadminSetting("community_vote_threshold", raw);
}

async function saveSuperadminCmsChanges() {
  if (!(await ensureOnline("Connect to internet to save CMS changes."))) return;
  const btn = document.getElementById("sa-cms-save-btn");
  setButtonState(btn, "loading", "Saving...");

  const title =
    document.getElementById("sa-cms-title")?.value.trim() || "DakMitra";
  const tagline =
    document.getElementById("sa-cms-tagline")?.value.trim() ||
    "The Modern Postal Database";
  const banner = {
    enabled: Boolean(document.getElementById("sa-cms-banner-enabled")?.checked),
    type: document.getElementById("sa-cms-banner-type")?.value || "info",
    text: document.getElementById("sa-cms-banner-text")?.value.trim() || "",
  };
  const maint = {
    enabled: Boolean(document.getElementById("sa-cms-maint-enabled")?.checked),
    message:
      document.getElementById("sa-cms-maint-msg")?.value.trim() ||
      "DakMitra is undergoing maintenance. Please check back shortly.",
  };

  const results = await Promise.all([
    saveSuperadminSetting("app_title", title, true),
    saveSuperadminSetting("app_tagline", tagline, true),
    saveSuperadminSetting("announcement_banner", banner, true),
    saveSuperadminSetting("maintenance_mode", maint, true),
  ]);

  if (results.every(Boolean)) {
    setButtonState(btn, "success", "Saved Live!");
    showToast("✨ CMS changes applied to all users!", "success");
    setTimeout(() => setButtonState(btn, "idle"), 1500);
  } else {
    setButtonState(btn, "idle");
  }
}

// --- TAB 2: USERS, APPROVALS & ADMIN ROLES ---
async function refreshSuperadminPendingBadge() {
  if (!isCurrentUserSuperadmin || !navigator.onLine || !supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.rpc("superadmin_get_users");
    if (error || !Array.isArray(data)) return;
    saState.users = data;
    updateSuperadminPendingBadges();
    if (
      document
        .getElementById("view-superadmin")
        ?.classList.contains("active") &&
      saState.activeTab === "users"
    ) {
      renderSuperadminUsersList();
    }
  } catch (_) {}
}

function updateSuperadminPendingBadges() {
  const pendingCount = saState.users.filter(
    (u) => u.approval_status === "PENDING"
  ).length;
  const sideBadge = document.getElementById("sidebar-superadmin-badge");
  const tabPill = document.getElementById("sa-pending-count-pill");
  if (sideBadge) {
    sideBadge.textContent = String(pendingCount);
    sideBadge.classList.toggle("hidden", pendingCount === 0);
  }
  if (tabPill) tabPill.textContent = String(pendingCount);
}

async function loadSuperadminUsers(force = false) {
  const listEl = document.getElementById("sa-users-list");
  if (!listEl) return;
  if (!force && saState.users.length > 0) {
    renderSuperadminUsersList();
    return;
  }
  if (!(await ensureOnline("Connect to internet to manage users."))) return;

  listEl.innerHTML = `<div class="skeleton-card"><div class="skeleton-line medium"></div><div class="skeleton-line short"></div></div>`;
  try {
    await ensureSupabaseReady();
    const { data, error } = await supabaseClient.rpc("superadmin_get_users");
    if (error) throw error;
    saState.users = Array.isArray(data) ? data : [];
    updateSuperadminPendingBadges();
    renderSuperadminUsersList();
  } catch (err) {
    listEl.innerHTML = `<div class="list-empty" style="color:#ef4444;">${escapeHTML(
      err.message
    )}</div>`;
  }
}

function setSuperadminUserFilter(filter) {
  saState.userFilter = filter;
  document.querySelectorAll("[data-sa-ufilter]").forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.getAttribute("data-sa-ufilter") === filter
    );
  });
  renderSuperadminUsersList();
}

function renderSuperadminUsersList() {
  const listEl = document.getElementById("sa-users-list");
  if (!listEl) return;

  const q = (document.getElementById("sa-users-search")?.value || "")
    .trim()
    .toLowerCase();

  const filtered = saState.users.filter((u) => {
    if (saState.userFilter === "pending" && u.approval_status !== "PENDING")
      return false;
    if (saState.userFilter === "admins" && !u.is_admin && !u.is_superadmin)
      return false;
    if (
      saState.userFilter === "blocked" &&
      !["REJECTED", "SUSPENDED"].includes(u.approval_status)
    )
      return false;

    if (!q) return true;
    const hay = `${u.name || ""} ${u.email || ""} ${u.employee_id || ""} ${
      u.designation || ""
    }`.toLowerCase();
    return hay.includes(q);
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="list-empty">No matching users found.</div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map((u) => {
      const uid = escapeForOnclick(u.id);
      const uname = escapeForOnclick(u.name || u.email || "User");
      const roleBadge = u.is_superadmin
        ? `<span class="member-admin-badge">👑 Superadmin</span>`
        : u.is_admin
        ? `<span class="member-admin-badge">🛡️ Admin</span>`
        : "";
      const statusColors = {
        APPROVED: "background:var(--success-bg);color:var(--success-text);",
        PENDING: "background:rgba(245,158,11,0.16);color:#b45309;",
        REJECTED: "background:#fee2e2;color:#b91c1c;",
        SUSPENDED: "background:#fee2e2;color:#b91c1c;",
      };
      const emailTag = u.email_confirmed_at ? "✅ Verified" : "✉️ Unverified";

      let actionsHtml = "";
      if (!u.is_superadmin) {
        if (u.approval_status !== "APPROVED") {
          actionsHtml += `<button class="dm-btn dm-btn-primary dm-btn-sm" onclick="saApproveAndVerify('${uid}', false)">✅ Approve</button>`;
        }
        if (u.approval_status === "PENDING") {
          actionsHtml += `<button class="dm-btn dm-btn-danger-soft dm-btn-sm" onclick="saPromptUserStatus('${uid}', 'REJECTED', '${uname}')">❌ Reject</button>`;
        } else if (u.approval_status === "APPROVED") {
          actionsHtml += `<button class="dm-btn dm-btn-danger-soft dm-btn-sm" onclick="saPromptUserStatus('${uid}', 'SUSPENDED', '${uname}')">🚫 Suspend</button>`;
        }

        actionsHtml += u.is_admin
          ? `<button class="dm-btn dm-btn-secondary dm-btn-sm" onclick="saToggleAdmin('${uid}', false, '${uname}')">⬇️ Remove Admin</button>`
          : `<button class="dm-btn dm-btn-secondary dm-btn-sm" onclick="saToggleAdmin('${uid}', true, '${uname}')">🛡️ Make Admin</button>`;

        if (u.device_id) {
          actionsHtml += `<button class="dm-btn dm-btn-secondary dm-btn-sm" onclick="saResetDevice('${uid}', '${uname}')">📱 Reset Device</button>`;
        }
        actionsHtml += `<button class="dm-btn dm-btn-secondary dm-btn-sm" onclick="saPromptPasswordReset('${uid}', '${uname}')">🔑 Reset PW</button>`;
        actionsHtml += `<button class="dm-btn dm-btn-danger-soft dm-btn-sm" onclick="saDeleteUserAccount('${uid}', '${uname}')">🗑️ Delete</button>`;
      }

      return `
          <div class="sa-user-card">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">
              <div>
                <div style="font-size:15px; font-weight:800; color:var(--text);">
                  ${escapeHTML(u.name || "Unnamed")} ${roleBadge}
                </div>
                <div style="font-size:12px; color:var(--text-light); margin-top:2px;">
                  ${escapeHTML(u.email)} • 🆔 ${escapeHTML(
        u.employee_id || "No ID"
      )} • ${emailTag}
                </div>
                <div style="font-size:12px; color:var(--text-light); margin-top:2px;">
                  ${escapeHTML(u.designation || "Employee")}${
        u.mobile ? ` • 📞 ${escapeHTML(u.mobile)}` : ""
      }
                </div>
                ${
                  u.status_note
                    ? `<div style="font-size:11.5px; color:#ef4444; margin-top:4px;">Note: ${escapeHTML(
                        u.status_note
                      )}</div>`
                    : ""
                }
              </div>
              <span class="badge" style="margin:0; font-size:11px; ${
                statusColors[u.approval_status] || ""
              }">
                ${escapeHTML(u.approval_status)}
              </span>
            </div>
            ${
              actionsHtml
                ? `<div class="sa-user-actions">${actionsHtml}</div>`
                : ""
            }
          </div>`;
    })
    .join("");
}

async function invokeSuperadminAuthOp(payload) {
  if (!(await ensureOnline("Connect to internet to perform this action.")))
    return null;
  await ensureSupabaseReady();
  const { data, error } = await supabaseClient.functions.invoke(
    "superadmin-auth-ops",
    { body: payload }
  );
  if (error) {
    let msg = error.message || "Auth operation failed";
    try {
      const body = await error.context?.json();
      if (body?.error) msg = body.error;
    } catch (_) {}
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function saApproveAndVerify(userId, makeAdmin = false) {
  try {
    showToast("⏳ Approving user...", "info");
    await invokeSuperadminAuthOp({
      action: "approve_and_verify",
      targetUserId: userId,
      makeAdmin,
    });
    showToast("✅ User approved & email verified!", "success");
    await loadSuperadminUsers(true);
  } catch (err) {
    showToast("❌ " + err.message, "error");
  }
}

async function saToggleAdmin(userId, makeAdmin, name) {
  const title = makeAdmin ? "Promote to Admin?" : "Remove Admin Status?";
  const msg = makeAdmin
    ? `Grant Admin rights to ${name}?`
    : `Remove Admin rights from ${name}?`;
  showCustomConfirm(
    title,
    msg,
    makeAdmin ? "Make Admin" : "Remove Admin",
    async () => {
      if (!(await ensureOnline("Connect to internet to update role."))) return;
      try {
        await ensureSupabaseReady();
        const { error } = await supabaseClient.rpc(
          "superadmin_set_admin_status",
          {
            p_target_user_id: userId,
            p_make_admin: makeAdmin,
          }
        );
        if (error) throw error;
        showToast(
          makeAdmin
            ? `🛡️ ${name} is now an Admin!`
            : `⬇️ Admin removed from ${name}.`,
          "success"
        );
        await loadSuperadminUsers(true);
      } catch (err) {
        showToast("❌ " + err.message, "error");
      }
    }
  );
}

async function saResetDevice(userId, name) {
  showCustomConfirm(
    "Reset Device Lock?",
    `Allow ${name} to sign in on a new phone/browser?`,
    "Reset Device",
    async () => {
      if (!(await ensureOnline("Connect to internet to reset device."))) return;
      try {
        await ensureSupabaseReady();
        const { error } = await supabaseClient.rpc(
          "superadmin_reset_device_lock",
          {
            p_target_user_id: userId,
          }
        );
        if (error) throw error;
        showToast("📱 Device lock cleared!", "success");
        await loadSuperadminUsers(true);
      } catch (err) {
        showToast("❌ " + err.message, "error");
      }
    }
  );
}

function openSuperadminUserModal({
  title,
  desc,
  label,
  placeholder,
  type = "text",
  onConfirm,
}) {
  document.getElementById("sa-user-modal-title").textContent = title;
  document.getElementById("sa-user-modal-desc").textContent = desc;
  document.getElementById("sa-user-modal-label").textContent = label;
  const input = document.getElementById("sa-user-modal-input");
  input.type = type;
  input.value = "";
  input.placeholder = placeholder || "";

  const btn = document.getElementById("sa-user-modal-confirm");
  const freshBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(freshBtn, btn);
  freshBtn.addEventListener("click", () =>
    onConfirm(input.value.trim(), freshBtn)
  );

  document.getElementById("sa-user-modal-overlay").classList.add("show");
  setTimeout(() => input.focus(), 100);
}

function closeSuperadminUserModal() {
  document.getElementById("sa-user-modal-overlay")?.classList.remove("show");
}

function saPromptUserStatus(userId, status, name) {
  openSuperadminUserModal({
    title: status === "REJECTED" ? `Reject ${name}?` : `Suspend ${name}?`,
    desc: "This user will be blocked from signing in and accessing data.",
    label: "Reason (Optional)",
    placeholder: "e.g. Duplicate account or not verified staff",
    onConfirm: async (note, btn) => {
      if (!(await ensureOnline("Connect to internet to update status.")))
        return;
      setButtonState(btn, "loading", "Saving...");
      try {
        await ensureSupabaseReady();
        const { error } = await supabaseClient.rpc(
          "superadmin_set_user_approval",
          {
            p_target_user_id: userId,
            p_status: status,
            p_note: note || null,
          }
        );
        if (error) throw error;
        closeSuperadminUserModal();
        showToast(`✅ User marked as ${status}.`, "success");
        await loadSuperadminUsers(true);
      } catch (err) {
        setButtonState(btn, "idle");
        showToast("❌ " + err.message, "error");
      }
    },
  });
}

function saPromptPasswordReset(userId, name) {
  openSuperadminUserModal({
    title: `Reset Password`,
    desc: `Set a new password for ${name} (minimum 6 characters).`,
    label: "New Password",
    placeholder: "At least 6 characters",
    type: "password",
    onConfirm: async (pw, btn) => {
      if (pw.length < 6)
        return showToast("⚠️ Minimum 6 characters.", "warning");
      setButtonState(btn, "loading", "Updating...");
      try {
        await invokeSuperadminAuthOp({
          action: "reset_password",
          targetUserId: userId,
          newPassword: pw,
        });
        closeSuperadminUserModal();
        showToast("🔑 Password updated successfully!", "success");
      } catch (err) {
        setButtonState(btn, "idle");
        showToast("❌ " + err.message, "error");
      }
    },
  });
}

function saDeleteUserAccount(userId, name) {
  showCustomConfirm(
    `Delete ${name}?`,
    "Permanently removes this user's login & profile. Postal records they added will be safely preserved.",
    "Delete Permanently",
    async () => {
      try {
        showToast("⏳ Deleting account...", "info");
        await invokeSuperadminAuthOp({
          action: "delete_user",
          targetUserId: userId,
        });
        showToast("🗑️ Account deleted.", "success");
        await loadSuperadminUsers(true);
      } catch (err) {
        showToast("❌ " + err.message, "error");
      }
    }
  );
}

// --- TAB 3: VISUAL DATABASE EXPLORER ---
async function initSuperadminDbExplorer() {
  if (saState.schema.length > 0) {
    if (saState.dbTable) loadSuperadminTableRows(false);
    return;
  }
  if (!(await ensureOnline("Connect to internet to browse database."))) return;

  const wrap = document.getElementById("sa-db-table-wrap");
  if (wrap)
    wrap.innerHTML = `<div style="padding:20px; text-align:center;">Loading schema...</div>`;

  try {
    await ensureSupabaseReady();
    const { data, error } = await supabaseClient.rpc(
      "superadmin_get_schema_overview"
    );
    if (error) throw error;
    saState.schema = Array.isArray(data) ? data : [];

    const select = document.getElementById("sa-db-table-select");
    if (select) {
      select.innerHTML = saState.schema
        .map(
          (t) =>
            `<option value="${escapeHTML(t.table_name)}">${escapeHTML(
              t.table_name
            )} (${t.row_count})</option>`
        )
        .join("");
    }

    if (saState.schema.length > 0) {
      saState.dbTable = saState.schema[0].table_name;
      onSuperadminTableChange(saState.dbTable);
    }
  } catch (err) {
    if (wrap)
      wrap.innerHTML = `<div style="padding:20px; color:#ef4444;">${escapeHTML(
        err.message
      )}</div>`;
  }
}

function getActiveDbTableMeta() {
  return saState.schema.find((t) => t.table_name === saState.dbTable) || null;
}

function onSuperadminTableChange(tableName) {
  saState.dbTable = tableName;
  saState.dbPage = 0;
  saState.dbSortCol = null;
  saState.dbSortDir = "desc";
  const meta = getActiveDbTableMeta();
  document
    .getElementById("sa-db-add-btn")
    ?.classList.toggle("hidden", Boolean(meta?.readonly));
  loadSuperadminTableRows(true);
}

function handleSuperadminDbSearch() {
  clearTimeout(saState.dbSearchTimer);
  saState.dbSearchTimer = setTimeout(() => {
    saState.dbPage = 0;
    loadSuperadminTableRows(true);
  }, 300);
}

function sortSuperadminDbBy(col) {
  if (saState.dbSortCol === col) {
    saState.dbSortDir = saState.dbSortDir === "asc" ? "desc" : "asc";
  } else {
    saState.dbSortCol = col;
    saState.dbSortDir = "asc";
  }
  saState.dbPage = 0;
  loadSuperadminTableRows(true);
}

function changeSuperadminDbPage(delta) {
  const maxPage = Math.max(
    0,
    Math.ceil(saState.dbTotal / saState.dbPageSize) - 1
  );
  saState.dbPage = Math.min(maxPage, Math.max(0, saState.dbPage + delta));
  loadSuperadminTableRows(false);
}

async function loadSuperadminTableRows(reset = false) {
  if (!saState.dbTable) return;
  if (!(await ensureOnline("Connect to internet to query database."))) return;
  if (reset) saState.dbPage = 0;

  const wrap = document.getElementById("sa-db-table-wrap");
  const metaEl = document.getElementById("sa-db-meta");
  const pager = document.getElementById("sa-db-pager");
  if (wrap)
    wrap.innerHTML = `<div style="padding:20px; text-align:center;">Loading rows...</div>`;

  try {
    await ensureSupabaseReady();
    const search =
      document.getElementById("sa-db-search")?.value.trim() || null;
    const { data, error } = await supabaseClient.rpc("superadmin_query_table", {
      p_table: saState.dbTable,
      p_search: search,
      p_sort_col: saState.dbSortCol,
      p_sort_dir: saState.dbSortDir,
      p_limit: saState.dbPageSize,
      p_offset: saState.dbPage * saState.dbPageSize,
    });
    if (error) throw error;

    saState.dbRows = Array.isArray(data?.rows) ? data.rows : [];
    saState.dbTotal = Number(data?.total_count || 0);

    const tMeta = getActiveDbTableMeta();
    const cols = (tMeta?.columns || []).map((c) => c.name);
    if (metaEl) {
      metaEl.textContent = `${saState.dbTable} • ${saState.dbTotal} rows${
        tMeta?.readonly ? " (Read-Only)" : " • Tap any row to edit"
      }`;
    }

    if (saState.dbRows.length === 0) {
      wrap.innerHTML = `<div style="padding:24px; text-align:center; color:var(--text-light);">No rows found.</div>`;
      pager?.classList.add("hidden");
      return;
    }

    const headHtml = cols
      .map((c) => {
        const arrow =
          saState.dbSortCol === c
            ? saState.dbSortDir === "asc"
              ? " ▲"
              : " ▼"
            : "";
        return `<th onclick="sortSuperadminDbBy('${escapeForOnclick(
          c
        )}')">${escapeHTML(c)}${arrow}</th>`;
      })
      .join("");

    const bodyHtml = saState.dbRows
      .map((row, idx) => {
        const cells = cols
          .map((c) => {
            const v = row[c];
            const txt =
              v === null || v === undefined
                ? "NULL"
                : typeof v === "object"
                ? JSON.stringify(v)
                : String(v);
            return `<td title="${escapeHTML(txt)}">${escapeHTML(
              txt.slice(0, 80)
            )}</td>`;
          })
          .join("");
        return `<tr onclick="openSuperadminDbRowModal('UPDATE', ${idx})">${cells}</tr>`;
      })
      .join("");

    wrap.innerHTML = `<table class="sa-db-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;

    const totalPages = Math.max(
      1,
      Math.ceil(saState.dbTotal / saState.dbPageSize)
    );
    if (pager) {
      pager.classList.toggle("hidden", totalPages <= 1);
      document.getElementById("sa-db-page-info").textContent = `Page ${
        saState.dbPage + 1
      } / ${totalPages}`;
      document.getElementById("sa-db-prev-btn").disabled = saState.dbPage <= 0;
      document.getElementById("sa-db-next-btn").disabled =
        saState.dbPage + 1 >= totalPages;
    }
  } catch (err) {
    if (wrap)
      wrap.innerHTML = `<div style="padding:20px; color:#ef4444;">${escapeHTML(
        err.message
      )}</div>`;
  }
}

function openSuperadminDbRowModal(op, rowIdx = null) {
  const tMeta = getActiveDbTableMeta();
  if (!tMeta) return;
  saState.dbModalOp = op;
  saState.dbModalRow = op === "UPDATE" ? saState.dbRows[rowIdx] : null;

  document.getElementById("sa-db-modal-title").textContent =
    op === "INSERT"
      ? `Insert into ${tMeta.table_name}`
      : `Edit ${tMeta.table_name}`;
  document.getElementById("sa-db-modal-sub").textContent =
    op === "UPDATE" && tMeta.pk_column
      ? `${tMeta.pk_column}: ${saState.dbModalRow?.[tMeta.pk_column]}`
      : "Leave auto-generated fields blank";

  document
    .getElementById("sa-db-delete-btn")
    ?.classList.toggle("hidden", op !== "UPDATE" || tMeta.readonly);
  document
    .getElementById("sa-db-save-btn")
    ?.classList.toggle("hidden", Boolean(tMeta.readonly));

  const fieldsEl = document.getElementById("sa-db-modal-fields");
  fieldsEl.innerHTML = (tMeta.columns || [])
    .map((col) => {
      const isPkLocked = op === "UPDATE" && col.is_pk;
      const disabled = isPkLocked || tMeta.readonly ? "disabled" : "";
      const rawVal = saState.dbModalRow ? saState.dbModalRow[col.name] : null;
      const isJson = col.type === "jsonb" || col.type === "json";
      const isBool = col.type === "boolean";

      let controlHtml = "";
      if (isBool) {
        const strVal =
          rawVal === true ? "true" : rawVal === false ? "false" : "";
        controlHtml = `<select class="sa-db-field" data-col="${escapeHTML(
          col.name
        )}" data-type="boolean" ${disabled}>
            ${
              col.nullable
                ? `<option value="" ${
                    strVal === "" ? "selected" : ""
                  }>NULL</option>`
                : ""
            }
            <option value="true" ${
              strVal === "true" ? "selected" : ""
            }>true</option>
            <option value="false" ${
              strVal === "false" ? "selected" : ""
            }>false</option>
          </select>`;
      } else if (isJson) {
        const jStr =
          rawVal === null || rawVal === undefined
            ? ""
            : JSON.stringify(rawVal, null, 2);
        controlHtml = `<textarea class="bulk-textarea sa-db-field" style="min-height:80px; font-family:monospace; font-size:12px;" data-col="${escapeHTML(
          col.name
        )}" data-type="jsonb" ${disabled} placeholder="Valid JSON or empty for NULL">${escapeHTML(
          jStr
        )}</textarea>`;
      } else {
        const strVal =
          rawVal === null || rawVal === undefined ? "" : String(rawVal);
        controlHtml = `<input type="text" class="sa-db-field" data-col="${escapeHTML(
          col.name
        )}" data-type="${escapeHTML(col.type)}" value="${escapeHTML(
          strVal
        )}" ${disabled} placeholder="${col.nullable ? "NULL" : col.type}" />`;
      }

      return `<div class="input-group" style="margin-bottom:10px;">
          <label>${escapeHTML(
            col.name
          )} <span style="opacity:0.65; font-weight:500;">(${escapeHTML(
        col.type
      )}${col.is_pk ? ", PK" : ""})</span></label>
          ${controlHtml}
        </div>`;
    })
    .join("");

  document.getElementById("sa-db-modal-overlay").classList.add("show");
}

function closeSuperadminDbModal() {
  document.getElementById("sa-db-modal-overlay")?.classList.remove("show");
}

async function saveSuperadminDbRow() {
  const tMeta = getActiveDbTableMeta();
  if (!tMeta || tMeta.readonly) return;
  if (!(await ensureOnline("Connect to internet to save row."))) return;

  const payload = {};
  const fields = document.querySelectorAll("#sa-db-modal-fields .sa-db-field");
  for (const el of fields) {
    if (el.disabled) continue;
    const col = el.getAttribute("data-col");
    const type = el.getAttribute("data-type");
    const val = el.value;

    if (saState.dbModalOp === "INSERT" && val.trim() === "") continue;

    if (type === "boolean") {
      payload[col] = val === "" ? null : val === "true";
    } else if (type === "jsonb") {
      if (val.trim() === "") {
        payload[col] = null;
      } else {
        try {
          payload[col] = JSON.parse(val);
        } catch (e) {
          return showToast(`⚠️ Invalid JSON in "${col}"`, "warning");
        }
      }
    } else {
      payload[col] = val === "" ? null : val;
    }
  }

  const btn = document.getElementById("sa-db-save-btn");
  setButtonState(btn, "loading", "Saving...");
  try {
    await ensureSupabaseReady();
    const pkVal =
      saState.dbModalOp === "UPDATE" && tMeta.pk_column
        ? String(saState.dbModalRow[tMeta.pk_column])
        : null;

    const { error } = await supabaseClient.rpc("superadmin_mutate_row", {
      p_table: tMeta.table_name,
      p_op: saState.dbModalOp,
      p_pk_col: tMeta.pk_column,
      p_pk_val: pkVal,
      p_data: payload,
    });
    if (error) throw error;

    closeSuperadminDbModal();
    showToast("✅ Database row saved!", "success");
    await loadSuperadminTableRows(false);
    if (tMeta.table_name === "post_offices") fetchAllPostOffices(true);
    if (tMeta.table_name === "app_settings") fetchAndApplyAppConfig();
  } catch (err) {
    showToast("❌ " + err.message, "error");
  } finally {
    setButtonState(btn, "idle");
  }
}

function deleteSuperadminDbRow() {
  const tMeta = getActiveDbTableMeta();
  if (!tMeta || tMeta.readonly || !saState.dbModalRow) return;
  const pkVal = String(saState.dbModalRow[tMeta.pk_column]);

  showCustomConfirm(
    `Delete row from ${tMeta.table_name}?`,
    `Permanently delete ${tMeta.pk_column} = ${pkVal}? This cannot be undone.`,
    "Delete Row",
    async () => {
      if (!(await ensureOnline("Connect to internet to delete row."))) return;
      try {
        await ensureSupabaseReady();
        const { error } = await supabaseClient.rpc("superadmin_mutate_row", {
          p_table: tMeta.table_name,
          p_op: "DELETE",
          p_pk_col: tMeta.pk_column,
          p_pk_val: pkVal,
          p_data: {},
        });
        if (error) throw error;
        closeSuperadminDbModal();
        showToast("🗑️ Row deleted.", "success");
        await loadSuperadminTableRows(false);
        if (tMeta.table_name === "post_offices") fetchAllPostOffices(true);
      } catch (err) {
        showToast("❌ " + err.message, "error");
      }
    }
  );
}

async function exportSuperadminTable(format) {
  if (!saState.dbTable) return;
  if (!(await ensureOnline("Connect to internet to export table."))) return;
  showToast(`⏳ Exporting ${saState.dbTable}...`, "info");

  try {
    await ensureSupabaseReady();
    const { data, error } = await supabaseClient.rpc("superadmin_query_table", {
      p_table: saState.dbTable,
      p_search: document.getElementById("sa-db-search")?.value.trim() || null,
      p_sort_col: saState.dbSortCol,
      p_sort_dir: saState.dbSortDir,
      p_limit: 500,
      p_offset: 0,
    });
    if (error) throw error;
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    if (rows.length === 0) return showToast("No rows to export.", "warning");

    let content = "";
    let mime = "application/json";
    let ext = "json";

    if (format === "csv") {
      const cols = Object.keys(rows[0]);
      const esc = (v) =>
        `"${String(
          v === null || v === undefined
            ? ""
            : typeof v === "object"
            ? JSON.stringify(v)
            : v
        ).replace(/"/g, '""')}"`;
      content =
        cols.join(",") +
        "\n" +
        rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
      mime = "text/csv";
      ext = "csv";
    } else {
      content = JSON.stringify(rows, null, 2);
    }

    const blob = new Blob([content], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `DakMitra_${saState.dbTable}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(
      `📥 Exported ${rows.length} rows (${ext.toUpperCase()})!`,
      "success"
    );
  } catch (err) {
    showToast("❌ " + err.message, "error");
  }
}

// --- TAB 4: AUDIT LOG ---
async function loadSuperadminAuditLogs() {
  const listEl = document.getElementById("sa-audit-list");
  if (!listEl) return;
  if (!(await ensureOnline("Connect to internet to view audit logs."))) return;

  listEl.innerHTML = `<div class="skeleton-card"><div class="skeleton-line medium"></div></div>`;
  try {
    await ensureSupabaseReady();
    const { data, error } = await supabaseClient.rpc(
      "superadmin_get_audit_logs",
      {
        p_limit: 40,
        p_offset: 0,
      }
    );
    if (error) throw error;
    const logs = Array.isArray(data) ? data : [];
    if (logs.length === 0) {
      listEl.innerHTML = `<div class="list-empty">No Superadmin actions logged yet.</div>`;
      return;
    }

    listEl.innerHTML = logs
      .map((l) => {
        const dt = new Date(l.created_at).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        });
        return `
            <div class="sa-user-card">
              <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:4px;">
                <strong style="font-size:13px; color:var(--primary);">${escapeHTML(
                  l.action
                )}</strong>
                <span style="font-size:11px; color:var(--text-light);">${dt}</span>
              </div>
              <div style="font-size:12px; color:var(--text-light);">
                Table: <b>${escapeHTML(
                  l.target_table || "-"
                )}</b> • ID: ${escapeHTML(l.target_id || "-")}
              </div>
            </div>`;
      })
      .join("");
  } catch (err) {
    listEl.innerHTML = `<div class="list-empty" style="color:#ef4444;">${escapeHTML(
      err.message
    )}</div>`;
  }
}

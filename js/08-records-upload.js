// =========================================================
// 08-RECORDS-UPLOAD.JS — Edit, Delete, History, Manual/Bulk & Excel
// =========================================================

// --- IN-PLACE EDIT RECORD MODAL ---
let activeInlineEditRecord = null;

function closeEditRecordModal() {
  document.getElementById("edit-record-modal-overlay").classList.remove("show");
  closeAllDropdowns();
  activeInlineEditRecord = null;
}

function getInlineSaveBtnDefaultHTML() {
  const label = isCurrentUserAdmin ? "Save Changes" : "Submit Edit";
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
      <polyline points="17 21 17 13 7 13 7 21"></polyline>
      <polyline points="7 3 7 8 15 8"></polyline>
    </svg>
    <span>${label}</span>
  `;
}

function updateRecord(id, currentAddress, currentOffice, currentPin) {
  closeAllDirectoryActionTrays();

  const safePin =
    !currentPin || currentPin === "null" || currentPin === "undefined"
      ? ""
      : String(currentPin).trim();

  activeInlineEditRecord = {
    id: id,
    oldAddress: currentAddress || "",
    oldOffice: currentOffice || "",
    oldPin: safePin,
  };

  const addrInput = document.getElementById("inline-edit-address");
  const offInput = document.getElementById("inline-edit-office");
  const pinInput = document.getElementById("inline-edit-pin");
  const clearOffBtn = document.getElementById("inline-edit-office-clear");
  const saveBtn = document.getElementById("inline-edit-save-btn");
  const saveBtnContent = document.getElementById(
    "inline-edit-save-btn-content",
  );

  addrInput.value = activeInlineEditRecord.oldAddress;
  offInput.value = activeInlineEditRecord.oldOffice;
  pinInput.value = activeInlineEditRecord.oldPin;

  if (offInput.value.length > 0) clearOffBtn.classList.remove("hidden");
  else clearOffBtn.classList.add("hidden");

  saveBtn.classList.remove("is-loading", "is-success");
  saveBtn.disabled = false;
  saveBtnContent.innerHTML = getInlineSaveBtnDefaultHTML();

  document.getElementById("edit-record-modal-overlay").classList.add("show");
  setTimeout(() => addrInput.focus(), 140);
}

function applyLocalRecordEdit(id, newAddress, newOffice, newPin) {
  upsertLocalPostOffice({
    id: id,
    Address: newAddress,
    Office: newOffice,
    Pin: newPin || null,
  });
}

async function saveInlineEditRecord() {
  if (!(await ensureOnline("Connect to internet to save changes."))) return;
  if (!activeInlineEditRecord) return;

  const newAddress = document
    .getElementById("inline-edit-address")
    .value.trim();
  const newOffice = document.getElementById("inline-edit-office").value.trim();
  const newPin = document.getElementById("inline-edit-pin").value.trim();

  if (!newAddress || !newOffice) {
    return showToast("⚠️ Address and Office are required.");
  }

  if (
    newAddress === activeInlineEditRecord.oldAddress &&
    newOffice === activeInlineEditRecord.oldOffice &&
    newPin === activeInlineEditRecord.oldPin
  ) {
    closeEditRecordModal();
    return showToast("No changes made.");
  }

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (!session || !session.user) {
    closeEditRecordModal();
    checkUserSession();
    return alert("Your session has expired. Please sign in again.");
  }

  const saveBtn = document.getElementById("inline-edit-save-btn");
  const saveBtnContent = document.getElementById(
    "inline-edit-save-btn-content",
  );
  const editedId = activeInlineEditRecord.id;

  saveBtn.classList.add("is-loading");
  saveBtn.disabled = true;
  saveBtnContent.innerHTML = `
    <div class="btn-spinner"></div>
    <span>Saving...</span>
  `;

  const reqData = {
    post_office_id: editedId,
    action_type: "EDIT",
    proposed_data: {
      Address: newAddress,
      Office: newOffice,
      Pin: newPin || null,
    },
    original_data: {
      Address: activeInlineEditRecord.oldAddress,
      Office: activeInlineEditRecord.oldOffice,
      Pin: activeInlineEditRecord.oldPin || null,
    },
    requested_by: session.user.id,
  };

  try {
    if (isCurrentUserAdmin) {
      const { error } = await supabaseClient.rpc("admin_direct_submit", {
        request_payloads: [reqData],
      });
      if (error) throw error;

      applyLocalRecordEdit(editedId, newAddress, newOffice, newPin);
      invalidateApprovalsCache();

      saveBtn.classList.remove("is-loading");
      saveBtn.classList.add("is-success");
      saveBtnContent.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline class="checkmark-path" points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Saved!</span>
      `;
      showToast("✨ Changes saved instantly!");

      setTimeout(() => {
        closeEditRecordModal();
        highlightUpdatedRecord(editedId);
      }, 650);
    } else {
      const { error } = await supabaseClient
        .from("edit_requests")
        .insert([reqData]);
      if (error) throw error;

      invalidateApprovalsCache();

      saveBtn.classList.remove("is-loading");
      saveBtn.classList.add("is-success");
      saveBtnContent.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline class="checkmark-path" points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Submitted!</span>
      `;
      showToast("✅ Edit request submitted for approval!");

      setTimeout(() => {
        closeEditRecordModal();
      }, 650);
    }
  } catch (err) {
    saveBtn.classList.remove("is-loading", "is-success");
    saveBtn.disabled = false;
    saveBtnContent.innerHTML = getInlineSaveBtnDefaultHTML();
    alert("Error saving edit: " + err.message);
  }
}

function highlightUpdatedRecord(id) {
  const safeId = CSS.escape(String(id));
  document.querySelectorAll(`[data-record-id="${safeId}"]`).forEach((el) => {
    el.classList.remove("record-updated-flash");
    void el.offsetWidth;
    el.classList.add("record-updated-flash");
    setTimeout(() => el.classList.remove("record-updated-flash"), 1200);
  });
}

document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    document
      .getElementById("edit-record-modal-overlay")
      ?.classList.contains("show")
  ) {
    closeEditRecordModal();
  }
});

// --- DELETE SINGLE RECORD ---
function deleteRecord(id) {
  let title = "Request Deletion?";
  let message =
    "This will submit a deletion request to the community for approval. Continue?";
  let btnText = "Request Delete";

  if (isCurrentUserAdmin) {
    title = "Admin: Force Delete?";
    message =
      "As an Admin, this deletion will be applied immediately without requiring community votes. Continue?";
    btnText = "Delete Instantly";
  }

  showCustomConfirm(title, message, btnText, async () => {
    if (!(await ensureOnline("Connect to internet to save changes."))) return;
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();

    if (!session || !session.user) {
      checkUserSession();
      return alert("Your session has expired. Please sign in again.");
    }

    const reqData = {
      post_office_id: id,
      action_type: "DELETE",
      proposed_data: {},
      requested_by: session.user.id,
    };

    if (isCurrentUserAdmin) {
      try {
        const { error } = await supabaseClient.rpc("admin_direct_submit", {
          request_payloads: [reqData],
        });
        if (error) throw error;
        removeLocalPostOffice(id);
        closeAllDirectoryActionTrays();
        showToast("🗑️ Admin: Record deleted instantly.");
      } catch (err) {
        alert("Error: " + err.message);
      }
    } else {
      const { error } = await supabaseClient
        .from("edit_requests")
        .insert(reqData);
      if (error) alert("Error: " + error.message);
      else showToast("📝 Deletion request submitted for approval.");
    }
    invalidateApprovalsCache();
  });
}

// --- RECORD HISTORY AUDIT MODAL ---
function closeHistoryModal() {
  document.getElementById("history-modal-overlay").classList.remove("show");
}

async function viewHistory(postOfficeId) {
  closeAllDirectoryActionTrays();
  const contentDiv = document.getElementById("history-modal-content");
  contentDiv.innerHTML = `<ul class="list-container"><li class="list-empty">Fetching records...</li></ul>`;
  document.getElementById("history-modal-overlay").classList.add("show");

  const showCachedHistoryFallback = () => {
    showOfflineToast("Showing cached history.");
    const savedHistory = localStorage.getItem(
      "dakmitra_history_" + postOfficeId,
    );
    contentDiv.innerHTML =
      savedHistory ||
      `<ul class="list-container"><li class="list-empty">📴 No internet connection. No cached history for this record.</li></ul>`;
  };

  if (!navigator.onLine) {
    showCachedHistoryFallback();
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("post_offices_history")
      .select("*")
      .eq("post_office_id", postOfficeId)
      .order("changed_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      contentDiv.innerHTML = `<ul class="list-container"><li class="list-empty">No history recorded for this entry yet.</li></ul>`;
      return;
    }

    // Collect all unique user IDs and resolve via SECURITY DEFINER RPC (RLS-safe)
    const userIdsToFetch = new Set();
    data.forEach((log) => {
      if (log.changed_by) userIdsToFetch.add(log.changed_by);
      if (log.approved_by) userIdsToFetch.add(log.approved_by);
    });

    const profilesMap = {};
    if (userIdsToFetch.size > 0) {
      const { data: profileData, error: profileErr } = await supabaseClient.rpc(
        "get_public_profiles_by_ids",
        {
          user_ids: Array.from(userIdsToFetch),
        },
      );
      if (profileErr) throw profileErr;
      if (Array.isArray(profileData)) {
        profileData.forEach((p) => {
          profilesMap[p.id] = p;
        });
      }
    }

    let html = `<div style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px;">`;

    data.forEach((log) => {
      const dateStr = new Date(log.changed_at).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });

      const reqProfile = log.changed_by ? profilesMap[log.changed_by] : null;
      const appProfile = log.approved_by ? profilesMap[log.approved_by] : null;

      const requesterName = reqProfile?.name || "System / Direct Upload";
      const requesterId = reqProfile?.employee_id || "No ID";
      const requesterLink = renderUserProfileLink(
        log.changed_by,
        requesterName,
      );

      let approverHtml = "";
      if (appProfile) {
        const approverId = appProfile.employee_id || "No ID";
        const approverLink = renderUserProfileLink(
          log.approved_by,
          appProfile.name,
        );
        if (appProfile.is_admin) {
          approverHtml = `
            <div style="font-size: 12px; color: var(--success-text); margin-top: 4px;">
              ✅ <b>Admin Approved</b> (Approved by: ${approverLink} - ${escapeHTML(
                approverId,
              )})
            </div>`;
        } else {
          approverHtml = `
            <div style="font-size: 12px; color: var(--primary); margin-top: 4px;">
              👥 <b>Community Approved</b> (Final vote by: ${approverLink} - ${escapeHTML(
                approverId,
              )})
            </div>`;
        }
      }

      let actionBadge = "";
      let changesHtml = "";

      const formatField = (
        oldVal,
        newVal,
        prefix = "",
        fallback = "N/A",
        linkTargets = null,
      ) => {
        const rawOld =
          oldVal === undefined || oldVal === null ? "" : String(oldVal).trim();
        const rawNew =
          newVal === undefined || newVal === null ? "" : String(newVal).trim();
        const sOld = rawOld === "" ? fallback : rawOld;
        const sNew = rawNew === "" ? fallback : rawNew;

        const oldHtml = linkTargets
          ? renderDirectoryLink(
              sOld,
              linkTargets.oldOffice,
              linkTargets.oldPin,
              "is-muted",
            )
          : escapeHTML(sOld);

        const newHtml = linkTargets
          ? renderDirectoryLink(sNew, linkTargets.newOffice, linkTargets.newPin)
          : escapeHTML(sNew);

        if (sOld !== sNew) {
          return `<div style="margin-bottom: 4px;">${prefix} <span style="text-decoration:line-through; color:var(--text-light);">${oldHtml}</span> ➡️ <b>${newHtml}</b></div>`;
        }
        return `<div style="margin-bottom: 4px;">${prefix} ${newHtml}</div>`;
      };

      if (log.action === "INSERT") {
        actionBadge = `<span class="badge" style="background:#dcfce7;color:#166534; padding: 4px 8px; font-size: 12px;">➕ CREATED</span>`;
        const newOff = log.new_data?.Office || log.new_data?.office || "";
        const newPin = log.new_data?.Pin ?? log.new_data?.pin ?? "";
        changesHtml = `
          <div style="margin-bottom: 4px;"><b>${escapeHTML(
            log.new_data?.Address,
          )}</b></div>
          <div style="margin-bottom: 4px;">🏢 ${renderDirectoryLink(
            newOff || "Unknown Office",
            newOff,
            newPin,
          )}</div>
          <div>📍 ${renderDirectoryLink(newPin || "N/A", newOff, newPin)}</div>
        `;
      } else if (log.action === "UPDATE") {
        actionBadge = `<span class="badge" style="background:#fef9c3;color:#854d0e; padding: 4px 8px; font-size: 12px;">✏️ EDITED</span>`;
        const oldD = log.old_data || {};
        const newD = log.new_data || {};
        const oldOff = oldD.Office || oldD.office || "";
        const newOff = newD.Office || newD.office || "";
        const oldPin = oldD.Pin ?? oldD.pin ?? "";
        const newPin = newD.Pin ?? newD.pin ?? "";

        const linkTargets = {
          oldOffice: oldOff,
          newOffice: newOff,
          oldPin: oldPin,
          newPin: newPin,
        };

        changesHtml =
          formatField(
            oldD.Address || oldD.address,
            newD.Address || newD.address,
            "📮",
            "Unknown Address",
          ) +
          formatField(oldOff, newOff, "🏢", "Unknown Office", linkTargets) +
          formatField(oldPin, newPin, "📍", "N/A", linkTargets);

        if (oldD.is_deleted !== newD.is_deleted) {
          changesHtml += `<div style="margin-top: 8px;"><b>Status:</b> ${
            newD.is_deleted ? "Marked as Deleted 🗑️" : "Restored ♻️"
          }</div>`;
        }
      } else if (log.action === "DELETE") {
        actionBadge = `<span class="badge" style="background:#fee2e2;color:#991b1b; padding: 4px 8px; font-size: 12px;">🗑️ DELETED</span>`;
        const oldOff = log.old_data?.Office || log.old_data?.office || "";
        const oldPin = log.old_data?.Pin ?? log.old_data?.pin ?? "";
        changesHtml = `
          <div style="text-decoration: line-through; color: var(--text-light); margin-bottom: 4px;"><b>${escapeHTML(
            log.old_data?.Address,
          )}</b></div>
          <div style="text-decoration: line-through; color: var(--text-light); margin-bottom: 4px;">🏢 ${renderDirectoryLink(
            oldOff || "Unknown Office",
            oldOff,
            oldPin,
            "is-muted",
          )}</div>
          <div style="text-decoration: line-through; color: var(--text-light);">📍 ${renderDirectoryLink(
            oldPin || "N/A",
            oldOff,
            oldPin,
            "is-muted",
          )}</div>
          <div style="margin-top: 8px; color: #991b1b; font-weight: 600;">Record was permanently deleted.</div>
        `;
      }

      const isBulkExcelUpload =
        log.action === "INSERT" && log.new_data?.upload_method === "excel_bulk";

      const attributionHtml = isBulkExcelUpload
        ? `<div style="font-size: 12px; color: var(--success-text); margin-top: 12px; padding-top: 8px; border-top: 1px dashed var(--border);">
             📊 <b>Added via Excel Bulk Upload</b> by Admin ${requesterLink} (${escapeHTML(
               requesterId,
             )})
           </div>`
        : `<div style="font-size: 12px; color: var(--text-light); margin-top: 12px; padding-top: 8px; border-top: 1px dashed var(--border);">
             <div>👤 Requested by: ${requesterLink} (${escapeHTML(
               requesterId,
             )})</div>
             ${approverHtml}
           </div>`;

      html += `
        <div style="background: var(--btn-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            ${actionBadge}
            <span style="font-size: 12px; color: var(--text-light); font-weight: 600;">${dateStr}</span>
          </div>
          <div style="font-size: 14px; margin-bottom: 8px; color: var(--text); line-height: 1.4;">
            ${changesHtml}
          </div>
          ${attributionHtml}
        </div>
      `;
    });

    html += `</div>`;
    contentDiv.innerHTML = html;
    localStorage.setItem("dakmitra_history_" + postOfficeId, html);
  } catch (err) {
    if (isNetworkError(err)) {
      showCachedHistoryFallback();
      return;
    }
    contentDiv.innerHTML = `<ul class="list-container"><li class="list-empty" style="color: red;">Error: ${escapeHTML(
      err.message,
    )}</li></ul>`;
  }
}

// --- MANUAL ENTRY ROWS ---
function getManualEntryRowHTML(showLabels = false) {
  return `
    <div class="manual-entry-row">
      <div class="input-group" style="flex: 1; margin-bottom: 0; text-align: left;">
        ${showLabels ? "<label>Address</label>" : ""}
        <input type="search" class="manual-address" placeholder="Address" autocomplete="off" />
      </div>
      <div class="input-group" style="flex: 1; margin-bottom: 0; text-align: left;">
        ${showLabels ? "<label>Office</label>" : ""}
        <div class="autocomplete-wrapper">
          <input type="search" class="manual-office" placeholder="Search & Select Office..." autocomplete="off" oninput="handleOfficeInput(this)" onfocus="handleOfficeInput(this)" onblur="scheduleCloseDropdowns(200)" style="padding-right: 40px; width: 100%;" />
          <button type="button" class="clear-btn hidden" onpointerdown="event.preventDefault()" style="position: absolute; right: 6px; top: 6px; width: 36px; height: 36px; padding: 0; margin: 0; z-index: 2;" onclick="clearOfficeInput(this)" title="Clear Office">✕</button>
          <div class="autocomplete-dropdown"></div>
        </div>
      </div>
      <div class="input-group" style="flex: 0.7; margin-bottom: 0; text-align: left;">
        ${showLabels ? "<label>Pin</label>" : ""}
        <input type="search" inputmode="numeric" class="manual-Pin" placeholder="e.g. 231305" autocomplete="off" />
      </div>
      <button type="button" class="btn" style="width: auto; background: var(--border); color: var(--text); padding: 14px;" onclick="this.parentElement.remove()" title="Remove row">✕</button>
    </div>
  `;
}

(function initManualEntries() {
  const container = document.getElementById("manual-entries-container");
  if (container) container.innerHTML = getManualEntryRowHTML(true);
})();

function addInputRow() {
  document
    .getElementById("manual-entries-container")
    .insertAdjacentHTML("beforeend", getManualEntryRowHTML(false));
}

async function submitMultipleRecords() {
  if (!(await ensureOnline("Connect to internet to save changes."))) return;
  const rows = document.querySelectorAll(".manual-entry-row");
  const requests = [];
  const adminDirectEdits = [];

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (!session || !session.user) {
    checkUserSession();
    return alert("Your session has expired. Please sign in again.");
  }

  rows.forEach((row) => {
    const address = row.querySelector(".manual-address").value.trim();
    const office = row.querySelector(".manual-office").value.trim();
    const Pin = row.querySelector(".manual-Pin").value.trim();
    const editId = row.getAttribute("data-edit-id");

    if (address && office) {
      if (editId) {
        const oldAddr = row.getAttribute("data-old-addr");
        const oldOff = row.getAttribute("data-old-off");
        const oldPin = row.getAttribute("data-old-pin");

        const reqData = {
          post_office_id: editId,
          action_type: "EDIT",
          proposed_data: {
            Address: address,
            Office: office,
            Pin: Pin || null,
          },
          original_data: {
            Address: oldAddr,
            Office: oldOff,
            Pin: oldPin || null,
          },
          requested_by: session.user.id,
        };

        if (isCurrentUserAdmin) adminDirectEdits.push(reqData);
        else requests.push(reqData);
      } else {
        const reqData = {
          action_type: "ADD",
          proposed_data: {
            Address: address,
            Office: office,
            Pin: Pin || null,
          },
          requested_by: session.user.id,
        };

        if (isCurrentUserAdmin) adminDirectEdits.push(reqData);
        else requests.push(reqData);
      }
    }
  });

  if (requests.length === 0 && adminDirectEdits.length === 0)
    return showToast("Please fill in at least one complete row.");

  const btn = document.getElementById("submit-multiple-btn");
  setButtonState(btn, "loading", "Submitting...");

  try {
    if (isCurrentUserAdmin) {
      const { error } = await supabaseClient.rpc("admin_direct_submit", {
        request_payloads: adminDirectEdits,
      });
      if (error) throw error;
      showToast("✅ Admin: Changes applied instantly!");
      await fetchAllPostOffices(true);
    } else {
      const { error } = await supabaseClient
        .from("edit_requests")
        .insert(requests);
      if (error) throw error;
      showToast("✅ Change requests submitted for approval!");
    }

    invalidateApprovalsCache();
    document.getElementById("manual-entries-container").innerHTML =
      getManualEntryRowHTML(true);
    switchDashboardView("search");
  } catch (err) {
    alert("Error submitting request: " + err.message);
  }

  setButtonState(btn, "idle");
}

// --- BULK SAME OFFICE UPLOAD TAB ---
let bulkReturnToDirectory = false;

function switchManualUploadTab(tab) {
  const rowsTab = document.getElementById("tab-manual-rows");
  const bulkTab = document.getElementById("tab-manual-bulk");
  const rowsPanel = document.getElementById("manual-panel-rows");
  const bulkPanel = document.getElementById("manual-panel-bulk");

  if (tab === "bulk") {
    rowsTab?.classList.remove("active");
    bulkTab?.classList.add("active");
    rowsPanel?.classList.add("hidden");
    bulkPanel?.classList.remove("hidden");
  } else {
    bulkTab?.classList.remove("active");
    rowsTab?.classList.add("active");
    bulkPanel?.classList.add("hidden");
    rowsPanel?.classList.remove("hidden");
  }
}

function selectBulkOffice(officeName, pinNumber) {
  const offInput = document.getElementById("bulk-office-input");
  const pinInput = document.getElementById("bulk-pin-input");
  const clearBtn = document.getElementById("bulk-office-clear");

  offInput.value = officeName;
  if (pinInput) pinInput.value = pinNumber;
  clearBtn?.classList.remove("hidden");

  closeAllDropdowns();
  updateBulkAddressPreview();
  document.getElementById("bulk-addresses-input")?.focus();
}

function clearBulkOffice() {
  const offInput = document.getElementById("bulk-office-input");
  const pinInput = document.getElementById("bulk-pin-input");
  if (offInput) offInput.value = "";
  if (pinInput) pinInput.value = "";
  offInput?.focus();
  handleBulkOfficeInput(offInput);
}

function parseBulkAddresses() {
  const raw = document.getElementById("bulk-addresses-input")?.value || "";
  const seen = new Set();
  const list = [];

  raw
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

function updateBulkAddressPreview() {
  const addresses = parseBulkAddresses();
  const box = document.getElementById("bulk-preview-box");
  const countEl = document.getElementById("bulk-preview-count");
  const chipsEl = document.getElementById("bulk-preview-chips");
  const submitBtn = document.getElementById("submit-bulk-btn");
  const officeVal = (document.getElementById("bulk-office-input")?.value || "")
    .trim()
    .toLowerCase();

  if (addresses.length === 0) {
    box?.classList.add("hidden");
    if (submitBtn) submitBtn.textContent = "Submit All Addresses";
    return;
  }

  const existingExact = new Map();
  const existingPhonetic = new Map();

  if (officeVal && cachedPostOffices) {
    cachedPostOffices.forEach((r) => {
      if (
        String(r.Office || "")
          .trim()
          .toLowerCase() === officeVal
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
  chipsEl.innerHTML = addresses
    .map((addr, idx) => {
      const matchedName =
        existingExact.get(addr.toLowerCase()) ||
        existingPhonetic.get(postalPhoneticKey(addr)) ||
        null;
      const isDup = Boolean(matchedName);
      if (isDup) dupCount++;
      return `
        <span class="bulk-chip ${isDup ? "is-duplicate" : ""}" title="${
          isDup ? `Similar to existing: ${escapeHTML(matchedName)}` : ""
        }">
          ${isDup ? "⚠️ " : ""}${escapeHTML(addr)}
          <button type="button" onclick="removeBulkAddressAt(${idx})" title="Remove">✕</button>
        </span>`;
    })
    .join("");

  countEl.textContent = `${addresses.length} ${
    addresses.length === 1 ? "address" : "addresses"
  } ready${dupCount > 0 ? ` (${dupCount} already in DB)` : ""}`;

  if (submitBtn) {
    submitBtn.textContent = `Submit ${addresses.length} ${
      addresses.length === 1 ? "Address" : "Addresses"
    }`;
  }
  box?.classList.remove("hidden");
}

function removeBulkAddressAt(indexToRemove) {
  const addresses = parseBulkAddresses();
  addresses.splice(indexToRemove, 1);
  const textarea = document.getElementById("bulk-addresses-input");
  if (textarea) textarea.value = addresses.join("\n");
  updateBulkAddressPreview();
}

function clearBulkAddresses() {
  const textarea = document.getElementById("bulk-addresses-input");
  if (textarea) textarea.value = "";
  updateBulkAddressPreview();
}

async function submitBulkSameOffice() {
  if (!(await ensureOnline("Connect to internet to save changes."))) return;

  const office = document.getElementById("bulk-office-input")?.value.trim();
  const pin = document.getElementById("bulk-pin-input")?.value.trim();
  const addresses = parseBulkAddresses();

  if (!office) return showToast("⚠️ Please select or enter an Office first.");
  if (addresses.length === 0) {
    return showToast("⚠️ Please enter at least one address.");
  }

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (!session || !session.user) {
    checkUserSession();
    return alert("Your session has expired. Please sign in again.");
  }

  const payloads = addresses.map((addr) => ({
    action_type: "ADD",
    proposed_data: {
      Address: addr,
      Office: office,
      Pin: pin || null,
    },
    requested_by: session.user.id,
  }));

  const btn = document.getElementById("submit-bulk-btn");
  setButtonState(btn, "loading", `Submitting ${addresses.length}...`);

  try {
    if (isCurrentUserAdmin) {
      const { error } = await supabaseClient.rpc("admin_direct_submit", {
        request_payloads: payloads,
      });
      if (error) throw error;
      showToast(`✅ Admin: Added ${addresses.length} addresses to ${office}!`);
      await fetchAllPostOffices(true);
    } else {
      const { error } = await supabaseClient
        .from("edit_requests")
        .insert(payloads);
      if (error) throw error;
      showToast(`✅ ${addresses.length} addresses submitted for approval!`);
    }

    invalidateApprovalsCache();
    clearBulkAddresses();

    if (bulkReturnToDirectory) {
      bulkReturnToDirectory = false;
      switchDashboardView("directory");
    } else {
      switchDashboardView("search");
    }
  } catch (err) {
    alert("Error submitting addresses: " + err.message);
  } finally {
    setButtonState(btn, "idle");
    updateBulkAddressPreview();
  }
}

// --- OFFICE AUTOCOMPLETE DROPDOWNS (INLINE EDIT, MANUAL, BULK & SEARCH FILTER) ---
function buildOfficeOptionHTML(office, pin, mode) {
  return `<div class="autocomplete-item" onmousedown="pickOfficeOption(this, '${escapeForOnclick(
    office,
  )}', '${escapeForOnclick(pin)}', '${mode}')">
    <div class="ac-item-main">
      <span class="ac-item-icon">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
          <path d="M9 22v-4h6v4"></path>
          <path d="M8 6h.01"></path><path d="M16 6h.01"></path>
          <path d="M12 6h.01"></path><path d="M12 10h.01"></path>
        </svg>
      </span>
      <span class="ac-item-name">${escapeHTML(office)}</span>
    </div>
    ${pin ? `<span class="ac-item-pin">${escapeHTML(pin)}</span>` : ""}
  </div>`;
}

function pickOfficeOption(itemEl, office, pin, mode) {
  if (mode === "inline") {
    const input = document.getElementById("inline-edit-office");
    const pinInput = document.getElementById("inline-edit-pin");
    const clearBtn = document.getElementById("inline-edit-office-clear");
    if (input) input.value = office;
    if (pinInput && pin) pinInput.value = pin;
    if (clearBtn) clearBtn.classList.remove("hidden");
  } else if (mode === "manual") {
    const wrapper = itemEl.closest(".autocomplete-wrapper");
    const row = wrapper?.closest(".manual-entry-row");
    const input = wrapper?.querySelector(".manual-office");
    const clearBtn = wrapper?.querySelector(".clear-btn");
    const pinInput = row?.querySelector(".manual-Pin");
    if (input) input.value = office;
    if (pinInput && pin) pinInput.value = pin;
    if (clearBtn) clearBtn.classList.remove("hidden");
  } else if (mode === "bulk") {
    const input = document.getElementById("bulk-office-input");
    const pinInput = document.getElementById("bulk-pin-input");
    const clearBtn = document.getElementById("bulk-office-clear");
    if (input) input.value = office;
    if (pinInput && pin) pinInput.value = pin;
    if (clearBtn) clearBtn.classList.remove("hidden");
    updateBulkAddressPreview();
  } else if (mode === "search-filter") {
    selectSearchOfficeFilter(office);
    return;
  } else if (mode === "dir-filter") {
    selectDirectoryOfficeFilter(office);
    return;
  }
  closeAllDropdowns();
}

function getOfficePinMap() {
  const officeMap = new Map();
  if (cachedPostOffices) {
    cachedPostOffices.forEach((row) => {
      if (row.Office && !officeMap.has(row.Office)) {
        officeMap.set(row.Office, row.Pin || "");
      }
    });
  }
  return officeMap;
}

function handleInlineEditOfficeInput(inputElement) {
  cancelCloseDropdowns();
  const val = inputElement.value;
  const dropdown = document.getElementById("inline-edit-office-dropdown");
  const clearBtn = document.getElementById("inline-edit-office-clear");
  const pinInput = document.getElementById("inline-edit-pin");

  if (val.length > 0) clearBtn.classList.remove("hidden");
  else clearBtn.classList.add("hidden");

  const officeMap = getOfficePinMap();
  let matchedOffices = Array.from(officeMap.keys());
  if (val) {
    const lowerVal = val.toLowerCase();
    matchedOffices = matchedOffices.filter((o) =>
      o.toLowerCase().includes(lowerVal),
    );
  }
  matchedOffices.sort();

  if (matchedOffices.length === 0) {
    dropdown.classList.remove("show");
  } else {
    dropdown.innerHTML = matchedOffices
      .slice(0, 10)
      .map((office) =>
        buildOfficeOptionHTML(office, officeMap.get(office), "inline"),
      )
      .join("");
    dropdown.classList.add("show");
  }

  if (pinInput) {
    if (val.trim() === "") {
      pinInput.value = "";
    } else {
      const exactMatch = Array.from(officeMap.keys()).find(
        (k) => k.toLowerCase() === val.toLowerCase(),
      );
      if (exactMatch) pinInput.value = officeMap.get(exactMatch);
    }
  }
}

function clearInlineEditOffice() {
  const offInput = document.getElementById("inline-edit-office");
  offInput.value = "";
  offInput.focus();
  handleInlineEditOfficeInput(offInput);
}

function handleOfficeInput(inputElement) {
  cancelCloseDropdowns();
  const val = inputElement.value;
  const wrapper = inputElement.closest(".autocomplete-wrapper");
  const dropdown = wrapper.querySelector(".autocomplete-dropdown");
  const clearBtn = wrapper.querySelector(".clear-btn");
  const pinInput = wrapper
    .closest(".manual-entry-row")
    .querySelector(".manual-Pin");

  if (val.length > 0) clearBtn.classList.remove("hidden");
  else clearBtn.classList.add("hidden");

  const officeMap = getOfficePinMap();
  let matchedOffices = Array.from(officeMap.keys());
  if (val) {
    const lowerVal = val.toLowerCase();
    matchedOffices = matchedOffices.filter((o) =>
      o.toLowerCase().includes(lowerVal),
    );
  }
  matchedOffices.sort();

  if (matchedOffices.length === 0) {
    dropdown.classList.remove("show");
  } else {
    dropdown.innerHTML = matchedOffices
      .slice(0, 10)
      .map((office) =>
        buildOfficeOptionHTML(office, officeMap.get(office), "manual"),
      )
      .join("");
    dropdown.classList.add("show");
  }

  if (pinInput) {
    if (val.trim() === "") {
      pinInput.value = "";
    } else {
      const exactMatch = Array.from(officeMap.keys()).find(
        (k) => k.toLowerCase() === val.toLowerCase(),
      );
      if (exactMatch) pinInput.value = officeMap.get(exactMatch);
    }
  }
}

function clearOfficeInput(btnElement) {
  const wrapper = btnElement.closest(".autocomplete-wrapper");
  const input = wrapper.querySelector(".manual-office");

  input.value = "";
  input.focus();
  handleOfficeInput(input);
}

function handleBulkOfficeInput(inputElement) {
  cancelCloseDropdowns();
  const val = inputElement.value;
  const dropdown = document.getElementById("bulk-office-dropdown");
  const clearBtn = document.getElementById("bulk-office-clear");
  const pinInput = document.getElementById("bulk-pin-input");

  if (clearBtn) clearBtn.classList.toggle("hidden", val.length === 0);

  const officeMap = getOfficePinMap();
  let matchedOffices = Array.from(officeMap.keys());
  if (val) {
    const lowerVal = val.toLowerCase();
    matchedOffices = matchedOffices.filter((o) =>
      o.toLowerCase().includes(lowerVal),
    );
  }
  matchedOffices.sort();

  if (matchedOffices.length === 0) {
    dropdown.classList.remove("show");
  } else {
    dropdown.innerHTML = matchedOffices
      .slice(0, 10)
      .map((office) =>
        buildOfficeOptionHTML(office, officeMap.get(office), "bulk"),
      )
      .join("");
    dropdown.classList.add("show");
  }

  if (pinInput) {
    if (val.trim() === "") {
      pinInput.value = "";
    } else {
      const exactMatch = Array.from(officeMap.keys()).find(
        (k) => k.toLowerCase() === val.toLowerCase(),
      );
      if (exactMatch) pinInput.value = officeMap.get(exactMatch);
    }
  }

  updateBulkAddressPreview();
}

function handleSearchOfficeFilterInput(inputElement) {
  cancelCloseDropdowns();
  const val = inputElement.value;
  const dropdown = document.getElementById("filter-office-dropdown");
  if (!dropdown) return;

  toggleClearBtn("filter-office", "clear-office-btn");
  triggerSearch();

  const officeMap = getOfficePinMap();
  let matchedOffices = Array.from(officeMap.keys());
  if (val) {
    const lowerVal = val.toLowerCase();
    matchedOffices = matchedOffices.filter((o) =>
      o.toLowerCase().includes(lowerVal),
    );
  }
  matchedOffices.sort();

  if (matchedOffices.length === 0) {
    dropdown.classList.remove("show");
  } else {
    dropdown.innerHTML = matchedOffices
      .slice(0, 10)
      .map((office) =>
        buildOfficeOptionHTML(office, officeMap.get(office), "search-filter"),
      )
      .join("");
    dropdown.classList.add("show");
  }
}

function selectSearchOfficeFilter(officeName) {
  const input = document.getElementById("filter-office");
  if (input) input.value = officeName;

  toggleClearBtn("filter-office", "clear-office-btn");
  closeAllDropdowns();
  document.getElementById("advanced-filters-panel")?.classList.add("hidden");

  triggerSearch();

  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.focus();
}

function handleDirectoryOfficeFilterInput(inputElement) {
  cancelCloseDropdowns();
  const val = inputElement.value;
  const dropdown = document.getElementById("dir-filter-office-dropdown");
  if (!dropdown) return;

  toggleClearBtn("dir-filter-office", "clear-dir-office-btn");
  filterDirectory();

  const officeMap = getOfficePinMap();
  let matchedOffices = Array.from(officeMap.keys());
  if (val) {
    const lowerVal = val.toLowerCase();
    matchedOffices = matchedOffices.filter((o) =>
      o.toLowerCase().includes(lowerVal),
    );
  }
  matchedOffices.sort();

  if (matchedOffices.length === 0) {
    dropdown.classList.remove("show");
  } else {
    dropdown.innerHTML = matchedOffices
      .slice(0, 10)
      .map((office) =>
        buildOfficeOptionHTML(office, officeMap.get(office), "dir-filter"),
      )
      .join("");
    dropdown.classList.add("show");
  }
}

function selectDirectoryOfficeFilter(officeName) {
  const input = document.getElementById("dir-filter-office");
  if (input) input.value = officeName;

  toggleClearBtn("dir-filter-office", "clear-dir-office-btn");
  closeAllDropdowns();
  document
    .getElementById("dir-advanced-filters-panel")
    ?.classList.add("hidden");

  filterDirectory();

  const searchInput = document.getElementById("directory-filter-input");
  if (searchInput) searchInput.focus();
}

// --- EXCEL BULK UPLOAD & TEMPLATE ---
async function uploadExcel() {
  if (!(await ensureOnline("Connect to internet to save changes."))) return;
  await ensureXLSXLoaded();
  const fileInput = document.getElementById("excel-file");
  const file = fileInput.files[0];
  const uploadBtn = document.getElementById("upload-excel-btn");
  if (!file) return alert("Please select an Excel file first.");

  setButtonState(uploadBtn, "loading", "Uploading...");

  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const jsonData = XLSX.utils.sheet_to_json(
        workbook.Sheets[workbook.SheetNames[0]],
      );
      if (jsonData.length === 0) {
        alert("The Excel file is empty.");
        setButtonState(uploadBtn, "idle");
        return;
      }

      const {
        data: { session },
      } = await supabaseClient.auth.getSession();

      if (!session || !session.user) {
        setButtonState(uploadBtn, "idle");
        checkUserSession();
        return alert("Your session has expired. Please sign in again.");
      }

      const formattedData = jsonData.map((row) => {
        const rawPrio = String(row["Priority"] ?? "")
          .trim()
          .toLowerCase();
        const priorityVal =
          rawPrio === "1" ||
          rawPrio === "high" ||
          rawPrio === "frequent" ||
          rawPrio === "yes" ||
          rawPrio === "true"
            ? 1
            : 0;

        return {
          Address: row["Address"],
          Office: row["Office"],
          Pin: row["Pin"] ? parseInt(row["Pin"], 10) || null : null,
          priority: priorityVal,
          user_id: session.user.id,
          last_modified_by: session.user.id,
          last_approved_by: session.user.id,
          upload_method: "excel_bulk",
          is_deleted: false,
        };
      });

      const { error } = await supabaseClient
        .from("post_offices")
        .insert(formattedData);
      if (error) {
        alert("Upload Error: " + error.message);
        setButtonState(uploadBtn, "idle");
      } else {
        setButtonState(uploadBtn, "success", "Uploaded!");
        showToast("✅ Excel data uploaded successfully!");
        fileInput.value = "";
        await fetchAllPostOffices(true);
        setTimeout(() => {
          setButtonState(uploadBtn, "idle");
        }, 2000);
      }
    } catch (err) {
      console.error(err);
      alert("Error reading Excel file.");
      setButtonState(uploadBtn, "idle");
    }
  };
  reader.readAsArrayBuffer(file);
}

async function downloadSampleExcel() {
  await ensureXLSXLoaded();
  const wb = XLSX.utils.book_new();
  const sampleData = [
    { Address: "Gothani BO", Office: "Chopan SO", Pin: "231205" },
    { Address: "Biraura BO", Office: "Bijaipur SO", Pin: "231305" },
  ];
  const ws = XLSX.utils.json_to_sheet(sampleData);
  ws["!cols"] = [{ wch: 20 }, { wch: 20 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, ws, "DakMitra Template");
  XLSX.writeFile(wb, "DakMitra_Sample_Template.xlsx");
  showToast("📥 Sample Excel downloaded!");
}

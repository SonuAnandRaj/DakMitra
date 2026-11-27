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
    "inline-edit-save-btn-content"
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
  if (isSelfParentOfficeRow(newAddress, newOffice)) {
    return showToast(
      "ℹ️ Parent HO/SO is already shown as the office header. Tap 👥 Staff there instead."
    );
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
    "inline-edit-save-btn-content"
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
      "dakmitra_history_" + postOfficeId
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
    await ensureSupabaseReady();
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
        }
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
        requesterName
      );

      let approverHtml = "";
      if (appProfile) {
        const approverId = appProfile.employee_id || "No ID";
        const approverLink = renderUserProfileLink(
          log.approved_by,
          appProfile.name
        );
        if (appProfile.is_admin) {
          approverHtml = `
            <div style="font-size: 12px; color: var(--success-text); margin-top: 4px;">
              ✅ <b>Admin Approved</b> (Approved by: ${approverLink} - ${escapeHTML(
            approverId
          )})
            </div>`;
        } else {
          approverHtml = `
            <div style="font-size: 12px; color: var(--primary); margin-top: 4px;">
              👥 <b>Community Approved</b> (Final vote by: ${approverLink} - ${escapeHTML(
            approverId
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
        linkTargets = null
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
              "is-muted"
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
            log.new_data?.Address
          )}</b></div>
          <div style="margin-bottom: 4px;">🏢 ${renderDirectoryLink(
            newOff || "Unknown Office",
            newOff,
            newPin
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
            "Unknown Address"
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
            log.old_data?.Address
          )}</b></div>
          <div style="text-decoration: line-through; color: var(--text-light); margin-bottom: 4px;">🏢 ${renderDirectoryLink(
            oldOff || "Unknown Office",
            oldOff,
            oldPin,
            "is-muted"
          )}</div>
          <div style="text-decoration: line-through; color: var(--text-light);">📍 ${renderDirectoryLink(
            oldPin || "N/A",
            oldOff,
            oldPin,
            "is-muted"
          )}</div>
          <div style="margin-top: 8px; color: #991b1b; font-weight: 600;">Record was permanently deleted.</div>
        `;
      }

      const isBulkExcelUpload =
        log.action === "INSERT" && log.new_data?.upload_method === "excel_bulk";

      const attributionHtml = isBulkExcelUpload
        ? `<div style="font-size: 12px; color: var(--success-text); margin-top: 12px; padding-top: 8px; border-top: 1px dashed var(--border);">
             📊 <b>Added via Excel Bulk Upload</b> by Admin ${requesterLink} (${escapeHTML(
            requesterId
          )})
           </div>`
        : `<div style="font-size: 12px; color: var(--text-light); margin-top: 12px; padding-top: 8px; border-top: 1px dashed var(--border);">
             <div>👤 Requested by: ${requesterLink} (${escapeHTML(
            requesterId
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
      err.message
    )}</li></ul>`;
  }
}

// --- MANUAL ENTRY ROWS ---
function getManualEntryRowHTML(rowNumber = 1) {
  return `
    <div class="manual-entry-row">
      <div class="manual-row-head">
        <span class="manual-row-badge">Record #${rowNumber}</span>
        <button
          type="button"
          class="dm-close-btn"
          style="width: 28px; height: 28px; font-size: 12px;"
          onclick="removeManualEntryRow(this)"
          title="Remove row"
          aria-label="Remove row"
        >✕</button>
      </div>

      <div class="manual-row-grid">
        <div class="input-group" style="text-align: left;">
          <label>Address</label>
          <div class="profile-input-wrapper">
            <svg class="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <input
              type="search"
              class="manual-address"
              placeholder="Village, Mohalla, or BO"
              autocomplete="off"
              oninput="updateManualSubmitCount()"
            />
          </div>
        </div>

        <div class="input-group" style="text-align: left;">
          <label>Delivery Office</label>
          <div class="autocomplete-wrapper">
            <div class="profile-input-wrapper">
              <svg class="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                <path d="M9 22v-4h6v4"></path>
                <path d="M8 6h.01"></path>
                <path d="M16 6h.01"></path>
                <path d="M12 6h.01"></path>
                <path d="M12 10h.01"></path>
              </svg>
              <input
                type="search"
                class="manual-office"
                placeholder="Search & Select Office..."
                autocomplete="off"
                oninput="handleOfficeInput(this)"
                onfocus="handleOfficeInput(this)"
                onblur="scheduleCloseDropdowns(200)"
                style="padding-right: 40px; width: 100%;"
              />
              <button
                type="button"
                class="clear-btn hidden"
                onpointerdown="event.preventDefault()"
                style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 34px; height: 34px; padding: 0; margin: 0; z-index: 2;"
                onclick="clearOfficeInput(this)"
                title="Clear Office"
              >✕</button>
            </div>
            <div class="autocomplete-dropdown"></div>
          </div>
        </div>

        <div class="input-group" style="text-align: left;">
          <label>PIN Code</label>
          <div class="profile-input-wrapper">
            <svg class="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <input
              type="search"
              inputmode="numeric"
              class="manual-Pin"
              placeholder="e.g. 231305"
              autocomplete="off"
            />
          </div>
        </div>
      </div>
    </div>
  `;
}

function renumberManualRows() {
  const rows = document.querySelectorAll(
    "#manual-entries-container .manual-entry-row"
  );
  rows.forEach((row, idx) => {
    const badge = row.querySelector(".manual-row-badge");
    if (badge) badge.textContent = `Record #${idx + 1}`;
  });
  updateManualSubmitCount();
}

function removeManualEntryRow(btnEl) {
  const container = document.getElementById("manual-entries-container");
  const row = btnEl?.closest(".manual-entry-row");
  if (!container || !row) return;

  const allRows = container.querySelectorAll(".manual-entry-row");
  if (allRows.length <= 1) {
    const addr = row.querySelector(".manual-address");
    const off = row.querySelector(".manual-office");
    const pin = row.querySelector(".manual-Pin");
    const clearBtn = row.querySelector(".clear-btn");
    if (addr) addr.value = "";
    if (off) off.value = "";
    if (pin) pin.value = "";
    if (clearBtn) clearBtn.classList.add("hidden");
    updateManualSubmitCount();
    showToast("🧹 Row cleared", "info");
    return;
  }

  row.remove();
  renumberManualRows();
}

function updateManualSubmitCount() {
  const btn = document.getElementById("submit-multiple-btn");
  if (
    !btn ||
    btn.classList.contains("is-loading") ||
    btn.classList.contains("is-success")
  ) {
    return;
  }

  const rows = document.querySelectorAll(
    "#manual-entries-container .manual-entry-row"
  );
  let readyCount = 0;
  rows.forEach((row) => {
    const a = row.querySelector(".manual-address")?.value.trim();
    const o = row.querySelector(".manual-office")?.value.trim();
    if (a && o) readyCount++;
  });

  const actionVerb = isCurrentUserAdmin ? "Add" : "Submit";
  btn.textContent =
    readyCount > 0
      ? `${actionVerb} ${readyCount} ${readyCount === 1 ? "Record" : "Records"}`
      : `${actionVerb} All`;
}

(function initManualEntries() {
  const container = document.getElementById("manual-entries-container");
  if (container) {
    container.innerHTML = getManualEntryRowHTML(1);
    updateManualSubmitCount();
  }
})();

function addInputRow() {
  const container = document.getElementById("manual-entries-container");
  if (!container) return;
  const nextNum = container.querySelectorAll(".manual-entry-row").length + 1;
  container.insertAdjacentHTML("beforeend", getManualEntryRowHTML(nextNum));
  const lastRow = container.lastElementChild;
  lastRow?.querySelector(".manual-address")?.focus();
  updateManualSubmitCount();
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

  let skippedParentOffice = 0;

  rows.forEach((row) => {
    const address = row.querySelector(".manual-address").value.trim();
    const office = row.querySelector(".manual-office").value.trim();
    const Pin = row.querySelector(".manual-Pin").value.trim();

    if (address && office) {
      if (isSelfParentOfficeRow(address, office)) {
        skippedParentOffice++;
        return;
      }
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
  });

  if (requests.length === 0 && adminDirectEdits.length === 0) {
    return showToast(
      skippedParentOffice > 0
        ? "ℹ️ Parent HO/SO staff is managed from the Directory office header (👥 Staff)."
        : "Please fill in at least one complete row."
    );
  }

  const btn = document.getElementById("submit-multiple-btn");
  delete btn.dataset.originalHtml;
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
      getManualEntryRowHTML(1);
    switchDashboardView("search");
  } catch (err) {
    alert("Error submitting request: " + err.message);
  }

  setButtonState(btn, "idle");
  updateManualSubmitCount();
}

// --- BULK SAME OFFICE UPLOAD TAB ---
let bulkAddPriority = 1;

function setBulkPriority(val, silent = false) {
  bulkAddPriority = Number(val) === 1 ? 1 : 0;
  document
    .getElementById("bulk-prio-priority")
    ?.classList.toggle("active", bulkAddPriority === 1);
  document
    .getElementById("bulk-prio-regular")
    ?.classList.toggle("active", bulkAddPriority === 0);

  if (!silent && navigator.vibrate) navigator.vibrate(15);
  updateBulkAddressPreview();
}

let currentUploadTab = "rows";

function syncUploadAdminUI() {
  const canExcel = Boolean(isCurrentUserAdmin || isCurrentUserSuperadmin);
  const tabsWrap = document.getElementById("upload-segmented-tabs");
  const excelTabBtn = document.getElementById("tab-manual-excel");
  const roleBanner = document.getElementById("upload-role-banner");

  if (excelTabBtn) excelTabBtn.classList.toggle("hidden", !canExcel);
  if (tabsWrap) tabsWrap.classList.toggle("has-excel-tab", canExcel);

  if (roleBanner) {
    roleBanner.classList.toggle("is-admin", canExcel);
    roleBanner.innerHTML = canExcel
      ? `<span>🛡️</span><span><strong>Admin Mode:</strong> Records publish directly to the live database.</span>`
      : `<span>📝</span><span>Submissions go to <strong>Approvals</strong> for colleague review before publishing.</span>`;
  }

  if (!canExcel && currentUploadTab === "excel") {
    currentUploadTab = "rows";
  }
  switchManualUploadTab(currentUploadTab, true);
  updateManualSubmitCount();
}

function switchManualUploadTab(tab, silent = false) {
  const canExcel = Boolean(isCurrentUserAdmin || isCurrentUserSuperadmin);
  const nextTab =
    tab === "excel" && canExcel ? "excel" : tab === "bulk" ? "bulk" : "rows";
  currentUploadTab = nextTab;

  const tabsWrap = document.getElementById("upload-segmented-tabs");
  if (tabsWrap) {
    tabsWrap.classList.toggle("is-tab-1", nextTab === "bulk");
    tabsWrap.classList.toggle("is-tab-2", nextTab === "excel");
  }

  [
    ["rows", "tab-manual-rows", "manual-panel-rows"],
    ["bulk", "tab-manual-bulk", "manual-panel-bulk"],
    ["excel", "tab-manual-excel", "manual-panel-excel"],
  ].forEach(([key, btnId, panelId]) => {
    const isActive = key === nextTab;
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    }
    document.getElementById(panelId)?.classList.toggle("hidden", !isActive);
  });

  if (!silent) {
    closeAllDropdowns();
    const area = document.getElementById("upload-display-area");
    if (area) area.scrollTop = 0;
    if (typeof uploadHeroController !== "undefined") {
      uploadHeroController.setCollapsed(false, true);
    }
  }
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
  return parseDelimitedAddresses(
    document.getElementById("bulk-addresses-input")?.value || ""
  );
}

function updateBulkAddressPreview() {
  const addresses = parseBulkAddresses();
  const submitBtn = document.getElementById("submit-bulk-btn");

  renderBulkAddressPreview({
    addresses,
    officeName: document.getElementById("bulk-office-input")?.value || "",
    priority: bulkAddPriority,
    boxId: "bulk-preview-box",
    countElId: "bulk-preview-count",
    chipsElId: "bulk-preview-chips",
    removeFnName: "removeBulkAddressAt",
  });

  if (submitBtn) {
    if (addresses.length === 0) {
      submitBtn.textContent =
        bulkAddPriority === 1
          ? "⚡ Submit All as Priority"
          : "Submit All Addresses";
    } else {
      const prioPrefix = bulkAddPriority === 1 ? "⚡ " : "";
      submitBtn.textContent = `${prioPrefix}Submit ${addresses.length} ${
        addresses.length === 1 ? "Address" : "Addresses"
      }`;
    }
  }
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
  const rawAddresses = parseBulkAddresses();

  if (!office) return showToast("⚠️ Please select or enter an Office first.");
  if (rawAddresses.length === 0) {
    return showToast("⚠️ Please enter at least one address.");
  }

  const addresses = rawAddresses.filter(
    (addr) => !isSelfParentOfficeRow(addr, office)
  );
  if (addresses.length === 0) {
    return showToast(
      "ℹ️ Parent office staff is managed from the Directory office header (👥 Staff)."
    );
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
      priority: bulkAddPriority,
    },
    requested_by: session.user.id,
  }));

  const prioText = bulkAddPriority === 1 ? "Priority " : "";
  const btn = document.getElementById("submit-bulk-btn");
  setButtonState(btn, "loading", `Submitting ${addresses.length}...`);

  try {
    if (isCurrentUserAdmin) {
      const { error } = await supabaseClient.rpc("admin_direct_submit", {
        request_payloads: payloads,
      });
      if (error) throw error;
      showToast(
        `✅ Admin: Added ${addresses.length} ${prioText}addresses to ${office}!`
      );
      await fetchAllPostOffices(true);
    } else {
      const { error } = await supabaseClient
        .from("edit_requests")
        .insert(payloads);
      if (error) throw error;
      showToast(
        `✅ ${addresses.length} ${prioText}addresses submitted for approval!`
      );
    }

    invalidateApprovalsCache();
    setBulkPriority(1, true);
    clearBulkAddresses();

    switchDashboardView("search");
  } catch (err) {
    alert("Error submitting addresses: " + err.message);
  } finally {
    setButtonState(btn, "idle");
    updateBulkAddressPreview();
  }
}

// --- UNIFIED OFFICE AUTOCOMPLETE DROPDOWNS ---
function buildOfficeOptionHTML(office, pin, mode) {
  return `<div class="autocomplete-item" onpointerdown="event.preventDefault(); cancelCloseDropdowns();" onclick="pickOfficeOption(this, '${escapeForOnclick(
    office
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

function renderOfficeAutocomplete({
  inputEl,
  dropdownEl,
  clearBtnEl = null,
  pinInputEl = null,
  mode,
}) {
  cancelCloseDropdowns();
  const val = inputEl ? inputEl.value : "";

  if (clearBtnEl) {
    clearBtnEl.classList.toggle("hidden", val.length === 0);
  }

  const officeMap = getOfficePinMap();

  if (dropdownEl) {
    let matchedOffices = Array.from(officeMap.keys());
    const q = val.trim().toLowerCase();
    if (q) {
      matchedOffices = matchedOffices.filter((o) =>
        o.toLowerCase().includes(q)
      );
    }
    matchedOffices.sort();

    if (matchedOffices.length === 0) {
      dropdownEl.classList.remove("show");
    } else {
      dropdownEl.innerHTML = matchedOffices
        .slice(0, 10)
        .map((office) =>
          buildOfficeOptionHTML(office, officeMap.get(office), mode)
        )
        .join("");
      dropdownEl.classList.add("show");
    }
  }

  if (pinInputEl) {
    const trimmed = val.trim();
    if (trimmed === "") {
      pinInputEl.value = "";
    } else {
      const exactMatch = Array.from(officeMap.keys()).find(
        (k) => k.toLowerCase() === trimmed.toLowerCase()
      );
      if (exactMatch) pinInputEl.value = officeMap.get(exactMatch);
    }
  }
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
    updateManualSubmitCount();
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
  } else if (mode === "appr-filter") {
    if (typeof selectApprovalsOffice === "function") {
      selectApprovalsOffice(office);
    }
    return;
  }
  closeAllDropdowns();
}

function handleInlineEditOfficeInput(inputElement) {
  renderOfficeAutocomplete({
    inputEl: inputElement,
    dropdownEl: document.getElementById("inline-edit-office-dropdown"),
    clearBtnEl: document.getElementById("inline-edit-office-clear"),
    pinInputEl: document.getElementById("inline-edit-pin"),
    mode: "inline",
  });
}

function clearInlineEditOffice() {
  const offInput = document.getElementById("inline-edit-office");
  offInput.value = "";
  offInput.focus();
  handleInlineEditOfficeInput(offInput);
}

function handleOfficeInput(inputElement) {
  const wrapper = inputElement.closest(".autocomplete-wrapper");
  renderOfficeAutocomplete({
    inputEl: inputElement,
    dropdownEl: wrapper.querySelector(".autocomplete-dropdown"),
    clearBtnEl: wrapper.querySelector(".clear-btn"),
    pinInputEl: wrapper
      .closest(".manual-entry-row")
      .querySelector(".manual-Pin"),
    mode: "manual",
  });
  updateManualSubmitCount();
}

function clearOfficeInput(btnElement) {
  const wrapper = btnElement.closest(".autocomplete-wrapper");
  const input = wrapper.querySelector(".manual-office");
  input.value = "";
  input.focus();
  handleOfficeInput(input);
}

function handleBulkOfficeInput(inputElement) {
  renderOfficeAutocomplete({
    inputEl: inputElement,
    dropdownEl: document.getElementById("bulk-office-dropdown"),
    clearBtnEl: document.getElementById("bulk-office-clear"),
    pinInputEl: document.getElementById("bulk-pin-input"),
    mode: "bulk",
  });
  updateBulkAddressPreview();
}

function handleSearchOfficeFilterInput(inputElement) {
  renderOfficeAutocomplete({
    inputEl: inputElement,
    dropdownEl: document.getElementById("filter-office-dropdown"),
    clearBtnEl: document.getElementById("clear-office-btn"),
    mode: "search-filter",
  });
  triggerSearch();
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
  renderOfficeAutocomplete({
    inputEl: inputElement,
    dropdownEl: document.getElementById("dir-filter-office-dropdown"),
    clearBtnEl: document.getElementById("clear-dir-office-btn"),
    mode: "dir-filter",
  });
  filterDirectory();
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

function handleExcelFileSelect(event) {
  const file = event?.target?.files?.[0];
  if (!file) {
    clearExcelFileSelection();
    return;
  }

  const ext = (file.name.split(".").pop() || "").toUpperCase();
  if (ext !== "XLSX" && ext !== "XLS") {
    clearExcelFileSelection();
    return showToast("⚠️ Please select an .xlsx or .xls file.", "warning");
  }

  const sizeText =
    file.size >= 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
      : `${Math.max(1, Math.round(file.size / 1024))} KB`;

  const extEl = document.getElementById("excel-file-ext");
  const nameEl = document.getElementById("excel-file-name");
  const metaEl = document.getElementById("excel-file-meta");

  if (extEl) extEl.textContent = ext;
  if (nameEl) nameEl.textContent = file.name;
  if (metaEl) metaEl.textContent = `${sizeText} • Ready to upload`;

  document.getElementById("excel-dropzone-btn")?.classList.add("hidden");
  document.getElementById("excel-file-preview")?.classList.remove("hidden");
}

function clearExcelFileSelection() {
  const fileInput = document.getElementById("excel-file");
  if (fileInput) fileInput.value = "";
  document.getElementById("excel-file-preview")?.classList.add("hidden");
  document.getElementById("excel-dropzone-btn")?.classList.remove("hidden");
}

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
        workbook.Sheets[workbook.SheetNames[0]]
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

      const formattedData = [];
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const address = String(row["Address"] ?? "").trim();
        const office = String(row["Office"] ?? "").trim();
        if (!address || !office) continue;
        if (isSelfParentOfficeRow(address, office)) continue;

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

        const pinStr = String(row["Pin"] ?? "").trim();
        const parsedPin = pinStr ? parseInt(pinStr, 10) || null : null;

        formattedData.push({
          Address: address,
          Office: office,
          Pin: parsedPin,
          priority: priorityVal,
          user_id: session.user.id,
          last_modified_by: session.user.id,
          last_approved_by: session.user.id,
          upload_method: "excel_bulk",
          is_deleted: false,
        });
      }

      if (formattedData.length === 0) {
        showToast("ℹ️ No valid Address + Office rows found to upload.");
        setButtonState(uploadBtn, "idle");
        return;
      }

      const CHUNK_SIZE = 500;
      let uploadedCount = 0;
      for (let start = 0; start < formattedData.length; start += CHUNK_SIZE) {
        const chunk = formattedData.slice(start, start + CHUNK_SIZE);
        setButtonState(
          uploadBtn,
          "loading",
          `Uploading ${Math.min(
            start + chunk.length,
            formattedData.length
          )} / ${formattedData.length}...`
        );
        const { error } = await supabaseClient
          .from("post_offices")
          .insert(chunk);
        if (error) {
          alert(`Upload failed after ${uploadedCount} rows: ${error.message}`);
          if (uploadedCount > 0) await fetchAllPostOffices(true);
          setButtonState(uploadBtn, "idle");
          return;
        }
        uploadedCount += chunk.length;
      }

      setButtonState(uploadBtn, "success", "Uploaded!");
      showToast(`✅ Uploaded ${uploadedCount} rows from Excel!`);
      fileInput.value = "";
      clearExcelFileSelection();
      await fetchAllPostOffices(true);
      setTimeout(() => {
        setButtonState(uploadBtn, "idle");
      }, 2000);
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

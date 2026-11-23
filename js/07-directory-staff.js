// =========================================================
// 07-DIRECTORY-STAFF.JS — Directory, Action Bar, Staff CRUD & Quick Modals
// =========================================================

// --- DIRECTORY RENDERING & FILTERING ---
function renderDirectory() {
  const displayArea = document.getElementById("directory-display-area");

  const filterInput = document.getElementById("directory-filter-input");
  const clearBtn = document.getElementById("clear-dir-filter-btn");
  if (filterInput) filterInput.value = "";
  if (clearBtn) clearBtn.classList.add("hidden");

  if (!cachedPostOffices || cachedPostOffices.length === 0) {
    displayArea.innerHTML = `<div class="list-empty">No data available.</div>`;
    return;
  }

  if (directoryGroupedData.length === 0) {
    buildDirectoryGroupedData();
  }

  directoryFilteredData = [...directoryGroupedData];
  directoryCurrentPage = 0;

  displayArea.innerHTML = `
      <div id="directory-content" style="padding: 4px;"></div>
      <div id="directory-sentinel" style="height: 40px; text-align: center; color: var(--text-light); font-size: 13px; padding: 10px;"></div>
    `;
  displayArea.scrollTop = 0;

  setupDirectoryObserver();
  renderDirectoryBatch();
}

function renderDirectoryBatch() {
  const contentDiv = document.getElementById("directory-content");
  const sentinel = document.getElementById("directory-sentinel");
  if (!contentDiv) return;

  const startIndex = directoryCurrentPage * DIRECTORY_PAGE_SIZE;
  const endIndex = startIndex + DIRECTORY_PAGE_SIZE;
  const batch = directoryFilteredData.slice(startIndex, endIndex);

  if (batch.length === 0 && directoryCurrentPage === 0) {
    contentDiv.innerHTML = `<div class="list-empty">No offices match your filter.</div>`;
    if (sentinel) sentinel.style.display = "none";
    return;
  }

  let html = "";
  batch.forEach((data) => {
    const safeId = "dir-office-" + data.office.replace(/\W/g, "-");
    const addressList = Array.isArray(data.addresses) ? data.addresses : [];
    const totalAddresses = addressList.length;

    html += `
        <div class="directory-card" id="${safeId}">
          <div class="directory-card-header">
            <div class="directory-office-info">
              <div class="directory-office-title">
                <span>🏢</span>
                <span>${escapeHTML(data.office)}</span>
              </div>
              <div class="directory-office-meta">
                <span>📍 ${escapeHTML(data.pin)}</span>
                <span class="meta-dot">•</span>
                <span class="meta-count">${totalAddresses} ${
                  totalAddresses === 1 ? "Address" : "Addresses"
                }</span>
              </div>
            </div>
  
            <div class="directory-header-actions">
              <button
                type="button"
                class="dir-quick-priority-btn"
                onclick="quickPriorityForOffice('${escapeForOnclick(
                  data.office,
                )}', '${escapeForOnclick(data.pin)}')"
                title="Mark frequent / high-priority addresses in ${escapeHTML(
                  data.office,
                )}"
                aria-label="Manage frequent addresses"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
              </button>

              <button
                type="button"
                class="dir-quick-add-btn"
                onclick="quickAddForOffice('${escapeForOnclick(
                  data.office,
                )}', '${escapeForOnclick(data.pin)}')"
                title="Add multiple addresses to ${escapeHTML(data.office)}"
                aria-label="Add addresses"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
  
              <button
                type="button"
                class="dir-quick-delete-btn"
                onclick="quickDeleteForOffice('${escapeForOnclick(
                  data.office,
                )}', '${escapeForOnclick(data.pin)}')"
                title="Delete multiple addresses from ${escapeHTML(
                  data.office,
                )}"
                aria-label="Delete addresses"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                  <path d="M10 11v6"></path>
                  <path d="M14 11v6"></path>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="directory-address-list">
      `;

    addressList.forEach((item) => {
      const addressText = typeof item === "object" ? item.Address : item;
      const recordId = typeof item === "object" ? item.id : "";
      const officeName = typeof item === "object" ? item.Office : data.office;
      const pinVal = typeof item === "object" ? item.Pin : data.pin;
      const isPriority =
        typeof item === "object" && Number(item.priority) >= 1;
      const officeType = detectOfficeType(addressText);

      if (officeType) {
        html += `<span class="directory-address-chip clickable-office-chip" onclick="openDirectoryChipActions(this)" data-record-id="${escapeHTML(
          recordId,
        )}" data-address="${escapeHTML(addressText)}" data-office="${escapeHTML(
          officeName,
        )}" data-pin="${escapeHTML(
          pinVal || "",
        )}" title="Tap for options">📮 ${escapeHTML(addressText)}${
          isPriority ? " ⚡" : ""
        }</span>`;
      } else if (isPriority) {
        html += `<span class="directory-address-chip priority-address-chip" onclick="openDirectoryChipActions(this)" data-record-id="${escapeHTML(
          recordId,
        )}" data-address="${escapeHTML(addressText)}" data-office="${escapeHTML(
          officeName,
        )}" data-pin="${escapeHTML(
          pinVal || "",
        )}" title="Frequent / High-Priority (Shared) • Tap for options">⚡ ${escapeHTML(
          addressText,
        )}</span>`;
      } else {
        html += `<span class="directory-address-chip" onclick="openDirectoryChipActions(this)" data-record-id="${escapeHTML(
          recordId,
        )}" data-address="${escapeHTML(addressText)}" data-office="${escapeHTML(
          officeName,
        )}" data-pin="${escapeHTML(
          pinVal || "",
        )}" title="Tap for options">${escapeHTML(addressText)}</span>`;
      }
    });

    html += `
          </div>
          <div class="directory-action-tray"></div>
        </div>
      `;
  });

  contentDiv.insertAdjacentHTML("beforeend", html);
  directoryCurrentPage++;

  if (sentinel) {
    sentinel.style.display = "block";
    if (endIndex >= directoryFilteredData.length) {
      sentinel.textContent = "End of directory";
    } else {
      sentinel.textContent = "Loading more...";
    }
  }
}

function setupDirectoryObserver() {
  const sentinel = document.getElementById("directory-sentinel");
  const displayArea = document.getElementById("directory-display-area");

  if (directoryObserver) directoryObserver.disconnect();

  directoryObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        if (
          directoryCurrentPage * DIRECTORY_PAGE_SIZE <
          directoryFilteredData.length
        ) {
          renderDirectoryBatch();
        }
      }
    },
    {
      root: displayArea,
      rootMargin: "300px",
      threshold: 0.1,
    },
  );

  if (sentinel) directoryObserver.observe(sentinel);
}

function goToDirectoryOffice(officeName) {
  if (!officeName) return;

  switchDashboardView("directory");

  const filterInput = document.getElementById("directory-filter-input");
  if (filterInput) {
    filterInput.value = officeName;
    toggleDirClearBtn();
    filterDirectory();
  }

  const cardId = "dir-office-" + officeName.replace(/\W/g, "-");

  setTimeout(() => {
    const card = document.getElementById(cardId);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "start" });

      card.style.transition = "background-color 0.5s ease, transform 0.3s ease";
      card.style.backgroundColor = "rgba(79, 70, 229, 0.15)";
      card.style.transform = "scale(1.02)";

      setTimeout(() => {
        card.style.backgroundColor = "var(--card-bg)";
        card.style.transform = "scale(1)";
      }, 1200);
    }
  }, 50);
}

function filterDirectory() {
  const filterValue = document
    .getElementById("directory-filter-input")
    .value.toLowerCase()
    .trim();

  if (!filterValue) {
    directoryFilteredData = [...directoryGroupedData];
  } else {
    directoryFilteredData = directoryGroupedData.filter((item) =>
      item.searchString.includes(filterValue),
    );
  }

  directoryCurrentPage = 0;
  const contentDiv = document.getElementById("directory-content");
  if (contentDiv) contentDiv.innerHTML = "";

  renderDirectoryBatch();
}

function toggleDirClearBtn() {
  const input = document.getElementById("directory-filter-input");
  const clearBtn = document.getElementById("clear-dir-filter-btn");
  if (input.value.length > 0) {
    clearBtn.classList.remove("hidden");
  } else {
    clearBtn.classList.add("hidden");
  }
}

function clearDirectoryFilter() {
  const input = document.getElementById("directory-filter-input");
  input.value = "";
  toggleDirClearBtn();
  filterDirectory();
  input.focus();
}

// --- FLOATING ACTION BAR (DIRECTORY CHIPS & SEARCH ITEMS) ---
function closeAllDirectoryActionTrays() {
  const bar = document.getElementById("directory-floating-bar");
  if (bar) {
    bar.classList.remove("open");
  }
  document
    .querySelectorAll(
      ".directory-address-chip.selected-chip, .list-item.selected-chip",
    )
    .forEach((c) => c.classList.remove("selected-chip"));
}

function openDirectoryChipActions(chipEl) {
  if (!chipEl) return;
  const bar = document.getElementById("directory-floating-bar");
  if (!bar) return;

  const isSameAlreadyOpen =
    bar.classList.contains("open") &&
    (chipEl.classList.contains("selected-chip") ||
      (chipEl.getAttribute("data-record-id") &&
        chipEl.getAttribute("data-record-id") ===
          bar.getAttribute("data-open-record-id")));

  closeAllDirectoryActionTrays();
  if (isSameAlreadyOpen) return;

  bar.setAttribute(
    "data-open-record-id",
    chipEl.getAttribute("data-record-id") || "",
  );
  bar.setAttribute(
    "data-open-address",
    chipEl.getAttribute("data-address") || "",
  );

  let recordId = chipEl.getAttribute("data-record-id") || "";
  const address = chipEl.getAttribute("data-address") || "";
  const office = chipEl.getAttribute("data-office") || "";
  const pin = chipEl.getAttribute("data-pin") || "";

  if (!recordId && cachedPostOffices.length > 0) {
    const match = cachedPostOffices.find(
      (r) =>
        String(r.Address || "")
          .trim()
          .toLowerCase() === address.trim().toLowerCase() &&
        String(r.Office || "")
          .trim()
          .toLowerCase() === office.trim().toLowerCase(),
    );
    if (match) recordId = String(match.id);
  }

  const favorites = getSafeStorage(FAV_KEY);
  const isFav = favorites.some((f) => String(f.id) === String(recordId));
  const favStyle = getFavoriteBtnStyles(isFav, false);

  const officeType = detectOfficeType(address);
  const infoBtnHtml = officeType
    ? `<button onclick="event.stopPropagation(); showOfficeDetailsModal('${escapeForOnclick(
        address,
      )}', '${escapeForOnclick(
        office,
      )}')" class="toolbar-btn info-i-btn" title="View ${officeType} Staff Details"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"></circle><line x1="12" y1="16" x2="12" y2="11.5"></line><circle cx="12" cy="8.2" r="0.6" fill="currentColor"></circle></svg></button>`
    : "";

  const liveRecord = cachedPostOffices.find(
    (r) => String(r.id) === String(recordId),
  );
  const isPriority = Number(liveRecord?.priority) >= 1;
  const isAutoTopOffice = officeType === "HO" || officeType === "SO";

  const priorityBtnHtml =
    recordId && !isAutoTopOffice
      ? `<button onclick="event.stopPropagation(); toggleRecordPriority('${escapeForOnclick(
          recordId,
        )}', this)" class="toolbar-btn priority-bolt-btn ${
          isPriority ? "is-active" : ""
        }" title="${
          isPriority
            ? "Frequent Priority ON (Shared with all staff) — Tap to remove"
            : "Mark as Frequent Priority (Shared with all staff)"
        }" aria-label="Toggle Shared Priority"><svg width="16" height="16" viewBox="0 0 24 24" fill="${
          isPriority ? "currentColor" : "none"
        }" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></button>`
      : "";

  bar.innerHTML = `
      <div class="card-actions">
        ${infoBtnHtml}
        ${priorityBtnHtml}
        <button onclick="event.stopPropagation(); viewHistory('${escapeForOnclick(
          recordId,
        )}')" class="toolbar-btn" style="background: var(--input-bg);">🕒 History</button>
        <button onclick="event.stopPropagation(); toggleFavorite('${escapeForOnclick(
          recordId,
        )}', '${escapeForOnclick(address)}', '${escapeForOnclick(
          office,
        )}', '${escapeForOnclick(pin)}', this)" class="toolbar-btn" title="Personal Favorite (saved only on this device)" style="${
          favStyle.style
        }">${favStyle.icon}</button>
        <button onclick="event.stopPropagation(); updateRecord('${escapeForOnclick(
          recordId,
        )}', '${escapeForOnclick(address)}', '${escapeForOnclick(
          office,
        )}', '${escapeForOnclick(
          pin,
        )}')" class="toolbar-btn" style="background: var(--input-bg);"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg> Edit</button>
        <button onclick="event.stopPropagation(); deleteRecord('${escapeForOnclick(
          recordId,
        )}')" class="toolbar-btn" style="background: #fee2e2; color: #b91c1c;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg> Delete</button>
      </div>
    `;

  const rect = chipEl.getBoundingClientRect();
  const barWidth = bar.offsetWidth;
  const barHeight = bar.offsetHeight;
  const margin = 12;

  let left = rect.left + rect.width / 2 - barWidth / 2;
  left = Math.max(
    margin,
    Math.min(left, window.innerWidth - barWidth - margin),
  );

  let top = rect.bottom + 8;
  if (top + barHeight > window.innerHeight - 90) {
    top = rect.top - barHeight - 8;
  }

  bar.style.left = `${left}px`;
  bar.style.top = `${top}px`;

  chipEl.classList.add("selected-chip");
  bar.classList.add("open");
  if (navigator.vibrate) navigator.vibrate(30);
}

// First tap outside closes the open options; second tap opens a new address
document.addEventListener(
  "click",
  (e) => {
    const bar = document.getElementById("directory-floating-bar");
    if (!bar || !bar.classList.contains("open")) return;
    if (e.target.closest("#directory-floating-bar")) return;

    closeAllDirectoryActionTrays();

    if (e.target.closest(".directory-address-chip, .list-item")) {
      e.stopPropagation();
      e.preventDefault();
    }
  },
  true,
);

document
  .getElementById("directory-display-area")
  ?.addEventListener("scroll", closeAllDirectoryActionTrays, { passive: true });
document
  .getElementById("results-display-area")
  ?.addEventListener("scroll", closeAllDirectoryActionTrays, { passive: true });

// --- OFFICE STAFF DETAILS MODAL (BO / SO / HO CRUD) ---
let activeOfficeRecord = null;
let activeOfficeType = null;

function hasValidValue(val) {
  return (
    val !== null &&
    val !== undefined &&
    String(val).trim() !== "" &&
    String(val).trim().toLowerCase() !== "null" &&
    String(val).trim().toLowerCase() !== "n/a"
  );
}

function normalizeStaffList(rawList, extraNameKey, extraContactKey) {
  let entries = [];

  const mapItem = (p) => ({
    name: p.name || p[extraNameKey] || "",
    contact: p.contact || p.mobile || p.phone || p[extraContactKey] || "",
  });

  if (Array.isArray(rawList)) {
    entries = rawList.map(mapItem);
  } else if (typeof rawList === "string" && rawList.trim() !== "") {
    try {
      const parsed = JSON.parse(rawList);
      if (Array.isArray(parsed)) {
        entries = parsed.map(mapItem);
      }
    } catch (e) {
      rawList.split(/[\n,;]+/).forEach((entry) => {
        const parts = entry.split(/[-:]/);
        if (parts.length >= 2) {
          entries.push({
            name: parts[0].trim(),
            contact: parts.slice(1).join("-").trim(),
          });
        } else if (parts[0].trim()) {
          entries.push({ name: parts[0].trim(), contact: "" });
        }
      });
    }
  }

  return entries.filter(
    (item) => hasValidValue(item.name) || hasValidValue(item.contact),
  );
}

function parsePaList(record) {
  const rawPaList =
    record?.pa_list || record?.PA_List || record?.postal_assistants;
  return normalizeStaffList(rawPaList, "pa_name", "pa_contact");
}

function parseMtsList(record) {
  const rawMtsList =
    record?.mts_list || record?.MTS_List || record?.multi_tasking_staff;
  return normalizeStaffList(rawMtsList, "mts_name", "mts_contact");
}

function buildStaffCardHTML(roleLabel, personName, contactNumber) {
  const hasName = hasValidValue(personName);
  const hasContact = hasValidValue(contactNumber);

  if (!hasName && !hasContact) return "";

  const cleanPhone = hasContact
    ? String(contactNumber).replace(/[^\d+]/g, "")
    : "";

  return `
      <div class="staff-detail-card">
        <div style="min-width: 0; flex: 1;">
          <span class="staff-role-label">${escapeHTML(roleLabel)}</span>
          ${
            hasName
              ? `<div class="staff-person-name">${escapeHTML(personName)}</div>`
              : ""
          }
          ${
            hasContact
              ? `<div style="font-size: 13px; color: var(--text-light); margin-top: 2px;">📞 ${escapeHTML(
                  contactNumber,
                )}</div>`
              : ""
          }
        </div>
        ${
          cleanPhone
            ? `<a href="tel:${escapeHTML(
                cleanPhone,
              )}" class="staff-call-btn">📞 Call</a>`
            : ""
        }
      </div>
    `;
}

function showOfficeDetailsModal(addressName, parentOfficeName) {
  closeAllDirectoryActionTrays();
  const officeType = detectOfficeType(addressName);
  if (!officeType) return;

  const record =
    cachedPostOffices.find(
      (r) =>
        String(r.Address || "")
          .trim()
          .toLowerCase() === String(addressName).trim().toLowerCase() &&
        String(r.Office || "")
          .trim()
          .toLowerCase() === String(parentOfficeName).trim().toLowerCase(),
    ) ||
    cachedPostOffices.find(
      (r) =>
        String(r.Address || "")
          .trim()
          .toLowerCase() === String(addressName).trim().toLowerCase(),
    );

  if (!record) {
    return showToast("⚠️ Office record not found in local database.");
  }

  activeOfficeRecord = record;
  activeOfficeType = officeType;

  const badgeLabels = {
    BO: "Branch Office (BO)",
    SO: "Sub Office (SO)",
    HO: "Head Office (HO)",
  };

  document.getElementById("office-modal-badge").textContent =
    badgeLabels[officeType] || officeType;
  document.getElementById("office-modal-title").textContent =
    record.Address || addressName;
  document.getElementById("office-modal-subtitle").textContent = `🏢 ${
    record.Office || parentOfficeName || "N/A"
  } • 📍 PIN: ${record.Pin || "N/A"}`;

  renderOfficeStaffViewMode();
  document.getElementById("office-details-modal-overlay").classList.add("show");
}

function renderOfficeStaffViewMode() {
  const record = activeOfficeRecord || {};
  const officeType = activeOfficeType;

  document.getElementById("office-modal-edit-btn").classList.remove("hidden");
  document
    .getElementById("office-modal-view-actions")
    .classList.remove("hidden");
  document.getElementById("office-modal-edit-actions").classList.add("hidden");

  let cardsHtml = "";

  if (officeType === "BO") {
    cardsHtml += buildStaffCardHTML(
      "Branch Post Master (BPM)",
      record.bpm_name,
      record.bpm_contact,
    );
    cardsHtml += buildStaffCardHTML(
      "Assistant Branch Post Master (ABPM)",
      record.abpm_name,
      record.abpm_contact,
    );
  } else if (officeType === "SO" || officeType === "HO") {
    if (officeType === "SO") {
      cardsHtml += buildStaffCardHTML(
        "Sub Post Master (SPM)",
        record.spm_name,
        record.spm_contact,
      );
    } else {
      cardsHtml += buildStaffCardHTML(
        "Post Master (PM)",
        record.pm_name,
        record.pm_contact,
      );
    }

    const paEntries = parsePaList(record);
    paEntries.forEach((pa, idx) => {
      const label =
        paEntries.length > 1
          ? `Postal Assistant (PA #${idx + 1})`
          : "Postal Assistant (PA)";
      cardsHtml += buildStaffCardHTML(label, pa.name, pa.contact);
    });

    const mtsEntries = parseMtsList(record);
    mtsEntries.forEach((mts, idx) => {
      const label =
        mtsEntries.length > 1
          ? `Multi Tasking Staff (MTS #${idx + 1})`
          : "Multi Tasking Staff (MTS)";
      cardsHtml += buildStaffCardHTML(label, mts.name, mts.contact);
    });
  }

  const editBtn = document.getElementById("office-modal-edit-btn");
  const bodyEl = document.getElementById("office-modal-body");

  if (!cardsHtml.trim()) {
    editBtn.innerHTML = "➕ Add";
    bodyEl.innerHTML = `
        <div class="list-empty" style="padding: 24px 16px; margin: 0; gap: 10px;">
          <span>No staff details stored for this ${officeType} yet.</span>
          <button type="button" class="btn" style="width: auto; padding: 8px 16px; font-size: 13px;" onclick="openOfficeStaffEditor()">
            ➕ Add ${officeType} Details
          </button>
        </div>
      `;
  } else {
    editBtn.innerHTML = "✎ Edit";
    bodyEl.innerHTML = cardsHtml;
  }
}

function openOfficeStaffEditor() {
  const record = activeOfficeRecord || {};
  const officeType = activeOfficeType;

  document.getElementById("office-modal-edit-btn").classList.add("hidden");
  document.getElementById("office-modal-view-actions").classList.add("hidden");
  document
    .getElementById("office-modal-edit-actions")
    .classList.remove("hidden");

  const bodyEl = document.getElementById("office-modal-body");
  let formHtml = "";

  if (officeType === "BO") {
    formHtml = `
        <div class="staff-edit-group">
          <div class="staff-edit-header">
            <span class="staff-role-label" style="margin:0;">Branch Post Master (BPM)</span>
            <button type="button" class="staff-remove-btn" onclick="clearStaffFieldGroup('crud-bpm-name', 'crud-bpm-contact')">Clear</button>
          </div>
          <div class="staff-edit-inputs">
            <input type="text" id="crud-bpm-name" placeholder="BPM Full Name" value="${escapeHTML(
              record.bpm_name || "",
            )}" />
            <input type="tel" inputmode="numeric" id="crud-bpm-contact" placeholder="Contact Number" maxlength="15" value="${escapeHTML(
              record.bpm_contact || "",
            )}" />
          </div>
        </div>
  
        <div class="staff-edit-group">
          <div class="staff-edit-header">
            <span class="staff-role-label" style="margin:0;">Assistant Branch Post Master (ABPM)</span>
            <button type="button" class="staff-remove-btn" onclick="clearStaffFieldGroup('crud-abpm-name', 'crud-abpm-contact')">Clear</button>
          </div>
          <div class="staff-edit-inputs">
            <input type="text" id="crud-abpm-name" placeholder="ABPM Full Name" value="${escapeHTML(
              record.abpm_name || "",
            )}" />
            <input type="tel" inputmode="numeric" id="crud-abpm-contact" placeholder="Contact Number" maxlength="15" value="${escapeHTML(
              record.abpm_contact || "",
            )}" />
          </div>
        </div>
      `;
    bodyEl.innerHTML = formHtml;
  } else if (officeType === "SO" || officeType === "HO") {
    const existingPAs = parsePaList(record);
    const existingMTS = parseMtsList(record);

    const headRoleHtml =
      officeType === "SO"
        ? `
        <div class="staff-edit-group">
          <div class="staff-edit-header">
            <span class="staff-role-label" style="margin:0;">Sub Post Master (SPM)</span>
            <button type="button" class="staff-remove-btn" onclick="clearStaffFieldGroup('crud-spm-name', 'crud-spm-contact')">Clear</button>
          </div>
          <div class="staff-edit-inputs">
            <input type="text" id="crud-spm-name" placeholder="SPM Full Name" value="${escapeHTML(
              record.spm_name || "",
            )}" />
            <input type="tel" inputmode="numeric" id="crud-spm-contact" placeholder="Contact Number" maxlength="15" value="${escapeHTML(
              record.spm_contact || "",
            )}" />
          </div>
        </div>`
        : `
        <div class="staff-edit-group">
          <div class="staff-edit-header">
            <span class="staff-role-label" style="margin:0;">Post Master (PM)</span>
            <button type="button" class="staff-remove-btn" onclick="clearStaffFieldGroup('crud-pm-name', 'crud-pm-contact')">Clear</button>
          </div>
          <div class="staff-edit-inputs">
            <input type="text" id="crud-pm-name" placeholder="Post Master Name" value="${escapeHTML(
              record.pm_name || "",
            )}" />
            <input type="tel" inputmode="numeric" id="crud-pm-contact" placeholder="Contact Number" maxlength="15" value="${escapeHTML(
              record.pm_contact || "",
            )}" />
          </div>
        </div>`;

    formHtml = `
        ${headRoleHtml}
  
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <span class="staff-role-label" style="margin: 0;">Postal Assistants (PA)</span>
          <button type="button" class="staff-icon-btn" onclick="addPaInputRow()">➕ Add PA</button>
        </div>
        <div id="crud-pa-list-container" style="display: flex; flex-direction: column; gap: 10px;"></div>
  
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
          <span class="staff-role-label" style="margin: 0;">Multi Tasking Staff (MTS)</span>
          <button type="button" class="staff-icon-btn" onclick="addMtsInputRow()">➕ Add MTS</button>
        </div>
        <div id="crud-mts-list-container" style="display: flex; flex-direction: column; gap: 10px;"></div>
      `;

    bodyEl.innerHTML = formHtml;

    if (existingPAs.length === 0) {
      addPaInputRow("", "");
    } else {
      existingPAs.forEach((pa) => addPaInputRow(pa.name, pa.contact));
    }

    if (existingMTS.length === 0) {
      addMtsInputRow("", "");
    } else {
      existingMTS.forEach((mts) => addMtsInputRow(mts.name, mts.contact));
    }
  }
}

function clearStaffFieldGroup(nameInputId, contactInputId) {
  const n = document.getElementById(nameInputId);
  const c = document.getElementById(contactInputId);
  if (n) n.value = "";
  if (c) c.value = "";
}

function addPaInputRow(name = "", contact = "") {
  const container = document.getElementById("crud-pa-list-container");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "staff-edit-group pa-crud-row";
  row.innerHTML = `
      <div class="staff-edit-header">
        <span class="staff-role-label" style="margin:0;">Postal Assistant (PA)</span>
        <button type="button" class="staff-remove-btn" onclick="this.closest('.pa-crud-row').remove()">✕ Remove</button>
      </div>
      <div class="staff-edit-inputs">
        <input type="text" class="crud-pa-name" placeholder="PA Full Name" value="${escapeHTML(
          name,
        )}" />
        <input type="tel" inputmode="numeric" class="crud-pa-contact" placeholder="Contact Number" maxlength="15" value="${escapeHTML(
          contact,
        )}" />
      </div>
    `;
  container.appendChild(row);
}

function addMtsInputRow(name = "", contact = "") {
  const container = document.getElementById("crud-mts-list-container");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "staff-edit-group mts-crud-row";
  row.innerHTML = `
      <div class="staff-edit-header">
        <span class="staff-role-label" style="margin:0;">Multi Tasking Staff (MTS)</span>
        <button type="button" class="staff-remove-btn" onclick="this.closest('.mts-crud-row').remove()">✕ Remove</button>
      </div>
      <div class="staff-edit-inputs">
        <input type="text" class="crud-mts-name" placeholder="MTS Full Name" value="${escapeHTML(
          name,
        )}" />
        <input type="tel" inputmode="numeric" class="crud-mts-contact" placeholder="Contact Number" maxlength="15" value="${escapeHTML(
          contact,
        )}" />
      </div>
    `;
  container.appendChild(row);
}

async function saveOfficeStaffDetails() {
  if (!(await ensureOnline("Connect to internet to save changes."))) return;
  if (!activeOfficeRecord || !activeOfficeRecord.id) return;

  const saveBtn = document.getElementById("save-office-staff-btn");
  setButtonState(saveBtn, "loading", "Saving...");

  let updatePayload = {};

  if (activeOfficeType === "BO") {
    const bpmName = document.getElementById("crud-bpm-name")?.value.trim();
    const bpmContact = document
      .getElementById("crud-bpm-contact")
      ?.value.trim();
    const abpmName = document.getElementById("crud-abpm-name")?.value.trim();
    const abpmContact = document
      .getElementById("crud-abpm-contact")
      ?.value.trim();

    updatePayload = {
      bpm_name: bpmName || null,
      bpm_contact: bpmContact || null,
      abpm_name: abpmName || null,
      abpm_contact: abpmContact || null,
    };
  } else if (activeOfficeType === "SO" || activeOfficeType === "HO") {
    const paRows = document.querySelectorAll(".pa-crud-row");
    const paList = [];
    paRows.forEach((row) => {
      const n = row.querySelector(".crud-pa-name")?.value.trim() || "";
      const c = row.querySelector(".crud-pa-contact")?.value.trim() || "";
      if (n || c) paList.push({ name: n, contact: c });
    });

    const mtsRows = document.querySelectorAll(".mts-crud-row");
    const mtsList = [];
    mtsRows.forEach((row) => {
      const n = row.querySelector(".crud-mts-name")?.value.trim() || "";
      const c = row.querySelector(".crud-mts-contact")?.value.trim() || "";
      if (n || c) mtsList.push({ name: n, contact: c });
    });

    if (activeOfficeType === "SO") {
      const spmName = document.getElementById("crud-spm-name")?.value.trim();
      const spmContact = document
        .getElementById("crud-spm-contact")
        ?.value.trim();

      updatePayload = {
        spm_name: spmName || null,
        spm_contact: spmContact || null,
        pa_list: paList,
        mts_list: mtsList,
      };
    } else {
      const pmName = document.getElementById("crud-pm-name")?.value.trim();
      const pmContact = document
        .getElementById("crud-pm-contact")
        ?.value.trim();

      updatePayload = {
        pm_name: pmName || null,
        pm_contact: pmContact || null,
        pa_list: paList,
        mts_list: mtsList,
      };
    }
  }

  try {
    const { error } = await supabaseClient
      .from("post_offices")
      .update(updatePayload)
      .eq("id", activeOfficeRecord.id);

    if (error) throw error;

    Object.assign(activeOfficeRecord, updatePayload);
    localStorage.setItem(
      "dakmitra_offline_db",
      JSON.stringify(cachedPostOffices),
    );

    showToast("✅ Office details updated!");
    setButtonState(saveBtn, "success", "Saved!");
    setTimeout(() => {
      setButtonState(saveBtn, "idle");
      renderOfficeStaffViewMode();
    }, 550);
  } catch (err) {
    setButtonState(saveBtn, "idle");
    alert("Failed to update office details: " + err.message);
  }
}

function closeOfficeDetailsModal() {
  document
    .getElementById("office-details-modal-overlay")
    .classList.remove("show");
}

// --- DIRECTORY QUICK-ADD MULTIPLE ADDRESSES MODAL ---
let activeQuickAddOffice = { office: "", pin: "" };

function getQuickAddBtnDefaultHTML(count = 0) {
  const baseLabel = isCurrentUserAdmin ? "Add" : "Submit";
  const label =
    count > 0
      ? `${baseLabel} ${count} ${count === 1 ? "Address" : "Addresses"}`
      : `${baseLabel} Addresses`;
  return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
      </svg>
      <span>${label}</span>
    `;
}

function quickAddForOffice(officeName, pinNumber) {
  closeAllDirectoryActionTrays();

  const cleanPin =
    pinNumber && pinNumber !== "N/A" ? String(pinNumber).trim() : "";
  activeQuickAddOffice = {
    office: officeName || "",
    pin: cleanPin,
  };

  document.getElementById("quick-add-subtitle").textContent = `🏢 ${
    activeQuickAddOffice.office
  }${cleanPin ? ` • 📍 ${cleanPin}` : ""}`;

  const textarea = document.getElementById("quick-add-addresses-input");
  const saveBtn = document.getElementById("quick-add-save-btn");
  const saveBtnContent = document.getElementById("quick-add-save-btn-content");

  if (textarea) textarea.value = "";
  saveBtn.classList.remove("is-loading", "is-success");
  saveBtn.disabled = false;
  saveBtnContent.innerHTML = getQuickAddBtnDefaultHTML(0);

  updateQuickAddPreview();
  document.getElementById("quick-add-modal-overlay").classList.add("show");
  setTimeout(() => textarea?.focus(), 140);
}

function closeQuickAddModal() {
  document.getElementById("quick-add-modal-overlay")?.classList.remove("show");
}

function parseQuickAddAddresses() {
  const raw = document.getElementById("quick-add-addresses-input")?.value || "";
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

function updateQuickAddPreview() {
  const addresses = parseQuickAddAddresses();
  const box = document.getElementById("quick-add-preview-box");
  const countEl = document.getElementById("quick-add-preview-count");
  const chipsEl = document.getElementById("quick-add-preview-chips");
  const saveBtn = document.getElementById("quick-add-save-btn");
  const saveBtnContent = document.getElementById("quick-add-save-btn-content");

  if (
    saveBtn &&
    !saveBtn.classList.contains("is-loading") &&
    !saveBtn.classList.contains("is-success")
  ) {
    saveBtnContent.innerHTML = getQuickAddBtnDefaultHTML(addresses.length);
  }

  if (addresses.length === 0) {
    box?.classList.add("hidden");
    return;
  }

  const officeLower = activeQuickAddOffice.office.trim().toLowerCase();
  const existingExact = new Map();
  const existingPhonetic = new Map();

  if (officeLower && cachedPostOffices) {
    cachedPostOffices.forEach((r) => {
      if (
        String(r.Office || "")
          .trim()
          .toLowerCase() === officeLower
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
            <button type="button" onclick="removeQuickAddAddressAt(${idx})" title="Remove">✕</button>
          </span>`;
    })
    .join("");

  countEl.textContent = `${addresses.length} ${
    addresses.length === 1 ? "address" : "addresses"
  } ready${dupCount > 0 ? ` (${dupCount} already in DB)` : ""}`;
  box?.classList.remove("hidden");
}

function removeQuickAddAddressAt(indexToRemove) {
  const addresses = parseQuickAddAddresses();
  addresses.splice(indexToRemove, 1);
  const textarea = document.getElementById("quick-add-addresses-input");
  if (textarea) textarea.value = addresses.join("\n");
  updateQuickAddPreview();
}

function clearQuickAddAddresses() {
  const textarea = document.getElementById("quick-add-addresses-input");
  if (textarea) textarea.value = "";
  updateQuickAddPreview();
}

async function submitQuickAddModal() {
  if (!(await ensureOnline("Connect to internet to save changes."))) return;

  const addresses = parseQuickAddAddresses();
  if (addresses.length === 0) {
    return showToast("⚠️ Please enter at least one address.");
  }

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (!session || !session.user) {
    closeQuickAddModal();
    checkUserSession();
    return alert("Your session has expired. Please sign in again.");
  }

  const saveBtn = document.getElementById("quick-add-save-btn");
  const saveBtnContent = document.getElementById("quick-add-save-btn-content");

  saveBtn.classList.add("is-loading");
  saveBtn.disabled = true;
  saveBtnContent.innerHTML = `
      <div class="btn-spinner"></div>
      <span>Saving...</span>
    `;

  const payloads = addresses.map((addr) => ({
    action_type: "ADD",
    proposed_data: {
      Address: addr,
      Office: activeQuickAddOffice.office,
      Pin: activeQuickAddOffice.pin || null,
    },
    requested_by: session.user.id,
  }));

  try {
    if (isCurrentUserAdmin) {
      const { error } = await supabaseClient.rpc("admin_direct_submit", {
        request_payloads: payloads,
      });
      if (error) throw error;

      await fetchAllPostOffices(true);
      invalidateApprovalsCache();

      saveBtn.classList.remove("is-loading");
      saveBtn.classList.add("is-success");
      saveBtnContent.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline class="checkmark-path" points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Added!</span>
        `;
      showToast(
        `✨ Added ${addresses.length} ${
          addresses.length === 1 ? "address" : "addresses"
        } to ${activeQuickAddOffice.office}!`,
      );
    } else {
      const { error } = await supabaseClient
        .from("edit_requests")
        .insert(payloads);
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
      showToast(
        `✅ ${addresses.length} ${
          addresses.length === 1 ? "address" : "addresses"
        } submitted for approval!`,
      );
    }

    setTimeout(() => {
      closeQuickAddModal();
    }, 650);
  } catch (err) {
    saveBtn.classList.remove("is-loading", "is-success");
    saveBtn.disabled = false;
    saveBtnContent.innerHTML = getQuickAddBtnDefaultHTML(addresses.length);
    alert("Error adding addresses: " + err.message);
  }
}

// --- DIRECTORY QUICK-DELETE MULTIPLE ADDRESSES MODAL ---
let activeQuickDeleteOffice = { office: "", pin: "" };
let activeQuickDeleteItems = [];
let activeQuickDeleteSelectedIds = new Set();
let isQuickDeleteTrayExpanded = false;

function getQuickDeleteBtnDefaultHTML(count = 0) {
  const baseLabel = isCurrentUserAdmin ? "Delete" : "Request Delete";
  const label = count > 0 ? `${baseLabel} (${count})` : `${baseLabel}`;
  return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
      </svg>
      <span>${label}</span>
    `;
}

function getFilteredQuickDeleteItems() {
  const q = (document.getElementById("quick-delete-filter-input")?.value || "")
    .trim()
    .toLowerCase();
  if (!q) return activeQuickDeleteItems;
  return activeQuickDeleteItems.filter((item) =>
    String(item.Address || "")
      .toLowerCase()
      .includes(q),
  );
}

function quickDeleteForOffice(officeName, pinNumber) {
  closeAllDirectoryActionTrays();

  const cleanPin =
    pinNumber && pinNumber !== "N/A" ? String(pinNumber).trim() : "";
  activeQuickDeleteOffice = {
    office: officeName || "",
    pin: cleanPin,
  };
  activeQuickDeleteSelectedIds = new Set();
  isQuickDeleteTrayExpanded = false;

  const targetLower = activeQuickDeleteOffice.office.trim().toLowerCase();
  activeQuickDeleteItems = (cachedPostOffices || [])
    .filter(
      (r) =>
        String(r.Office || "")
          .trim()
          .toLowerCase() === targetLower,
    )
    .sort((a, b) =>
      String(a.Address || "").localeCompare(String(b.Address || "")),
    );

  document.getElementById("quick-delete-subtitle").textContent = `🏢 ${
    activeQuickDeleteOffice.office
  }${cleanPin ? ` • 📍 ${cleanPin}` : ""}`;

  const filterInput = document.getElementById("quick-delete-filter-input");
  if (filterInput) filterInput.value = "";

  const submitBtn = document.getElementById("quick-delete-submit-btn");
  submitBtn.classList.remove("is-loading", "is-success");

  renderQuickDeleteChips();

  const overlay = document.getElementById("quick-delete-modal-overlay");
  const chipsContainer = document.getElementById(
    "quick-delete-chips-container",
  );
  overlay.classList.add("show");
  if (chipsContainer) chipsContainer.scrollTop = 0;
  overlay.scrollTop = 0;
}

function closeQuickDeleteModal() {
  const overlay = document.getElementById("quick-delete-modal-overlay");
  const chipsContainer = document.getElementById(
    "quick-delete-chips-container",
  );
  isQuickDeleteTrayExpanded = false;
  overlay?.classList.remove("show");
  if (chipsContainer) chipsContainer.scrollTop = 0;
  if (overlay) overlay.scrollTop = 0;
}

function renderQuickDeleteChips() {
  const container = document.getElementById("quick-delete-chips-container");
  if (!container) return;

  const visibleItems = getFilteredQuickDeleteItems();

  if (visibleItems.length === 0) {
    container.innerHTML = `<div style="width: 100%; text-align: center; padding: 18px 8px; font-size: 13px; color: var(--text-light);">No matching addresses found.</div>`;
  } else {
    container.innerHTML = visibleItems
      .map((item) => {
        const idStr = String(item.id);
        const isSelected = activeQuickDeleteSelectedIds.has(idStr);
        return `
            <button
              type="button"
              class="delete-select-chip ${isSelected ? "selected" : ""}"
              data-delete-id="${escapeHTML(idStr)}"
              onclick="toggleQuickDeleteItem('${escapeForOnclick(
                idStr,
              )}', this)"
            >
              <span class="delete-chip-check">${isSelected ? "✓" : ""}</span>
              <span>${escapeHTML(item.Address)}</span>
            </button>`;
      })
      .join("");
  }

  updateQuickDeleteUI();
}

function toggleQuickDeleteItem(idStr, chipEl) {
  if (activeQuickDeleteSelectedIds.has(idStr)) {
    activeQuickDeleteSelectedIds.delete(idStr);
    chipEl?.classList.remove("selected");
    const chk = chipEl?.querySelector(".delete-chip-check");
    if (chk) chk.textContent = "";
  } else {
    activeQuickDeleteSelectedIds.add(idStr);
    chipEl?.classList.add("selected");
    const chk = chipEl?.querySelector(".delete-chip-check");
    if (chk) chk.textContent = "✓";
  }

  if (navigator.vibrate) navigator.vibrate(20);
  updateQuickDeleteUI();
}

function renderQuickDeleteSelectedTray() {
  const box = document.getElementById("quick-delete-selected-box");
  const labelEl = document.getElementById("quick-delete-selected-label");
  const chipsEl = document.getElementById("quick-delete-selected-chips");
  const expandBtn = document.getElementById("quick-delete-expand-btn");
  if (!box || !chipsEl) return;

  const count = activeQuickDeleteSelectedIds.size;
  if (count === 0) {
    isQuickDeleteTrayExpanded = false;
    box.classList.add("hidden");
    chipsEl.innerHTML = "";
    chipsEl.classList.remove("is-expanded");
    return;
  }

  const byId = new Map(
    activeQuickDeleteItems.map((item) => [String(item.id), item.Address]),
  );

  // Newest selections appear first so each tap is immediately visible
  const selectedIdsNewestFirst = Array.from(
    activeQuickDeleteSelectedIds,
  ).reverse();

  chipsEl.innerHTML = selectedIdsNewestFirst
    .map((idStr) => {
      const addr = byId.get(idStr);
      if (!addr) return "";
      return `
        <span class="delete-selected-pill">
          <span>${escapeHTML(addr)}</span>
          <button
            type="button"
            onclick="removeQuickDeleteSelectedChip('${escapeForOnclick(
              idStr,
            )}')"
            title="Remove from deletion list"
            aria-label="Remove ${escapeHTML(addr)}"
          >✕</button>
        </span>`;
    })
    .join("");

  if (labelEl) {
    labelEl.textContent = `${count} ${
      count === 1 ? "address" : "addresses"
    } marked for deletion`;
  }

  if (count <= 3) {
    isQuickDeleteTrayExpanded = false;
    expandBtn?.classList.add("hidden");
  } else if (expandBtn) {
    expandBtn.classList.remove("hidden");
    expandBtn.textContent = isQuickDeleteTrayExpanded ? "Compact" : "Expand";
  }

  chipsEl.classList.toggle("is-expanded", isQuickDeleteTrayExpanded);
  box.classList.remove("hidden");
}

function removeQuickDeleteSelectedChip(idStr) {
  activeQuickDeleteSelectedIds.delete(idStr);

  // Sync the matching main picker chip in-place without losing scroll position
  const container = document.getElementById("quick-delete-chips-container");
  if (container) {
    const btn = container.querySelector(
      `.delete-select-chip[data-delete-id="${CSS.escape(String(idStr))}"]`,
    );
    if (btn) {
      btn.classList.remove("selected");
      const chk = btn.querySelector(".delete-chip-check");
      if (chk) chk.textContent = "";
    }
  }

  if (navigator.vibrate) navigator.vibrate(15);
  updateQuickDeleteUI();
}

function clearAllQuickDeleteSelected() {
  activeQuickDeleteSelectedIds.clear();
  isQuickDeleteTrayExpanded = false;
  if (navigator.vibrate) navigator.vibrate(20);
  renderQuickDeleteChips();
}

function toggleQuickDeleteTrayExpand() {
  isQuickDeleteTrayExpanded = !isQuickDeleteTrayExpanded;
  renderQuickDeleteSelectedTray();
}

function toggleSelectAllQuickDelete() {
  const visibleItems = getFilteredQuickDeleteItems();
  if (visibleItems.length === 0) return;

  const allVisibleSelected = visibleItems.every((item) =>
    activeQuickDeleteSelectedIds.has(String(item.id)),
  );

  visibleItems.forEach((item) => {
    const idStr = String(item.id);
    if (allVisibleSelected) activeQuickDeleteSelectedIds.delete(idStr);
    else activeQuickDeleteSelectedIds.add(idStr);
  });

  renderQuickDeleteChips();
}

function updateQuickDeleteUI() {
  const count = activeQuickDeleteSelectedIds.size;
  const countEl = document.getElementById("quick-delete-count");
  const selectAllBtn = document.getElementById("quick-delete-select-all-btn");
  const submitBtn = document.getElementById("quick-delete-submit-btn");
  const submitBtnContent = document.getElementById(
    "quick-delete-submit-btn-content",
  );

  if (countEl) {
    countEl.textContent = `${count} of ${activeQuickDeleteItems.length} selected`;
    countEl.style.color = count > 0 ? "#ef4444" : "var(--text-light)";
  }

  const visibleItems = getFilteredQuickDeleteItems();
  const allVisibleSelected =
    visibleItems.length > 0 &&
    visibleItems.every((item) =>
      activeQuickDeleteSelectedIds.has(String(item.id)),
    );
  if (selectAllBtn) {
    selectAllBtn.textContent = allVisibleSelected
      ? "Deselect All"
      : "Select All";
  }

  if (
    submitBtn &&
    !submitBtn.classList.contains("is-loading") &&
    !submitBtn.classList.contains("is-success")
  ) {
    submitBtn.disabled = count === 0;
    submitBtnContent.innerHTML = getQuickDeleteBtnDefaultHTML(count);
  }

  renderQuickDeleteSelectedTray();
}

function confirmQuickDeleteModal() {
  const count = activeQuickDeleteSelectedIds.size;
  if (count === 0) return;

  const title = isCurrentUserAdmin
    ? `Admin: Delete ${count} ${count === 1 ? "Address" : "Addresses"}?`
    : `Request Deletion of ${count} ${count === 1 ? "Address" : "Addresses"}?`;

  const message = isCurrentUserAdmin
    ? `This will immediately delete ${count} selected ${
        count === 1 ? "address" : "addresses"
      } from ${activeQuickDeleteOffice.office}. Continue?`
    : `This will submit ${count} deletion ${
        count === 1 ? "request" : "requests"
      } for ${activeQuickDeleteOffice.office} to the community for approval.`;

  const btnText = isCurrentUserAdmin ? "Delete Instantly" : "Submit Requests";

  showCustomConfirm(title, message, btnText, () => {
    executeQuickDeleteModal();
  });
}

async function executeQuickDeleteModal() {
  if (!(await ensureOnline("Connect to internet to save changes."))) return;

  const idsToDelete = Array.from(activeQuickDeleteSelectedIds);
  if (idsToDelete.length === 0) return;

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (!session || !session.user) {
    closeQuickDeleteModal();
    checkUserSession();
    return alert("Your session has expired. Please sign in again.");
  }

  const submitBtn = document.getElementById("quick-delete-submit-btn");
  const submitBtnContent = document.getElementById(
    "quick-delete-submit-btn-content",
  );

  submitBtn.classList.add("is-loading");
  submitBtn.disabled = true;
  submitBtnContent.innerHTML = `
      <div class="btn-spinner"></div>
      <span>Deleting...</span>
    `;

  const payloads = idsToDelete.map((id) => ({
    post_office_id: id,
    action_type: "DELETE",
    proposed_data: {},
    requested_by: session.user.id,
  }));

  try {
    if (isCurrentUserAdmin) {
      const { error } = await supabaseClient.rpc("admin_direct_submit", {
        request_payloads: payloads,
      });
      if (error) throw error;

      idsToDelete.forEach((id) => removeLocalPostOffice(id));
      invalidateApprovalsCache();

      submitBtn.classList.remove("is-loading");
      submitBtn.classList.add("is-success");
      submitBtnContent.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline class="checkmark-path" points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Deleted!</span>
        `;
      showToast(
        `🗑️ Admin: Deleted ${idsToDelete.length} ${
          idsToDelete.length === 1 ? "address" : "addresses"
        } from ${activeQuickDeleteOffice.office}.`,
      );
    } else {
      const { error } = await supabaseClient
        .from("edit_requests")
        .insert(payloads);
      if (error) throw error;

      invalidateApprovalsCache();

      submitBtn.classList.remove("is-loading");
      submitBtn.classList.add("is-success");
      submitBtnContent.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline class="checkmark-path" points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Submitted!</span>
        `;
      showToast(
        `📝 ${idsToDelete.length} deletion ${
          idsToDelete.length === 1 ? "request" : "requests"
        } submitted for approval!`,
      );
    }

    setTimeout(() => {
      closeQuickDeleteModal();
    }, 650);
  } catch (err) {
    submitBtn.classList.remove("is-loading", "is-success");
    submitBtn.disabled = false;
    submitBtnContent.innerHTML = getQuickDeleteBtnDefaultHTML(
      idsToDelete.length,
    );
    alert("Error deleting addresses: " + err.message);
  }
}

// --- 1-TAP SHARED PRIORITY TOGGLE (OPTIMISTIC UI + ROLLBACK) ---
async function toggleRecordPriority(recordId, btnEl) {
  if (!(await ensureOnline("Connect to internet to update priority."))) return;

  const idx = cachedPostOffices.findIndex(
    (r) => String(r.id) === String(recordId),
  );
  if (idx === -1) return;

  const prevPriority = Number(cachedPostOffices[idx].priority) >= 1 ? 1 : 0;
  const nextPriority = prevPriority === 1 ? 0 : 1;

  // Optimistic local update
  cachedPostOffices[idx].priority = nextPriority;
  updateSearchIndexRow(cachedPostOffices[idx]);
  persistPostOfficeCache();

  if (btnEl) {
    btnEl.classList.toggle("is-active", nextPriority === 1);
    const svg = btnEl.querySelector("svg");
    if (svg) {
      svg.setAttribute("fill", nextPriority === 1 ? "currentColor" : "none");
    }
  }

  closeAllDirectoryActionTrays();
  refreshSearchInPlace();
  refreshDirectoryInPlace();

  showToast(
    nextPriority === 1
      ? "⚡ Marked as Frequent (shared with all staff)"
      : "Removed from Frequent priority",
    nextPriority === 1 ? "success" : "info",
  );

  try {
    const numericId = Number(recordId);
    const { error } = await supabaseClient.rpc("update_address_priorities", {
      promote_ids: nextPriority === 1 ? [numericId] : [],
      demote_ids: nextPriority === 0 ? [numericId] : [],
    });
    if (error) throw error;
  } catch (err) {
    // Rollback on failure
    cachedPostOffices[idx].priority = prevPriority;
    updateSearchIndexRow(cachedPostOffices[idx]);
    persistPostOfficeCache();
    refreshSearchInPlace();
    refreshDirectoryInPlace();
    alert("Failed to update priority: " + err.message);
  }
}

// --- DIRECTORY BULK PRIORITY (FREQUENT ADDRESSES) MODAL ---
let activeQuickPriorityOffice = { office: "", pin: "" };
let activeQuickPriorityItems = [];
let activeQuickPriorityInitial = new Set();
let activeQuickPriorityDraft = new Set();
let quickPriorityNonBoOnly = false;

function getQuickPriorityDelta() {
  const promoteIds = [];
  const demoteIds = [];

  activeQuickPriorityDraft.forEach((idStr) => {
    if (!activeQuickPriorityInitial.has(idStr)) {
      promoteIds.push(Number(idStr));
    }
  });

  activeQuickPriorityInitial.forEach((idStr) => {
    if (!activeQuickPriorityDraft.has(idStr)) {
      demoteIds.push(Number(idStr));
    }
  });

  return {
    promoteIds,
    demoteIds,
    totalChanges: promoteIds.length + demoteIds.length,
  };
}

function getQuickPrioritySaveBtnHTML(changeCount = 0) {
  const label =
    changeCount > 0
      ? `Save (${changeCount} ${changeCount === 1 ? "change" : "changes"})`
      : "Save Changes";
  return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
      <span>${label}</span>
    `;
}

function quickPriorityForOffice(officeName, pinNumber) {
  closeAllDirectoryActionTrays();

  const cleanPin =
    pinNumber && pinNumber !== "N/A" ? String(pinNumber).trim() : "";
  activeQuickPriorityOffice = {
    office: officeName || "",
    pin: cleanPin,
  };
  quickPriorityNonBoOnly = false;

  const targetLower = activeQuickPriorityOffice.office.trim().toLowerCase();
  activeQuickPriorityItems = (cachedPostOffices || [])
    .filter(
      (r) =>
        String(r.Office || "")
          .trim()
          .toLowerCase() === targetLower,
    )
    .sort((a, b) => compareByPriorityOnly(a, b));

  activeQuickPriorityInitial = new Set();
  activeQuickPriorityItems.forEach((item) => {
    if (Number(item.priority) >= 1) {
      activeQuickPriorityInitial.add(String(item.id));
    }
  });
  activeQuickPriorityDraft = new Set(activeQuickPriorityInitial);

  document.getElementById("quick-priority-subtitle").textContent = `🏢 ${
    activeQuickPriorityOffice.office
  }${cleanPin ? ` • 📍 ${cleanPin}` : ""}`;

  const filterInput = document.getElementById("quick-priority-filter-input");
  if (filterInput) filterInput.value = "";

  const saveBtn = document.getElementById("quick-priority-save-btn");
  saveBtn.classList.remove("is-loading", "is-success");

  renderQuickPriorityChips();

  const overlay = document.getElementById("quick-priority-modal-overlay");
  const chipsContainer = document.getElementById(
    "quick-priority-chips-container",
  );
  overlay.classList.add("show");
  if (chipsContainer) chipsContainer.scrollTop = 0;
  overlay.scrollTop = 0;
}

function closeQuickPriorityModal() {
  const overlay = document.getElementById("quick-priority-modal-overlay");
  const chipsContainer = document.getElementById(
    "quick-priority-chips-container",
  );
  overlay?.classList.remove("show");
  if (chipsContainer) chipsContainer.scrollTop = 0;
  if (overlay) overlay.scrollTop = 0;
}

function toggleQuickPriorityNonBoOnly() {
  quickPriorityNonBoOnly = !quickPriorityNonBoOnly;
  renderQuickPriorityChips();
}

function renderQuickPriorityChips() {
  const container = document.getElementById("quick-priority-chips-container");
  if (!container) return;

  const q = (
    document.getElementById("quick-priority-filter-input")?.value || ""
  )
    .trim()
    .toLowerCase();

  const visibleItems = activeQuickPriorityItems.filter((item) => {
    const ot = detectOfficeType(item.Address);
    if (quickPriorityNonBoOnly && ot) return false;
    if (q && !String(item.Address || "").toLowerCase().includes(q)) return false;
    return true;
  });

  if (visibleItems.length === 0) {
    container.innerHTML = `<div style="width: 100%; text-align: center; padding: 18px 8px; font-size: 13px; color: var(--text-light);">No matching addresses found.</div>`;
  } else {
    container.innerHTML = visibleItems
      .map((item) => {
        const idStr = String(item.id);
        const ot = detectOfficeType(item.Address);
        const isAutoTop = ot === "HO" || ot === "SO";
        const isSelected = activeQuickPriorityDraft.has(idStr);

        if (isAutoTop) {
          return `
            <button type="button" class="priority-select-chip is-auto-top" disabled title="${ot} always ranks on top automatically">
              <span>📮 ${escapeHTML(item.Address)}</span>
              <span class="priority-chip-tag">Auto-Top</span>
            </button>`;
        }

        return `
          <button
            type="button"
            class="priority-select-chip ${isSelected ? "selected" : ""}"
            onclick="toggleQuickPriorityItem('${escapeForOnclick(idStr)}', this)"
          >
            <span>${isSelected ? "⚡" : ot === "BO" ? "📮" : "•"}</span>
            <span>${escapeHTML(item.Address)}</span>
            ${ot === "BO" ? `<span class="priority-chip-tag">Auto-BO</span>` : ""}
          </button>`;
      })
      .join("");
  }

  updateQuickPriorityUI();
}

function toggleQuickPriorityItem(idStr, chipEl) {
  const item = activeQuickPriorityItems.find((i) => String(i.id) === idStr);
  const ot = item ? detectOfficeType(item.Address) : null;

  if (activeQuickPriorityDraft.has(idStr)) {
    activeQuickPriorityDraft.delete(idStr);
    chipEl?.classList.remove("selected");
    const iconSpan = chipEl?.querySelector("span");
    if (iconSpan) iconSpan.textContent = ot === "BO" ? "📮" : "•";
  } else {
    activeQuickPriorityDraft.add(idStr);
    chipEl?.classList.add("selected");
    const iconSpan = chipEl?.querySelector("span");
    if (iconSpan) iconSpan.textContent = "⚡";
  }

  if (navigator.vibrate) navigator.vibrate(20);
  updateQuickPriorityUI();
}

function updateQuickPriorityUI() {
  const countEl = document.getElementById("quick-priority-count");
  const hideBoBtn = document.getElementById("quick-priority-hide-bo-btn");
  const saveBtn = document.getElementById("quick-priority-save-btn");
  const saveBtnContent = document.getElementById(
    "quick-priority-save-btn-content",
  );

  const { totalChanges } = getQuickPriorityDelta();

  if (countEl) {
    countEl.textContent = `${activeQuickPriorityDraft.size} marked Frequent`;
    countEl.style.color =
      activeQuickPriorityDraft.size > 0 ? "#d97706" : "var(--text-light)";
  }

  if (hideBoBtn) {
    hideBoBtn.textContent = quickPriorityNonBoOnly
      ? "Show All"
      : "Hide BO/SO/HO";
  }

  if (
    saveBtn &&
    !saveBtn.classList.contains("is-loading") &&
    !saveBtn.classList.contains("is-success")
  ) {
    saveBtn.disabled = totalChanges === 0;
    saveBtnContent.innerHTML = getQuickPrioritySaveBtnHTML(totalChanges);
  }
}

async function saveQuickPriorityModal() {
  if (!(await ensureOnline("Connect to internet to save priority changes."))) {
    return;
  }

  const { promoteIds, demoteIds, totalChanges } = getQuickPriorityDelta();
  if (totalChanges === 0) return;

  const saveBtn = document.getElementById("quick-priority-save-btn");
  const saveBtnContent = document.getElementById(
    "quick-priority-save-btn-content",
  );

  saveBtn.classList.add("is-loading");
  saveBtn.disabled = true;
  saveBtnContent.innerHTML = `
      <div class="btn-spinner"></div>
      <span>Saving...</span>
    `;

  try {
    const { error } = await supabaseClient.rpc("update_address_priorities", {
      promote_ids: promoteIds,
      demote_ids: demoteIds,
    });
    if (error) throw error;

    const promoteSet = new Set(promoteIds.map(String));
    const demoteSet = new Set(demoteIds.map(String));

    cachedPostOffices.forEach((row) => {
      const idStr = String(row.id);
      if (promoteSet.has(idStr)) {
        row.priority = 1;
        updateSearchIndexRow(row);
      } else if (demoteSet.has(idStr)) {
        row.priority = 0;
        updateSearchIndexRow(row);
      }
    });

    persistPostOfficeCache();
    refreshSearchInPlace();
    refreshDirectoryInPlace();

    saveBtn.classList.remove("is-loading");
    saveBtn.classList.add("is-success");
    saveBtnContent.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline class="checkmark-path" points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Saved!</span>
      `;
    showToast(
      `⚡ Updated ${totalChanges} ${
        totalChanges === 1 ? "address" : "addresses"
      } for all staff!`,
    );

    setTimeout(() => {
      closeQuickPriorityModal();
    }, 600);
  } catch (err) {
    saveBtn.classList.remove("is-loading", "is-success");
    saveBtn.disabled = false;
    saveBtnContent.innerHTML = getQuickPrioritySaveBtnHTML(totalChanges);
    alert("Error updating priorities: " + err.message);
  }
}
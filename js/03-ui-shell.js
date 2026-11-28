// =========================================================
// 03-UI-SHELL.JS — Shell, Navigation, Theme, PWA & Gestures
// =========================================================

// --- SMOOTH SPLASH CONTROLLER ---
function showSplashScreen() {
  const splash = document.getElementById("splash-screen");
  const content = document.getElementById("splash-content");
  if (!splash) return;
  if (content) {
    const h = window.visualViewport
      ? window.visualViewport.height
      : window.innerHeight;
    if (h > 0) content.style.top = Math.round(h / 2) + "px";
  }
  splash.classList.remove("hidden-splash");
}

function hideSplashScreen() {
  const splash = document.getElementById("splash-screen");
  if (!splash || splash.classList.contains("hidden-splash")) return;

  const elapsed = performance.now() - SPLASH_START_TIME;
  const remaining = Math.max(0, SPLASH_MIN_DURATION_MS - elapsed);

  setTimeout(() => {
    requestAnimationFrame(() => {
      splash.classList.add("hidden-splash");
    });
  }, remaining);
}

// Failsafe: never allow splash screen to hang if network/CDN stalls
setTimeout(hideSplashScreen, 4500);

// --- APP VERSION & UPDATE CHECK ---
function initAppVersion() {
  document.querySelectorAll("[data-app-version]").forEach((el) => {
    el.textContent = `v${APP_VERSION}`;
  });
  const buildEl = document.getElementById("app-build-code");
  if (buildEl) buildEl.textContent = `#${APP_BUILD_CODE}`;

  const previousVersion = localStorage.getItem("dakmitra_app_version");
  if (previousVersion && previousVersion !== APP_VERSION) {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.update());
      });
    }
    setTimeout(() => {
      showToast(`🎉 Updated to DakMitra v${APP_VERSION}`);
    }, 1200);
  }
  localStorage.setItem("dakmitra_app_version", APP_VERSION);
}

async function checkForAppUpdate() {
  if (!(await ensureOnline("Connect to internet to check for updates.")))
    return;

  const btn = document.getElementById("check-updates-btn");
  setButtonState(btn, "loading", "Checking...");

  if (!("serviceWorker" in navigator)) {
    setButtonState(btn, "success", "Up to Date");
    showToast(`✅ DakMitra v${APP_VERSION} is up to date!`);
    setTimeout(() => setButtonState(btn, "idle"), 1800);
    return;
  }

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    let foundUpdate = false;

    for (const reg of regs) {
      await reg.update();
      if (reg.installing || reg.waiting) {
        foundUpdate = true;
      }
    }

    if (foundUpdate) {
      setButtonState(btn, "loading", "Installing...");
      showToast("⬇️ New update found — installing now...", "info");
      setTimeout(() => setButtonState(btn, "idle"), 4500);
    } else {
      setButtonState(btn, "success", "Up to Date");
      showToast(`✅ DakMitra v${APP_VERSION} is up to date!`);
      setTimeout(() => setButtonState(btn, "idle"), 1800);
    }
  } catch (err) {
    setButtonState(btn, "idle");
    showToast("⚠️ Could not check for updates right now.", "warning");
  }
}

initAppVersion();

// --- THEME LOGIC (Exact System Bar & Notch Color Match) ---
function syncSettingsThemeUI(themePref) {
  const mode =
    themePref === "light" || themePref === "dark" ? themePref : "system";
  const tabsEl = document.getElementById("settings-theme-tabs");
  if (tabsEl) {
    tabsEl.classList.toggle("is-tab-1", mode === "dark");
    tabsEl.classList.toggle("is-tab-2", mode === "system");
  }
  document
    .getElementById("theme-opt-light")
    ?.classList.toggle("active", mode === "light");
  document
    .getElementById("theme-opt-dark")
    ?.classList.toggle("active", mode === "dark");
  document
    .getElementById("theme-opt-system")
    ?.classList.toggle("active", mode === "system");
}

function applyTheme(theme) {
  let isDark = false;
  if (theme === "system") {
    isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute(
      "data-theme",
      isDark ? "dark" : "light"
    );
  } else {
    isDark = theme === "dark";
    document.documentElement.setAttribute("data-theme", theme);
  }
  localStorage.setItem("app-theme", theme);

  const bgColor = isDark ? "#090e17" : "#f8fafc";
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  document.documentElement.style.backgroundColor = bgColor;
  const metaTheme = document.getElementById("meta-theme-color");
  if (metaTheme) {
    metaTheme.setAttribute("content", bgColor);
  }
  syncSettingsThemeUI(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const newTheme = current === "dark" ? "light" : "dark";
  applyTheme(newTheme);
}

const savedTheme = localStorage.getItem("app-theme") || "system";
applyTheme(savedTheme);

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if ((localStorage.getItem("app-theme") || "system") === "system") {
      applyTheme("system");
    }
  });

// --- PWA INSTALLATION & AUTO-UPDATE ---
if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then((reg) => {
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible" && navigator.onLine) {
            reg.update().catch(() => {});
          }
        });
      })
      .catch((err) => console.log("SW failed: ", err));
  });
}

let deferredPrompt;
const installBtn = document.getElementById("install-app-btn");
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn?.classList.remove("hidden");
});
installBtn?.addEventListener("click", async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") installBtn.classList.add("hidden");
    deferredPrompt = null;
  }
});

window.addEventListener("appinstalled", () => {
  installBtn?.classList.add("hidden");
  deferredPrompt = null;
});

// --- SIDEBAR & VIEW SWITCHING ---
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebar-overlay").classList.toggle("show");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("show");
}

function resetOuterPageScroll(activeViewEl) {
  const applyReset = () => {
    window.scrollTo(0, 0);
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    if (activeViewEl) {
      activeViewEl.scrollTop = 0;
    }

    const mainContainer = document.querySelector(
      "#dashboard-view main.container"
    );
    if (mainContainer) mainContainer.scrollTop = 0;
  };

  applyReset();
  requestAnimationFrame(applyReset);
}

function switchDashboardView(viewId) {
  if (typeof closeAllDirectoryActionTrays === "function") {
    closeAllDirectoryActionTrays();
  }

  if (viewId !== "learn" && typeof pauseOrLeaveLearnView === "function") {
    pauseOrLeaveLearnView();
  }

  const prevActiveSection = document.querySelector(".view-section.active");
  const prevViewId = prevActiveSection?.id?.replace(/^view-/, "");
  if (prevViewId && prevViewId !== viewId && prevViewId !== "feedback") {
    window.lastDashboardView = prevViewId;
  }

  document
    .querySelectorAll(".view-section, .sidebar-menu-item, .bottom-nav-item")
    .forEach((el) => {
      el.classList.remove("active");
    });

  const activeViewEl = document.getElementById("view-" + viewId);
  activeViewEl?.classList.add("active");
  document.getElementById("nav-" + viewId)?.classList.add("active");
  document.getElementById("bottom-nav-" + viewId)?.classList.add("active");

  if (
    document.activeElement &&
    typeof document.activeElement.blur === "function" &&
    (!activeViewEl || !activeViewEl.contains(document.activeElement))
  ) {
    document.activeElement.blur();
  }
  resetOuterPageScroll(activeViewEl);

  const searchVal = document.getElementById("search-input")?.value.trim();
  const officeFilterVal = document
    .getElementById("filter-office")
    ?.value.trim();
  const pinFilterVal = document.getElementById("filter-pin")?.value.trim();
  const isSearchBlank = !searchVal && !officeFilterVal && !pinFilterVal;

  if (viewId !== "search") {
    if (window.searchObserver) window.searchObserver.disconnect();

    if (isSearchBlank && window.searchDisplayLimit > 10) {
      window.searchDisplayLimit = 10;
      if (typeof renderResults === "function") renderResults(false);
      if (window.searchObserver) window.searchObserver.disconnect();
    }
  } else {
    if (isSearchBlank) {
      const area = document.getElementById("results-display-area");
      setSearchHeroCollapsed(false, true);
      if (area) area.scrollTop = 0;

      document
        .getElementById("advanced-filters-panel")
        ?.classList.add("hidden");
      document.getElementById("search-history-panel")?.classList.add("hidden");
      closeAllDropdowns();

      if (typeof renderResults === "function") renderResults(false);
    } else {
      if (typeof setupSearchObserver === "function") setupSearchObserver();
    }
  }

  if (viewId === "favorites") {
    if (typeof renderFavorites === "function") renderFavorites();
  } else if (viewId === "approvals") {
    approvalsHeroController.setCollapsed(false, true);
    if (typeof switchApprovalTab === "function") {
      switchApprovalTab(currentApprovalTab);
    }
  } else if (viewId === "directory") {
    directoryHeroController.setCollapsed(false, true);
    if (typeof renderDirectory === "function") renderDirectory();
  } else if (viewId === "members") {
    membersHeroController.setCollapsed(false, true);
    if (typeof renderMembersDirectory === "function") renderMembersDirectory();
  } else if (viewId === "feedback") {
    feedbackHeroController.setCollapsed(false, true);
    if (typeof renderFeedbackView === "function") renderFeedbackView();
  } else if (viewId === "learn") {
    if (typeof renderLearnView === "function") renderLearnView();
  } else if (viewId === "superadmin") {
    superadminHeroController.setCollapsed(false, true);
    if (typeof renderSuperadminView === "function") renderSuperadminView();
  } else if (viewId === "settings") {
    settingsHeroController.setCollapsed(false, true);
    if (typeof updateSettingsStatusUI === "function") updateSettingsStatusUI();
  } else if (viewId === "upload") {
    uploadHeroController.setCollapsed(false, true);
    if (typeof syncUploadAdminUI === "function") syncUploadAdminUI();
    if (typeof updateManualSubmitCount === "function")
      updateManualSubmitCount();
  }

  closeSidebar();
}

// --- PWA ANDROID / BROWSER BACK BUTTON HANDLER ---
(function initPwaBackNavigation() {
  let isHandlingPopstate = false;
  let isRestoringFromPopstate = false;
  let rootGuardPushed = false;

  const DISMISSIBLE_MODAL_SELECTOR =
    ".modal-overlay.show:not(#maintenance-overlay)";

  function getActiveDashboardViewId() {
    return (
      document
        .querySelector(".view-section.active")
        ?.id?.replace(/^view-/, "") || "search"
    );
  }

  function isMaintenanceLocked() {
    return !!document
      .getElementById("maintenance-overlay")
      ?.classList.contains("show");
  }

  function isRootCleanState() {
    const hasOpenModal = !!document.querySelector(DISMISSIBLE_MODAL_SELECTOR);
    const hasOpenSidebar = !!document
      .getElementById("sidebar")
      ?.classList.contains("open");
    const hasOpenPopover = !!document
      .getElementById("directory-floating-bar")
      ?.classList.contains("open");
    const searchActive = !!document
      .getElementById("view-search")
      ?.classList.contains("active");

    return !hasOpenModal && !hasOpenSidebar && !hasOpenPopover && searchActive;
  }

  function pushNavStep(tag, viewId = null) {
    if (isHandlingPopstate || isRestoringFromPopstate) return;
    try {
      const resolvedView = viewId || getActiveDashboardViewId();
      if (
        tag.startsWith("view:") &&
        history.state?.dakmitraNav === tag &&
        history.state?.viewId === resolvedView
      ) {
        return;
      }
      history.pushState(
        { dakmitraNav: tag, viewId: resolvedView, ts: Date.now() },
        ""
      );
      rootGuardPushed = true;
    } catch (_) {}
  }

  window.pushPwaNavStep = pushNavStep;

  function ensureBaseHistoryState() {
    try {
      if (!history.state || !history.state.dakmitraBase) {
        history.replaceState({ dakmitraBase: true }, "");
      }
      if (!rootGuardPushed) {
        history.pushState({ dakmitraNav: "root", viewId: "search" }, "");
        rootGuardPushed = true;
      }
    } catch (_) {}
  }

  window.addEventListener("load", ensureBaseHistoryState);
  setTimeout(ensureBaseHistoryState, 0);

  const origToggleSidebar = window.toggleSidebar;
  if (typeof origToggleSidebar === "function") {
    window.toggleSidebar = function () {
      const wasOpen = document
        .getElementById("sidebar")
        ?.classList.contains("open");
      origToggleSidebar.apply(this, arguments);
      const isNowOpen = document
        .getElementById("sidebar")
        ?.classList.contains("open");
      if (!wasOpen && isNowOpen) {
        pushNavStep("sidebar");
      }
    };
  }

  const origSwitchView = window.switchDashboardView;
  if (typeof origSwitchView === "function") {
    window.switchDashboardView = function (viewId) {
      origSwitchView.apply(this, arguments);
      if (viewId) {
        pushNavStep("view:" + viewId, viewId);
      }
    };
  }

  const modalObserver = new MutationObserver((mutations) => {
    if (isHandlingPopstate) return;
    for (const m of mutations) {
      if (
        m.type === "attributes" &&
        m.attributeName === "class" &&
        m.target.id !== "maintenance-overlay" &&
        m.target.classList?.contains("modal-overlay") &&
        m.target.classList.contains("show")
      ) {
        pushNavStep("modal:" + (m.target.id || "dialog"));
        break;
      }
    }
  });

  document
    .querySelectorAll(".modal-overlay:not(#maintenance-overlay)")
    .forEach((modal) => {
      modalObserver.observe(modal, { attributes: true });
    });

  window.addEventListener("popstate", (event) => {
    if (isMaintenanceLocked()) {
      try {
        history.pushState(
          { dakmitraNav: "maintenance", viewId: getActiveDashboardViewId() },
          ""
        );
      } catch (_) {}
      return;
    }

    isHandlingPopstate = true;
    let shouldSkipStaleStep = false;

    try {
      const openModals = Array.from(
        document.querySelectorAll(DISMISSIBLE_MODAL_SELECTOR)
      );
      if (openModals.length > 0) {
        const topModal = openModals[openModals.length - 1];
        if (
          topModal.id === "edit-record-modal-overlay" &&
          window.closeEditRecordModal
        ) {
          closeEditRecordModal();
        } else if (
          topModal.id === "quick-add-modal-overlay" &&
          window.closeQuickAddModal
        ) {
          closeQuickAddModal();
        } else if (
          topModal.id === "quick-delete-modal-overlay" &&
          window.closeQuickDeleteModal
        ) {
          closeQuickDeleteModal();
        } else if (
          topModal.id === "quick-priority-modal-overlay" &&
          window.closeQuickPriorityModal
        ) {
          closeQuickPriorityModal();
        } else if (
          topModal.id === "quick-verify-modal-overlay" &&
          window.closeQuickVerifyModal
        ) {
          closeQuickVerifyModal();
        } else if (
          topModal.id === "feedback-admin-modal-overlay" &&
          window.closeFeedbackAdminModal
        ) {
          closeFeedbackAdminModal();
        } else if (
          topModal.id === "office-details-modal-overlay" &&
          window.closeOfficeDetailsModal
        ) {
          closeOfficeDetailsModal();
        } else if (
          topModal.id === "history-modal-overlay" &&
          window.closeHistoryModal
        ) {
          closeHistoryModal();
        } else if (
          topModal.id === "user-profile-modal-overlay" &&
          window.closeUserProfileModal
        ) {
          closeUserProfileModal();
        } else if (
          topModal.id === "sa-db-modal-overlay" &&
          window.closeSuperadminDbModal
        ) {
          closeSuperadminDbModal();
        } else if (
          topModal.id === "sa-user-modal-overlay" &&
          window.closeSuperadminUserModal
        ) {
          closeSuperadminUserModal();
        } else if (
          topModal.id === "crop-modal-overlay" &&
          window.closeCropModal
        ) {
          closeCropModal();
        } else if (
          topModal.id === "avatar-lightbox-overlay" &&
          window.closeProfilePhotoModal
        ) {
          closeProfilePhotoModal();
        } else if (
          topModal.id === "confirm-modal-overlay" &&
          window.closeConfirmModal
        ) {
          closeConfirmModal();
        } else if (
          topModal.id === "alert-modal-overlay" &&
          window.closeAlertModal
        ) {
          closeAlertModal();
        } else {
          topModal.classList.remove("show");
        }
        return;
      }

      const popover = document.getElementById("directory-floating-bar");
      if (popover && popover.classList.contains("open")) {
        if (typeof closeAllDirectoryActionTrays === "function") {
          closeAllDirectoryActionTrays();
        } else {
          popover.classList.remove("open");
        }
        return;
      }

      const sidebar = document.getElementById("sidebar");
      if (sidebar && sidebar.classList.contains("open")) {
        if (typeof closeSidebar === "function") {
          closeSidebar();
        } else {
          toggleSidebar();
        }
        return;
      }

      if (
        typeof handleLearnBackNavigation === "function" &&
        handleLearnBackNavigation()
      ) {
        return;
      }

      const targetView =
        event.state && typeof event.state.viewId === "string"
          ? event.state.viewId
          : "search";

      const currentViewId = getActiveDashboardViewId();

      if (
        currentViewId !== targetView &&
        typeof origSwitchView === "function"
      ) {
        isRestoringFromPopstate = true;
        try {
          origSwitchView.call(window, targetView);
        } finally {
          setTimeout(() => {
            isRestoringFromPopstate = false;
          }, 0);
        }
        return;
      }

      // Skip stale modal/sidebar history entries closed via Cancel/X
      if (
        event.state &&
        !event.state.dakmitraBase &&
        event.state.dakmitraNav &&
        event.state.dakmitraNav !== "root"
      ) {
        shouldSkipStaleStep = true;
        return;
      }

      if (isRootCleanState()) {
        showToast("Press Back again to exit DakMitra");
      }
    } finally {
      if (shouldSkipStaleStep) {
        isHandlingPopstate = false;
        history.back();
      } else {
        setTimeout(() => {
          isHandlingPopstate = false;
        }, 60);
      }
    }
  });
})();

// --- APP-WIDE SMART KEYBOARD MANAGER ---
(function initGlobalKeyboardHandler() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  let baselineHeight = Math.max(window.innerHeight, vv ? vv.height : 0);
  let lastWidth = vv ? vv.width : window.innerWidth;
  let blurTimer = null;

  function isEditableElement(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === "TEXTAREA") return !el.readOnly && !el.disabled;
    if (tag === "INPUT") {
      const nonText = [
        "checkbox",
        "radio",
        "file",
        "range",
        "button",
        "submit",
        "reset",
        "color",
        "hidden",
      ];
      return (
        !nonText.includes((el.type || "text").toLowerCase()) &&
        !el.readOnly &&
        !el.disabled
      );
    }
    return false;
  }

  function ensureFocusedInputVisible(el) {
    if (!isEditableElement(el)) return;
    if (!document.body.classList.contains("keyboard-open")) return;

    const vvTop = vv ? vv.offsetTop : 0;
    const vvHeight = vv ? vv.height : window.innerHeight;
    const rect = el.getBoundingClientRect();

    const insideModal = el.closest(".modal-overlay.show");
    const scrollParent =
      el.closest(
        ".feedback-submit-panel, .staff-detail-list, .results-container-scroll, #view-upload, #view-profile, #view-settings, #view-learn"
      ) ||
      insideModal ||
      null;

    if (scrollParent) {
      const parentRect = scrollParent.getBoundingClientRect();
      const safeTop = Math.max(
        insideModal ? vvTop + 20 : vvTop + 76,
        parentRect.top + 8
      );
      const safeBottom = Math.min(
        vvTop + vvHeight - 20,
        parentRect.bottom - 12
      );

      if (rect.top >= safeTop && rect.bottom <= safeBottom) return;

      const targetTop = rect.top - parentRect.top + scrollParent.scrollTop - 16;
      scrollParent.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
      });
    } else {
      const safeTop = vvTop + 76;
      const safeBottom = vvTop + vvHeight - 72;
      if (rect.top >= safeTop && rect.bottom <= safeBottom) return;

      const desiredTop = vvTop + Math.min(110, vvHeight * 0.25);
      window.scrollBy({
        top: rect.top - desiredTop,
        behavior: "smooth",
      });
    }
  }

  function syncKeyboardState() {
    const vvHeight = vv ? vv.height : window.innerHeight;
    const vvWidth = vv ? vv.width : window.innerWidth;
    const vvTop = vv ? vv.offsetTop : 0;

    if (Math.abs(vvWidth - lastWidth) > 50) {
      lastWidth = vvWidth;
      baselineHeight = Math.max(window.innerHeight, vvHeight);
    }

    const activeEl = document.activeElement;
    const activeIsEditable = isEditableElement(activeEl);

    if (!activeIsEditable && vvHeight > baselineHeight) {
      baselineHeight = vvHeight;
    }

    const kbHeight = Math.max(0, Math.round(baselineHeight - vvHeight));
    const fixedOffset = Math.max(
      0,
      Math.round(window.innerHeight - vvHeight - vvTop)
    );
    const isKeyboardOpen = activeIsEditable && kbHeight > 110;

    root.style.setProperty("--vvh", `${Math.round(vvHeight)}px`);
    root.style.setProperty("--vv-top", `${Math.round(vvTop)}px`);
    root.style.setProperty("--kb-height", `${isKeyboardOpen ? kbHeight : 0}px`);
    root.style.setProperty(
      "--kb-fixed-offset",
      `${isKeyboardOpen ? fixedOffset : 0}px`
    );

    document.body.classList.toggle("keyboard-open", isKeyboardOpen);

    // Prevent Chrome from shifting the outer page up above the keyboard on dashboard views
    const isDashboardVisible = !document
      .getElementById("dashboard-view")
      ?.classList.contains("hidden");
    if (isDashboardVisible && window.scrollY > 0) {
      window.scrollTo(0, 0);
    }

    if (isKeyboardOpen) {
      requestAnimationFrame(() => ensureFocusedInputVisible(activeEl));
    }
  }

  if (vv) {
    vv.addEventListener("resize", syncKeyboardState);
    vv.addEventListener("scroll", syncKeyboardState);
  }
  window.addEventListener("resize", syncKeyboardState);

  document.addEventListener("focusin", (e) => {
    clearTimeout(blurTimer);
    if (!isEditableElement(e.target)) return;
    syncKeyboardState();
    setTimeout(() => {
      syncKeyboardState();
      ensureFocusedInputVisible(e.target);
    }, 180);
    setTimeout(() => ensureFocusedInputVisible(e.target), 360);
  });

  document.addEventListener("focusout", () => {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(syncKeyboardState, 120);
  });
})();

// --- GLOBAL ACTIVE-WINDOW SCROLL LOCK (ALL MODALS & SIDEBAR) ---
(function initGlobalOverlayScrollLock() {
  let touchStartX = 0;
  let touchStartY = 0;

  function getTopActiveOverlay() {
    const active = Array.from(
      document.querySelectorAll(".modal-overlay.show, .sidebar.open")
    );
    if (active.length === 0) return null;

    return active.sort((a, b) => {
      const za = parseInt(getComputedStyle(a).zIndex, 10) || 0;
      const zb = parseInt(getComputedStyle(b).zIndex, 10) || 0;
      return za - zb;
    })[active.length - 1];
  }

  let lockListenersAttached = false;

  function findScrollableAncestor(target, boundaryEl) {
    let el = target instanceof Element ? target : target?.parentElement;
    while (el) {
      const style = getComputedStyle(el);
      const canScrollY =
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight + 1;

      if (canScrollY) return el;
      if (el === boundaryEl) break;
      el = el.parentElement;
    }
    return null;
  }

  function findHorizontalScrollableAncestor(target, boundaryEl) {
    let el = target instanceof Element ? target : target?.parentElement;
    while (el) {
      const style = getComputedStyle(el);
      const canScrollX =
        (style.overflowX === "auto" || style.overflowX === "scroll") &&
        el.scrollWidth > el.clientWidth + 1;

      if (canScrollX) return el;
      if (el === boundaryEl) break;
      el = el.parentElement;
    }
    return null;
  }

  function onLockTouchStart(e) {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }

  function onLockTouchMove(e) {
    const activeOverlay = getTopActiveOverlay();
    if (!activeOverlay) return;

    if (e.target.closest("#crop-stage, #lightbox-stage")) return;
    if (e.target.tagName === "INPUT" && e.target.type === "range") return;

    if (!activeOverlay.contains(e.target)) {
      e.preventDefault();
      return;
    }

    if (!e.touches || e.touches.length === 0) return;
    const deltaX = e.touches[0].clientX - touchStartX;
    const deltaY = e.touches[0].clientY - touchStartY;

    if (
      Math.abs(deltaX) > Math.abs(deltaY) &&
      findHorizontalScrollableAncestor(e.target, activeOverlay)
    ) {
      return;
    }

    if (Math.abs(deltaY) < 8) return;

    const scrollable = findScrollableAncestor(e.target, activeOverlay);
    if (!scrollable) {
      e.preventDefault();
      return;
    }

    const atTop = scrollable.scrollTop <= 0 && deltaY > 0;
    const atBottom =
      scrollable.scrollTop + scrollable.clientHeight >=
        scrollable.scrollHeight - 1 && deltaY < 0;

    if (atTop || atBottom) {
      e.preventDefault();
    }
  }

  function onLockWheel(e) {
    const activeOverlay = getTopActiveOverlay();
    if (!activeOverlay) return;

    if (!activeOverlay.contains(e.target)) {
      e.preventDefault();
      return;
    }

    if (
      Math.abs(e.deltaX) > Math.abs(e.deltaY) &&
      findHorizontalScrollableAncestor(e.target, activeOverlay)
    ) {
      return;
    }

    const scrollable = findScrollableAncestor(e.target, activeOverlay);
    if (!scrollable) {
      e.preventDefault();
      return;
    }

    const atTop = scrollable.scrollTop <= 0 && e.deltaY < 0;
    const atBottom =
      scrollable.scrollTop + scrollable.clientHeight >=
        scrollable.scrollHeight - 1 && e.deltaY > 0;

    if (atTop || atBottom) {
      e.preventDefault();
    }
  }

  function syncScrollLock() {
    const hasActiveOverlay = !!getTopActiveOverlay();
    document.documentElement.classList.toggle(
      "dm-scroll-locked",
      hasActiveOverlay
    );
    document.body.classList.toggle("dm-scroll-locked", hasActiveOverlay);

    if (hasActiveOverlay && !lockListenersAttached) {
      document.addEventListener("touchstart", onLockTouchStart, {
        passive: true,
      });
      document.addEventListener("touchmove", onLockTouchMove, {
        passive: false,
      });
      document.addEventListener("wheel", onLockWheel, { passive: false });
      lockListenersAttached = true;
    } else if (!hasActiveOverlay && lockListenersAttached) {
      document.removeEventListener("touchstart", onLockTouchStart);
      document.removeEventListener("touchmove", onLockTouchMove);
      document.removeEventListener("wheel", onLockWheel);
      lockListenersAttached = false;
    }
  }

  const observer = new MutationObserver(syncScrollLock);
  document
    .querySelectorAll(".modal-overlay, .sidebar, .sidebar-overlay")
    .forEach((el) => {
      observer.observe(el, {
        attributes: true,
        attributeFilter: ["class"],
      });
    });
  syncScrollLock();
})();

// --- ULTRA-SMOOTH COLLAPSIBLE HERO CONTROLLER (Search, Approvals, Directory, Feedback) ---
function createCollapsibleHero(
  scrollElIds,
  wrapElId,
  onCollapse = null,
  options = {}
) {
  const ids = Array.isArray(scrollElIds) ? scrollElIds : [scrollElIds];
  const scrollEls = ids
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const wrapEl = document.getElementById(wrapElId);

  const collapseAccum = options.collapseAccum ?? 240;
  const minScrollTop = options.minScrollTop ?? 180;
  const expandAccum = options.expandAccum ?? 40;

  let isCollapsed = false;
  let isTransitioning = false;
  let transitionTimer = null;
  let scrollAccum = 0;
  let activeScrollEl = scrollEls[0] || null;
  const lastScrollMap = new WeakMap();
  scrollEls.forEach((el) => lastScrollMap.set(el, 0));

  function syncAllScrollTops() {
    scrollEls.forEach((el) => {
      lastScrollMap.set(el, Math.max(0, el.scrollTop));
    });
  }

  function finishTransition() {
    clearTimeout(transitionTimer);
    if (wrapEl) wrapEl.classList.remove("is-animating");
    isTransitioning = false;
    scrollAccum = 0;

    if (activeScrollEl && activeScrollEl.offsetParent !== null) {
      lastScrollMap.set(activeScrollEl, Math.max(0, activeScrollEl.scrollTop));
      const remainingScroll =
        activeScrollEl.scrollHeight - activeScrollEl.clientHeight;
      if (isCollapsed && remainingScroll <= 20) {
        setCollapsed(false);
      }
    }
  }

  function setCollapsed(shouldCollapse, instant = false) {
    if (!wrapEl) return;

    if (isCollapsed === shouldCollapse) {
      if (instant) {
        scrollAccum = 0;
        syncAllScrollTops();
      }
      return;
    }

    isCollapsed = shouldCollapse;
    clearTimeout(transitionTimer);

    if (instant) {
      wrapEl.classList.remove("is-animating");
      wrapEl.classList.toggle("collapsed", shouldCollapse);
      isTransitioning = false;
      scrollAccum = 0;
      syncAllScrollTops();
      return;
    }

    isTransitioning = true;
    wrapEl.classList.add("is-animating");

    if (shouldCollapse) {
      if (typeof onCollapse === "function") onCollapse();
      wrapEl.classList.add("collapsed");
    } else {
      wrapEl.classList.remove("collapsed");
    }

    transitionTimer = setTimeout(finishTransition, 960);
  }

  if (wrapEl) {
    wrapEl.addEventListener("transitionend", (e) => {
      if (e.target === wrapEl && e.propertyName === "grid-template-rows") {
        finishTransition();
      }
    });
  }

  scrollEls.forEach((scrollEl) => {
    let pullStartY = 0;
    let scrollRafId = null;

    scrollEl.addEventListener(
      "touchstart",
      (e) => {
        if (scrollEl.offsetParent === null) return;
        activeScrollEl = scrollEl;
        pullStartY = e.touches[0].clientY;
      },
      { passive: true }
    );

    scrollEl.addEventListener(
      "touchmove",
      (e) => {
        if (scrollEl.offsetParent === null) return;
        if (
          isCollapsed &&
          scrollEl.scrollTop <= 5 &&
          e.touches[0].clientY - pullStartY > 25
        ) {
          activeScrollEl = scrollEl;
          setCollapsed(false);
        }
      },
      { passive: true }
    );

    scrollEl.addEventListener(
      "wheel",
      (e) => {
        if (scrollEl.offsetParent === null) return;
        if (isCollapsed && scrollEl.scrollTop <= 5 && e.deltaY < 0) {
          activeScrollEl = scrollEl;
          setCollapsed(false);
        }
      },
      { passive: true }
    );

    scrollEl.addEventListener(
      "scroll",
      () => {
        if (scrollEl.offsetParent === null || scrollRafId) return;
        scrollRafId = requestAnimationFrame(() => {
          scrollRafId = null;
          if (scrollEl.offsetParent === null) return;

          if (activeScrollEl !== scrollEl) {
            activeScrollEl = scrollEl;
            scrollAccum = 0;
          }

          const currentScroll = Math.max(0, scrollEl.scrollTop);
          const prevScroll = lastScrollMap.get(scrollEl) || 0;

          if (isTransitioning) {
            lastScrollMap.set(scrollEl, currentScroll);
            return;
          }

          if (currentScroll <= 6) {
            if (isCollapsed) setCollapsed(false);
            lastScrollMap.set(scrollEl, currentScroll);
            scrollAccum = 0;
            return;
          }

          const delta = currentScroll - prevScroll;
          lastScrollMap.set(scrollEl, currentScroll);
          if (Math.abs(delta) < 1) return;

          if (
            (delta > 0 && scrollAccum < 0) ||
            (delta < 0 && scrollAccum > 0)
          ) {
            scrollAccum = 0;
          }
          scrollAccum += delta;

          const scrollableRange = scrollEl.scrollHeight - scrollEl.clientHeight;
          const minNeededScroll = (wrapEl?.offsetHeight || 160) + 24;

          if (
            !isCollapsed &&
            scrollAccum > collapseAccum &&
            currentScroll > minScrollTop &&
            scrollableRange > minNeededScroll
          ) {
            setCollapsed(true);
          } else if (isCollapsed && scrollAccum < -expandAccum) {
            setCollapsed(false);
          }
        });
      },
      { passive: true }
    );
  });

  return { setCollapsed };
}

const searchHeroController = createCollapsibleHero(
  "results-display-area",
  "search-hero-collapse-wrap",
  () => {
    document.getElementById("search-input")?.blur();
    document.getElementById("advanced-filters-panel")?.classList.add("hidden");
    document.getElementById("search-history-panel")?.classList.add("hidden");
    closeAllDropdowns();
  }
);

const approvalsHeroController = createCollapsibleHero(
  "approvals-display-area",
  "approvals-hero-collapse-wrap",
  () => {
    document.getElementById("approvals-search-input")?.blur();
    document.getElementById("approvals-filters-panel")?.classList.add("hidden");
    closeAllDropdowns();
  }
);

const directoryHeroController = createCollapsibleHero(
  "directory-display-area",
  "directory-hero-collapse-wrap",
  () => {
    document.getElementById("directory-filter-input")?.blur();
    document
      .getElementById("dir-advanced-filters-panel")
      ?.classList.add("hidden");
    document
      .getElementById("dir-search-history-panel")
      ?.classList.add("hidden");
    closeAllDropdowns();
  }
);

const membersHeroController = createCollapsibleHero(
  "members-display-area",
  "members-hero-collapse-wrap",
  () => {
    document.getElementById("members-filter-input")?.blur();
  }
);

const feedbackHeroController = createCollapsibleHero(
  ["feedback-display-area", "feedback-submit-panel"],
  "feedback-hero-collapse-wrap",
  () => {
    document.getElementById("feedback-search-input")?.blur();
  },
  { collapseAccum: 140, minScrollTop: 100 }
);

const superadminHeroController = createCollapsibleHero(
  "superadmin-display-area",
  "superadmin-hero-collapse-wrap",
  () => {
    document.getElementById("sa-users-search")?.blur();
    document.getElementById("sa-db-search")?.blur();
  }
);

const settingsHeroController = createCollapsibleHero(
  "settings-display-area",
  "settings-hero-collapse-wrap",
  null,
  { collapseAccum: 110, minScrollTop: 70 }
);

const uploadHeroController = createCollapsibleHero(
  "upload-display-area",
  "upload-hero-collapse-wrap",
  () => {
    closeAllDropdowns();
  },
  { collapseAccum: 110, minScrollTop: 70 }
);

function setSearchHeroCollapsed(shouldCollapse, instant = false) {
  searchHeroController.setCollapsed(shouldCollapse, instant);
}

// --- SWIPE NAVIGATION LOGIC ---
(function initSwipeNavigation() {
  let touchStartX = 0;
  let touchEndX = 0;
  let touchStartY = 0;
  let touchEndY = 0;
  let touchStartTime = 0;
  let ignoreSwipe = false;

  const swipeArea = document.getElementById("dashboard-view");
  if (!swipeArea) return;

  function isInsideHorizontalScroller(target) {
    if (!(target instanceof Element)) return false;

    if (
      target.closest(
        ".dir-filter-bar, .dir-filter-chips, .quick-delete-selected-chips, .learn-flashcard-stage, #top-profile-btn, input, textarea, select"
      )
    ) {
      return true;
    }

    let el = target;
    while (el && el !== swipeArea) {
      const style = getComputedStyle(el);
      const canScrollX =
        (style.overflowX === "auto" || style.overflowX === "scroll") &&
        el.scrollWidth > el.clientWidth + 4;
      if (canScrollX) return true;
      el = el.parentElement;
    }
    return false;
  }

  swipeArea.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) {
        ignoreSwipe = true;
        return;
      }

      ignoreSwipe = isInsideHorizontalScroller(e.target);
      if (ignoreSwipe) return;

      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
      touchStartTime = performance.now();
    },
    { passive: true }
  );

  swipeArea.addEventListener(
    "touchcancel",
    () => {
      ignoreSwipe = true;
    },
    { passive: true }
  );

  swipeArea.addEventListener(
    "touchend",
    (e) => {
      if (ignoreSwipe || e.changedTouches.length === 0) {
        ignoreSwipe = false;
        return;
      }

      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      const elapsed = Math.max(1, performance.now() - touchStartTime);

      if (
        document.getElementById("sidebar")?.classList.contains("open") ||
        document.querySelector(".modal-overlay.show") ||
        document
          .getElementById("directory-floating-bar")
          ?.classList.contains("open")
      ) {
        return;
      }

      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const velocity = absX / elapsed; // px per ms

      // Hard-swipe thresholds: long distance + brisk flick + straight horizontal line
      const MIN_SWIPE_DISTANCE = Math.max(
        135,
        Math.round(window.innerWidth * 0.36)
      );
      const MAX_SWIPE_DURATION = 420;
      const MIN_SWIPE_VELOCITY = 0.45;
      const MAX_VERTICAL_DRIFT = 50;
      const HORIZONTAL_RATIO = 2.6;

      if (
        absX > MIN_SWIPE_DISTANCE &&
        elapsed <= MAX_SWIPE_DURATION &&
        velocity >= MIN_SWIPE_VELOCITY &&
        absY < MAX_VERTICAL_DRIFT &&
        absX > absY * HORIZONTAL_RATIO
      ) {
        const currentActiveId = viewOrder.find((view) =>
          document.getElementById("view-" + view)?.classList.contains("active")
        );

        let currentIndex = viewOrder.indexOf(currentActiveId);
        if (currentIndex === -1) return;

        if (deltaX < 0 && currentIndex < viewOrder.length - 1) {
          switchDashboardView(viewOrder[currentIndex + 1]);
        } else if (deltaX > 0 && currentIndex > 0) {
          switchDashboardView(viewOrder[currentIndex - 1]);
        }
      }
    },
    { passive: true }
  );
})();

// --- PROFILE BUTTON DRAG TO OPEN SIDEBAR ---
(function initSidebarDragOpen() {
  const profileBtn = document.getElementById("top-profile-btn");
  if (!profileBtn) return;

  let startX = null;
  let startY = null;
  let dragTriggered = false;

  profileBtn.addEventListener(
    "touchstart",
    (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dragTriggered = false;
    },
    { passive: true }
  );

  profileBtn.addEventListener(
    "touchmove",
    (e) => {
      if (startX === null) return;
      const dx = e.touches[0].clientX - startX;
      const dy = Math.abs(e.touches[0].clientY - startY);

      if (dx > 18 && dx > dy) {
        e.stopPropagation();
        const sidebar = document.getElementById("sidebar");
        if (!sidebar.classList.contains("open")) {
          toggleSidebar();
          dragTriggered = true;
        }
        startX = null;
      }
    },
    { passive: true }
  );

  profileBtn.addEventListener(
    "touchend",
    (e) => {
      if (dragTriggered) {
        e.stopPropagation();
        const preventClick = (clickEvent) => {
          clickEvent.stopPropagation();
          clickEvent.preventDefault();
        };
        profileBtn.addEventListener("click", preventClick, {
          once: true,
          capture: true,
        });
        dragTriggered = false;
      }
      startX = null;
    },
    { passive: true }
  );

  let mouseDownX = null;
  profileBtn.addEventListener("mousedown", (e) => {
    mouseDownX = e.clientX;
    dragTriggered = false;
  });
  window.addEventListener("mousemove", (e) => {
    if (mouseDownX === null) return;
    if (e.clientX - mouseDownX > 20) {
      const sidebar = document.getElementById("sidebar");
      if (!sidebar.classList.contains("open")) {
        toggleSidebar();
        dragTriggered = true;
      }
      mouseDownX = null;
    }
  });
  window.addEventListener("mouseup", () => {
    if (dragTriggered) {
      const preventClick = (clickEvent) => {
        clickEvent.stopPropagation();
        clickEvent.preventDefault();
      };
      profileBtn.addEventListener("click", preventClick, {
        once: true,
        capture: true,
      });
      dragTriggered = false;
    }
    mouseDownX = null;
  });
})();

// --- GLOBAL SMART ENTER-KEY & KEYBOARD NAVIGATION ---
(function initSmartEnterNavigation() {
  const TEXT_INPUT_SELECTOR =
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]):not([type="button"]):not([type="submit"])';

  const GROUP_CONTAINERS = [
    ".form-body",
    ".profile-edit-card",
    ".advanced-filters-inputs",
    "#approvals-filters-panel",
    "#manual-entries-container",
    ".edit-modal-card",
    "#office-modal-body",
  ].join(", ");

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.keyCode !== 13) return;

    const currentInput = e.target;
    if (!currentInput || !currentInput.matches(TEXT_INPUT_SELECTOR)) return;

    e.preventDefault();

    if (currentInput.id === "search-input") {
      currentInput.blur();
      if (typeof triggerSearch === "function") triggerSearch(true);
      return;
    }

    if (currentInput.id === "fb-title") {
      const descEl = document.getElementById("fb-description");
      if (descEl) {
        descEl.focus();
        return;
      }
    }

    if (currentInput.id === "learn-pin-input") {
      if (typeof submitPinSniperAnswer === "function") submitPinSniperAnswer();
      return;
    }

    if (currentInput.id === "directory-filter-input") {
      currentInput.blur();
      if (typeof filterDirectory === "function")
        filterDirectory(true, { saveHistory: true });
      return;
    }

    if (
      currentInput.id === "members-filter-input" ||
      currentInput.id === "approvals-search-input" ||
      currentInput.id === "feedback-search-input"
    ) {
      currentInput.blur();
      if (
        currentInput.id === "approvals-search-input" &&
        typeof applyApprovalsFilters === "function"
      ) {
        applyApprovalsFilters(true);
      } else if (
        currentInput.id === "feedback-search-input" &&
        typeof applyFeedbackFilters === "function"
      ) {
        applyFeedbackFilters();
      }
      return;
    }

    if (typeof closeAllDropdowns === "function") {
      closeAllDropdowns();
    }

    const container = currentInput.closest(GROUP_CONTAINERS);
    if (container) {
      const visibleInputs = Array.from(
        container.querySelectorAll(TEXT_INPUT_SELECTOR)
      ).filter(
        (el) => el.offsetParent !== null && !el.disabled && !el.readOnly
      );

      const currentIndex = visibleInputs.indexOf(currentInput);
      const nextInput = visibleInputs[currentIndex + 1];

      if (nextInput) {
        nextInput.focus();
        nextInput.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }

    currentInput.blur();
  });

  document.addEventListener("focusin", function (e) {
    const input = e.target;
    if (!input || input.tagName !== "INPUT") return;

    if (
      input.id === "search-input" ||
      input.id === "directory-filter-input" ||
      input.id === "members-filter-input" ||
      input.id === "feedback-search-input" ||
      input.id === "approvals-search-input"
    ) {
      input.setAttribute("enterkeyhint", "search");
      return;
    }

    if (input.id === "fb-title") {
      input.setAttribute("enterkeyhint", "next");
      return;
    }

    const container = input.closest(GROUP_CONTAINERS);
    if (!container) {
      input.setAttribute("enterkeyhint", "done");
      return;
    }

    const visibleInputs = Array.from(
      container.querySelectorAll(TEXT_INPUT_SELECTOR)
    ).filter((el) => el.offsetParent !== null && !el.disabled && !el.readOnly);

    const isLast = visibleInputs.indexOf(input) === visibleInputs.length - 1;
    input.setAttribute("enterkeyhint", isLast ? "done" : "next");
  });
})();

// --- CHAIN UPWARD SCROLL FROM TOP OF INNER SCROLLERS TO OUTER SCROLL (SLOW & SMOOTH) ---
(function initInnerToOuterTopScrollChain() {
  // Adjust these 3 values to fine-tune speed (lower = slower)
  const WHEEL_SPEED = 0.3; // 30% of normal mouse wheel speed
  const TOUCH_SPEED = 0.4; // 40% of finger drag speed on phone
  const SMOOTH_FACTOR = 0.1; // Easing speed per frame (0.06 = very slow glide, 0.2 = snappier)

  const anim = {
    el: null,
    currentTop: 0,
    targetTop: 0,
    rafId: null,
  };

  function stopAnim() {
    if (anim.rafId) {
      cancelAnimationFrame(anim.rafId);
      anim.rafId = null;
    }
    anim.el = null;
  }

  function stepAnim() {
    if (!anim.el) {
      stopAnim();
      return;
    }

    const diff = anim.targetTop - anim.currentTop;
    if (Math.abs(diff) < 0.5) {
      anim.currentTop = anim.targetTop;
      anim.el.scrollTop = Math.round(anim.targetTop);
      stopAnim();
      return;
    }

    anim.currentTop += diff * SMOOTH_FACTOR;
    anim.el.scrollTop = anim.currentTop;
    anim.rafId = requestAnimationFrame(stepAnim);
  }

  function nudgeOuterScrollUp(outerEl, negativeDelta) {
    if (!outerEl || negativeDelta >= 0) return;

    if (anim.el !== outerEl || !anim.rafId) {
      stopAnim();
      anim.el = outerEl;
      anim.currentTop = outerEl.scrollTop;
      anim.targetTop = outerEl.scrollTop;
    }

    anim.targetTop = Math.max(0, anim.targetTop + negativeDelta);

    if (!anim.rafId) {
      anim.rafId = requestAnimationFrame(stepAnim);
    }
  }

  const isVerticallyScrollable = (el) => {
    if (!el || el === document.body || el === document.documentElement) {
      return false;
    }
    const style = getComputedStyle(el);
    return (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight + 1
    );
  };

  function findInnerScrollable(target) {
    let el = target instanceof Element ? target : target?.parentElement;
    while (el && el !== document.body && el !== document.documentElement) {
      if (isVerticallyScrollable(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function findOuterScrollableUp(innerEl) {
    let el = innerEl ? innerEl.parentElement : null;
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.scrollTop > 0 && isVerticallyScrollable(el)) {
        return el;
      }
      el = el.parentElement;
    }
    const docScroller = document.scrollingElement || document.documentElement;
    if (docScroller && docScroller.scrollTop > 0) {
      return docScroller;
    }
    return null;
  }

  function isBlockedContext(target) {
    if (document.documentElement.classList.contains("dm-scroll-locked")) {
      return true;
    }
    if (
      target instanceof Element &&
      target.closest(
        ".modal-overlay.show, .sidebar.open, #crop-stage, #lightbox-stage"
      )
    ) {
      return true;
    }
    return false;
  }

  // 1. Desktop wheel / trackpad (passive so native scrolling never blocks)
  document.addEventListener(
    "wheel",
    (e) => {
      if (e.deltaY > 0) {
        stopAnim();
        return;
      }
      if (e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (isBlockedContext(e.target)) return;

      const innerEl = findInnerScrollable(e.target);
      if (!innerEl || innerEl.scrollTop > 1) return;

      const outerEl = findOuterScrollableUp(innerEl);
      if (!outerEl) return;

      const deltaY =
        e.deltaMode === 1
          ? e.deltaY * 32
          : e.deltaMode === 2
          ? e.deltaY * window.innerHeight
          : e.deltaY;

      const dampedStep = Math.max(-40, deltaY * WHEEL_SPEED);
      nudgeOuterScrollUp(outerEl, dampedStep);
    },
    { passive: true }
  );

  // 2. Mobile touch (passive so Android compositor stays at 60fps)
  let touchStartX = 0;
  let touchStartY = 0;
  let lastTouchY = 0;
  let activeInner = null;
  let gestureAxis = null;

  document.addEventListener(
    "touchstart",
    (e) => {
      stopAnim();
      if (e.touches.length !== 1 || isBlockedContext(e.target)) {
        activeInner = null;
        gestureAxis = null;
        return;
      }
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      lastTouchY = touchStartY;
      activeInner = findInnerScrollable(e.target);
      gestureAxis = null;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      if (!activeInner || e.touches.length !== 1) return;
      if (activeInner.scrollTop > 1) return;
      if (isBlockedContext(e.target)) return;

      const currX = e.touches[0].clientX;
      const currY = e.touches[0].clientY;
      const dy = currY - lastTouchY;
      lastTouchY = currY;

      if (gestureAxis === null) {
        const totalDx = Math.abs(currX - touchStartX);
        const totalDy = Math.abs(currY - touchStartY);
        if (totalDx < 5 && totalDy < 5) return;
        gestureAxis = totalDx > totalDy ? "x" : "y";
      }
      if (gestureAxis !== "y") return;
      if (dy < 0) {
        stopAnim();
        return;
      }
      if (dy === 0) return;

      const outerEl = findOuterScrollableUp(activeInner);
      if (!outerEl) return;

      nudgeOuterScrollUp(outerEl, -dy * TOUCH_SPEED);
    },
    { passive: true }
  );

  const resetTouch = () => {
    activeInner = null;
    gestureAxis = null;
  };
  document.addEventListener("touchend", resetTouch, { passive: true });
  document.addEventListener("touchcancel", resetTouch, { passive: true });
})();

// --- GLOBAL AUTO-CLEAR (✕) BUTTONS FOR ALL ELIGIBLE INPUTS ---
(function initGlobalInputClearButtons() {
  const EXCLUDED_TYPES = new Set([
    "password",
    "hidden",
    "checkbox",
    "radio",
    "file",
    "range",
    "button",
    "submit",
    "reset",
    "color",
    "date",
    "datetime-local",
    "month",
    "week",
    "time",
    "image",
  ]);

  const EXCLUDED_IDS = new Set(["learn-pin-input", "sa-input-vote-threshold"]);

  const clearMetaMap = new WeakMap();

  function isExcludedInput(input) {
    if (!input || input.tagName !== "INPUT") return true;
    if (input.hasAttribute("data-no-clear")) return true;
    if (input.id && EXCLUDED_IDS.has(input.id)) return true;
    const type = (input.type || "text").toLowerCase();
    return EXCLUDED_TYPES.has(type);
  }

  function isSearchOrFilterInput(input) {
    if (input.closest(".search-input-wrapper")) return true;
    const id = (input.id || "").toLowerCase();
    return id.includes("search") || id.includes("filter");
  }

  function syncInputClearButton(input) {
    const meta = clearMetaMap.get(input);
    if (!meta) return;

    const blocked = isExcludedInput(input) || input.disabled || input.readOnly;
    const hasValue = input.value.length > 0;
    const isFocused = document.activeElement === input;
    const shouldShow =
      !blocked && hasValue && (meta.alwaysWhenFilled || isFocused);

    meta.btn.classList.toggle("hidden", !shouldShow);
    if (meta.usesOverlayPadding) {
      input.classList.toggle("dm-has-clear-visible", shouldShow);
    }
  }

  function enhanceInput(input) {
    if (!input || clearMetaMap.has(input)) return;
    if (isExcludedInput(input)) return;

    const parent = input.parentElement;
    if (!parent) return;

    // Skip inputs that already have a dedicated custom .clear-btn
    if (parent.querySelector(":scope > .clear-btn:not(.dm-auto-clear-btn)")) {
      return;
    }

    const inSearchWrap = parent.classList.contains("search-input-wrapper");
    const inProfileWrap = parent.classList.contains("profile-input-wrapper");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = inSearchWrap
      ? "clear-btn dm-auto-clear-btn hidden"
      : "clear-btn dm-auto-clear-btn dm-auto-clear-abs hidden";
    btn.tabIndex = -1;
    btn.title = "Clear";
    btn.setAttribute("aria-label", "Clear input");
    btn.textContent = "✕";

    const keepFocus = (e) => e.preventDefault();
    btn.addEventListener("pointerdown", keepFocus);
    btn.addEventListener("mousedown", keepFocus);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (input.disabled || input.readOnly) return;

      input.value = "";
      try {
        input.focus({ preventScroll: true });
      } catch (_) {
        input.focus();
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      syncInputClearButton(input);
    });

    if (inSearchWrap || inProfileWrap) {
      input.insertAdjacentElement("afterend", btn);
    } else {
      const wrap = document.createElement("div");
      wrap.className = "dm-clear-wrap";

      // Preserve flex sizing for inline flex inputs (e.g. #sa-cms-banner-text)
      if (input.style.flex) {
        wrap.style.flex = input.style.flex;
        wrap.style.width = "auto";
        input.style.flex = "";
      }
      if (input.style.minWidth) {
        wrap.style.minWidth = input.style.minWidth;
        input.style.minWidth = "";
      }

      parent.insertBefore(wrap, input);
      wrap.appendChild(input);
      wrap.appendChild(btn);
    }

    clearMetaMap.set(input, {
      btn,
      alwaysWhenFilled: isSearchOrFilterInput(input),
      usesOverlayPadding: !inSearchWrap,
    });

    syncInputClearButton(input);
  }

  function scanTree(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.tagName === "INPUT") {
      enhanceInput(root);
      return;
    }
    root.querySelectorAll("input").forEach(enhanceInput);
  }

  function syncInputsInside(container) {
    if (!container) return;
    container.querySelectorAll("input").forEach(syncInputClearButton);
  }

  // Initial scan for all static inputs
  scanTree(document.body);

  // Delegated listeners for typing, focus, blur & programmatic changes
  document.addEventListener("input", (e) => syncInputClearButton(e.target));
  document.addEventListener("change", (e) => syncInputClearButton(e.target));
  document.addEventListener("focusin", (e) => {
    if (e.target?.tagName === "INPUT") {
      enhanceInput(e.target);
      syncInputClearButton(e.target);
    }
  });
  document.addEventListener("focusout", (e) => {
    if (e.target?.tagName === "INPUT") {
      syncInputClearButton(e.target);
    }
  });

  // Auto-wire dynamically created inputs only inside containers that inject them
  const domObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList" && m.addedNodes.length > 0) {
        m.addedNodes.forEach(scanTree);
      }
    }
  });
  [
    "manual-entries-container",
    "office-modal-body",
    "sa-db-modal-fields",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) domObserver.observe(el, { childList: true, subtree: true });
  });

  // Re-sync inputs when modals open (handles programmatic clears & password-type reuse)
  const modalSyncObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (
        m.type === "attributes" &&
        m.target.classList?.contains("modal-overlay") &&
        m.target.classList.contains("show")
      ) {
        syncInputsInside(m.target);
      }
    }
  });
  document.querySelectorAll(".modal-overlay").forEach((modal) => {
    modalSyncObserver.observe(modal, {
      attributes: true,
      attributeFilter: ["class"],
    });
  });
})();

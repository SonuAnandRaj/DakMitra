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
  showToast("🔍 Checking for updates...");
  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (let reg of regs) {
      await reg.update();
    }
  }
  setTimeout(() => {
    showToast(`✅ DakMitra v${APP_VERSION} is up to date!`);
  }, 1000);
}

initAppVersion();

// --- THEME LOGIC (Exact System Bar & Notch Color Match) ---
function applyTheme(theme) {
  let isDark = false;
  if (theme === "system") {
    isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute(
      "data-theme",
      isDark ? "dark" : "light",
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
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const newTheme = current === "dark" ? "light" : "dark";
  applyTheme(newTheme);
}

const savedTheme = localStorage.getItem("app-theme") || "system";
applyTheme(savedTheme);

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
      "#dashboard-view main.container",
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
  }

  closeSidebar();
}

// --- PWA ANDROID / BROWSER BACK BUTTON HANDLER ---
(function initPwaBackNavigation() {
  let isHandlingPopstate = false;
  let isRestoringFromPopstate = false;
  let rootGuardPushed = false;

  function isRootCleanState() {
    const hasOpenModal = !!document.querySelector(".modal-overlay.show");
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
      const stateObj = { dakmitraNav: tag, ts: Date.now() };
      if (viewId) stateObj.viewId = viewId;
      history.pushState(stateObj, "");
      rootGuardPushed = true;
    } catch (_) {}
  }

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
        m.target.classList?.contains("modal-overlay") &&
        m.target.classList.contains("show")
      ) {
        pushNavStep("modal:" + (m.target.id || "dialog"));
        break;
      }
    }
  });

  document.querySelectorAll(".modal-overlay").forEach((modal) => {
    modalObserver.observe(modal, { attributes: true });
  });

  window.addEventListener("popstate", (event) => {
    isHandlingPopstate = true;

    try {
      const openModals = Array.from(
        document.querySelectorAll(".modal-overlay.show"),
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

      const targetView =
        event.state && typeof event.state.viewId === "string"
          ? event.state.viewId
          : "search";

      const currentViewId =
        document
          .querySelector(".view-section.active")
          ?.id?.replace(/^view-/, "") || "search";

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

      if (isRootCleanState()) {
        showToast("Press Back again to exit DakMitra");
      }
    } finally {
      setTimeout(() => {
        isHandlingPopstate = false;
      }, 60);
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
    const safeTop = insideModal ? vvTop + 20 : vvTop + 76;
    const safeBottom = vvTop + vvHeight - 72;

    if (rect.top >= safeTop && rect.bottom <= safeBottom) return;

    const scrollParent =
      el.closest(".staff-detail-list") || insideModal || null;

    if (scrollParent) {
      const parentRect = scrollParent.getBoundingClientRect();
      const targetTop = rect.top - parentRect.top + scrollParent.scrollTop - 24;
      scrollParent.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
      });
    } else {
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
      Math.round(window.innerHeight - vvHeight - vvTop),
    );
    const isKeyboardOpen = activeIsEditable && kbHeight > 110;

    root.style.setProperty("--vvh", `${Math.round(vvHeight)}px`);
    root.style.setProperty("--vv-top", `${Math.round(vvTop)}px`);
    root.style.setProperty("--kb-height", `${isKeyboardOpen ? kbHeight : 0}px`);
    root.style.setProperty(
      "--kb-fixed-offset",
      `${isKeyboardOpen ? fixedOffset : 0}px`,
    );

    document.body.classList.toggle("keyboard-open", isKeyboardOpen);

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
  let touchStartY = 0;

  function getTopActiveOverlay() {
    const active = Array.from(
      document.querySelectorAll(".modal-overlay.show, .sidebar.open"),
    );
    if (active.length === 0) return null;

    return active.sort((a, b) => {
      const za = parseInt(getComputedStyle(a).zIndex, 10) || 0;
      const zb = parseInt(getComputedStyle(b).zIndex, 10) || 0;
      return za - zb;
    })[active.length - 1];
  }

  function syncScrollLock() {
    const hasActiveOverlay = !!getTopActiveOverlay();
    document.documentElement.classList.toggle(
      "dm-scroll-locked",
      hasActiveOverlay,
    );
    document.body.classList.toggle("dm-scroll-locked", hasActiveOverlay);
  }

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

  document.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
      }
    },
    { passive: true },
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      const activeOverlay = getTopActiveOverlay();
      if (!activeOverlay) return;

      if (e.target.closest("#crop-stage, #lightbox-stage")) return;
      if (e.target.tagName === "INPUT" && e.target.type === "range") return;

      if (!activeOverlay.contains(e.target)) {
        e.preventDefault();
        return;
      }

      if (!e.touches || e.touches.length === 0) return;
      const currentY = e.touches[0].clientY;
      const deltaY = currentY - touchStartY;
      if (Math.abs(deltaY) < 8) return; // Allow normal taps without cancelling

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
    },
    { passive: false },
  );

  document.addEventListener(
    "wheel",
    (e) => {
      const activeOverlay = getTopActiveOverlay();
      if (!activeOverlay) return;

      if (!activeOverlay.contains(e.target)) {
        e.preventDefault();
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
    },
    { passive: false },
  );
})();

// --- ULTRA-SMOOTH COLLAPSIBLE HERO CONTROLLER (Search, Approvals, Directory) ---
function createCollapsibleHero(scrollElId, wrapElId, onCollapse = null) {
  const scrollEl = document.getElementById(scrollElId);
  const wrapEl = document.getElementById(wrapElId);

  let isCollapsed = false;
  let isTransitioning = false;
  let transitionTimer = null;
  let lastScrollTop = 0;
  let scrollAccum = 0;
  let scrollRafId = null;

  function finishTransition() {
    clearTimeout(transitionTimer);
    if (wrapEl) wrapEl.classList.remove("is-animating");
    isTransitioning = false;
    scrollAccum = 0;

    if (scrollEl) {
      lastScrollTop = Math.max(0, scrollEl.scrollTop);
      const remainingScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (isCollapsed && remainingScroll <= 20) {
        setCollapsed(false);
      }
    }
  }

  function setCollapsed(shouldCollapse, instant = false) {
    if (!wrapEl || isCollapsed === shouldCollapse) return;

    isCollapsed = shouldCollapse;
    clearTimeout(transitionTimer);

    if (instant) {
      wrapEl.classList.remove("is-animating");
      wrapEl.classList.toggle("collapsed", shouldCollapse);
      isTransitioning = false;
      scrollAccum = 0;
      lastScrollTop = scrollEl ? Math.max(0, scrollEl.scrollTop) : 0;
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

  if (scrollEl) {
    let pullStartY = 0;

    scrollEl.addEventListener(
      "touchstart",
      (e) => {
        pullStartY = e.touches[0].clientY;
      },
      { passive: true },
    );

    scrollEl.addEventListener(
      "touchmove",
      (e) => {
        if (
          isCollapsed &&
          scrollEl.scrollTop <= 5 &&
          e.touches[0].clientY - pullStartY > 25
        ) {
          setCollapsed(false);
        }
      },
      { passive: true },
    );

    scrollEl.addEventListener(
      "wheel",
      (e) => {
        if (isCollapsed && scrollEl.scrollTop <= 5 && e.deltaY < 0) {
          setCollapsed(false);
        }
      },
      { passive: true },
    );

    scrollEl.addEventListener(
      "scroll",
      () => {
        if (scrollRafId) return;
        scrollRafId = requestAnimationFrame(() => {
          scrollRafId = null;
          const currentScroll = Math.max(0, scrollEl.scrollTop);

          if (isTransitioning) {
            lastScrollTop = currentScroll;
            return;
          }

          if (currentScroll <= 6) {
            if (isCollapsed) setCollapsed(false);
            lastScrollTop = currentScroll;
            scrollAccum = 0;
            return;
          }

          const delta = currentScroll - lastScrollTop;
          lastScrollTop = currentScroll;
          if (Math.abs(delta) < 1) return;

          if (
            (delta > 0 && scrollAccum < 0) ||
            (delta < 0 && scrollAccum > 0)
          ) {
            scrollAccum = 0;
          }
          scrollAccum += delta;

          const scrollableRange = scrollEl.scrollHeight - scrollEl.clientHeight;
          const minNeededScroll = wrapEl?.offsetHeight || 160;

          if (
            !isCollapsed &&
            scrollAccum > 240 &&
            currentScroll > 180 &&
            scrollableRange > minNeededScroll
          ) {
            setCollapsed(true);
          } else if (isCollapsed && scrollAccum < -40) {
            setCollapsed(false);
          }
        });
      },
      { passive: true },
    );
  }

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
  },
);

const approvalsHeroController = createCollapsibleHero(
  "approvals-display-area",
  "approvals-hero-collapse-wrap",
  () => {
    document.getElementById("approvals-search-input")?.blur();
    document.getElementById("approvals-filters-panel")?.classList.add("hidden");
    closeAllDropdowns();
  },
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
  },
);

const membersHeroController = createCollapsibleHero(
  "members-display-area",
  "members-hero-collapse-wrap",
  () => {
    document.getElementById("members-filter-input")?.blur();
  },
);

const feedbackHeroController = createCollapsibleHero(
  "feedback-display-area",
  "feedback-hero-collapse-wrap",
  () => {
    document.getElementById("feedback-search-input")?.blur();
  },
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
        ".dir-filter-bar, .dir-filter-chips, .quick-delete-selected-chips, #top-profile-btn, input, textarea, select",
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
    { passive: true },
  );

  swipeArea.addEventListener(
    "touchcancel",
    () => {
      ignoreSwipe = true;
    },
    { passive: true },
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
        Math.round(window.innerWidth * 0.36),
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
          document.getElementById("view-" + view)?.classList.contains("active"),
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
    { passive: true },
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
    { passive: true },
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
    { passive: true },
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
    { passive: true },
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
        container.querySelectorAll(TEXT_INPUT_SELECTOR),
      ).filter(
        (el) => el.offsetParent !== null && !el.disabled && !el.readOnly,
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

    const container = input.closest(GROUP_CONTAINERS);
    if (!container) {
      input.setAttribute("enterkeyhint", "done");
      return;
    }

    const visibleInputs = Array.from(
      container.querySelectorAll(TEXT_INPUT_SELECTOR),
    ).filter((el) => el.offsetParent !== null && !el.disabled && !el.readOnly);

    const isLast = visibleInputs.indexOf(input) === visibleInputs.length - 1;
    input.setAttribute("enterkeyhint", isLast ? "done" : "next");
  });
})();

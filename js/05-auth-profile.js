// =========================================================
// 05-AUTH-PROFILE.JS — Auth, Passkeys, Profile, Cropper & Lightbox
// =========================================================

// --- AUTH TABS & ALERTS ---
function switchTab(mode) {
  currentMode = mode;
  const signinTab = document.getElementById("tab-signin");
  const signupTab = document.getElementById("tab-signup");
  const tabsContainer = document.getElementById("auth-segmented-tabs");
  const authBtn = document.getElementById("auth-btn");
  const extraFields = document.getElementById("signup-extra-fields");

  hideAlert();
  if (mode === "signin") {
    signinTab.classList.add("active");
    signupTab.classList.remove("active");
    tabsContainer?.classList.remove("is-signup");
    authBtn.textContent = "Sign In";
    extraFields.classList.add("hidden");
  } else {
    signupTab.classList.add("active");
    signinTab.classList.remove("active");
    tabsContainer?.classList.add("is-signup");
    authBtn.textContent = "Create Account";
    extraFields.classList.remove("hidden");
  }
}

function showAlert(message, type = "error") {
  const box = document.getElementById("alert-box");
  box.className = `alert ${type}`;
  box.textContent = message;
  if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
}

function hideAlert() {
  const box = document.getElementById("alert-box");
  box.className = "alert";
  box.textContent = "";
}

// --- AUTHENTICATION & DEVICE REGISTRATION ---
async function handleAuth() {
  await ensureSupabaseReady();
  hideAlert();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  if (!email || !password)
    return showAlert("Please fill in all required fields.");

  const splashScreen = document.getElementById("splash-screen");
  splashScreen.classList.remove("hidden-splash");

  if (currentMode === "signup") {
    const name = document.getElementById("signup-name").value.trim();
    const employeeId = document.getElementById("signup-empid").value.trim();
    const mobile = document.getElementById("signup-mobile").value.trim();
    const designation = document
      .getElementById("signup-designation")
      .value.trim();

    if (!name || !employeeId || !mobile || !designation) {
      splashScreen.classList.add("hidden-splash");
      return showAlert("Please complete all profile fields.");
    }

    if (!/^\d{10}$/.test(mobile)) {
      splashScreen.classList.add("hidden-splash");
      return showAlert("Please enter a valid 10-digit mobile number.");
    }

    const { error: authError } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { name, employee_id: employeeId, mobile, designation },
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    });

    splashScreen.classList.add("hidden-splash");
    if (authError) return showAlert(authError.message);

    showToast("✉️ Account created!");
    showAlert(
      "Registration successful! Check your email to verify.",
      "success",
    );
    switchTab("signin");
  } else {
    const { data: authData, error: authError } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

    if (authError) {
      splashScreen.classList.add("hidden-splash");
      return showAlert(authError.message);
    }

    let localDeviceId = localStorage.getItem("dakmitra_device_id");
    if (!localDeviceId) {
      localDeviceId =
        "dev_" + Math.random().toString(36).substring(2) + Date.now();
      localStorage.setItem("dakmitra_device_id", localDeviceId);
    }

    const { data: profileData, error: profileError } = await supabaseClient
      .from("profiles")
      .select("device_id, name, designation, employee_id, mobile, avatar_url")
      .eq("id", authData.user.id)
      .single();

    if (profileError) {
      await supabaseClient.auth.signOut();
      splashScreen.classList.add("hidden-splash");
      return showAlert("Error checking device registration.");
    }

    if (profileData.device_id && profileData.device_id !== localDeviceId) {
      await supabaseClient.auth.signOut();
      splashScreen.classList.add("hidden-splash");
      return showAlert(
        "Login Denied: Account already registered on another device.",
      );
    }

    if (!profileData.device_id) {
      await supabaseClient
        .from("profiles")
        .update({ device_id: localDeviceId })
        .eq("id", authData.user.id);
    }

    localStorage.setItem(
      "dakmitra_cached_profile",
      JSON.stringify({ ...profileData, email: authData.user.email }),
    );
    checkUserSession();
  }
}

async function checkEmailVerificationRedirect() {
  const hash = window.location.hash;
  if (hash && hash.includes("type=signup")) {
    const splashScreen = document.getElementById("splash-screen");
    splashScreen.classList.remove("hidden-splash");
    setTimeout(() => {
      splashScreen.classList.add("hidden-splash");
      showCustomConfirm(
        "🎉 Email Verified Successfully!",
        "Your DakMitra account is now active.",
        "Sign In Now",
        () => {
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );
          switchTab("signin");
        },
      );
    }, 1000);
  }
}

async function signOutApp() {
  await ensureSupabaseReady();
  teardownRealtimeSync();
  await supabaseClient.auth.signOut();
  localStorage.removeItem("dakmitra_cached_profile");
  closeSidebar();
  checkUserSession();
}

// --- DEVICE PASSKEYS ---
async function registerDevicePasskey() {
  await ensureSupabaseReady();
  try {
    const { error } = await supabaseClient.auth.registerPasskey();
    if (error) throw error;
    showToast("✅ Device successfully registered!");
  } catch (err) {
    showCustomAlert(
      "Passkey Failed",
      "Passkey registration failed: " + err.message,
      "⚠️",
    );
  }
}

async function signInWithDevice() {
  await ensureSupabaseReady();
  const splashScreen = document.getElementById("splash-screen");
  splashScreen.classList.remove("hidden-splash");

  try {
    const { error } = await supabaseClient.auth.signInWithPasskey();
    if (error) throw error;

    showToast("🔓 Verified by Device");
    checkUserSession();
  } catch (err) {
    splashScreen.classList.add("hidden-splash");
    showAlert("Device authentication failed. Try again.");
  }
}

// --- PROFILE RENDER & EDIT ---
function renderUserProfileUI(profileData, userEmail) {
  const name = profileData?.name || userEmail.split("@")[0] || "User";
  const designation = profileData?.designation || "Employee";
  const empId = profileData?.employee_id || "Not Set";
  const mobile = profileData?.mobile || "Not Set";
  const avatarUrl = profileData?.avatar_url || null;
  const initial = name.charAt(0).toUpperCase();

  document.getElementById("user-name-display").textContent = name;
  document.getElementById("user-designation-display").textContent = designation;
  document.getElementById("user-email-display").textContent = userEmail;

  document.getElementById("profile-page-name").textContent = name;
  document.getElementById("profile-page-designation").textContent = designation;
  document.getElementById("profile-page-empid").textContent = empId;
  document.getElementById("profile-page-mobile").textContent = mobile;
  document.getElementById("profile-page-email").textContent = userEmail;

  const nameInput = document.getElementById("edit-profile-name");
  const mobileInput = document.getElementById("edit-profile-mobile");
  const desigSelect = document.getElementById("edit-profile-designation");
  if (nameInput) nameInput.value = name;
  if (mobileInput) mobileInput.value = profileData?.mobile || "";
  if (desigSelect && profileData?.designation) {
    desigSelect.value = profileData.designation;
  }

  const topAvatar = document.getElementById("top-profile-btn");
  const sidebarAvatar = document.getElementById("avatar-letter");
  const pageAvatar = document.getElementById("profile-page-avatar");
  const removeBtn = document.getElementById("remove-avatar-btn");

  if (avatarUrl) {
    const imgTag = `<img src="${escapeHTML(avatarUrl)}" alt="Profile" />`;
    if (topAvatar) topAvatar.innerHTML = imgTag;
    sidebarAvatar.innerHTML = imgTag;
    pageAvatar.innerHTML = imgTag;
    removeBtn?.classList.remove("hidden");
  } else {
    if (topAvatar) topAvatar.textContent = initial;
    sidebarAvatar.textContent = initial;
    pageAvatar.textContent = initial;
    removeBtn?.classList.add("hidden");
  }
}

async function saveProfileDetails() {
  if (!(await ensureOnline("Connect to internet to save changes."))) return;
  const newName = document.getElementById("edit-profile-name").value.trim();
  const newMobile = document.getElementById("edit-profile-mobile").value.trim();
  const newDesignation = document.getElementById(
    "edit-profile-designation",
  ).value;

  if (!newName) return showToast("⚠️ Name cannot be empty.");
  if (newMobile && !/^\d{10}$/.test(newMobile)) {
    return showToast("⚠️ Please enter a valid 10-digit mobile number.");
  }

  const btn = document.getElementById("save-profile-btn");
  const btnContent = document.getElementById("save-profile-btn-content");

  const defaultHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
      </svg>
      <span>Save Profile Changes</span>
    `;

  btn.classList.add("is-loading");
  btn.disabled = true;
  btnContent.innerHTML = `
      <div class="btn-spinner"></div>
      <span>Updating Profile...</span>
    `;

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (session) {
    const { error } = await supabaseClient
      .from("profiles")
      .update({
        name: newName,
        mobile: newMobile || null,
        designation: newDesignation,
      })
      .eq("id", session.user.id);

    if (error) {
      btn.classList.remove("is-loading");
      btn.disabled = false;
      btnContent.innerHTML = defaultHTML;
      alert("Error updating profile: " + error.message);
      return;
    }

    let cachedProfile = {};
    try {
      cachedProfile =
        JSON.parse(localStorage.getItem("dakmitra_cached_profile")) || {};
    } catch (e) {}
    cachedProfile.name = newName;
    cachedProfile.mobile = newMobile || null;
    cachedProfile.designation = newDesignation;
    localStorage.setItem(
      "dakmitra_cached_profile",
      JSON.stringify(cachedProfile),
    );

    renderUserProfileUI(cachedProfile, session.user.email);

    btn.classList.remove("is-loading");
    btn.classList.add("is-success");
    btnContent.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline class="checkmark-path" points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Changes Saved!</span>
      `;
    showToast("✨ Profile updated successfully!");

    setTimeout(() => {
      btn.classList.remove("is-success");
      btn.disabled = false;
      btnContent.innerHTML = defaultHTML;
    }, 2200);
  } else {
    btn.classList.remove("is-loading");
    btn.disabled = false;
    btnContent.innerHTML = defaultHTML;
    showToast("⚠️ Session expired. Please sign in again.");
  }
}

async function updateAvatarInDatabase(avatarDataUrl) {
  if (!(await ensureOnline("Connect to internet to update your photo.")))
    return;
  await ensureSupabaseReady();
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (!session) return showToast("⚠️ Please sign in to update your photo.");

  showToast("⏳ Updating profile picture...");

  const { error } = await supabaseClient
    .from("profiles")
    .update({ avatar_url: avatarDataUrl })
    .eq("id", session.user.id);

  if (error) {
    return alert("Failed to update picture: " + error.message);
  }

  let cachedProfile = {};
  try {
    cachedProfile =
      JSON.parse(localStorage.getItem("dakmitra_cached_profile")) || {};
  } catch (e) {}
  cachedProfile.avatar_url = avatarDataUrl;
  localStorage.setItem(
    "dakmitra_cached_profile",
    JSON.stringify(cachedProfile),
  );

  renderUserProfileUI(cachedProfile, session.user.email);
  showToast("✨ Profile picture updated!");
}

function removeProfilePic() {
  showCustomConfirm(
    "Remove Profile Picture?",
    "Your profile will revert to the default letter avatar.",
    "Remove",
    async () => {
      await updateAvatarInDatabase(null);
      document.getElementById("profile-pic-input").value = "";
    },
  );
}

// =========================================================
// MODERN PINCH-TO-ZOOM PROFILE PHOTO CROPPER (WITH LIVE DUAL PREVIEW)
// =========================================================
const cropState = {
  img: null,
  natW: 0,
  natH: 0,
  scale: 1,
  minScale: 1,
  maxScale: 5,
  tx: 0,
  ty: 0,
  rotation: 0,
  guideShape: "round",
  cropSize: 300,
  previewSquareSize: 50,
  previewRoundSize: 48,
  pointers: new Map(),
  lastPinchDist: 0,
  lastPinchMid: null,
  lastTapTime: 0,
  objectUrl: null,
};

function getCropSize() {
  const cutout = document.getElementById("crop-cutout");
  return cutout ? cutout.getBoundingClientRect().width || 300 : 300;
}

function syncCropMetrics() {
  cropState.cropSize = getCropSize();
  const sqFrame = document.getElementById("crop-preview-square-frame");
  const rdFrame = document.getElementById("crop-preview-round-frame");
  if (sqFrame && sqFrame.clientWidth > 0) {
    cropState.previewSquareSize = sqFrame.clientWidth;
  }
  if (rdFrame && rdFrame.clientWidth > 0) {
    cropState.previewRoundSize = rdFrame.clientWidth;
  }
}

function setCropGuideShape(shape) {
  cropState.guideShape = shape === "square" ? "square" : "round";
  const cutout = document.getElementById("crop-cutout");
  const sqBtn = document.getElementById("crop-preview-square-btn");
  const rdBtn = document.getElementById("crop-preview-round-btn");

  cutout?.classList.toggle("is-square", cropState.guideShape === "square");
  sqBtn?.classList.toggle("active", cropState.guideShape === "square");
  rdBtn?.classList.toggle("active", cropState.guideShape === "round");

  if (navigator.vibrate) navigator.vibrate(20);
}

function computeCropBounds() {
  const cropSize = cropState.cropSize || getCropSize();
  const swapped = cropState.rotation % 180 !== 0;
  const baseW = swapped ? cropState.natH : cropState.natW;
  const baseH = swapped ? cropState.natW : cropState.natH;

  cropState.minScale = Math.max(cropSize / baseW, cropSize / baseH);
  cropState.maxScale = cropState.minScale * 4.5;
  cropState.scale = Math.min(
    Math.max(cropState.scale, cropState.minScale),
    cropState.maxScale,
  );

  const effW = baseW * cropState.scale;
  const effH = baseH * cropState.scale;
  const maxTx = Math.max(0, (effW - cropSize) / 2);
  const maxTy = Math.max(0, (effH - cropSize) / 2);

  cropState.tx = Math.min(Math.max(cropState.tx, -maxTx), maxTx);
  cropState.ty = Math.min(Math.max(cropState.ty, -maxTy), maxTy);
}

function applyCropTransform(animate = false) {
  const imgEl = document.getElementById("crop-source-img");
  if (!imgEl) return;

  imgEl.classList.toggle("is-animating", animate);
  imgEl.style.transform = `translate3d(calc(-50% + ${cropState.tx}px), calc(-50% + ${cropState.ty}px), 0) scale(${cropState.scale}) rotate(${cropState.rotation}deg)`;

  // Sync both live previews at 60fps using exact scaled GPU transforms
  const cropSize = cropState.cropSize || getCropSize() || 300;
  const previews = [
    {
      el: document.getElementById("crop-preview-square-img"),
      size: cropState.previewSquareSize,
    },
    {
      el: document.getElementById("crop-preview-round-img"),
      size: cropState.previewRoundSize,
    },
  ];

  previews.forEach(({ el, size }) => {
    if (!el || !size) return;
    const ratio = size / cropSize;
    el.classList.toggle("is-animating", animate);
    el.style.transform = `translate3d(calc(-50% + ${
      cropState.tx * ratio
    }px), calc(-50% + ${cropState.ty * ratio}px), 0) scale(${
      cropState.scale * ratio
    }) rotate(${cropState.rotation}deg)`;
  });
}

function handleProfilePicUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    return showToast("⚠️ Please select a valid image file.");
  }

  if (cropState.objectUrl) URL.revokeObjectURL(cropState.objectUrl);
  cropState.objectUrl = URL.createObjectURL(file);

  const imgEl = document.getElementById("crop-source-img");
  const sqPrevImg = document.getElementById("crop-preview-square-img");
  const rdPrevImg = document.getElementById("crop-preview-round-img");

  const loader = new Image();
  loader.onload = () => {
    cropState.img = loader;
    cropState.natW = loader.naturalWidth;
    cropState.natH = loader.naturalHeight;
    cropState.rotation = 0;
    cropState.tx = 0;
    cropState.ty = 0;

    [imgEl, sqPrevImg, rdPrevImg].forEach((el) => {
      if (!el) return;
      el.src = cropState.objectUrl;
      el.style.width = `${cropState.natW}px`;
      el.style.height = `${cropState.natH}px`;
    });

    setCropGuideShape("round");
    document.getElementById("crop-modal-overlay").classList.add("show");

    requestAnimationFrame(() => {
      syncCropMetrics();
      cropState.scale = 0;
      computeCropBounds();
      applyCropTransform(false);
    });
  };
  loader.src = cropState.objectUrl;
}

function rotateCropImage() {
  cropState.rotation = (cropState.rotation + 90) % 360;
  computeCropBounds();
  applyCropTransform(true);
}

function closeCropModal() {
  document.getElementById("crop-modal-overlay").classList.remove("show");
  const input = document.getElementById("profile-pic-input");
  if (input) input.value = "";
  cropState.pointers.clear();
}

function renderCropToCanvas() {
  const canvas = document.getElementById("crop-canvas");
  if (!canvas || !cropState.img) return null;

  const outSize = canvas.width;
  const ratio = outSize / getCropSize();
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, outSize, outSize);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  ctx.translate(outSize / 2, outSize / 2);
  ctx.translate(cropState.tx * ratio, cropState.ty * ratio);
  ctx.scale(cropState.scale * ratio, cropState.scale * ratio);
  ctx.rotate((cropState.rotation * Math.PI) / 180);
  ctx.drawImage(
    cropState.img,
    -cropState.natW / 2,
    -cropState.natH / 2,
    cropState.natW,
    cropState.natH,
  );
  ctx.restore();
  return canvas;
}

async function applyCropAndUpload() {
  const canvas = renderCropToCanvas();
  if (!canvas) return;
  const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.9);

  const btn = document.getElementById("apply-crop-btn");
  btn.textContent = "Saving...";
  btn.disabled = true;

  await updateAvatarInDatabase(compressedDataUrl);

  btn.textContent = "Save Photo";
  btn.disabled = false;
  closeCropModal();
}

(function initCropGestures() {
  const stage = document.getElementById("crop-stage");
  if (!stage) return;

  function getPinchMetrics() {
    const pts = Array.from(cropState.pointers.values());
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return {
      dist: Math.hypot(dx, dy),
      mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
    };
  }

  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    cropState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.classList.add("is-interacting");

    if (cropState.pointers.size === 1) {
      const now = Date.now();
      if (now - cropState.lastTapTime < 280) {
        const targetScale =
          cropState.scale > cropState.minScale * 1.15
            ? cropState.minScale
            : cropState.minScale * 2.2;
        cropState.scale = targetScale;
        if (targetScale === cropState.minScale) {
          cropState.tx = 0;
          cropState.ty = 0;
        }
        computeCropBounds();
        applyCropTransform(true);
        cropState.lastTapTime = 0;
      } else {
        cropState.lastTapTime = now;
      }
    } else if (cropState.pointers.size === 2) {
      const { dist, mid } = getPinchMetrics();
      cropState.lastPinchDist = dist;
      cropState.lastPinchMid = mid;
    }
  });

  stage.addEventListener("pointermove", (e) => {
    if (!cropState.pointers.has(e.pointerId)) return;
    const prev = cropState.pointers.get(e.pointerId);
    const curr = { x: e.clientX, y: e.clientY };
    cropState.pointers.set(e.pointerId, curr);

    if (cropState.pointers.size === 1) {
      cropState.tx += curr.x - prev.x;
      cropState.ty += curr.y - prev.y;
      computeCropBounds();
      applyCropTransform(false);
    } else if (cropState.pointers.size === 2) {
      const { dist, mid } = getPinchMetrics();
      if (cropState.lastPinchDist > 0) {
        const rect = stage.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        const oldScale = cropState.scale;
        const newScale = Math.min(
          Math.max(
            oldScale * (dist / cropState.lastPinchDist),
            cropState.minScale,
          ),
          cropState.maxScale,
        );
        const factor = newScale / oldScale;

        const mx = mid.x - cx;
        const my = mid.y - cy;
        cropState.tx =
          mx -
          (mx - cropState.tx) * factor +
          (mid.x - cropState.lastPinchMid.x);
        cropState.ty =
          my -
          (my - cropState.ty) * factor +
          (mid.y - cropState.lastPinchMid.y);
        cropState.scale = newScale;

        computeCropBounds();
        applyCropTransform(false);
      }
      cropState.lastPinchDist = dist;
      cropState.lastPinchMid = mid;
    }
  });

  function handlePointerEnd(e) {
    cropState.pointers.delete(e.pointerId);
    if (cropState.pointers.size < 2) {
      cropState.lastPinchDist = 0;
      cropState.lastPinchMid = null;
    }
    if (cropState.pointers.size === 0) {
      stage.classList.remove("is-interacting");
    }
  }

  stage.addEventListener("pointerup", handlePointerEnd);
  stage.addEventListener("pointercancel", handlePointerEnd);

  stage.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.91;
      cropState.scale *= zoomFactor;
      computeCropBounds();
      applyCropTransform(false);
    },
    { passive: false },
  );

  window.addEventListener("resize", () => {
    if (
      cropState.img &&
      document.getElementById("crop-modal-overlay")?.classList.contains("show")
    ) {
      syncCropMetrics();
      computeCropBounds();
      applyCropTransform(false);
    }
  });
})();

// =========================================================
// MODERN SWIPE-DOWN & PINCH-ZOOM PROFILE LIGHTBOX
// =========================================================
const lbState = {
  scale: 1,
  tx: 0,
  ty: 0,
  hasPhoto: false,
  pointers: new Map(),
  lastPinchDist: 0,
  lastTapTime: 0,
  tapTimer: null,
  moved: false,
};

function applyLightboxTransform(dragging = false) {
  const overlay = document.getElementById("avatar-lightbox-overlay");
  const frame = document.getElementById("avatar-lightbox-frame");
  if (!frame) return;

  frame.classList.toggle("is-dragging", dragging);

  if (lbState.scale === 1 && lbState.ty > 0) {
    const progress = Math.min(lbState.ty / 260, 1);
    const shrink = 1 - progress * 0.18;
    frame.style.transform = `translate3d(${lbState.tx * 0.35}px, ${
      lbState.ty
    }px, 0) scale(${shrink})`;
    if (overlay) {
      overlay.style.backgroundColor = `rgba(0, 0, 0, ${
        0.96 - progress * 0.65
      })`;
    }
  } else {
    frame.style.transform = `translate3d(${lbState.tx}px, ${lbState.ty}px, 0) scale(${lbState.scale})`;
    if (overlay) overlay.style.backgroundColor = "";
  }
}

function openProfilePhotoModal() {
  const avatarEl = document.getElementById("profile-page-avatar");
  const frame = document.getElementById("avatar-lightbox-frame");
  const nameEl = document.getElementById("lightbox-user-name");
  const deleteBtn = document.getElementById("lightbox-delete-btn");
  const shell = document.getElementById("lightbox-shell");
  const overlay = document.getElementById("avatar-lightbox-overlay");

  const existingImg = avatarEl?.querySelector("img");
  const displayName =
    document.getElementById("profile-page-name")?.textContent?.trim() ||
    "Profile Photo";

  if (nameEl) nameEl.textContent = displayName;
  shell?.classList.remove("ui-hidden");

  lbState.scale = 1;
  lbState.tx = 0;
  lbState.ty = 0;
  lbState.hasPhoto = Boolean(existingImg && existingImg.src);

  if (lbState.hasPhoto) {
    frame.innerHTML = `<img src="${escapeHTML(
      existingImg.src,
    )}" alt="Profile Photo" />`;
    deleteBtn?.classList.remove("hidden");
  } else {
    const initial = (avatarEl?.textContent || "U").trim().charAt(0) || "U";
    frame.innerHTML = `<div class="lightbox-initial-circle">${escapeHTML(
      initial,
    )}</div>`;
    deleteBtn?.classList.add("hidden");
  }

  overlay.style.backgroundColor = "";
  frame.style.transform = "";
  overlay.classList.add("show");
}

function closeProfilePhotoModal() {
  const overlay = document.getElementById("avatar-lightbox-overlay");
  const frame = document.getElementById("avatar-lightbox-frame");
  overlay?.classList.remove("show");
  setTimeout(() => {
    if (overlay) overlay.style.backgroundColor = "";
    if (frame) frame.style.transform = "";
    lbState.scale = 1;
    lbState.tx = 0;
    lbState.ty = 0;
  }, 260);
}

function triggerPhotoChangeFromLightbox() {
  closeProfilePhotoModal();
  setTimeout(() => {
    document.getElementById("profile-pic-input")?.click();
  }, 180);
}

function removePhotoFromLightbox() {
  closeProfilePhotoModal();
  if (typeof removeProfilePic === "function") removeProfilePic();
}

(function initLightboxGestures() {
  const stage = document.getElementById("lightbox-stage");
  const shell = document.getElementById("lightbox-shell");
  if (!stage) return;

  function clampLightboxPan() {
    const frame = document.getElementById("avatar-lightbox-frame");
    if (!frame) return;
    const maxOffset = (frame.offsetWidth * (lbState.scale - 1)) / 2;
    lbState.tx = Math.min(Math.max(lbState.tx, -maxOffset), maxOffset);
    lbState.ty = Math.min(Math.max(lbState.ty, -maxOffset), maxOffset);
  }

  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    lbState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lbState.moved = false;

    if (lbState.pointers.size === 2) {
      const pts = Array.from(lbState.pointers.values());
      lbState.lastPinchDist = Math.hypot(
        pts[0].x - pts[1].x,
        pts[0].y - pts[1].y,
      );
    }
  });

  stage.addEventListener("pointermove", (e) => {
    if (!lbState.pointers.has(e.pointerId)) return;
    const prev = lbState.pointers.get(e.pointerId);
    const curr = { x: e.clientX, y: e.clientY };
    lbState.pointers.set(e.pointerId, curr);

    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    if (Math.hypot(dx, dy) > 2) lbState.moved = true;

    if (lbState.pointers.size === 1) {
      if (lbState.scale > 1) {
        lbState.tx += dx;
        lbState.ty += dy;
        clampLightboxPan();
        applyLightboxTransform(true);
      } else {
        lbState.tx += dx;
        lbState.ty = Math.max(0, lbState.ty + dy);
        applyLightboxTransform(true);
      }
    } else if (lbState.pointers.size === 2 && lbState.hasPhoto) {
      const pts = Array.from(lbState.pointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lbState.lastPinchDist > 0) {
        lbState.scale = Math.min(
          Math.max(lbState.scale * (dist / lbState.lastPinchDist), 1),
          4,
        );
        clampLightboxPan();
        applyLightboxTransform(true);
      }
      lbState.lastPinchDist = dist;
    }
  });

  function handleLbEnd(e) {
    lbState.pointers.delete(e.pointerId);
    if (lbState.pointers.size < 2) lbState.lastPinchDist = 0;
    if (lbState.pointers.size > 0) return;

    if (!lbState.moved) {
      const now = Date.now();
      if (now - lbState.lastTapTime < 260) {
        clearTimeout(lbState.tapTimer);
        lbState.lastTapTime = 0;
        if (lbState.hasPhoto) {
          lbState.scale = lbState.scale > 1.1 ? 1 : 2.4;
          lbState.tx = 0;
          lbState.ty = 0;
          applyLightboxTransform(false);
        }
      } else {
        lbState.lastTapTime = now;
        lbState.tapTimer = setTimeout(() => {
          shell?.classList.toggle("ui-hidden");
        }, 260);
      }
      return;
    }

    if (lbState.scale <= 1.02) {
      if (lbState.ty > 95) {
        closeProfilePhotoModal();
      } else {
        lbState.scale = 1;
        lbState.tx = 0;
        lbState.ty = 0;
        applyLightboxTransform(false);
      }
    }
  }

  stage.addEventListener("pointerup", handleLbEnd);
  stage.addEventListener("pointercancel", handleLbEnd);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (
        document
          .getElementById("avatar-lightbox-overlay")
          ?.classList.contains("show")
      ) {
        closeProfilePhotoModal();
      } else if (
        document
          .getElementById("crop-modal-overlay")
          ?.classList.contains("show")
      ) {
        closeCropModal();
      }
    }
  });
})();

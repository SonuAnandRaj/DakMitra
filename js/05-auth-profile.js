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

// --- SUPERADMIN AUTH & LOCKOUT ALERT REPORTER ---
function isPasskeyUserCancel(err) {
  const name = String(err?.name || "");
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    name === "NotAllowedError" ||
    name === "AbortError" ||
    msg.includes("notallowederror") ||
    msg.includes("cancel") ||
    msg.includes("aborted") ||
    msg.includes("timed out")
  );
}

async function reportAuthAlert(
  eventType,
  email,
  errorMessage,
  source = "signin"
) {
  try {
    if (!navigator.onLine) return;
    if (typeof isNetworkError === "function" && isNetworkError(errorMessage)) {
      return;
    }
    if (!supabaseClient && typeof initSupabaseClient === "function") {
      initSupabaseClient();
    }
    if (!supabaseClient) return;

    const meta =
      typeof collectFeedbackDeviceMeta === "function"
        ? collectFeedbackDeviceMeta()
        : {
            app_version:
              typeof APP_VERSION !== "undefined" ? `v${APP_VERSION}` : "",
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            ua_short: String(navigator.userAgent || "").slice(0, 160),
          };

    const rpcCall = supabaseClient.rpc("report_auth_alert", {
      p_event_type: eventType,
      p_email: email ? String(email).trim() : null,
      p_error_message: String(errorMessage || "Authentication error").slice(
        0,
        300
      ),
      p_source: source,
      p_device_meta: meta,
    });

    await Promise.race([
      rpcCall,
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch (_) {}
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
  showSplashScreen();

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

    const { data: signUpData, error: authError } =
      await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { name, employee_id: employeeId, mobile, designation },
          emailRedirectTo: window.location.origin + window.location.pathname,
        },
      });

    if (authError) {
      reportAuthAlert("SIGNUP_FAILED", email, authError.message, "signup");
      splashScreen.classList.add("hidden-splash");
      return showAlert(authError.message);
    }

    if (typeof fetchAndApplyAppConfig === "function") {
      await fetchAndApplyAppConfig();
    }

    if (appConfig.require_user_approval) {
      // When email verification is OFF, Supabase auto-creates a session — revoke it immediately
      if (signUpData?.session) {
        await supabaseClient.auth.signOut();
      }
      splashScreen.classList.add("hidden-splash");
      showToast("⏳ Account created! Waiting for Superadmin approval.");
      switchTab("signin");
      showAlert(
        "Registration successful! Your account must be approved by the Superadmin before you can sign in.",
        "success"
      );
      return;
    }

    splashScreen.classList.add("hidden-splash");
    if (signUpData?.session) {
      showToast("🎉 Account created! Signing you in...");
      checkUserSession();
      return;
    }

    showToast("✉️ Account created!");
    switchTab("signin");
    showAlert("Registration successful! You can now sign in.", "success");
  } else {
    const { data: authData, error: authError } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

    if (authError) {
      reportAuthAlert("LOGIN_FAILED", email, authError.message, "signin");
      splashScreen.classList.add("hidden-splash");
      return showAlert(authError.message);
    }

    const { data: profileData, error: profileError } = await supabaseClient
      .from("profiles")
      .select(
        "device_id, name, designation, employee_id, mobile, avatar_url, show_mobile, approval_status, status_note"
      )
      .eq("id", authData.user.id)
      .single();

    if (profileError) {
      await reportAuthAlert(
        "PROFILE_ERROR",
        authData.user?.email || email,
        profileError.message || "Error checking account profile.",
        "signin"
      );
      await supabaseClient.auth.signOut();
      splashScreen.classList.add("hidden-splash");
      return showAlert("Error checking account profile.");
    }

    const isSuper =
      typeof checkIfSuperadmin === "function"
        ? await checkIfSuperadmin(authData.user.id)
        : false;

    const blockedMsg = getAccountBlockReason(profileData, isSuper);
    if (blockedMsg) {
      await forceLogoutBlockedUser(blockedMsg, {
        eventType: "ACCOUNT_BLOCKED",
        email: authData.user?.email || email,
        source: "signin",
      });
      splashScreen.classList.add("hidden-splash");
      return;
    }

    const devCheck = await enforceAndBindDeviceOnSignIn(
      authData.user.id,
      profileData,
      isSuper
    );
    if (!devCheck.ok) {
      await forceLogoutBlockedUser(devCheck.reason, {
        eventType: "DEVICE_LOCKED",
        email: authData.user?.email || email,
        source: "signin",
      });
      splashScreen.classList.add("hidden-splash");
      return;
    }

    localStorage.setItem(
      "dakmitra_cached_profile",
      JSON.stringify({
        ...profileData,
        device_id: devCheck.device_id,
        email: authData.user.email,
        is_superadmin: isSuper,
      })
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
            window.location.pathname
          );
          switchTab("signin");
        }
      );
    }, 1000);
  }
}

function getAccountBlockReason(profileData, isSuper = false) {
  if (isSuper) return null;
  const status = String(
    profileData?.approval_status || "APPROVED"
  ).toUpperCase();
  const note = profileData?.status_note
    ? ` Reason: ${profileData.status_note}`
    : "";

  if (status === "PENDING") {
    return "Account Pending Approval: Please wait for the Superadmin to approve your account.";
  }
  if (status === "REJECTED") {
    return `Registration Rejected.${note}`;
  }
  if (status === "SUSPENDED") {
    return `Account Suspended by Superadmin.${note}`;
  }
  return null;
}

function getOrCreateLocalDeviceId() {
  let localDeviceId = localStorage.getItem("dakmitra_device_id");
  if (!localDeviceId) {
    localDeviceId =
      "dev_" + Math.random().toString(36).substring(2) + Date.now();
    localStorage.setItem("dakmitra_device_id", localDeviceId);
  }
  return localDeviceId;
}

function getDeviceLockMismatchReason(profileData, isSuper = false) {
  if (isSuper) return null; // Keeps Superadmin accessible across dev & mobile
  const localDeviceId = localStorage.getItem("dakmitra_device_id");
  if (!profileData?.device_id) {
    return "Session Ended: Your device lock was reset by Superadmin. Please sign in again.";
  }
  if (!localDeviceId || profileData.device_id !== localDeviceId) {
    return "Session Ended: Account is registered on another device.";
  }
  return null;
}

async function enforceAndBindDeviceOnSignIn(
  userId,
  profileData,
  isSuper = false
) {
  if (isSuper) {
    return { ok: true, device_id: profileData?.device_id || null };
  }

  const localDeviceId = getOrCreateLocalDeviceId();
  if (profileData?.device_id && profileData.device_id !== localDeviceId) {
    return {
      ok: false,
      reason: "Login Denied: Account already registered on another device.",
    };
  }

  if (!profileData?.device_id) {
    const { error } = await supabaseClient
      .from("profiles")
      .update({ device_id: localDeviceId })
      .eq("id", userId);
    if (error) {
      return { ok: false, reason: "Error binding device: " + error.message };
    }
  }

  return { ok: true, device_id: localDeviceId };
}

function clearSessionCachesAndState() {
  isCurrentUserAdmin = false;
  isCurrentUserSuperadmin = false;
  currentUserId = null;

  localStorage.removeItem("dakmitra_cached_profile");
  localStorage.removeItem("dakmitra_members_cache");
  localStorage.removeItem("dakmitra_feedback_cache");
  localStorage.removeItem("dakmitra_feedback_draft");
  localStorage.removeItem("dakmitra_learning_leaderboard_cache");
  localStorage.removeItem("dakmitra_approvals_cache_pending");
  localStorage.removeItem("dakmitra_approvals_cache_resolved");

  if (typeof invalidateApprovalsCache === "function") {
    invalidateApprovalsCache();
  }
  if (typeof resetApprovalsFiltersStateOnly === "function") {
    resetApprovalsFiltersStateOnly();
  }
  if (typeof invalidateFeedbackCache === "function") invalidateFeedbackCache();
  if (typeof updateSidebarFeedbackBadge === "function") {
    updateSidebarFeedbackBadge(0);
  }
  if (typeof resetLearnMemoryState === "function") resetLearnMemoryState();
  if (typeof resetSuperadminState === "function") resetSuperadminState();

  membersDirectoryData = [];
  membersDirectoryLoaded = false;
  if (typeof userProfileCache !== "undefined") userProfileCache.clear();

  document.getElementById("maintenance-overlay")?.classList.remove("show");
  if (typeof closeAllDirectoryActionTrays === "function") {
    closeAllDirectoryActionTrays();
  }
}

async function forceLogoutBlockedUser(reasonMsg, alertMeta = null) {
  if (alertMeta && alertMeta.eventType) {
    await reportAuthAlert(
      alertMeta.eventType,
      alertMeta.email || null,
      reasonMsg,
      alertMeta.source || "session"
    );
  }

  try {
    teardownRealtimeSync();
    if (supabaseClient) await supabaseClient.auth.signOut();
  } catch (_) {}

  clearSessionCachesAndState();
  localStorage.removeItem("dakmitra_offline_db");
  localStorage.removeItem(OFFICE_STAFF_CACHE_KEY);
  localStorage.removeItem("dakmitra_sync_meta");
  cachedPostOffices = [];
  cachedOfficeStaff = [];
  officeStaffByKeyMap.clear();

  document.getElementById("dashboard-view")?.classList.add("hidden");
  document.getElementById("auth-view")?.classList.remove("hidden");
  switchTab("signin");
  if (reasonMsg) showAlert(reasonMsg, "error");
}

async function signOutApp() {
  await ensureSupabaseReady();
  teardownRealtimeSync();
  await supabaseClient.auth.signOut();
  clearSessionCachesAndState();
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
      "⚠️"
    );
  }
}

async function signInWithDevice() {
  await ensureSupabaseReady();
  hideAlert();
  const splashScreen = document.getElementById("splash-screen");
  showSplashScreen();

  try {
    const { data: authData, error } =
      await supabaseClient.auth.signInWithPasskey();
    if (error) throw error;

    const user =
      authData?.user || (await supabaseClient.auth.getUser())?.data?.user;
    if (!user) throw new Error("Unable to verify user session.");

    const { data: profileData, error: profileError } = await supabaseClient
      .from("profiles")
      .select(
        "device_id, name, designation, employee_id, mobile, avatar_url, show_mobile, approval_status, status_note"
      )
      .eq("id", user.id)
      .single();

    if (profileError) {
      await reportAuthAlert(
        "PROFILE_ERROR",
        user.email,
        profileError.message || "Error checking account profile.",
        "passkey"
      );
      await supabaseClient.auth.signOut();
      splashScreen.classList.add("hidden-splash");
      return showAlert("Error checking account profile.");
    }

    const isSuper =
      typeof checkIfSuperadmin === "function"
        ? await checkIfSuperadmin(user.id)
        : false;

    const blockedMsg = getAccountBlockReason(profileData, isSuper);
    if (blockedMsg) {
      await forceLogoutBlockedUser(blockedMsg, {
        eventType: "ACCOUNT_BLOCKED",
        email: user.email,
        source: "passkey",
      });
      splashScreen.classList.add("hidden-splash");
      return;
    }

    const devCheck = await enforceAndBindDeviceOnSignIn(
      user.id,
      profileData,
      isSuper
    );
    if (!devCheck.ok) {
      await forceLogoutBlockedUser(devCheck.reason, {
        eventType: "DEVICE_LOCKED",
        email: user.email,
        source: "passkey",
      });
      splashScreen.classList.add("hidden-splash");
      return;
    }

    localStorage.setItem(
      "dakmitra_cached_profile",
      JSON.stringify({
        ...profileData,
        device_id: devCheck.device_id,
        email: user.email,
        is_superadmin: isSuper,
      })
    );

    showToast("🔓 Verified by Device");
    checkUserSession();
  } catch (err) {
    if (!isPasskeyUserCancel(err)) {
      const typedEmail = document.getElementById("email")?.value.trim() || null;
      reportAuthAlert(
        "PASSKEY_FAILED",
        typedEmail,
        err?.message || "Device authentication failed.",
        "passkey"
      );
    }
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
  const showMobileToggle = document.getElementById("edit-profile-show-mobile");
  if (showMobileToggle) {
    showMobileToggle.checked = profileData?.show_mobile !== false;
  }

  const topAvatar = document.getElementById("top-profile-btn");
  const sidebarAvatar = document.getElementById("avatar-letter");
  const pageAvatar = document.getElementById("profile-page-avatar");

  if (avatarUrl) {
    const imgTag = `<img src="${escapeHTML(avatarUrl)}" alt="Profile" />`;
    if (topAvatar) topAvatar.innerHTML = imgTag;
    sidebarAvatar.innerHTML = imgTag;
    pageAvatar.innerHTML = imgTag;
  } else {
    if (topAvatar) topAvatar.textContent = initial;
    sidebarAvatar.textContent = initial;
    pageAvatar.textContent = initial;
  }
}

async function saveProfileDetails() {
  if (!(await ensureOnline("Connect to internet to save changes."))) return;
  const newName = document.getElementById("edit-profile-name").value.trim();
  const newMobile = document.getElementById("edit-profile-mobile").value.trim();
  const newDesignation = document.getElementById(
    "edit-profile-designation"
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

  const showMobile =
    document.getElementById("edit-profile-show-mobile")?.checked !== false;

  if (session) {
    const { error } = await supabaseClient
      .from("profiles")
      .update({
        name: newName,
        mobile: newMobile || null,
        designation: newDesignation,
        show_mobile: showMobile,
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
    cachedProfile.show_mobile = showMobile;
    userProfileCache.delete(String(session.user.id));
    membersDirectoryLoaded = false;
    localStorage.setItem(
      "dakmitra_cached_profile",
      JSON.stringify(cachedProfile)
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

const AVATAR_BUCKET = "avatars";

async function cleanupOldStorageAvatars(userId, keepFileName = null) {
  if (!userId || !supabaseClient) return;
  try {
    const { data: files, error } = await supabaseClient.storage
      .from(AVATAR_BUCKET)
      .list(String(userId));
    if (error || !Array.isArray(files) || files.length === 0) return;

    const toRemove = files
      .filter((f) => f?.name && f.name !== keepFileName)
      .map((f) => `${userId}/${f.name}`);

    if (toRemove.length > 0) {
      await supabaseClient.storage.from(AVATAR_BUCKET).remove(toRemove);
    }
  } catch (_) {}
}

async function updateAvatarInDatabase(avatarUrlOrBlob) {
  if (!(await ensureOnline("Connect to internet to update your photo.")))
    return false;

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (!session) {
    showToast("⚠️ Please sign in to update your photo.");
    return false;
  }

  const userId = session.user.id;
  showToast("⏳ Updating profile picture...");

  let nextAvatarUrl = null;
  let uploadedFileName = null;
  let uploadedPath = null;

  try {
    if (avatarUrlOrBlob instanceof Blob) {
      uploadedFileName = `avatar_${Date.now()}.jpg`;
      uploadedPath = `${userId}/${uploadedFileName}`;

      const { error: uploadErr } = await supabaseClient.storage
        .from(AVATAR_BUCKET)
        .upload(uploadedPath, avatarUrlOrBlob, {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: false,
        });

      if (uploadErr) throw uploadErr;

      const { data: publicData } = supabaseClient.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(uploadedPath);
      nextAvatarUrl = publicData?.publicUrl || null;
      if (!nextAvatarUrl) throw new Error("Could not resolve avatar URL.");
    } else if (typeof avatarUrlOrBlob === "string" && avatarUrlOrBlob.trim()) {
      nextAvatarUrl = avatarUrlOrBlob.trim();
    }

    const { error } = await supabaseClient
      .from("profiles")
      .update({ avatar_url: nextAvatarUrl })
      .eq("id", userId);

    if (error) {
      if (uploadedPath) {
        supabaseClient.storage
          .from(AVATAR_BUCKET)
          .remove([uploadedPath])
          .catch(() => {});
      }
      throw error;
    }

    // Delete older files in Storage only after the DB update succeeds
    await cleanupOldStorageAvatars(userId, uploadedFileName);

    let cachedProfile = {};
    try {
      cachedProfile =
        JSON.parse(localStorage.getItem("dakmitra_cached_profile")) || {};
    } catch (e) {}
    cachedProfile.avatar_url = nextAvatarUrl;
    localStorage.setItem(
      "dakmitra_cached_profile",
      JSON.stringify(cachedProfile)
    );

    userProfileCache.delete(String(userId));
    membersDirectoryLoaded = false;

    renderUserProfileUI(cachedProfile, session.user.email);
    showToast(
      nextAvatarUrl
        ? "✨ Profile picture updated!"
        : "🗑️ Profile picture removed."
    );
    return true;
  } catch (err) {
    alert("Failed to update picture: " + err.message);
    return false;
  }
}

function removeProfilePic() {
  showCustomConfirm(
    "Remove Profile Picture?",
    "Your profile will revert to the default letter avatar.",
    "Remove",
    async () => {
      await updateAvatarInDatabase(null);
      const input = document.getElementById("profile-pic-input");
      if (input) input.value = "";
    }
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
    cropState.maxScale
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

  if (cropState.objectUrl) {
    const urlToRevoke = cropState.objectUrl;
    cropState.objectUrl = null;
    setTimeout(() => URL.revokeObjectURL(urlToRevoke), 320);
  }
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
    cropState.natH
  );
  ctx.restore();
  return canvas;
}

async function applyCropAndUpload() {
  const canvas = renderCropToCanvas();
  if (!canvas) return;

  const btn = document.getElementById("apply-crop-btn");
  btn.textContent = "Saving...";
  btn.disabled = true;

  try {
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Image encoding failed."))),
        "image/jpeg",
        0.85
      );
    });

    const ok = await updateAvatarInDatabase(blob);
    if (ok) closeCropModal();
  } catch (err) {
    showToast("❌ " + (err.message || "Could not process photo."), "error");
  } finally {
    btn.textContent = "Save Photo";
    btn.disabled = false;
  }
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
            cropState.minScale
          ),
          cropState.maxScale
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
    { passive: false }
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

function openProfilePhotoModal(customOptions = null) {
  const avatarEl = document.getElementById("profile-page-avatar");
  const frame = document.getElementById("avatar-lightbox-frame");
  const nameEl = document.getElementById("lightbox-user-name");
  const deleteBtn = document.getElementById("lightbox-delete-btn");
  const bottomBar = document.getElementById("lightbox-bottombar");
  const shell = document.getElementById("lightbox-shell");
  const overlay = document.getElementById("avatar-lightbox-overlay");

  const isReadOnly = Boolean(customOptions && customOptions.readOnly);
  let imgSrc = null;
  let displayName = "Profile Photo";
  let initial = "U";

  if (customOptions) {
    imgSrc = customOptions.src || null;
    displayName = customOptions.name || "Profile Photo";
    initial = (customOptions.initial || displayName || "U")
      .trim()
      .charAt(0)
      .toUpperCase();
  } else {
    const existingImg = avatarEl?.querySelector("img");
    imgSrc = existingImg?.src || null;
    displayName =
      document.getElementById("profile-page-name")?.textContent?.trim() ||
      "Profile Photo";
    initial = (avatarEl?.textContent || "U").trim().charAt(0) || "U";
  }

  if (nameEl) nameEl.textContent = displayName;
  shell?.classList.remove("ui-hidden");
  bottomBar?.classList.toggle("hidden", isReadOnly);

  lbState.scale = 1;
  lbState.tx = 0;
  lbState.ty = 0;
  lbState.hasPhoto = Boolean(imgSrc);

  if (lbState.hasPhoto) {
    frame.innerHTML = `<img src="${escapeHTML(imgSrc)}" alt="Profile Photo" />`;
    deleteBtn?.classList.toggle("hidden", isReadOnly);
  } else {
    frame.innerHTML = `<div class="lightbox-initial-circle">${escapeHTML(
      initial
    )}</div>`;
    deleteBtn?.classList.add("hidden");
  }

  overlay.style.backgroundColor = "";
  frame.style.transform = "";
  frame?.classList.toggle(
    "is-screenshot",
    Boolean(customOptions && customOptions.isScreenshot)
  );
  overlay.classList.add("show");
}

function closeProfilePhotoModal() {
  const overlay = document.getElementById("avatar-lightbox-overlay");
  const frame = document.getElementById("avatar-lightbox-frame");
  overlay?.classList.remove("show");
  setTimeout(() => {
    if (overlay) overlay.style.backgroundColor = "";
    if (frame) frame.style.transform = "";
    frame?.classList.remove("is-screenshot");
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
        pts[0].y - pts[1].y
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
          4
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

// =========================================================
// PUBLIC USER PROFILES & MEMBERS DIRECTORY
// =========================================================
const MEMBERS_CACHE_KEY = "dakmitra_members_cache";
const USER_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

let membersDirectoryData = [];
let membersDirectoryLoaded = false;
let activeMemberRoleFilter = "all";
const userProfileCache = new Map();
let activeViewedProfile = null;

// Shared inline clickable user-name helper (used by Approvals & Record History)
function renderUserProfileLink(userId, displayName, extraClass = "") {
  const safeName = escapeHTML(displayName || "Unknown User");
  if (
    !userId ||
    !displayName ||
    displayName === "System / Direct Upload" ||
    displayName === "Unknown User"
  ) {
    return `<b>${safeName}</b>`;
  }
  return `<button type="button" class="history-dir-link ${extraClass}" onclick="event.stopPropagation(); openUserProfileModal('${escapeForOnclick(
    userId
  )}', '${escapeForOnclick(
    displayName
  )}')" title="View ${safeName}'s profile">${safeName}</button>`;
}

const MEMBER_ROLE_CHIPS = [
  { key: "all", label: "All" },
  { key: "admin", label: "🛡️ Admins" },
  { key: "Sorting Assistant (SA)", label: "SA" },
  { key: "Postal Assistant (PA)", label: "PA" },
  { key: "Post Man", label: "Post Man" },
  { key: "Multi Tasking Staff (MTS)", label: "MTS" },
  { key: "Branch Post Master (BPM)", label: "BPM" },
  { key: "Assistant Branch Post Master (ABPM)", label: "ABPM" },
];

async function renderMembersDirectory(forceRefresh = false) {
  const contentEl = document.getElementById("members-content");
  if (!contentEl) return;

  // 1. Instant render from local cache if available
  if (membersDirectoryData.length === 0) {
    try {
      const cached = JSON.parse(localStorage.getItem(MEMBERS_CACHE_KEY));
      if (Array.isArray(cached) && cached.length > 0) {
        membersDirectoryData = cached;
      }
    } catch (_) {}
  }

  if (membersDirectoryData.length > 0) {
    renderMembersListUI();
  } else {
    contentEl.innerHTML = `
      <div class="skeleton-card"><div class="skeleton-line medium"></div><div class="skeleton-line short"></div></div>
      <div class="skeleton-card"><div class="skeleton-line medium"></div><div class="skeleton-line short"></div></div>
      <div class="skeleton-card"><div class="skeleton-line medium"></div><div class="skeleton-line short"></div></div>`;
  }

  if (membersDirectoryLoaded && !forceRefresh) return;

  // 2. Refresh fresh list from Supabase RPC
  const handleOfflineEmployees = () => {
    if (membersDirectoryData.length === 0) {
      contentEl.innerHTML = `<div class="list-empty">📡 No internet connection and no cached employees saved yet.</div>`;
    } else {
      showOfflineToast("Showing cached employees.");
    }
  };

  if (!navigator.onLine) {
    handleOfflineEmployees();
    return;
  }

  try {
    await ensureSupabaseReady();
    const { data, error } = await supabaseClient.rpc("get_members_directory");
    if (error) throw error;

    membersDirectoryData = Array.isArray(data) ? data : [];
    membersDirectoryLoaded = true;
    try {
      localStorage.setItem(
        MEMBERS_CACHE_KEY,
        JSON.stringify(membersDirectoryData)
      );
    } catch (_) {}

    renderMembersListUI();
  } catch (err) {
    if (isNetworkError(err)) {
      handleOfflineEmployees();
      return;
    }
    if (membersDirectoryData.length === 0) {
      contentEl.innerHTML = `<div class="list-empty" style="color: #ef4444;">Failed to load employees: ${escapeHTML(
        err.message
      )}</div>`;
    }
  }
}

function setMemberRoleFilter(roleKey) {
  activeMemberRoleFilter = roleKey || "all";
  if (navigator.vibrate) navigator.vibrate(18);
  renderMembersListUI();
}

function filterMembersDirectory() {
  const input = document.getElementById("members-filter-input");
  const clearBtn = document.getElementById("clear-members-filter-btn");
  if (clearBtn && input) {
    clearBtn.classList.toggle("hidden", input.value.length === 0);
  }
  renderMembersListUI();
}

function clearMembersFilter() {
  const input = document.getElementById("members-filter-input");
  if (input) {
    input.value = "";
    input.focus();
  }
  document.getElementById("clear-members-filter-btn")?.classList.add("hidden");
  renderMembersListUI();
}

function renderMembersListUI() {
  const contentEl = document.getElementById("members-content");
  const chipsEl = document.getElementById("members-filter-chips");
  if (!contentEl) return;

  const q = (document.getElementById("members-filter-input")?.value || "")
    .trim()
    .toLowerCase();

  const textMatched = q
    ? membersDirectoryData.filter((m) => {
        const hay = `${m.name || ""} ${m.employee_id || ""} ${
          m.designation || ""
        }`.toLowerCase();
        return hay.includes(q);
      })
    : membersDirectoryData;

  if (chipsEl) {
    chipsEl.innerHTML = MEMBER_ROLE_CHIPS.map((chip) => {
      let count = textMatched.length;
      if (chip.key === "admin") {
        count = textMatched.filter((m) => Boolean(m.is_admin)).length;
      } else if (chip.key !== "all") {
        count = textMatched.filter(
          (m) => String(m.designation || "") === chip.key
        ).length;
      }

      if (
        chip.key !== "all" &&
        count === 0 &&
        activeMemberRoleFilter !== chip.key
      ) {
        return "";
      }

      const activeCls = activeMemberRoleFilter === chip.key ? "active" : "";
      const styleCls = chip.key === "admin" ? "is-priority" : "is-office";

      return `
        <button
          type="button"
          class="dir-filter-chip ${
            chip.key === "all" ? "" : styleCls
          } ${activeCls}"
          onclick="setMemberRoleFilter('${escapeForOnclick(chip.key)}')"
        >
          <span>${escapeHTML(chip.label)}</span>
          <span class="dir-chip-count">${count}</span>
        </button>`;
    }).join("");
  }

  const filtered = textMatched.filter((m) => {
    if (activeMemberRoleFilter === "all") return true;
    if (activeMemberRoleFilter === "admin") return Boolean(m.is_admin);
    return String(m.designation || "") === activeMemberRoleFilter;
  });

  if (filtered.length === 0) {
    contentEl.innerHTML = `<div class="list-empty">No matching employees found.</div>`;
    return;
  }

  contentEl.innerHTML = filtered
    .map((m) => {
      const name = m.name || "DakMitra User";
      const initial = name.trim().charAt(0).toUpperCase() || "U";
      const isSelf = currentUserId && String(m.id) === String(currentUserId);
      const desig = m.designation || "Employee";
      const empId = m.employee_id || "No ID";

      return `
        <button
          type="button"
          class="member-card"
          onclick="openUserProfileModal('${escapeForOnclick(
            m.id
          )}', '${escapeForOnclick(name)}')"
        >
          <div class="member-avatar">${escapeHTML(initial)}</div>
          <div class="member-info">
            <div class="member-name-row">
              <span class="member-name">${escapeHTML(name)}</span>
              ${
                m.is_superadmin
                  ? `<span class="member-admin-badge">👑 Superadmin</span>`
                  : m.is_admin
                  ? `<span class="member-admin-badge">Admin</span>`
                  : ""
              }
              ${isSelf ? `<span class="member-you-badge">You</span>` : ""}
            </div>
            <div class="member-meta">
              <span>${escapeHTML(desig)}</span>
              <span>•</span>
              <span>🆔 ${escapeHTML(empId)}</span>
            </div>
          </div>
          <svg class="member-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>`;
    })
    .join("");
}

function closeUserProfileModal() {
  document
    .getElementById("user-profile-modal-overlay")
    ?.classList.remove("show");
}

function openViewedUserPhotoLightbox() {
  if (!activeViewedProfile) return;
  const name = activeViewedProfile.name || "User Profile";
  openProfilePhotoModal({
    src: activeViewedProfile.avatar_url || null,
    name: name,
    initial: name.trim().charAt(0).toUpperCase() || "U",
    readOnly: true,
  });
}

function renderUserProfileModalContent(profile, isOfflineBasic = false) {
  const bodyEl = document.getElementById("user-modal-body");
  const actionsEl = document.getElementById("user-modal-actions");
  if (!bodyEl) return;

  activeViewedProfile = profile;
  const name = profile.name || "DakMitra User";
  const initial = name.trim().charAt(0).toUpperCase() || "U";
  const designation = profile.designation || "Employee";
  const empId = profile.employee_id || "Not Set";
  const isSelf = currentUserId && String(profile.id) === String(currentUserId);
  const avatarHtml = profile.avatar_url
    ? `<img src="${escapeHTML(profile.avatar_url)}" alt="${escapeHTML(
        name
      )}" />`
    : escapeHTML(initial);

  const hasMobile = Boolean(profile.mobile && String(profile.mobile).trim());
  const cleanPhone = hasMobile
    ? String(profile.mobile).replace(/[^\d+]/g, "")
    : "";

  let mobileValueHtml = "";
  if (isOfflineBasic) {
    mobileValueHtml = `<strong style="color: var(--text-light); font-weight: 600;">Available online</strong>`;
  } else if (hasMobile) {
    mobileValueHtml = `
      <div class="user-modal-mobile-row">
        <div>
          <strong>${escapeHTML(profile.mobile)}</strong>
          ${
            isSelf && profile.show_mobile === false
              ? `<div style="font-size: 11px; color: var(--text-light); margin-top: 2px;">Hidden from colleagues</div>`
              : ""
          }
        </div>
        ${
          cleanPhone
            ? `<a href="tel:${escapeHTML(
                cleanPhone
              )}" class="staff-call-btn">📞 Call</a>`
            : ""
        }
      </div>`;
  } else if (profile.show_mobile === false) {
    mobileValueHtml = `<strong style="color: var(--text-light); font-weight: 600;">Hidden by user</strong>`;
  } else {
    mobileValueHtml = `<strong style="color: var(--text-light); font-weight: 600;">Not Set</strong>`;
  }

  const memberSinceHtml = profile.created_at
    ? `<div class="profile-detail-box" style="grid-column: 1 / -1">
         <span>Joined</span>
         <strong>${escapeHTML(
           new Date(profile.created_at).toLocaleDateString("en-IN", {
             month: "long",
             year: "numeric",
           })
         )}</strong>
       </div>`
    : "";

  const safeUid = escapeForOnclick(profile.id || "");
  const safeNameArg = escapeForOnclick(name);
  const safeEmpArg = escapeForOnclick(profile.employee_id || "");

  const statsHtml = isOfflineBasic
    ? ""
    : `<div class="member-stats-grid">
           <button
             type="button"
             class="member-stat-pill is-clickable"
             onclick="openApprovalsForUser('${safeUid}', '${safeNameArg}', '${safeEmpArg}', 'resolved', 'requested')"
             title="View ${escapeHTML(name)}'s resolved requests"
           >
             <strong>${Number(profile.approved_requests_count || 0)}</strong>
             <span>Approved Edits</span>
           </button>
           <button
             type="button"
             class="member-stat-pill is-clickable"
             onclick="openApprovalsForUser('${safeUid}', '${safeNameArg}', '${safeEmpArg}', 'resolved', 'voted')"
             title="View requests ${escapeHTML(name)} voted on"
           >
             <strong>${Number(profile.votes_cast_count || 0)}</strong>
             <span>Votes Cast</span>
           </button>
         </div>`;

  bodyEl.innerHTML = `
    <div class="user-modal-banner"></div>
    <div class="user-modal-avatar-wrap">
      <div
        class="user-modal-avatar"
        onclick="openViewedUserPhotoLightbox()"
        title="Tap to view photo"
      >
        ${avatarHtml}
      </div>
    </div>

    <div style="padding: 0 20px;">
      <div style="display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px;">
        <h3 style="font-size: 20px; font-weight: 800; color: var(--text); margin: 0;">
          ${escapeHTML(name)}
        </h3>
        ${
          profile.is_superadmin
            ? `<span class="member-admin-badge">👑 Superadmin</span>`
            : profile.is_admin
            ? `<span class="member-admin-badge">🛡️ Admin</span>`
            : ""
        }
        ${isSelf ? `<span class="member-you-badge">You</span>` : ""}
      </div>

      <div class="sidebar-designation" style="margin: 0 auto 4px; font-size: 12px; padding: 5px 12px;">
        ${escapeHTML(designation)}
      </div>
    </div>

    ${statsHtml}

    <div class="profile-info-grid" style="padding: 14px 20px 18px;">
      <div class="profile-detail-box">
        <span>Employee ID</span>
        <strong>${escapeHTML(empId)}</strong>
      </div>
      <div class="profile-detail-box">
        <span>Mobile Number</span>
        ${mobileValueHtml}
      </div>
      ${memberSinceHtml}
    </div>
  `;

  if (actionsEl) {
    actionsEl.innerHTML = isSelf
      ? `<button type="button" class="dm-btn dm-btn-secondary" style="flex: 1" onclick="openApprovalsForUser('${safeUid}', '${safeNameArg}', '${safeEmpArg}', 'resolved', 'requested')">📋 My Approvals</button>
         <button type="button" class="dm-btn dm-btn-primary" style="flex: 1" onclick="closeUserProfileModal(); switchDashboardView('profile');">Edit Profile</button>`
      : `<button type="button" class="dm-btn dm-btn-secondary" style="flex: 0.42" onclick="closeUserProfileModal()">Close</button>
         <button type="button" class="dm-btn dm-btn-primary" style="flex: 1" onclick="openApprovalsForUser('${safeUid}', '${safeNameArg}', '${safeEmpArg}', 'resolved', 'requested')">📋 View Approvals</button>`;
  }
}

async function openUserProfileModal(userId, fallbackName = "") {
  if (!userId) return;

  const overlay = document.getElementById("user-profile-modal-overlay");
  const bodyEl = document.getElementById("user-modal-body");
  const actionsEl = document.getElementById("user-modal-actions");
  if (!overlay || !bodyEl) return;

  const cacheKey = String(userId);
  const cachedEntry = userProfileCache.get(cacheKey);
  if (cachedEntry && Date.now() - cachedEntry.ts < USER_PROFILE_CACHE_TTL_MS) {
    renderUserProfileModalContent(cachedEntry.data);
    overlay.classList.add("show");
    return;
  }

  // Show immediate loading skeleton inside modal
  const tempInitial = (fallbackName || "U").trim().charAt(0).toUpperCase();
  bodyEl.innerHTML = `
    <div class="user-modal-banner"></div>
    <div class="user-modal-avatar-wrap">
      <div class="user-modal-avatar">${escapeHTML(tempInitial)}</div>
    </div>
    <div style="padding: 0 20px 24px;">
      <h3 style="font-size: 19px; font-weight: 800; color: var(--text); margin-bottom: 12px;">
        ${escapeHTML(fallbackName || "Loading profile...")}
      </h3>
      <div class="skeleton-line medium" style="margin: 0 auto 10px;"></div>
      <div class="skeleton-line short" style="margin: 0 auto;"></div>
    </div>
  `;
  if (actionsEl) {
    actionsEl.innerHTML = `<button type="button" class="dm-btn dm-btn-secondary dm-btn-full" onclick="closeUserProfileModal()">Close</button>`;
  }
  overlay.classList.add("show");

  const handleOfflineProfile = () => {
    const basicMember = membersDirectoryData.find(
      (m) => String(m.id) === cacheKey
    );
    if (basicMember) {
      renderUserProfileModalContent(basicMember, true);
      showOfflineToast("Showing cached basic profile.");
    } else {
      bodyEl.innerHTML = `<div style="padding: 40px 20px; color: var(--text-light); font-size: 14px;">📡 Connect to the internet to load this user's profile.</div>`;
    }
  };

  if (!navigator.onLine) {
    handleOfflineProfile();
    return;
  }

  try {
    await ensureSupabaseReady();
    const { data, error } = await supabaseClient.rpc(
      "get_user_public_profile",
      { target_user_id: userId }
    );
    if (error) throw error;

    const profile = Array.isArray(data) ? data[0] : data;
    if (!profile) {
      bodyEl.innerHTML = `<div style="padding: 40px 20px; color: var(--text-light); font-size: 14px;">Profile not found.</div>`;
      return;
    }

    userProfileCache.set(cacheKey, { data: profile, ts: Date.now() });
    renderUserProfileModalContent(profile);
  } catch (err) {
    if (isNetworkError(err)) {
      handleOfflineProfile();
      return;
    }
    bodyEl.innerHTML = `<div style="padding: 40px 20px; color: #ef4444; font-size: 14px;">Error loading profile: ${escapeHTML(
      err.message
    )}</div>`;
  }
}

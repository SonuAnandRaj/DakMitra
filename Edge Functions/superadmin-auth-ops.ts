import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonRes({ error: "Missing authorization." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonRes({ error: "Server environment keys missing." }, 500);
    }

    // 1. Verify caller's JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: actor },
      error: authErr,
    } = await userClient.auth.getUser();

    if (authErr || !actor) {
      return jsonRes({ error: "Session expired. Please sign in again." }, 401);
    }

    // 2. Verify caller is in public.superadmins using Service Role client
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: superRow } = await adminClient
      .from("superadmins")
      .select("id")
      .eq("id", actor.id)
      .maybeSingle();

    if (!superRow) {
      return jsonRes({ error: "Unauthorized: Superadmin access required." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").trim();
    const targetUserId = String(body.targetUserId || "").trim();

    if (!action || !targetUserId) {
      return jsonRes({ error: "Missing action or targetUserId." }, 400);
    }

    // Check if target is a Superadmin
    const { data: targetSuper } = await adminClient
      .from("superadmins")
      .select("id")
      .eq("id", targetUserId)
      .maybeSingle();

    // Fetch target profile for audit context
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("id, email, name, approval_status")
      .eq("id", targetUserId)
      .maybeSingle();

    const logAudit = async (
      auditAction: string,
      targetTable: string,
      oldData: unknown = null,
      newData: unknown = null,
    ) => {
      await adminClient.from("superadmin_audit_logs").insert({
        actor_id: actor.id,
        action: auditAction,
        target_table: targetTable,
        target_id: targetUserId,
        old_data: oldData,
        new_data: newData,
      });
    };

    // --- ACTION 1: APPROVE + AUTO-VERIFY EMAIL (+ OPTIONAL MAKE ADMIN) ---
    if (action === "approve_and_verify") {
      const { error: verifyErr } = await adminClient.auth.admin.updateUserById(
        targetUserId,
        { email_confirm: true },
      );
      if (verifyErr) return jsonRes({ error: verifyErr.message }, 400);

      const note = body.note ? String(body.note).trim() : null;
      const { error: profErr } = await adminClient
        .from("profiles")
        .update({
          approval_status: "APPROVED",
          approved_by: actor.id,
          approved_at: new Date().toISOString(),
          status_note: note || null,
        })
        .eq("id", targetUserId);
      if (profErr) return jsonRes({ error: profErr.message }, 400);

      if (body.makeAdmin === true && targetProfile?.email && !targetSuper) {
        await adminClient
          .from("admins")
          .upsert({ id: targetUserId, email: targetProfile.email }, { onConflict: "id" });
      }

      await logAudit(
        "APPROVE_AND_VERIFY_USER",
        "profiles",
        { approval_status: targetProfile?.approval_status ?? null },
        {
          approval_status: "APPROVED",
          email_confirmed: true,
          make_admin: Boolean(body.makeAdmin),
        },
      );

      return jsonRes({ ok: true, status: "APPROVED" });
    }

    // --- ACTION 2: AUTO-VERIFY EMAIL ONLY ---
    if (action === "verify_email") {
      const { error: verifyErr } = await adminClient.auth.admin.updateUserById(
        targetUserId,
        { email_confirm: true },
      );
      if (verifyErr) return jsonRes({ error: verifyErr.message }, 400);

      await logAudit("VERIFY_USER_EMAIL", "auth.users", null, {
        email: targetProfile?.email ?? null,
        email_confirmed: true,
      });

      return jsonRes({ ok: true });
    }

    // --- ACTION 3: RESET USER PASSWORD ---
    if (action === "reset_password") {
      const newPassword = String(body.newPassword || "");
      if (newPassword.length < 6) {
        return jsonRes(
          { error: "Password must be at least 6 characters." },
          400,
        );
      }

      const { error: pwErr } = await adminClient.auth.admin.updateUserById(
        targetUserId,
        { password: newPassword },
      );
      if (pwErr) return jsonRes({ error: pwErr.message }, 400);

      await logAudit("RESET_USER_PASSWORD", "auth.users", null, {
        email: targetProfile?.email ?? null,
      });

      return jsonRes({ ok: true });
    }

    // --- ACTION 4: SAFE DELETE AUTH ACCOUNT (PRESERVES POSTAL RECORDS & HISTORY) ---
    if (action === "delete_user") {
      if (targetUserId === actor.id || targetSuper) {
        return jsonRes({ error: "Cannot delete a Superadmin account." }, 400);
      }

      // 1. Clean up Storage files uploaded by this user in feedback-attachments
      const { data: userFeedback } = await adminClient
        .from("feedback_items")
        .select("attachment_path")
        .eq("user_id", targetUserId)
        .not("attachment_path", "is", null);

      const paths = (userFeedback || [])
        .map((r: { attachment_path?: string }) => r.attachment_path)
        .filter(Boolean) as string[];
      if (paths.length > 0) {
        await adminClient.storage.from("feedback-attachments").remove(paths);
      }

      // 2. Detach from post_offices & history so NO postal records are ever cascade-deleted
      await adminClient
        .from("post_offices")
        .update({ user_id: null })
        .eq("user_id", targetUserId);
      await adminClient
        .from("post_offices")
        .update({ last_modified_by: null })
        .eq("last_modified_by", targetUserId);
      await adminClient
        .from("post_offices")
        .update({ last_approved_by: null })
        .eq("last_approved_by", targetUserId);

      await adminClient
        .from("post_offices_history")
        .update({ changed_by: null })
        .eq("changed_by", targetUserId);
      await adminClient
        .from("post_offices_history")
        .update({ approved_by: null })
        .eq("approved_by", targetUserId);

      // 1b. Clean up user's profile avatars in Storage (safe if bucket doesn't exist yet)
      try {
        const { data: avatarFiles } = await adminClient.storage
          .from("avatars")
          .list(targetUserId);
        if (Array.isArray(avatarFiles) && avatarFiles.length > 0) {
          const avatarPaths = avatarFiles.map(
            (f: { name: string }) => `${targetUserId}/${f.name}`,
          );
          await adminClient.storage.from("avatars").remove(avatarPaths);
        }
      } catch (_) {}

      // 3. Detach remaining admin/reviewer FKs & remove votes/requests created by the deleted user
      await adminClient
        .from("edit_requests")
        .update({ last_approved_by: null })
        .eq("last_approved_by", targetUserId);
      await adminClient
        .from("feedback_items")
        .update({ reviewed_by: null })
        .eq("reviewed_by", targetUserId);
      await adminClient
        .from("profiles")
        .update({ approved_by: null })
        .eq("approved_by", targetUserId);

      await adminClient
        .from("request_approvals")
        .delete()
        .eq("approved_by", targetUserId);
      await adminClient
        .from("edit_requests")
        .delete()
        .eq("requested_by", targetUserId);

      // 4. Delete from auth.users (cascades profiles, admins, feedback, learning progress)
      const { error: delErr } =
        await adminClient.auth.admin.deleteUser(targetUserId);
      if (delErr) return jsonRes({ error: delErr.message }, 400);

      await logAudit("DELETE_USER_ACCOUNT", "auth.users", targetProfile, null);

      return jsonRes({ ok: true });
    }

    return jsonRes({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return jsonRes(
      { error: err instanceof Error ? err.message : "Unknown server error" },
      500,
    );
  }
});
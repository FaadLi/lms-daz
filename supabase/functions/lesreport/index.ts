import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { hashToken, imageMime, randomToken } from "../_shared/security.ts";
import { requestLog, type RequestStage } from "../_shared/diagnostics.ts";
import {
  clearSignedMedia,
  signMedia,
  validRequests,
  type MediaRequest,
  type MediaRow,
} from "../_shared/media.ts";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const url = Deno.env.get("SUPABASE_URL")!;
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const origins = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const admin = createClient(url, secret, {
  db: { retry: false, timeout: 15000 },
  auth: { persistSession: false, autoRefreshToken: false },
});
type ObjectRow = Record<string, unknown>;
async function rpc<T>(name: `lms_${string}`, args: ObjectRow) {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw error;
  return data as T;
}
async function remove(owner: string, id: string, version?: number) {
  const path = await rpc<string | null>("lms_prepare_media_delete", {
    p_owner: owner,
    p_asset: id,
    p_version: version ?? null,
  });
  if (!path) return;
  const { error } = await admin.storage.from("lms_media").remove([path]);
  if (error) throw error;
  await rpc("lms_finish_media_delete", { p_owner: owner, p_asset: id });
  clearSignedMedia(id);
}
async function cleanup(owner: string) {
  const { data, error } = await admin
    .from("lms_media_assets")
    .select("id,state,created_at")
    .eq("owner_id", owner)
    .or(
      `state.eq.deleting,and(state.eq.pending,created_at.lt.${new Date(Date.now() - 86400000).toISOString()})`,
    )
    .order("created_at")
    .limit(50);
  if (error) throw error;
  for (const row of data || []) await remove(owner, row.id);
  return { processed: data?.length || 0 };
}

Deno.serve(async (request) => {
  let action: unknown = "unknown";
  let stage: RequestStage = "cors";
  const origin = request.headers.get("origin") || "";
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    ...(origins.includes(origin)
      ? { "Access-Control-Allow-Origin": origin }
      : {}),
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };
  const respond = (body: unknown, status = 200) => {
    console.info(requestLog(action, stage, status));
    return new Response(JSON.stringify(body), { status, headers });
  };
  if (origin && !origins.includes(origin))
    return respond({ error: "Origin tidak diizinkan." }, 403);
  if (request.method === "OPTIONS") {
    console.info(requestLog(action, stage, 204));
    return new Response(null, { status: 204, headers });
  }
  stage = "request";
  if (request.method !== "POST")
    return respond({ error: "Gunakan POST." }, 405);
  try {
    if (Number(request.headers.get("content-length") || 0) > 16384)
      return respond({ error: "Permintaan terlalu besar." }, 413);
    const raw = await request.text();
    if (raw.length > 16384)
      return respond({ error: "Permintaan terlalu besar." }, 413);
    const body = JSON.parse(raw) as ObjectRow;
    if (typeof body.action !== "string")
      return respond({ error: "Permintaan tidak valid." }, 400);
    action = body.action;
    if (body.action === "parent") {
      stage = "token";
      if (
        typeof body.token !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(body.token)
      )
        return respond({ error: "Tautan tidak valid atau kedaluwarsa." }, 403);
      const hash = await hashToken(body.token);
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown";
      stage = "rate-limit";
      const allowed = await rpc<boolean>("lms_consume_request_limit", {
        p_key: await hashToken(`ip:${ip}:${secret}`),
        p_limit: 120,
      });
      const tokenAllowed = await rpc<boolean>("lms_consume_request_limit", {
        p_key: `token:${hash}`,
        p_limit: 60,
      });
      if (!allowed || !tokenAllowed)
        return respond(
          { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
          429,
        );
      if (
        body.id != null &&
        (typeof body.id !== "string" || !uuid.test(body.id))
      )
        return respond({ error: "Permintaan tidak valid." }, 400);
      if (
        body.mediaOnly === true &&
        (body.operation !== "read" || !validRequests(body.requests))
      )
        return respond({ error: "Permintaan media tidak valid." }, 400);
      stage = "rpc";
      const result = await rpc<ObjectRow>("lms_parent_request", {
        p_hash: hash,
        p_action: body.operation || "read",
        p_section: body.section || "reports",
        p_page: body.page || 0,
        p_message: body.message || null,
        p_id: body.id || null,
        p_report: body.reportId || null,
      });
      const media = (result.media || []) as ObjectRow[];
      const items = (result.items || []) as ObjectRow[];
      const all = body.section === "photos" ? [...media, ...items] : media;
      if (body.mediaOnly === true) {
        stage = "signed-read";
        if (body.operation !== "read" || !validRequests(body.requests))
          return respond({ error: "Permintaan media tidak valid." }, 400);
        const signed = await signMedia(
          String((result.child as ObjectRow).id),
          body.requests,
          all as MediaRow[],
          async (path, transform) => {
            const { data, error } = await admin.storage
              .from("lms_media")
              .createSignedUrl(path, 60, transform ? { transform } : undefined);
            if (error || !data?.signedUrl) throw new Error("Photo unavailable");
            return data.signedUrl;
          },
        );
        return respond({ items: signed });
      }
      if (body.includeMediaUrls === false) {
        all.forEach((row) => {
          delete row.object_path;
          delete row.url;
        });
        return respond(result);
      }
      if (all.length) {
        stage = "signed-read";
        const { data, error } = await admin.storage
          .from("lms_media")
          .createSignedUrls(
            all.map((row) => String(row.object_path)),
            60,
          );
        if (error || data?.some((item) => !item.signedUrl))
          throw new Error("Photo unavailable");
        all.forEach((row, index) => {
          row.url = data![index].signedUrl;
          delete row.object_path;
        });
      }
      return respond(result);
    }
    // Every privileged action verifies the actual Auth user. Body owner/role is ignored.
    stage = "auth";
    const token = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    if (!token) return respond({ error: "Login diperlukan." }, 401);
    const {
      data: { user },
      error,
    } = await admin.auth.getUser(token);
    if (error || !user) return respond({ error: "Session tidak valid." }, 401);
    stage = "rate-limit";
    if (
      !(await rpc<boolean>("lms_consume_request_limit", {
        p_key: `user:${user.id}`,
        p_limit: 120,
      }))
    )
      return respond({ error: "Terlalu banyak permintaan." }, 429);
    if (body.action === "media-urls") {
      if (!validRequests(body.requests))
        return respond({ error: "Permintaan media tidak valid." }, 400);
      const ids = [...new Set(body.requests.map((item) => item.id))];
      stage = "metadata";
      const { data, error } = await admin
        .from("lms_media_assets")
        .select("id,object_path")
        .eq("owner_id", user.id)
        .eq("state", "ready")
        .in("id", ids);
      if (error) throw error;
      stage = "signed-read";
      const signed = await signMedia(
        user.id,
        body.requests as MediaRequest[],
        data || [],
        async (path, transform) => {
          const { data, error } = await admin.storage
            .from("lms_media")
            .createSignedUrl(path, 60, transform ? { transform } : undefined);
          if (error || !data?.signedUrl) throw new Error("Photo unavailable");
          return data.signedUrl;
        },
      );
      return respond({ items: signed });
    }
    if (body.action === "issue-link") {
      stage = "request";
      if (
        typeof body.childId !== "string" ||
        !uuid.test(body.childId) ||
        !Number.isInteger(body.days) ||
        Number(body.days) < 1 ||
        Number(body.days) > 90
      )
        return respond({ error: "Murid atau masa berlaku tidak valid." }, 400);
      const token = randomToken();
      stage = "rpc";
      const result = await rpc<ObjectRow>("lms_issue_report_link", {
        p_owner: user.id,
        p_child: body.childId,
        p_report: body.reportId || null,
        p_hash: await hashToken(token),
        p_expires: new Date(
          Date.now() + Number(body.days) * 86400000,
        ).toISOString(),
      });
      return respond({ ...result, token });
    }
    if (body.action === "finish-upload") {
      stage = "metadata";
      const { data: asset, error } = await admin
        .from("lms_media_assets")
        .select("*")
        .eq("id", body.assetId)
        .eq("owner_id", user.id)
        .single();
      if (error || !asset)
        return respond({ error: "Upload tidak ditemukan." }, 404);
      if (asset.state === "deleting")
        return respond({ error: "Upload sudah dihapus." }, 409);
      stage = "storage-read";
      const { data: file, error: downloadError } = await admin.storage
        .from("lms_media")
        .download(asset.object_path);
      if (downloadError || !file) throw new Error("File missing");
      const bytes = new Uint8Array(await file.arrayBuffer());
      stage = "image-validation";
      if (
        bytes.length !== asset.size_bytes ||
        bytes.length > 5242880 ||
        imageMime(bytes) !== asset.mime_type
      ) {
        await remove(user.id, asset.id);
        return respond(
          { error: "Isi file tidak cocok dengan format/ukuran gambar." },
          400,
        );
      }
      stage = "rpc";
      await rpc("lms_finish_upload", {
        p_owner: user.id,
        p_asset: asset.id,
        p_version: body.version ?? null,
      });
      let cleanupPending = false;
      stage = "cleanup";
      try {
        await cleanup(user.id);
      } catch {
        cleanupPending = true;
        stage = "cleanup-pending";
      }
      return respond({ ok: true, cleanupPending });
    }
    if (body.action === "delete-media") {
      stage = "delete-media";
      await remove(
        user.id,
        String(body.assetId),
        body.version as number | undefined,
      );
      return respond({ ok: true });
    }
    if (body.action === "cleanup-media") {
      stage = "cleanup";
      return respond(await cleanup(user.id));
    }
    stage = "request";
    return respond({ error: "Aksi tidak valid." }, 400);
  } catch (error) {
    const code = (error as { code?: string }).code;
    return respond(
      {
        error:
          code === "42501"
            ? "Akses ditolak atau tautan kedaluwarsa."
            : code === "40001" || code === "PT409"
              ? "Data sudah berubah. Muat ulang sebelum menyimpan."
              : "Permintaan gagal. Periksa data lalu coba lagi.",
      },
      code === "42501" ? 403 : code === "40001" || code === "PT409" ? 409 : 400,
    );
  }
});

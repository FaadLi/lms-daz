import { client } from "./supabase";
import type { Row, Page, Entity, Table } from "../types";
import { scheduleRow } from "../utils/schedules";
import { reportRow } from "../utils/reports";
import { requireOnline } from "./network";
import { invalidateData } from "./queryCache";
import {
  invalidateMedia,
  mediaUrls,
  type MediaVariant,
  type SignedAsset,
} from "./mediaCache";
import { optimizeUpload } from "./images";

export const PAGE_SIZE = 20;
export function tableName(entity: Entity): Table {
  return `lms_${entity}`;
}
const joins: Partial<Record<Entity, string>> = {
  children: "*,parent:lms_parents!lms_children_owner_id_parent_id_fkey(*)",
  schedules:
    "*,child:lms_children!lms_schedules_owner_id_child_id_fkey(full_name,nickname),schedule_subjects:lms_schedule_subjects!lms_schedule_subjects_owner_id_schedule_id_fkey(subject:lms_subjects!lms_schedule_subjects_owner_id_subject_id_fkey(id,name,is_active))",
  attendance:
    "*,child:lms_children!lms_attendance_owner_id_child_id_fkey(full_name,nickname)",
  lesson_reports:
    "*,report_subjects:lms_lesson_report_subjects!lms_report_subjects_report_fkey(subject_id,score,subject:lms_subjects!lms_report_subjects_subject_fkey(id,name,is_active))",
  report_templates:
    "*,subject:lms_subjects!lms_report_templates_owner_id_subject_id_fkey(name)",
  invoices:
    "*,child:lms_children!lms_invoices_owner_id_child_id_fkey(full_name,nickname),transactions:lms_payment_transactions(amount,date,method)",
};
const summaries: Partial<Record<Entity, string>> = {
  children: "id,version,full_name,nickname,grade_level,avatar_id,is_active",
  schedules:
    "id,version,day_of_week,start_time,end_time,child:lms_children!lms_schedules_owner_id_child_id_fkey(full_name),schedule_subjects:lms_schedule_subjects!lms_schedule_subjects_owner_id_schedule_id_fkey(subject:lms_subjects!lms_schedule_subjects_owner_id_subject_id_fkey(id,name,is_active))",
};
export function errorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e.code === "40001" || e.code === "PT409")
    return "Data sudah berubah. Muat ulang sebelum menyimpan.";
  if (e.code === "23505")
    return "Data duplikat. Periksa nomor, jadwal, atau sesi yang sudah tercatat.";
  if (e.code === "23503")
    return "Relasi data tidak valid atau masih dipakai oleh catatan lain.";
  return e.message || "Permintaan gagal. Coba lagi.";
}
export async function call<T>(
  name: `lms_${string}`,
  args: Record<string, unknown> = {},
): Promise<T> {
  requireOnline();
  const { data, error } = await client().rpc(name, args);
  if (error) throw error;
  const changed =
    name === "lms_save_record" || name === "lms_delete_record"
      ? String(args.p_table).replace(/^lms_/, "")
      : (
          {
            lms_save_schedule: "schedules",
            lms_save_lesson_report: "lesson_reports",
            lms_create_child: "children",
            lms_comment_teacher: "comments",
            lms_read_comments: "comments",
            lms_mark_notification_read: "notifications",
            lms_mark_report_shared: "lesson_reports",
            lms_revoke_report_link: "report_links",
            lms_record_payment: "invoices",
          } as Record<string, string>
        )[name];
  if (changed)
    await invalidateData([
      changed,
      "dashboard",
      ...(changed === "comments" ? ["notifications"] : []),
      ...(changed === "notifications" ? ["comments"] : []),
      ...(changed === "children"
        ? ["parents", "schedules", "attendance", "invoices"]
        : []),
      ...(changed === "parents" ? ["children"] : []),
      ...(changed === "subjects"
        ? ["schedules", "lesson_reports", "report_templates"]
        : []),
      ...(changed === "lesson_reports" && name === "lms_delete_record"
        ? ["comments", "report_links", "media_assets"]
        : []),
      ...(changed === "invoices" ? ["payment_transactions"] : []),
    ]);
  return data as T;
}
export async function list(
  table: Entity,
  options: {
    page?: number;
    search?: string;
    searchColumn?: string;
    childId?: string;
    reportId?: string;
    activeOnly?: boolean;
    summary?: boolean;
    limit?: number;
  } = {},
): Promise<Page> {
  const page = options.page ?? 0;
  if (table === "invoices")
    return call<Page>("lms_invoice_page", {
      p_child: options.childId || null,
      p_page: page,
    });
  let query = client()
    .from(tableName(table))
    .select((options.summary && summaries[table]) || joins[table] || "*", {
      count: "exact",
    });
  if (options.childId) query = query.eq("child_id", options.childId);
  if (options.reportId) query = query.eq("report_id", options.reportId);
  if (options.activeOnly) query = query.eq("is_active", true);
  if (options.search)
    query = query.ilike(
      options.searchColumn || "full_name",
      `%${options.search.replace(/[%_\\]/g, "\\$&")}%`,
    );
  if (table === "media_assets") query = query.eq("state", "ready");
  const order =
    table === "schedules"
      ? "day_of_week"
      : ["attendance", "lesson_reports"].includes(table)
        ? "date"
        : "created_at";
  const { data, error, count } = await query
    .order(order, { ascending: table === "schedules" })
    .order("id")
    .range(
      page * Math.min(PAGE_SIZE, options.limit || PAGE_SIZE),
      (page + 1) * Math.min(PAGE_SIZE, options.limit || PAGE_SIZE) - 1,
    );
  if (error) throw error;
  const items = (data || []) as unknown as Row[];
  return {
    items:
      table === "schedules"
        ? items.map(scheduleRow)
        : table === "lesson_reports"
          ? items.map(reportRow)
          : items,
    total: count || 0,
  };
}
export async function get(table: Entity, id: string): Promise<Row> {
  const { data, error } = await client()
    .from(tableName(table))
    .select(joins[table] || "*")
    .eq("id", id)
    .single();
  if (error) throw error;
  const row = data as unknown as Row;
  return table === "schedules"
    ? scheduleRow(row)
    : table === "lesson_reports"
      ? reportRow(row)
      : row;
}
export const db = {
  list,
  get,
  subjectsByIds: async (ids: string[]) => {
    const { data, error } = await client()
      .from("lms_subjects")
      .select("id,name,is_active")
      .in("id", ids);
    if (error) throw error;
    return (data || []) as { id: string; name: string; is_active: boolean }[];
  },
  save: (
    table: Entity,
    data: Record<string, unknown>,
    version: number | null = null,
  ) =>
    table === "schedules"
      ? call<Row>("lms_save_schedule", {
          p_data: data,
          p_version: version,
        })
      : table === "lesson_reports"
        ? call<Row>("lms_save_lesson_report", {
            p_data: data,
            p_version: version,
          })
        : call<Row>("lms_save_record", {
            p_table: tableName(table),
            p_data: data,
            p_version: version,
          }),
  createChild: (
    child: Record<string, unknown>,
    parent: Record<string, unknown> | null,
  ) => call<Row>("lms_create_child", { p_child: child, p_parent: parent }),
  dashboard: () => call<Record<string, number>>("lms_dashboard_stats"),
  comment: (
    childId: string,
    message: string,
    id: string,
    reportId: string | null = null,
  ) =>
    call("lms_comment_teacher", {
      p_child: childId,
      p_report: reportId,
      p_message: message,
      p_id: id,
    }),
  readComments: (childId: string) =>
    call("lms_read_comments", { p_child: childId }),
  share: (row: Row) =>
    call("lms_mark_report_shared", { p_id: row.id, p_version: row.version }),
  linkInfo: (childId: string) =>
    call<Row | null>("lms_report_link_info", { p_child: childId }),
  revokeLink: (childId: string) =>
    call("lms_revoke_report_link", { p_child: childId }),
  remove: (table: Entity, row: Row) =>
    call("lms_delete_record", {
      p_table: tableName(table),
      p_id: row.id,
      p_version: row.version,
    }),
  transactions: (invoiceId: string, page: number) =>
    call<Page>("lms_transaction_page", { p_invoice: invoiceId, p_page: page }),
  payment: (row: Row, values: Record<string, unknown>, key: string) =>
    call("lms_record_payment", {
      p_invoice: row.id,
      p_amount: values.amount,
      p_date: values.date,
      p_method: values.method,
      p_notes: values.notes || "",
      p_key: key,
    }),
};
class RequestStageError extends Error {
  readonly status?: number;
  readonly detail: string;
  constructor(stage: string, cause: unknown, status?: number, detail?: string) {
    const previous = cause instanceof RequestStageError ? cause : null;
    const httpStatus = status ?? (cause as { status?: number } | null)?.status;
    const message = previous?.detail ?? detail ?? errorMessage(cause);
    super(`${stage}${httpStatus ? ` (HTTP ${httpStatus})` : ""}: ${message}`, {
      cause,
    });
    this.status = httpStatus;
    this.detail = message;
  }
}

// Parent requests carry no teacher session; the server scopes access using the token.
export async function edge<T>(
  body: Record<string, unknown>,
  authenticated = false,
): Promise<T> {
  requireOnline();
  let authorization: string | undefined;
  if (authenticated) {
    const { data } = await client().auth.getSession();
    if (!data.session)
      throw new RequestStageError(
        "Edge Function",
        new Error("Session berakhir. Masuk kembali."),
      );
    authorization = `Bearer ${data.session.access_token}`;
  }
  let response: Response;
  try {
    response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lesreport`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      },
    );
  } catch (error) {
    throw new RequestStageError(
      "Edge Function",
      error,
      undefined,
      "Tidak dapat terhubung ke server. Periksa jaringan, CORS, atau batas waktu permintaan.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new RequestStageError(
      "Edge Function",
      error,
      response.status,
      "Respons server tidak valid.",
    );
  }
  if (!response.ok)
    throw new RequestStageError(
      "Edge Function",
      new Error(
        typeof data?.error === "string" ? data.error : "Permintaan gagal.",
      ),
      response.status,
    );
  if (
    authenticated &&
    ["finish-upload", "delete-media", "issue-link", "cleanup-media"].includes(
      String(body.action),
    )
  ) {
    if (body.action !== "issue-link") invalidateMedia();
    await invalidateData(
      body.action === "issue-link"
        ? ["report_links"]
        : ["media_assets", "media_urls", "children", "profiles"],
    );
  }
  return data as T;
}
export async function signedMedia(
  rows: Row[],
  variant: MediaVariant = "thumbnail",
): Promise<Row[]> {
  if (!rows.length) return [];
  const { data } = await client().auth.getSession();
  if (!data.session?.user.id)
    throw new Error("Session berakhir. Masuk kembali.");
  const urls = await mediaUrls(
    data.session.user.id,
    rows.map(({ id }) => ({ id, variant })),
    async (requests) =>
      (
        await edge<{ items: SignedAsset[] }>(
          { action: "media-urls", requests },
          true,
        )
      ).items,
  );
  return rows.map((row, index) => ({ ...row, ...urls[index] }));
}
export async function upload(
  file: File,
  kind: "profile" | "avatar" | "photo",
  target: Row,
  caption = "",
) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024 ||
    file.size === 0
  )
    throw new Error("Gunakan JPG, PNG, atau WebP maksimal 5 MB.");
  let asset: Row | undefined;
  let stage = "RPC persiapan upload";
  try {
    stage = "Optimasi gambar";
    file = await optimizeUpload(file, kind);
    stage = "RPC persiapan upload";
    asset = await call<Row>("lms_begin_upload", {
      p_kind: kind,
      p_child:
        kind === "profile"
          ? null
          : kind === "avatar"
            ? target.id
            : target.child_id,
      p_report: kind === "photo" ? target.id : null,
      p_mime: file.type,
      p_size: file.size,
      p_caption: caption,
    });
    stage = "Storage upload";
    const { error } = await client()
      .storage.from("lms_media")
      .upload(String(asset.object_path), file, {
        upsert: false,
        contentType: file.type,
        cacheControl: "60",
      });
    if (error) throw error;
    stage = "Finalisasi upload";
    return await edge<{ ok: boolean; cleanupPending?: boolean }>(
      { action: "finish-upload", assetId: asset.id, version: target.version },
      true,
    );
  } catch (error) {
    // A lost response can follow a successful finalize. Reconcile before retrying.
    if (asset) {
      try {
        const current = await get("media_assets", asset.id);
        if (current.state === "ready") {
          invalidateMedia();
          await invalidateData([
            "media_assets",
            "media_urls",
            "children",
            "profiles",
          ]);
          return { ok: true, cleanupPending: true };
        }
      } catch {
        /* Keep the original error when the status cannot be verified. */
      }
    }
    const failure = new RequestStageError(stage, error);
    if (asset)
      failure.message +=
        " Muat ulang untuk memeriksa status upload sebelum mencoba lagi.";
    throw failure;
  }
}

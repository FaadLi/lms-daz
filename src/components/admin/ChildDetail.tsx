import { useState } from "react";
import type { Row, Entity } from "../../types";
import { db, edge } from "../../services/db";
import { useMutation, useQuery } from "../../services/hooks";
import { CrudPanel, RowDetails } from "./CrudPanel";
import { MediaManager } from "./MediaManager";
import {
  ErrorNotice,
  Pager,
  QueryState,
  RecordForm,
  text,
} from "../common/DataUI";
import { fields } from "../../data/forms";
import { formatDateIndo } from "../../data/presets";
import { ProgressChart } from "../common/ProgressChart";
import { createWhatsappUrl } from "../../utils/whatsapp";

function Comments({ childId }: { childId: string }) {
  const [page, setPage] = useState(0),
    [message, setMessage] = useState(""),
    [id, setId] = useState(() => crypto.randomUUID());
  const mutation = useMutation();
  const query = useQuery(`comments:${childId}:${page}`, () =>
    db.list("comments", { childId, page }),
  );
  return (
    <section className="space-y-3">
      <h2>Komentar</h2>
      <button
        disabled={mutation.pending}
        onClick={() =>
          void mutation.run(async () => {
            await db.readComments(childId);
            query.refresh();
          })
        }
      >
        Tandai sudah dibaca
      </button>
      <QueryState query={query}>
        {query.data?.items.map((row) => (
          <article className="border bg-white rounded-xl p-3" key={row.id}>
            <strong>{row.sender_user_id ? "Guru" : "Orang tua"}</strong>
            <p className="whitespace-pre-wrap">{text(row, "message")}</p>
            <small>{formatDateIndo(text(row, "created_at"))}</small>
          </article>
        ))}
      </QueryState>
      <Pager page={page} total={query.data?.total || 0} onPage={setPage} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void mutation.run(async () => {
            await db.comment(childId, message, id);
            setMessage("");
            setId(crypto.randomUUID());
            query.refresh();
          });
        }}
      >
        <textarea
          required
          value={message}
          maxLength={2000}
          onChange={(e) => setMessage(e.target.value)}
          disabled={mutation.pending}
        />
        <button disabled={mutation.pending}>Kirim komentar</button>
      </form>
      <ErrorNotice message={mutation.error} />
    </section>
  );
}
function Links({ child }: { child: Row }) {
  const [creating, setCreating] = useState(false),
    [issued, setIssued] = useState<{
      token: string;
      expires_at: string;
    } | null>(null);
  const mutation = useMutation();
  const query = useQuery(`link:${child.id}`, () => db.linkInfo(child.id));
  const link = issued
    ? `${window.location.origin}/#/report/${issued.token}`
    : "";
  return (
    <section className="bg-white border rounded-xl p-4 space-y-3">
      <h3 className="font-bold">Akses orang tua</h3>
      <QueryState query={query}>
        {query.data && (
          <p>
            Berlaku sampai {formatDateIndo(text(query.data, "expires_at"))} ·{" "}
            {Number(query.data.access_count)} akses{" "}
            {query.data.revoked_at ? "· Dicabut" : ""}
          </p>
        )}
      </QueryState>
      <p>
        Tautan hanya ditampilkan saat diterbitkan. Membuat tautan baru mencabut
        tautan sebelumnya.
      </p>
      <div className="flex gap-2">
        <button onClick={() => setCreating(true)}>Buat / ganti tautan</button>
        <button
          disabled={mutation.pending}
          onClick={() =>
            void mutation.run(async () => {
              await db.revokeLink(child.id);
              setIssued(null);
              query.refresh();
            })
          }
        >
          Cabut akses
        </button>
      </div>
      {issued && (
        <>
          <input readOnly value={link} aria-label="Tautan privat" />
          <button
            onClick={() =>
              void mutation.run(() => navigator.clipboard.writeText(link))
            }
          >
            Salin tautan
          </button>
          <a target="_blank" rel="noreferrer" href={link}>
            Preview orang tua
          </a>
          <a
            target="_blank"
            rel="noreferrer"
            href={createWhatsappUrl(
              text(child, "parent.whatsapp_number"),
              `Laporan perkembangan belajar ${text(child, "nickname")}: ${link}`,
            )}
          >
            Buka WhatsApp
          </a>
        </>
      )}
      <ErrorNotice message={mutation.error} />
      {creating && (
        <RecordForm
          title="Buat tautan privat"
          fields={[
            {
              name: "days",
              label: "Masa berlaku (hari)",
              type: "number",
              min: 1,
              max: 90,
              required: true,
            },
            {
              name: "report_id",
              label: "Batasi ke satu laporan (opsional)",
              type: "reference",
              reference: "lesson_reports",
              childId: child.id,
            },
          ]}
          onClose={() => setCreating(false)}
          onSave={async (values) => {
            const result = await edge<{ token: string; expires_at: string }>(
              {
                action: "issue-link",
                childId: child.id,
                reportId: values.report_id || null,
                days: values.days,
              },
              true,
            );
            setIssued(result);
            query.refresh();
          }}
        />
      )}
    </section>
  );
}
function ReportMedia({ childId }: { childId: string }) {
  const [selecting, setSelecting] = useState(true),
    [reportId, setReportId] = useState("");
  const query = useQuery(`report-media:${reportId}`, () =>
    reportId ? db.get("lesson_reports", reportId) : Promise.resolve(null),
  );
  const report = query.data;
  return (
    <section className="space-y-3">
      <button onClick={() => setSelecting(true)}>
        Pilih laporan untuk foto
      </button>
      <ErrorNotice message={query.error} />
      {report && (
        <>
          <RowDetails row={report} table="lesson_reports" />
          <MediaManager
            target={report}
            kind="photo"
            onChanged={query.refresh}
          />
        </>
      )}
      {selecting && (
        <RecordForm
          title="Pilih laporan"
          fields={[
            {
              name: "report_id",
              label: "Laporan",
              type: "reference",
              reference: "lesson_reports",
              childId,
              required: true,
            },
          ]}
          onClose={() => setSelecting(false)}
          onSave={async (values) => {
            const selected = await db.get(
              "lesson_reports",
              String(values.report_id),
            );
            setReportId(selected.id);
          }}
        />
      )}
    </section>
  );
}
function Progress({ childId, name }: { childId: string; name: string }) {
  const query = useQuery(`progress:${childId}`, () =>
    db.list("lesson_reports", { childId }),
  );
  return (
    <QueryState query={query}>
      <ProgressChart
        childName={name}
        reports={(query.data?.items || []).slice(0, 6).map((row) => ({
          id: row.id,
          date: text(row, "date"),
          score: Number(row.score),
          topic: text(row, "topic"),
        }))}
      />
    </QueryState>
  );
}
export function ChildDetail({ id }: { id: string }) {
  const [tab, setTab] = useState("lesson_reports"),
    [editing, setEditing] = useState(false);
  const query = useQuery(`child:${id}`, () => db.get("children", id));
  const child = query.data;
  const tabs: Record<string, string> = {
    lesson_reports: "Laporan",
    progress: "Progress",
    schedules: "Jadwal",
    attendance: "Absensi",
    invoices: "Pembayaran",
    photos: "Foto",
    comments: "Komentar",
  };
  return (
    <QueryState query={query}>
      {child && (
        <div className="space-y-5">
          <a href="#/children">← Daftar murid</a>
          <h1 className="text-2xl font-bold">{text(child, "full_name")}</h1>
          <RowDetails row={child} table="children" />
          <button onClick={() => setEditing(true)}>Edit murid</button>
          <MediaManager
            target={child}
            kind="avatar"
            onChanged={query.refresh}
          />
          <Links child={child} />
          <nav className="flex flex-wrap gap-2">
            {Object.entries(tabs).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          {["lesson_reports", "schedules", "attendance", "invoices"].includes(
            tab,
          ) && (
            <CrudPanel
              key={tab}
              table={tab as Entity}
              title={tabs[tab]}
              childId={id}
            />
          )}
          {tab === "progress" && (
            <Progress childId={id} name={text(child, "nickname")} />
          )}{" "}
          {tab === "comments" && <Comments childId={id} />}{" "}
          {tab === "photos" && <ReportMedia childId={id} />}
          {editing && (
            <RecordForm
              title="Edit murid"
              fields={fields.children!}
              initial={child}
              onClose={() => setEditing(false)}
              onSave={async (values) => {
                await db.save(
                  "children",
                  { ...values, id: child.id },
                  child.version,
                );
                query.refresh();
              }}
            />
          )}
        </div>
      )}
    </QueryState>
  );
}

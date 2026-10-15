import { useState } from "react";
import type { Row } from "../../types";
import { edge } from "../../services/db";
import { useMutation, useQuery } from "../../services/hooks";
import { ErrorNotice, Pager, QueryState, text } from "../common/DataUI";
import { formatDateIndo, formatRupiah, DAY_NAMES } from "../../data/presets";
import { ScoreBadge } from "../common/ScoreBadge";
import { ProgressChart } from "../common/ProgressChart";

interface PortalData {
  child: Row;
  teacher: Row;
  items: Row[];
  media: Row[];
  total: number;
  report_id: string | null;
}
export function ParentPortal({ token }: { token: string }) {
  const [section, setSection] = useState("reports"),
    [page, setPage] = useState(0),
    [opened, setOpened] = useState(false),
    [message, setMessage] = useState(""),
    [commentId, setCommentId] = useState(() => crypto.randomUUID());
  const mutation = useMutation();
  const query = useQuery(`parent:${token}:${section}:${page}`, async () => {
    const result = await edge<PortalData>({
      action: "parent",
      token,
      operation: opened ? "read" : "open",
      section,
      page,
    });
    setOpened(true);
    return result;
  });
  const data = query.data;
  const tabs = data?.report_id
    ? { reports: "Laporan", comments: "Komentar" }
    : {
        reports: "Laporan",
        schedules: "Jadwal",
        attendance: "Absensi",
        invoices: "Pembayaran",
        photos: "Foto",
        comments: "Komentar",
      };
  return (
    <main className="max-w-xl mx-auto min-h-screen bg-white p-4 space-y-4">
      <h1 className="text-xl font-bold">Raport Digital</h1>
      <QueryState query={query}>
        {data && (
          <>
            <p>
              {text(data.teacher, "institution_name")} ·{" "}
              {text(data.teacher, "name")}
            </p>
            <h2 className="font-bold">{text(data.child, "full_name")}</h2>
            {data.media
              .filter((row) => row.id === data.child.avatar_id)
              .map((row) => (
                <img
                  key={row.id}
                  src={text(row, "url")}
                  alt="Avatar murid"
                  className="w-20 h-20 rounded-xl"
                />
              ))}
            <nav className="flex flex-wrap gap-2">
              {Object.entries(tabs).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => {
                    setSection(key);
                    setPage(0);
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
            {section === "reports" && (
              <ProgressChart
                childName={text(data.child, "nickname")}
                reports={data.items
                  .slice(0, 6)
                  .map((row) => ({
                    id: row.id,
                    date: text(row, "date"),
                    score: Number(row.score),
                    topic: text(row, "topic"),
                  }))}
              />
            )}
            {data.items.length === 0 && <p>Belum ada data.</p>}
            {data.items.map((row) => (
              <article
                className="border rounded-2xl p-4 space-y-2"
                key={row.id}
              >
                {section === "reports" ? (
                  <>
                    <strong>{text(row, "topic")}</strong>
                    <p>
                      {formatDateIndo(text(row, "date"))} ·{" "}
                      {text(row, "subject.name")}
                    </p>
                    <ScoreBadge score={Number(row.score)} />
                    {[
                      "what_learned",
                      "learning_outcome",
                      "teacher_notes",
                      "next_step",
                      "home_practice",
                    ].map((key) => (
                      <p key={key} className="whitespace-pre-wrap">
                        {text(row, key)}
                      </p>
                    ))}
                    {data.media
                      .filter((photo) => photo.report_id === row.id)
                      .map((photo) => (
                        <figure key={photo.id}>
                          <img
                            src={text(photo, "url")}
                            alt={
                              text(photo, "caption") || "Dokumentasi belajar"
                            }
                            className="max-h-72 rounded-xl"
                          />
                          <figcaption>{text(photo, "caption")}</figcaption>
                        </figure>
                      ))}
                  </>
                ) : section === "comments" ? (
                  <>
                    <strong>{row.from_teacher ? "Guru" : "Orang tua"}</strong>
                    <p className="whitespace-pre-wrap">
                      {text(row, "message")}
                    </p>
                    <small>{formatDateIndo(text(row, "created_at"))}</small>
                  </>
                ) : section === "photos" ? (
                  <>
                    <img
                      src={text(row, "url")}
                      alt={text(row, "caption") || "Dokumentasi belajar"}
                      className="max-h-72 rounded-xl"
                    />
                    <p>{text(row, "caption")}</p>
                  </>
                ) : section === "invoices" ? (
                  <>
                    <strong>{text(row, "invoice_number")}</strong>
                    <p>
                      {formatRupiah(Number(row.amount))} · Sisa{" "}
                      {formatRupiah(
                        Number(row.amount) - Number(row.paid_amount),
                      )}
                    </p>
                    <p>Jatuh tempo {formatDateIndo(text(row, "due_date"))}</p>
                  </>
                ) : section === "schedules" ? (
                  <>
                    <p>
                      {DAY_NAMES[Number(row.day_of_week)]} ·{" "}
                      {text(row, "start_time")}–{text(row, "end_time")}
                    </p>
                    <p>
                      {text(row, "subject.name")} · {text(row, "location")}
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      {formatDateIndo(text(row, "date"))} ·{" "}
                      {text(row, "status")}
                    </p>
                    <p>
                      {text(row, "start_time")}–{text(row, "end_time")}
                    </p>
                    <p>{text(row, "notes")}</p>
                  </>
                )}
              </article>
            ))}
            <Pager page={page} total={data.total} onPage={setPage} />
            <button onClick={query.refresh}>Perbarui data / akses foto</button>
            {section === "comments" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutation.run(async () => {
                    await edge({
                      action: "parent",
                      token,
                      operation: "comment",
                      section: "comments",
                      id: commentId,
                      message,
                      reportId: data.report_id,
                    });
                    setMessage("");
                    setCommentId(crypto.randomUUID());
                    query.refresh();
                  });
                }}
              >
                <textarea
                  required
                  maxLength={2000}
                  value={message}
                  disabled={mutation.pending}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button disabled={mutation.pending}>Kirim komentar</button>
                <ErrorNotice message={mutation.error} />
              </form>
            )}
          </>
        )}
      </QueryState>
    </main>
  );
}

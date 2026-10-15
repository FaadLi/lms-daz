import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Row, Entity } from "../../types";
import { client } from "../../services/supabase";
import { db, edge } from "../../services/db";
import { useMutation, useQuery } from "../../services/hooks";
import { CrudPanel } from "./CrudPanel";
import { ChildDetail } from "./ChildDetail";
import { MediaManager } from "./MediaManager";
import { ErrorNotice, QueryState, RecordForm, text } from "../common/DataUI";
import { profileFields } from "../../data/forms";
import { formatRupiah } from "../../data/presets";

const navigation: Record<string, string> = {
  dashboard: "Dashboard",
  children: "Murid",
  parents: "Orang tua",
  schedules: "Jadwal",
  attendance: "Absensi",
  invoices: "Pembayaran",
  subjects: "Mata pelajaran",
  report_templates: "Template",
  settings: "Pengaturan",
};
function Dashboard() {
  const query = useQuery("dashboard", db.dashboard);
  const labels: Record<string, string> = {
    children: "Murid aktif",
    sessions: "Sesi hari ini",
    present: "Hadir hari ini",
    reports: "Laporan",
    unread: "Komentar belum dibaca",
    outstanding: "Saldo tagihan",
  };
  return (
    <QueryState query={query}>
      <div className="grid grid-cols-2 gap-4">
        {Object.entries(labels).map(([key, label]) => (
          <article key={key} className="bg-white rounded-xl border p-4">
            <p>{label}</p>
            <strong className="text-xl">
              {key === "outstanding"
                ? formatRupiah(query.data?.[key] || 0)
                : query.data?.[key]}
            </strong>
          </article>
        ))}
      </div>
      <button onClick={query.refresh}>Muat ulang</button>
    </QueryState>
  );
}
export function AdminWorkspace({ user, path }: { user: User; path: string }) {
  const profile = useQuery(
    `profile:${user.id}`,
    async () => (await db.list("profiles")).items[0] || null,
  );
  const [editing, setEditing] = useState(false);
  const mutation = useMutation();
  const page = path.split("/")[1] || "dashboard";
  const childId = path.match(/^\/children\/([a-f0-9-]+)$/i)?.[1];
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b p-4">
        <div className="max-w-5xl mx-auto flex justify-between gap-3">
          <a href="#/dashboard" className="font-bold">
            Les Report
          </a>
          <span>{text(profile.data || undefined, "name") || user.email}</span>
          <button
            disabled={mutation.pending}
            onClick={() =>
              void mutation.run(async () => {
                const { error } = await client().auth.signOut();
                if (error) throw error;
              })
            }
          >
            Keluar
          </button>
        </div>
        <nav className="max-w-5xl mx-auto flex flex-wrap gap-2 mt-3">
          {Object.entries(navigation).map(([key, label]) => (
            <a
              key={key}
              href={`#/${key}`}
              aria-current={page === key ? "page" : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
      </header>
      <main className="max-w-5xl mx-auto p-4 space-y-4">
        <ErrorNotice message={mutation.error} />
        <QueryState query={profile}>
          {profile.data === null ? (
            <RecordForm
              title="Lengkapi profil guru"
              fields={profileFields}
              initial={{ id: user.id, version: 0 } as Row}
              onClose={() => void client().auth.signOut()}
              onSave={async (values) => {
                await db.save("profiles", { ...values, id: user.id });
                profile.refresh();
              }}
            />
          ) : childId ? (
            <ChildDetail key={childId} id={childId} />
          ) : page === "dashboard" ? (
            <Dashboard />
          ) : page === "settings" ? (
            <section className="space-y-4">
              <h1 className="text-xl font-bold">Profil guru</h1>
              <p>
                {text(profile.data || undefined, "name")} · {user.email}
              </p>
              <p>{text(profile.data || undefined, "institution_name")}</p>
              <button onClick={() => setEditing(true)}>Edit profil</button>
              {profile.data && (
                <MediaManager
                  target={profile.data}
                  kind="profile"
                  onChanged={profile.refresh}
                />
              )}
              <button
                disabled={mutation.pending}
                onClick={() =>
                  void mutation.run(() =>
                    edge({ action: "cleanup-media" }, true),
                  )
                }
              >
                Bersihkan Upload
              </button>
            </section>
          ) : navigation[page] ? (
            <CrudPanel
              key={page}
              table={page as Entity}
              title={navigation[page]}
              onChild={
                page === "children"
                  ? (row) => {
                      window.location.hash = `/children/${row.id}`;
                    }
                  : undefined
              }
            />
          ) : (
            <p>Halaman tidak ditemukan.</p>
          )}
        </QueryState>
        {editing && profile.data && (
          <RecordForm
            title="Edit profil"
            fields={profileFields}
            initial={profile.data}
            onClose={() => setEditing(false)}
            onSave={async (values) => {
              await db.save(
                "profiles",
                { ...values, id: user.id },
                profile.data!.version,
              );
              profile.refresh();
            }}
          />
        )}
      </main>
    </div>
  );
}

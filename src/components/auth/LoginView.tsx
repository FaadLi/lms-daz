import { useState } from "react";
import { client } from "../../services/supabase";
import { useMutation } from "../../services/hooks";
import { ErrorNotice } from "../common/DataUI";

export function LoginView() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const mutation = useMutation();
  return (
    <main className="min-h-screen flex justify-center items-center p-4 bg-slate-100">
      <form
        className="bg-white border rounded-3xl p-7 max-w-sm w-full space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void mutation.run(async () => {
            const { error } = await client().auth.signInWithPassword({
              email: email.trim(),
              password,
            });
            if (error) throw error;
          });
        }}
      >
        <h1 className="text-2xl font-bold">Les Report</h1>
        <p>Masuk sebagai guru</p>
        <fieldset disabled={mutation.pending} className="space-y-4">
          <label className="block">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <ErrorNotice message={mutation.error} />
          <button type="submit">
            {mutation.pending ? "Memproses…" : "Masuk"}
          </button>
        </fieldset>
      </form>
    </main>
  );
}

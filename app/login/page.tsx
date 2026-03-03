"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setError(error.message);
      else router.replace("/");
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMessage("Check your email to confirm your account.");
    }

    setLoading(false);
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--sidebar-bg)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "10px 14px",
    color: "var(--text)",
    fontSize: 14,
    outline: "none",
    width: "100%",
  };

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <div style={{ width: 340 }}>
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "2em",
            fontWeight: 700,
            marginBottom: "0.2em",
            letterSpacing: "-0.02em",
          }}
        >
          Ghost
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: "2.5em" }}>
          The writing IDE
        </p>

        {/* Mode tabs */}
        <div className="flex gap-5 mb-6">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); setMessage(null); }}
              style={{
                fontSize: 14,
                color: mode === m ? "var(--text)" : "var(--text-muted)",
                borderBottom: mode === m ? "1px solid var(--accent)" : "1px solid transparent",
                paddingBottom: 4,
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            style={inputStyle}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            style={inputStyle}
          />

          {error && (
            <p style={{ color: "#e05555", fontSize: 13, margin: 0 }}>{error}</p>
          )}
          {message && (
            <p style={{ color: "var(--accent)", fontSize: 13, margin: 0 }}>{message}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "10px 14px",
              fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              marginTop: 4,
            }}
          >
            {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

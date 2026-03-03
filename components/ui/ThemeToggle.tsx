"use client";

import { useState, useEffect } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("ghost-theme") as "dark" | "light" | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("ghost-theme", next);
  }

  return (
    <button
      onClick={toggle}
      className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm"
      title="Toggle theme (Cmd+D)"
    >
      {theme === "dark" ? "☾" : "☀"}
    </button>
  );
}

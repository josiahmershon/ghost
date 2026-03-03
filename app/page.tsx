"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Home() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function redirectToEditor() {
      // Find most recently updated doc, or create one
      const { data } = await supabase
        .from("documents")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (data) {
        router.replace(`/editor/${data.id}`);
      } else {
        const { data: newDoc, error } = await supabase
          .from("documents")
          .insert({ title: "Untitled", content: {} })
          .select("id")
          .single();
        if (!error && newDoc) {
          router.replace(`/editor/${newDoc.id}`);
        }
      }
    }
    redirectToEditor();
  }, []);

  return (
    <div
      className="flex items-center justify-center h-screen"
      style={{ background: "var(--bg)", color: "var(--text-muted)" }}
    >
      <span className="text-sm">Loading…</span>
    </div>
  );
}

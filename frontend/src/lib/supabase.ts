import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { apiPath } from "./api";

// Try build-time env vars first, then fetch from backend
const buildUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const buildAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export let supabase: SupabaseClient | null =
  buildUrl && buildAnon ? createClient(buildUrl, buildAnon) : null;

/** Fetch Supabase config from backend and initialize client if needed. */
export async function initSupabase(): Promise<void> {
  if (supabase) return; // already configured from build-time env

  try {
    const r = await fetch(apiPath("/api/config"));
    if (!r.ok) return;
    const { supabase_url, supabase_anon_key } = await r.json();
    if (supabase_url && supabase_anon_key) {
      supabase = createClient(supabase_url, supabase_anon_key);
    }
  } catch {
    // Backend not reachable — continue without Supabase
  }
}

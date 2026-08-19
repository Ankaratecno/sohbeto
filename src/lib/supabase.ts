import { createClient } from "@supabase/supabase-js";

/** Kullanıcının kendi Supabase projesi (public/publishable değerler). */
export const SUPABASE_URL = "https://vtqfkrxakvltyurjcwqe.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_0An0LLkoNGIJWyxnGoJX6w_KWAozncH";

/** Web Push VAPID public key (public değer). Private key Supabase Secrets'ta. */
export const VAPID_PUBLIC_KEY =
  "BPaXczn1pM216lfDoETu-WGZe_9jUykqS_xGFDlf8qdN71XIlZypsNoSKJOwKov94DpX4fVvYPwKRhogw6LxDO4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: "sohbeto_supabase_auth",
    persistSession: true,
    autoRefreshToken: true,
  },
});

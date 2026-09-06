/**
 * Sohbeto Relay (posta kutusu köprüsü).
 *
 * Karşı taraf çevrimdışıyken paketler Supabase'e bırakılır (relay_send),
 * alıcı uygulamayı açtığında kutusunu çeker (relay_fetch). Böylece gönderen
 * de uygulamayı kapatsa mesaj/medya kaybolmaz.
 *
 * Şema: supabase/relay.sql
 */
import { supabase } from "@/lib/supabase";
import { ensureSupabaseUser } from "@/pwa/push";

type RelayRow = { id: number; from_phone: string | null; payload: string; created_at: string };

function normalizePhone(v: unknown): string {
  const d = String(v ?? "").replace(/[^0-9]/g, "");
  return d ? `+${d}` : "";
}

/** Paketi alıcının kutusuna bırakır. */
export async function relaySend(toPhone: string, payload: string): Promise<boolean> {
  const to = normalizePhone(toPhone);
  if (!to || !payload) return false;
  try {
    await ensureSupabaseUser();
    const { error } = await supabase.rpc("relay_send", { p_to: to, p_payload: payload });
    if (error) {
      console.warn("[Sohbeto] Posta kutusuna bırakılamadı:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[Sohbeto] relay_send hatası:", (e as Error).message);
    return false;
  }
}

/** Kendi kutusundaki paketleri çeker (çekilenler sunucudan silinir). */
export async function relayFetch(limit = 300): Promise<Array<{ from: string; payload: string }>> {
  try {
    await ensureSupabaseUser();
    const { data, error } = await supabase.rpc("relay_fetch", { p_limit: limit });
    if (error) {
      console.warn("[Sohbeto] Posta kutusu okunamadı:", error.message);
      return [];
    }
    const rows = (data ?? []) as RelayRow[];
    return rows
      .slice()
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((r) => ({ from: normalizePhone(r.from_phone), payload: r.payload }));
  } catch (e) {
    console.warn("[Sohbeto] relay_fetch hatası:", (e as Error).message);
    return [];
  }
}

/** Taşıma katmanı (iframe içindeki peer.js) bu global'leri kullanır. */
export function initRelay(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  w["sohbetoRelaySend"] = relaySend;
  w["sohbetoRelayFetch"] = relayFetch;
}

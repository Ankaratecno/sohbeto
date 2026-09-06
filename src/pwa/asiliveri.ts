/**
 * ASILI VERİ — ana pencere (Supabase) tarafı.
 *
 * iframe içindeki asiliveri.js şifreli paketleri buraya postMessage ile
 * gönderir; burada Supabase RPC'lerine yazılır/okunur. Metin hiçbir zaman
 * burada çözülmez — sadece okunamaz blob taşınır.
 */
import { supabase } from "@/lib/supabase";

export type AsiliRow = {
  code: string;
  from_phone: string;
  to_phone: string;
  kind: string;
  alg: string;
  iv: string | null;
  payload: string;
  msg_id: string | null;
  created_at: string;
};

/** Açık anahtarımı defterime yaz. */
export async function setMyKey(pubkey: string): Promise<boolean> {
  if (!pubkey) return false;
  const { data, error } = await supabase.rpc("verimetri_set_key", { p_pubkey: pubkey });
  if (error) return false;
  return data === true;
}

/** Bir numaranın açık anahtarını al (yoksa null). */
export async function getPeerKey(phone: string): Promise<string | null> {
  if (!phone) return null;
  const { data, error } = await supabase.rpc("verimetri_get_key", { p_phone: phone });
  if (error) return null;
  return typeof data === "string" && data ? data : null;
}

/** Şifreli mesajı kuyruğa as. */
export async function enqueue(args: {
  code: string;
  toPhone: string;
  payload: string;
  iv?: string | null;
  alg?: string | null;
  kind?: string | null;
  msgId?: string | null;
}): Promise<{ ok: boolean; reason: string }> {
  const { data, error } = await supabase.rpc("asili_gonder", {
    p_code: args.code,
    p_to_phone: args.toPhone,
    p_payload: args.payload,
    p_iv: args.iv ?? null,
    p_alg: args.alg ?? "aes-gcm-ecdh",
    p_kind: args.kind ?? "text",
    p_msg_id: args.msgId ?? null,
  });
  if (error) return { ok: false, reason: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: !!row?.ok, reason: String(row?.reason ?? "ok") };
}

/** Bana asılı duran, teslim edilmemiş veriler. */
export async function fetchQueue(limit = 200): Promise<AsiliRow[]> {
  const { data, error } = await supabase.rpc("asili_kuyrugum", { p_limit: limit });
  if (error || !Array.isArray(data)) return [];
  return data as AsiliRow[];
}

/** Teslim aldığım kodları işaretle (bir daha düşmez). */
export async function markDelivered(codes: string[]): Promise<number> {
  const list = (codes || []).filter(Boolean);
  if (!list.length) return 0;
  const { data, error } = await supabase.rpc("asili_teslim", { p_codes: list });
  if (error) return 0;
  return typeof data === "number" ? data : 0;
}

/** Gönderdiğim verilerin teslim durumu. */
export async function deliveryStatus(codes: string[]): Promise<Record<string, string | null>> {
  const list = (codes || []).filter(Boolean);
  if (!list.length) return {};
  const { data, error } = await supabase.rpc("asili_durumum", { p_codes: list });
  if (error || !Array.isArray(data)) return {};
  const out: Record<string, string | null> = {};
  for (const row of data as { code: string; delivered_at: string | null }[]) {
    out[row.code] = row.delivered_at;
  }
  return out;
}

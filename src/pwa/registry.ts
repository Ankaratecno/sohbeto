import { supabase } from "@/lib/supabase";
import { ensureSupabaseUser } from "@/pwa/push";

export type FounderMessage = {
  id: string;
  body: string;
  send_at: string;
  founder_phone: string;
};

/** Alınan sanal numarayı + kullanıcı adını registered_numbers tablosuna yazar. */
export async function registerNumber(
  phone: string,
  username?: string | null,
  displayName?: string | null,
): Promise<{ ok: boolean; reason: string }> {
  const uid = await ensureSupabaseUser();
  if (!uid) return { ok: false, reason: "auth" };
  const { data, error } = await supabase.rpc("register_my_number", {
    p_phone: phone,
    p_username: username || null,
    p_display_name: displayName || null,
  });
  if (error) return { ok: false, reason: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: Boolean(row?.ok), reason: String(row?.reason ?? "ok") };
}

/** Kullanıcı adı müsait mi? */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const uid = await ensureSupabaseUser();
  if (!uid) return false;
  const { data, error } = await supabase.rpc("is_username_available", { p_username: username });
  if (error) return false;
  return Boolean(data);
}

/** Çevrimiçi/son görülme bilgisini tazeler. */
export async function touchPresence(online = true): Promise<void> {
  const uid = await ensureSupabaseUser();
  if (!uid) return;
  await supabase.rpc("touch_my_presence", { p_online: online });
}

/** Vakti gelmiş ve bana henüz teslim edilmemiş kurucu mesajları. */
export async function pendingFounderMessages(): Promise<FounderMessage[]> {
  const uid = await ensureSupabaseUser();
  if (!uid) return [];
  const { data, error } = await supabase.rpc("pending_founder_messages");
  if (error || !Array.isArray(data)) return [];
  return data as FounderMessage[];
}

/** Mesajı teslim edildi olarak işaretler (bir daha düşmez). */
export async function markFounderMessageDelivered(id: string): Promise<void> {
  const uid = await ensureSupabaseUser();
  if (!uid) return;
  await supabase.rpc("mark_founder_message_delivered", { p_message_id: id });
}

export type FounderVerifyResult = {
  ok: boolean;
  phone?: string;
  displayName?: string | null;
};

/** Kurucu PIN'ini sunucuda doğrular (SOHBETO olarak giriş). */
export async function verifyFounderLogin(
  phone: string,
  pin: string,
): Promise<FounderVerifyResult> {
  const uid = await ensureSupabaseUser();
  if (!uid) return { ok: false };
  const { data, error } = await supabase.rpc("verify_founder_login", {
    p_phone: phone,
    p_pin: pin,
  });
  if (error) return { ok: false };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: Boolean(row?.ok),
    phone: row?.phone,
    displayName: row?.display_name,
  };
}

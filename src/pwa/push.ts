/**
 * Web Push aboneliği: tarayıcı → Supabase (push_subscriptions).
 * Kimlik: anonim Supabase oturumu (auth.users satırı oluşur, RLS çalışır).
 */
import {
  supabase,
  VAPID_PUBLIC_KEY,
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
} from "@/lib/supabase";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return buffer;
}

function deviceId(): string {
  let id = localStorage.getItem("sohbeto_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("sohbeto_device_id", id);
  }
  return id;
}

/** Uygulamanın sanal numarası (push hedefi). */
function normalizePhone(v: unknown): string {
  const d = String(v ?? "").replace(/[^0-9]/g, "");
  return d ? `+${d}` : "";
}

function storedPhone(): string {
  return localStorage.getItem("sohbeto_push_phone") || "";
}

/** Uygulama giriş yaptığında kendi numarasını kaydeder ve aboneliği tazeler. */
export async function setPushPhone(phone: string): Promise<void> {
  const p = normalizePhone(phone);
  if (!p) return;
  localStorage.setItem("sohbeto_push_phone", p);
  // Numarayı profile de yaz (telefon → user_id çözümlemesi için).
  await ensureSupabaseUser();
  const { error } = await supabase.rpc("set_my_phone", { p_phone: p });
  if (error) console.warn("[Sohbeto] Profil numarası yazılamadı:", error.message);
  // Abonelik satırındaki phone alanı boş kalmış olabilir → her girişte tazele.
  if ("Notification" in window && Notification.permission === "granted") await enablePush();
}


/** Oturum yoksa anonim oturum açar, kullanıcı id'sini döner. */
export async function ensureSupabaseUser(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.warn("[Sohbeto] Anonim oturum açılamadı:", error.message);
    return null;
  }
  return anon.user?.id ?? null;
}

/** İzin ister (gerekirse), abone olur ve Supabase'e kaydeder. */
export async function enablePush(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return false;
  }

  const userId = await ensureSupabaseUser();
  if (!userId) return false;

  const reg = await navigator.serviceWorker.ready;

  // Mevcut abonelik ESKİ bir VAPID public key ile alınmışsa sunucudaki private
  // key ile eşleşmez → push servisi 403 döner. Bu durumda aboneliği yenile.
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    const raw = existing.options?.applicationServerKey as ArrayBuffer | undefined;
    let key: string | null = null;
    if (raw) {
      let bin = "";
      new Uint8Array(raw).forEach((b) => (bin += String.fromCharCode(b)));
      key = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    if (key !== VAPID_PUBLIC_KEY) {
      try {
        await supabase.from("push_subscriptions").delete().eq("endpoint", existing.endpoint);
      } catch {
        /* noop */
      }
      await existing.unsubscribe();
    }
  }

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  const subscription = {
    p_device_id: deviceId(),
    p_phone: storedPhone() || null,
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_platform: navigator.platform || null,
    p_user_agent: navigator.userAgent,
  };

  // Güvenli DB fonksiyonu eski anonim kullanıcıya ait aynı endpoint'i mevcut
  // kullanıcıya devreder. Normal tablo upsert'i bu durumda RLS'ye takılır.
  const { error } = await supabase.rpc("upsert_push_subscription", subscription);
  if (error) {
    console.warn("[Sohbeto] Push aboneliği kaydedilemedi:", error.message);
    return false;
  }
  return true;
}

/** Aboneliği kaldırır ve kaydı siler. */
export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  } catch {
    /* noop */
  }
}

type PushResult = { sent?: number; failed?: number; note?: string; error?: unknown };

/** Bir kullanıcıya bildirim gönderir (send-push edge function). */
export async function sendPush(payload: {
  user_id?: string;
  user_ids?: string[];
  phone?: string;
  title: string;
  body: string;
  kind?: "message" | "call";
  url?: string;
  icon?: string;
  image?: string;
  data?: Record<string, unknown>;
}): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke<PushResult>("send-push", {
    body: payload,
  });
  if (error) {
    console.error("[Sohbeto] send-push hatası:", error.message, payload);
    return false;
  }
  if (data?.error) {
    console.error("[Sohbeto] send-push reddetti:", data.error, payload);
    return false;
  }
  console.info("[Sohbeto] send-push:", data);
  return (data?.sent ?? 0) > 0;
}

/** Numaraya ait push kullanıcı id'lerini bulur (eski fonksiyon sürümü için). */
async function userIdsForPhone(phone: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("push_user_ids_by_phone", { p_phone: phone });
  if (error) {
    console.warn("[Sohbeto] Numara çözümlenemedi:", error.message);
    return [];
  }
  const rows = (data ?? []) as unknown;
  if (Array.isArray(rows)) {
    return rows
      .map((r) => (typeof r === "string" ? r : (r as { user_id?: string })?.user_id))
      .filter((v): v is string => typeof v === "string");
  }
  return [];
}

/**
 * Bildirime tıklanınca açılacak adres.
 * Değiştirmek için: url-degisikligi.txt dosyasına bak.
 */
export const APP_URL = "https://ankaratecno.github.io/sohbeto/";

/** Numaraya bildirim gönderir (P2P mesaj/arama tetikleyicisi). */
export async function notifyPhone(
  phone: string,
  title: string,
  body: string,
  kind: "message" | "call" = "message",
  url?: string,
  icon?: string,
  data?: Record<string, unknown>,
): Promise<boolean> {
  const p = normalizePhone(phone);
  if (!p) return false;
  await ensureSupabaseUser();
  // Hem phone (yeni fonksiyon) hem user_ids (eski fonksiyon) gönderilir.
  const user_ids = await userIdsForPhone(p);
  if (!user_ids.length) {
    console.warn("[Sohbeto] Bu numaraya kayıtlı push aboneliği bulunamadı:", p);
  }
  return sendPush({
    phone: p,
    ...(user_ids.length ? { user_ids } : {}),
    title,
    body,
    kind,
    url: url || APP_URL,
    ...(icon && /^https?:\/\//.test(icon) ? { icon } : {}),
    // data.from → bildirime tıklanınca doğrudan o kişinin sohbeti/araması açılır.
    data: { from: normalizePhone(String(data?.["from"] ?? "")) || undefined, kind, ...(data || {}) },
  });
}



/** VAPID uyumunu kontrol eder: sunucudaki public key + çiftin geçerliliği. */
export async function pushDiag(): Promise<unknown> {
  const url = `${SUPABASE_URL}/functions/v1/push-diag?client=${encodeURIComponent(VAPID_PUBLIC_KEY)}`;
  const { data: s } = await supabase.auth.getSession();
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      ...(s.session ? { Authorization: `Bearer ${s.session.access_token}` } : {}),
    },
  });
  const out = await res.json().catch(() => ({ error: "cevap okunamadı" }));
  // Ek olarak tarayıcıdaki mevcut aboneliğin hangi key ile alındığını göster.
  let subKey: string | null = null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const raw = sub?.options?.applicationServerKey as ArrayBuffer | undefined;
    if (raw) {
      const bytes = new Uint8Array(raw);
      let bin = "";
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      subKey = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
  } catch {
    /* noop */
  }
  const report = {
    ...out,
    subscription_key: subKey,
    subscription_matches_client: subKey ? subKey === VAPID_PUBLIC_KEY : null,
  };
  console.info("[Sohbeto] push-diag:", report);
  return report;
}

/** İzin zaten verilmişse sessizce aboneliği tazeler; ayrıca iframe için global açar. */
export function initPush(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  w["sohbetoEnablePush"] = enablePush;
  w["sohbetoDisablePush"] = disablePush;
  w["sohbetoSendPush"] = sendPush;
  w["sohbetoSetPushPhone"] = setPushPhone;
  w["sohbetoNotifyPhone"] = notifyPhone;
  w["sohbetoPushDiag"] = pushDiag;
  if ("Notification" in window && Notification.permission === "granted") {
    void enablePush();
  }
}

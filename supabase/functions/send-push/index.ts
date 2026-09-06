// Sohbeto — send-push
// Deploy: supabase functions deploy send-push
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
//          FCM_SERVICE_ACCOUNT (Firebase servis hesabı JSON'u — APK bildirimleri için, isteğe bağlı)
//
// İKİ GÖREV
//  1) Normal çağrı  → Web Push (PWA) + FCM "uyan" sinyali (APK). Google'a giden
//     FCM paketi SADECE {"t":"1"} içerir: metin, numara, başlık YOKTUR.
//     Kim yazdı / arama mı mesaj mı bilgisi fcm_tickets tablosuna (kendi
//     Supabase'ine) yazılır.
//  2) { op: "peek", token, secret } → APK uyanınca kendi biletlerini çeker;
//     bildirim metnini CİHAZDA oluşturur. Bu yol JWT istemez, cihaz sırrı ister.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import webpush from "npm:web-push@3.6.7";
import { z } from "npm:zod@3.23.8";
import { SignJWT, importPKCS8 } from "npm:jose@5.9.6";

const BodySchema = z.object({
  user_id: z.string().uuid().optional(),
  user_ids: z.array(z.string().uuid()).max(100).optional(),
  phone: z.string().min(3).max(24).optional(),
  phones: z.array(z.string().min(3).max(24)).max(100).optional(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  kind: z.enum(["message", "call"]).default("message"),
  url: z.string().max(500).optional(),
  icon: z.string().max(500).optional(),
  image: z.string().max(500).optional(),
  data: z.record(z.unknown()).optional(),
});

const PeekSchema = z.object({
  op: z.literal("peek"),
  token: z.string().min(20).max(4096),
  secret: z.string().min(16).max(200),
});

// ---------------------------------------------------------------- FCM v1
type ServiceAccount = { project_id: string; client_email: string; private_key: string };
let fcmTokenCache: { token: string; exp: number } | null = null;

function loadServiceAccount(): ServiceAccount | null {
  const raw = (Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "").trim();
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!sa.project_id || !sa.client_email || !sa.private_key) return null;
    return { project_id: sa.project_id, client_email: sa.client_email, private_key: sa.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (fcmTokenCache && fcmTokenCache.exp > now + 60) return fcmTokenCache.token;
  const key = await importPKCS8(sa.private_key, "RS256");
  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Google token alınamadı [${res.status}]: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  fcmTokenCache = { token: data.access_token, exp: now + (data.expires_in ?? 3600) - 600 };
  return data.access_token;
}

/** Tek cihaza data-only "uyan" sinyali. Başlık/gövde/numara YOK. */
async function fcmWake(sa: ServiceAccount, access: string, token: string, kind: string) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        data: { t: "1" },
        android: { priority: "high", ttl: kind === "call" ? "60s" : "3600s" },
      },
    }),
  });
  if (res.ok) return { ok: true as const, stale: false };
  const text = await res.text();
  const stale = res.status === 404 || /UNREGISTERED/.test(text);
  console.error("[send-push] FCM hata", res.status, text.slice(0, 300));
  return { ok: false as const, stale };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const rawBody = await req.json().catch(() => ({}));

    // ------------------------------------------------------------ 2) PEEK
    // APK uyandı: "benim için bilet var mı?" — cihaz token + cihaz sırrı ile.
    if (rawBody && rawBody.op === "peek") {
      const p = PeekSchema.safeParse(rawBody);
      if (!p.success) return json({ error: "peek parametreleri" }, 400);
      const { data: dev } = await admin
        .from("fcm_tokens")
        .select("id, phone, secret")
        .eq("token", p.data.token)
        .maybeSingle();
      if (!dev || dev.secret !== p.data.secret) return json({ error: "Yetkisiz" }, 401);

      const { data: tickets } = await admin
        .from("fcm_tickets")
        .select("id, kind, from_phone, created_at")
        .eq("token_id", dev.id)
        .is("consumed_at", null)
        .gte("created_at", new Date(Date.now() - 6 * 3600 * 1000).toISOString())
        .order("created_at", { ascending: true })
        .limit(20);
      const list = tickets ?? [];
      if (list.length) {
        await admin
          .from("fcm_tickets")
          .update({ consumed_at: new Date().toISOString() })
          .in("id", list.map((t) => t.id));
      }
      return json({ tickets: list.map((t) => ({ id: t.id, kind: t.kind, from: t.from_phone ?? "", ts: t.created_at })) });
    }

    // ------------------------------------------------------------ 1) GÖNDER
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@sohbeto.app";
    if (!publicKey || !privateKey) return json({ error: "VAPID anahtarları eksik" }, 500);

    // Çağıran kimliğini doğrula (JWT).
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Yetkisiz" }, 401);
    const { data: caller, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !caller?.user) return json({ error: "Yetkisiz" }, 401);

    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { user_id, user_ids, phone, phones, title, body, kind, url, icon, image, data } = parsed.data;

    const norm = (p: string) => {
      const d = p.replace(/[^0-9]/g, "");
      return d ? `+${d}` : "";
    };
    const userTargets = user_ids?.length ? user_ids : user_id ? [user_id] : [];
    const phoneTargets = (phones?.length ? phones : phone ? [phone] : []).map(norm).filter(Boolean);
    if (!userTargets.length && !phoneTargets.length)
      return json({ error: "user_id/user_ids veya phone/phones gerekli" }, 400);

    // Gönderen numarası (bilet için). Metin değil, sadece kimden.
    const fromPhone = norm(String((data as Record<string, unknown> | undefined)?.["from"] ?? ""));

    // ---- a) Web Push (PWA / tarayıcı) — mevcut akış, dokunulmadı
    let query = admin.from("push_subscriptions").select("id, endpoint, p256dh, auth");
    query = userTargets.length && phoneTargets.length
      ? query.or(
          `user_id.in.(${userTargets.join(",")}),phone.in.(${phoneTargets.map((p) => `"${p}"`).join(",")})`,
        )
      : userTargets.length
        ? query.in("user_id", userTargets)
        : query.in("phone", phoneTargets);
    const { data: subs, error: subErr } = await query;
    if (subErr) return json({ error: subErr.message }, 500);

    let sent = 0;
    const stale: string[] = [];
    if (subs?.length) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      const payload = JSON.stringify({
        title,
        body,
        kind,
        url: url ?? "/",
        ...(icon ? { icon } : {}),
        ...(image ? { image } : {}),
        data: data ?? {},
        ts: Date.now(),
      });
      await Promise.all(
        subs.map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload,
              { TTL: kind === "call" ? 60 : 3600, urgency: "high" },
            );
            sent++;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) stale.push(s.id);
          }
        }),
      );
      if (stale.length) await admin.from("push_subscriptions").delete().in("id", stale);
    }

    // ---- b) FCM (APK) — sadece "uyan" sinyali
    let fcmSent = 0;
    let fcmFailed = 0;
    let fcmNote: string | undefined;
    const sa = loadServiceAccount();
    if (!sa) {
      fcmNote = "FCM_SERVICE_ACCOUNT yok (APK bildirimi atlandı)";
    } else {
      let tq = admin.from("fcm_tokens").select("id, token");
      tq = userTargets.length && phoneTargets.length
        ? tq.or(
            `user_id.in.(${userTargets.join(",")}),phone.in.(${phoneTargets.map((p) => `"${p}"`).join(",")})`,
          )
        : userTargets.length
          ? tq.in("user_id", userTargets)
          : tq.in("phone", phoneTargets);
      const { data: devices } = await tq;
      if (devices?.length) {
        // Önce bilet (kim / ne türde). Google'a bu bilgi GİTMEZ.
        await admin.from("fcm_tickets").insert(
          devices.map((d) => ({ token_id: d.id, kind, from_phone: fromPhone || null })),
        );
        try {
          const access = await fcmAccessToken(sa);
          const dead: string[] = [];
          await Promise.all(
            devices.map(async (d) => {
              const r = await fcmWake(sa, access, d.token, kind);
              if (r.ok) fcmSent++;
              else {
                fcmFailed++;
                if (r.stale) dead.push(d.id);
              }
            }),
          );
          if (dead.length) await admin.from("fcm_tokens").delete().in("id", dead);
        } catch (e) {
          fcmNote = (e as Error).message;
          fcmFailed = devices.length;
        }
      }
    }

    const total = sent + fcmSent;
    return json({
      sent: total,
      failed: (subs?.length ?? 0) - sent + fcmFailed,
      removed: stale.length,
      web_sent: sent,
      fcm_sent: fcmSent,
      ...(fcmNote ? { fcm_note: fcmNote } : {}),
      ...(!subs?.length && !fcmSent ? { note: "abonelik yok" } : {}),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

// Sohbeto — send-push
// Deploy: supabase functions deploy send-push
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import webpush from "npm:web-push@3.6.7";
import { z } from "npm:zod@3.23.8";

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
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@sohbeto.app";
    if (!publicKey || !privateKey) return json({ error: "VAPID anahtarları eksik" }, 500);

    // Çağıran kimliğini doğrula (JWT).
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Yetkisiz" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: caller, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !caller?.user) return json({ error: "Yetkisiz" }, 401);

    const parsed = BodySchema.safeParse(await req.json());
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
    if (!subs?.length) return json({ sent: 0, failed: 0, note: "abonelik yok" });

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

    let sent = 0;
    const stale: string[] = [];
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

    return json({ sent, failed: subs.length - sent, removed: stale.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

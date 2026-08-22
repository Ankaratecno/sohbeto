// Sohbeto — push-diag
// VAPID anahtar çiftinin uyumunu kontrol eder. Private key ASLA dönmez.
// Deploy: supabase functions deploy push-diag
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const publicKey = (Deno.env.get("VAPID_PUBLIC_KEY") ?? "").trim();
    const privateKey = (Deno.env.get("VAPID_PRIVATE_KEY") ?? "").trim();
    const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@sohbeto.app";

    // İstemcinin gömülü public key'i (query ?client=...) ile karşılaştır.
    const clientKey = (new URL(req.url).searchParams.get("client") ?? "").trim();

    const result: Record<string, unknown> = {
      has_public: !!publicKey,
      has_private: !!privateKey,
      public_len: publicKey.length, // beklenen: 87-88
      private_len: privateKey.length, // beklenen: 43-44
      server_public_key: publicKey, // public değer, paylaşmak güvenli
      client_matches_server: clientKey ? clientKey === publicKey : null,
      subject,
    };

    // Çiftin gerçekten birbirine ait olduğunu web-push'un kendi doğrulaması ile test et.
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      const headers = webpush.getVapidHeaders(
        "https://fcm.googleapis.com",
        subject,
        publicKey,
        privateKey,
        "aes128gcm",
      );
      result.pair_valid = !!headers?.Authorization;
    } catch (e) {
      result.pair_valid = false;
      result.pair_error = (e as Error).message;
    }

    return json(result);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

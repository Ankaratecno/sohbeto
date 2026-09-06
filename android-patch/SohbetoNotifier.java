package app.sohbeto.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

/**
 * Bildirimleri ÇİZEN ortak katman. Hem JS köprüsü (CallNotificationPlugin)
 * hem de FCM servisi (SohbetoMessagingService) buradan geçer.
 *
 * Kanal kimlikleri CallNotificationPlugin ile aynıdır; böylece kullanıcı
 * ayarlarda tek "Aramalar" / "Mesajlar" kanalı görür.
 *
 * Bildirim metni CİHAZDA üretilir: "Ayşe: yeni mesaj", "Ayşe seni arıyor".
 * Ad, uygulamanın rehberinden (JS → FcmPlugin.setNames) gelen yerel haritadan
 * çözülür; rehberde yoksa numara gösterilir.
 */
public final class SohbetoNotifier {

    static final String CH_CALLS = "sohbeto_calls_v2";
    static final String CH_MESSAGES = "sohbeto_messages_v2";
    static final int CALL_ID = 424242;
    static final String PREFS = "sohbeto_fcm";

    private SohbetoNotifier() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Rehber adı: yoksa numaranın kendisi. */
    static String displayName(Context ctx, String phone) {
        if (phone == null || phone.isEmpty()) return "Bilinmeyen";
        try {
            String raw = prefs(ctx).getString("names", "{}");
            JSONObject names = new JSONObject(raw);
            String key = "+" + phone.replaceAll("[^0-9]", "");
            String n = names.optString(key, "");
            if (!n.isEmpty()) return n;
            n = names.optString(phone, "");
            if (!n.isEmpty()) return n;
        } catch (Throwable ignored) {
        }
        return phone;
    }

    private static Uri rawSound(Context ctx, String name) {
        int resId = ctx.getResources().getIdentifier(name, "raw", ctx.getPackageName());
        if (resId == 0) return null;
        return Uri.parse("android.resource://" + ctx.getPackageName() + "/" + resId);
    }

    static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (nm.getNotificationChannel(CH_CALLS) == null) {
            NotificationChannel calls = new NotificationChannel(CH_CALLS, "Aramalar", NotificationManager.IMPORTANCE_HIGH);
            calls.setDescription("Gelen sesli aramalar");
            calls.enableVibration(true);
            calls.setVibrationPattern(new long[] { 0, 800, 600, 800, 600 });
            calls.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            Uri ring = rawSound(ctx, "ringtone");
            if (ring == null) ring = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE);
            calls.setSound(ring, new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            nm.createNotificationChannel(calls);
        }

        if (nm.getNotificationChannel(CH_MESSAGES) == null) {
            NotificationChannel msg = new NotificationChannel(CH_MESSAGES, "Mesajlar", NotificationManager.IMPORTANCE_HIGH);
            msg.setDescription("Yeni mesaj bildirimleri");
            msg.enableVibration(true);
            Uri tone = rawSound(ctx, "message");
            if (tone != null) {
                msg.setSound(tone, new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
            }
            nm.createNotificationChannel(msg);
        }
    }

    static PendingIntent activityIntent(Context ctx, String action, String from, int reqCode) {
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.setAction(action);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("sohbeto_action", action);
        intent.putExtra("sohbeto_from", from);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(ctx, reqCode, intent, flags);
    }

    /** Tam ekran gelen arama: "Ayşe seni arıyor". */
    static boolean showIncomingCall(Context ctx, String from, String name, String subtitle) {
        ensureChannels(ctx);
        if (from == null) from = "Bilinmeyen";
        if (name == null || name.isEmpty()) name = from;
        if (subtitle == null) subtitle = "Sohbeto sesli arama";

        PendingIntent full = activityIntent(ctx, "SOHBETO_INCOMING", from, 1);
        PendingIntent answer = activityIntent(ctx, "SOHBETO_ANSWER", from, 2);
        // Reddet uygulamayı açmasın: broadcast ile bildirimi kapat, reddi not düş.
        Intent dIntent = new Intent(ctx, CallActionReceiver.class);
        dIntent.setAction(CallActionReceiver.ACTION_DECLINE);
        dIntent.putExtra("sohbeto_from", from);
        int dFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) dFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent decline = PendingIntent.getBroadcast(ctx, 3, dIntent, dFlags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CH_CALLS)
                .setSmallIcon(ctx.getApplicationInfo().icon)
                .setContentTitle(name)
                .setContentText(subtitle)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(full)
                .setFullScreenIntent(full, true)
                .addAction(0, "Reddet", decline)
                .addAction(0, "Cevapla", answer);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            Uri ring = rawSound(ctx, "ringtone");
            if (ring == null) ring = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE);
            b.setSound(ring, android.media.AudioManager.STREAM_RING);
            b.setVibrate(new long[] { 0, 800, 600, 800, 600 });
        }

        try {
            NotificationManagerCompat.from(ctx).notify(CALL_ID, b.build());
            return true;
        } catch (SecurityException e) {
            return false;
        }
    }

    /** Mesaj bildirimi: başlık = kişi adı, gövde = "yeni mesaj". */
    static boolean showMessage(Context ctx, String from, String title, String body, int id) {
        ensureChannels(ctx);
        if (from == null) from = "";
        if (title == null || title.isEmpty()) title = "Sohbeto";
        if (body == null || body.isEmpty()) body = "Yeni mesaj";

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CH_MESSAGES)
                .setSmallIcon(ctx.getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                // Aynı kişi için bildirim tazelenince ses/titreşim TEKRAR çalmasın.
                .setOnlyAlertOnce(true)
                .setContentIntent(activityIntent(ctx, "SOHBETO_OPEN", from, id));

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            Uri tone = rawSound(ctx, "message");
            if (tone != null) b.setSound(tone);
            b.setVibrate(new long[] { 0, 250 });
        }

        try {
            NotificationManagerCompat.from(ctx).notify(id, b.build());
            return true;
        } catch (SecurityException e) {
            return false;
        }
    }
}

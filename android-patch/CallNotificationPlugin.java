package app.sohbeto.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tam ekran gelen arama bildirimi (Android 8 / API 26 ve üzeri).
 *
 * - API 26-28: setFullScreenIntent() izin gerektirmez, doğrudan çalışır.
 * - API 29+  : USE_FULL_SCREEN_INTENT izni manifeste eklidir.
 * - API 34+  : kullanıcı ayarlardan izin verirse tam ekran açılır, vermezse
 *              üstten "heads-up" bildirim olarak düşer (yine Cevapla/Reddet var).
 *
 * Zil sesi / mesaj sesi: res/raw altındaki dosyalar kullanılır
 * (android-patch/sounds/ringtone.mp3 ve message.mp3 → patch-android.sh kopyalar).
 */
@CapacitorPlugin(name = "CallNotification")
public class CallNotificationPlugin extends Plugin {

    private static final String CH_CALLS = "sohbeto_calls_v2";
    private static final String CH_MESSAGES = "sohbeto_messages_v2";
    private static final int CALL_ID = 424242;

    private Uri rawSound(String name) {
        int resId = getContext().getResources().getIdentifier(name, "raw", getContext().getPackageName());
        if (resId == 0) return null;
        return Uri.parse("android.resource://" + getContext().getPackageName() + "/" + resId);
    }

    private void ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (nm.getNotificationChannel(CH_CALLS) == null) {
            NotificationChannel calls = new NotificationChannel(CH_CALLS, "Aramalar", NotificationManager.IMPORTANCE_HIGH);
            calls.setDescription("Gelen sesli aramalar");
            calls.enableVibration(true);
            calls.setVibrationPattern(new long[] { 0, 800, 600, 800, 600 });
            calls.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            Uri ring = rawSound("ringtone");
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
            Uri tone = rawSound("message");
            if (tone != null) {
                msg.setSound(tone, new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
            }
            nm.createNotificationChannel(msg);
        }
    }

    private PendingIntent activityIntent(String action, String from, int reqCode) {
        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.setAction(action);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("sohbeto_action", action);
        intent.putExtra("sohbeto_from", from);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(getContext(), reqCode, intent, flags);
    }

    /** Tam ekran gelen arama bildirimi gösterir. */
    @PluginMethod
    public void showIncomingCall(PluginCall call) {
        ensureChannels();
        String from = call.getString("from", "Bilinmeyen");
        String name = call.getString("name", from);
        String subtitle = call.getString("subtitle", "Sohbeto sesli arama");

        PendingIntent full = activityIntent("SOHBETO_INCOMING", from, 1);
        PendingIntent answer = activityIntent("SOHBETO_ANSWER", from, 2);
        PendingIntent decline = activityIntent("SOHBETO_DECLINE", from, 3);

        NotificationCompat.Builder b = new NotificationCompat.Builder(getContext(), CH_CALLS)
                .setSmallIcon(getContext().getApplicationInfo().icon)
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

        // Android 8/9 için sesi bildirime de bağla (kanal yoksa kullanılır).
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            Uri ring = rawSound("ringtone");
            if (ring == null) ring = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE);
            b.setSound(ring, android.media.AudioManager.STREAM_RING);
            b.setVibrate(new long[] { 0, 800, 600, 800, 600 });
        }

        try {
            NotificationManagerCompat.from(getContext()).notify(CALL_ID, b.build());
            JSObject ret = new JSObject();
            ret.put("value", true);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject("Bildirim izni yok", e);
        }
    }

    /** Gelen arama bildirimini kapatır. */
    @PluginMethod
    public void cancelIncomingCall(PluginCall call) {
        NotificationManagerCompat.from(getContext()).cancel(CALL_ID);
        call.resolve();
    }

    /** Normal mesaj bildirimi (kendi sesimizle). */
    @PluginMethod
    public void showMessage(PluginCall call) {
        ensureChannels();
        String from = call.getString("from", "");
        String title = call.getString("title", "Sohbeto");
        String body = call.getString("body", "Yeni mesaj");
        int id = call.getInt("id", (int) (System.currentTimeMillis() % 100000));

        NotificationCompat.Builder b = new NotificationCompat.Builder(getContext(), CH_MESSAGES)
                .setSmallIcon(getContext().getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(activityIntent("SOHBETO_OPEN", from, id));

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            Uri tone = rawSound("message");
            if (tone != null) b.setSound(tone);
            b.setVibrate(new long[] { 0, 250 });
        }

        try {
            NotificationManagerCompat.from(getContext()).notify(id, b.build());
            call.resolve();
        } catch (SecurityException e) {
            call.reject("Bildirim izni yok", e);
        }
    }
}

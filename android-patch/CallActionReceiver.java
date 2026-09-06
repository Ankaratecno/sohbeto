package app.sohbeto.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import androidx.core.app.NotificationManagerCompat;

/**
 * Bildirimdeki "Reddet" düğmesi.
 *
 * Uygulamayı AÇMADAN çalışır: zil bildirimi anında kapanır, reddedilen
 * numara küçük bir not olarak saklanır. Uygulama bir sonraki açılışında
 * (veya zaten açıksa hemen) bu nottan CALL_REJECT sinyalini gönderir.
 */
public class CallActionReceiver extends BroadcastReceiver {

    public static final String ACTION_DECLINE = "app.sohbeto.mobile.DECLINE";
    public static final String PREFS = "sohbeto_call_actions";
    public static final String KEY_PENDING_DECLINE = "pending_decline";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_DECLINE.equals(intent.getAction())) return;
        String from = intent.getStringExtra("sohbeto_from");

        // 1) Zil bildirimi hemen kapansın (ekranda hiçbir şey açılmaz).
        try { NotificationManagerCompat.from(context).cancel(424242); } catch (Exception ignored) {}

        // 2) Uygulama açıksa web tarafına anında ilet.
        try {
            Intent local = new Intent("sohbeto.call.declined");
            local.putExtra("sohbeto_from", from == null ? "" : from);
            context.sendBroadcast(local);
        } catch (Exception ignored) {}

        // 3) Kapalıysa: bir sonraki açılışta reddi göndermek üzere not düş.
        try {
            SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            sp.edit().putString(KEY_PENDING_DECLINE, from == null ? "" : from).apply();
        } catch (Exception ignored) {}
    }
}

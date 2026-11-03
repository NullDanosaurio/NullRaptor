package es.nullraptor.movil;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.BridgeActivity;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;

/**
 * El panel de Nullraptor dentro de la app. La passkey no funciona en el WebView (Android pide que Google lea el
 * assetlinks.json del dominio, y el panel solo existe en Tailscale), así que se entra en una pestaña de Chrome y la
 * sesión vuelve a la app con un código de un solo uso (panel/lib/entrada-app.mjs):
 *   es.nullraptor.movil://entrar           → verificador secreto nuevo y Chrome en /vincular-app?reto=sha256(verificador)
 *   es.nullraptor.movil://sesion?codigo=X  → el WebView canjea /entrar/app?codigo=X&verificador=…
 * El verificador nunca sale de la app hasta el canje, así que un código interceptado no sirve a nadie más.
 */
public class MainActivity extends BridgeActivity {
    private static final String ESQUEMA = "es.nullraptor.movil";
    private static final String PREFS = "entrada";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        atender(getIntent());
        // Atrás vuelve a la pantalla anterior del panel (cada vista es una entrada del historial); sin nada detrás, sale.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge().getWebView();
                if (web.canGoBack()) {
                    web.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        atender(intent);
    }

    private void atender(Intent intent) {
        Uri uri = intent == null ? null : intent.getData();
        if (uri == null || !ESQUEMA.equals(uri.getScheme())) return;
        if ("entrar".equals(uri.getHost())) entrarConChrome();
        else if ("sesion".equals(uri.getHost())) canjear(uri.getQueryParameter("codigo"));
    }

    /** Origen https del panel: el de la página abierta, o el último usado. */
    private String panel() {
        SharedPreferences p = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        WebView web = getBridge() == null ? null : getBridge().getWebView();
        String url = web == null ? null : web.getUrl();
        if (url != null) {
            Uri u = Uri.parse(url);
            if ("https".equals(u.getScheme()) && u.getHost() != null && u.getHost().endsWith(".ts.net")) {
                String origen = "https://" + u.getHost();
                p.edit().putString("panel", origen).apply();
                return origen;
            }
        }
        return p.getString("panel", null);
    }

    private void entrarConChrome() {
        String panel = panel();
        if (panel == null) return;
        byte[] azar = new byte[32];
        new SecureRandom().nextBytes(azar);
        String verificador = b64(azar);
        String reto;
        try {
            reto = b64(MessageDigest.getInstance("SHA-256").digest(verificador.getBytes(StandardCharsets.US_ASCII)));
        } catch (Exception e) {
            return;
        }
        // Se guarda por si Android cierra la app mientras estás en Chrome.
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("verificador", verificador).apply();
        new CustomTabsIntent.Builder().build().launchUrl(this, Uri.parse(panel + "/vincular-app?reto=" + reto));
    }

    private void canjear(String codigo) {
        SharedPreferences p = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String verificador = p.getString("verificador", null);
        String panel = p.getString("panel", null);
        p.edit().remove("verificador").apply(); // un solo intento
        if (codigo == null || verificador == null || panel == null) return;
        WebView web = getBridge().getWebView();
        web.loadUrl(panel + "/entrar/app?codigo=" + Uri.encode(codigo) + "&verificador=" + Uri.encode(verificador));
    }

    private static String b64(byte[] datos) {
        return Base64.encodeToString(datos, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }
}

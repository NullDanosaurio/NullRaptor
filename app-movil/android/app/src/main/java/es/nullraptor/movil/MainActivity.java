package es.nullraptor.movil;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;

/**
 * El panel de Nullraptor dentro de la app. Activa las passkeys (WebAuthn) en el WebView en modo «app»: Android
 * comprueba en /.well-known/assetlinks.json del panel que esta app, firmada con la clave declarada en
 * app-movil/firma.json, puede usar las passkeys de ese dominio.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView web = getBridge().getWebView();
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) {
            WebSettingsCompat.setWebAuthenticationSupport(web.getSettings(), WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP);
        }
    }
}

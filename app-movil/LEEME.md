# Nullraptor para Android

App Android (Capacitor) que abre el panel de Nullraptor por Tailscale y le añade lo que una web no puede hacer en el
móvil, pensado para el modo voz (Jarvis). La interfaz es la del panel: la app no duplica pantallas.

## Cómo funciona

- La primera vez pide la dirección del panel (`https://<equipo>.<red>.ts.net`, solo `*.ts.net`) y la recuerda.
- Se entra con la passkey del panel **en una pestaña de Chrome**: dentro de la app (WebView) la passkey no funciona,
  porque Android exige que Google pueda leer el `assetlinks.json` del dominio y el panel solo existe en Tailscale.
  La app genera un verificador secreto, abre `/vincular-app?reto=sha256(verificador)` en Chrome, entras con la
  passkey y vuelves con «Volver a la app» (`es.nullraptor.movil://sesion?codigo=…`); la app canjea el código con su
  verificador en `/entrar/app` (como PKCE: un código interceptado no sirve sin el verificador). Lo mismo para
  reconfirmar la passkey cada hora (terminal). Detalle en `panel/lib/entrada-app.mjs` y `MainActivity.java`.
- La app se identifica añadiendo `NullraptorApp/0.1` a su user agent (`capacitor.config.json`).
- Necesita Tailscale activo en el móvil.

## Compilar (en el contenedor de Nullraptor)

Requisitos en el volumen: Java 21 (`/estado/sistema/jdk21`) y el SDK de Android (`/estado/sistema/android`).

```sh
cd app-movil
npm ci
export JAVA_HOME=/estado/sistema/jdk21 ANDROID_HOME=/estado/sistema/android GRADLE_USER_HOME=/estado/sistema/gradle
export NULLRAPTOR_ANDROID_FIRMA=/estado/sistema/android/nullraptor-depuracion.keystore   # la de firma.json
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
npm run apk   # → android/app/build/outputs/apk/debug/app-debug.apk
```

La clave de depuración (`nullraptor-depuracion.keystore`, contraseña `android`) vale para uso personal. Para una
versión publicada, Daniel crea su propia clave, la guarda en el cofre y añade su huella a `firma.json`.

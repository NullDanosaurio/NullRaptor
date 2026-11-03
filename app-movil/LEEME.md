# Nullraptor para Android

App Android (Capacitor) que abre el panel de Nullraptor por Tailscale y le añade lo que una web no puede hacer en el
móvil, pensado para el modo voz (Jarvis). La interfaz es la del panel: la app no duplica pantallas.

## Cómo funciona

- La primera vez pide la dirección del panel (`https://<equipo>.<red>.ts.net`, solo `*.ts.net`) y la recuerda.
- Se entra con la passkey del panel, igual que en el navegador.
- Necesita Tailscale activo en el móvil.

## Compilar (en el contenedor de Nullraptor)

Requisitos en el volumen: Java 21 (`/estado/sistema/jdk21`) y el SDK de Android (`/estado/sistema/android`).

```sh
cd app-movil
npm ci
export JAVA_HOME=/estado/sistema/jdk21 ANDROID_HOME=/estado/sistema/android GRADLE_USER_HOME=/estado/sistema/gradle
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
npm run apk   # → android/app/build/outputs/apk/debug/app-debug.apk
```

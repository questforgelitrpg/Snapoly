# Snapoly Android test build

`Snapoly-0.5.0-debug.apk` is the installable Android prototype. Package: `com.polysnap.prototype`. Android 8 or newer; WebGL 2 support in the system WebView is required. iPhone uses the published web/PWA version. Both music tracks are embedded in the APK's standalone HTML; music needs no network or file permissions.

The APK contains the entire game offline. The Java shell adds portrait orientation, system-bar/cutout spacing, private local scores and pause-on-background behavior. It requests no Android permissions, blocks network loads, and exposes no JavaScript-to-Java bridge.

## Rebuild

Install Node.js 20+, JDK 21 and Android SDK platform 36 / build-tools 36.0.0 from their official sources. Set `JAVA_HOME` and `ANDROID_SDK_ROOT` to those local directories.

From the source folder:

```text
npm ci
npm test
npm run build:android
```

The script compiles the resources and Java shell, adds DEX code and the bundled HTML, aligns the APK, signs it using a local test key, then verifies its signature and manifest. Output: `android/build/Snapoly-0.5.0-debug.apk`.

Build intermediates stay in `android/build/`. A generated test key stays in `.keys/`; both directories are excluded from source archives. The signing password is the conventional public test password `android`. This is not a production credential. A new checkout generates a different test key, so Android cannot update an existing installation signed by another checkout. Keep the original key privately if future test builds need to update in place. Uninstalling deletes saved scores; do not uninstall to resolve an update error without preserving or accepting that data loss.

## USB installation

With the phone connected and Android debugging already authorized:

```text
adb install -r android/build/Snapoly-0.5.0-debug.apk
adb shell am start -n com.polysnap.prototype/.MainActivity
```

Normal Android installation prompts may require action on the phone. This prototype has no Play Store listing, automatic updater or native iOS package.

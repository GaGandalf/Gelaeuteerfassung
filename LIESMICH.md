# Geläut-Erfassung – Web-App und Handy-App

Dieses Projekt enthält die Geläut-Erfassung in drei Formen:

| Form | Für | Wo gespeichert |
|---|---|---|
| **Website / Web-App** (Ordner `www`) | PC, Tablet und Handy im Browser | im jeweiligen Browser |
| **Installierbare Web-App (PWA)** | iPhone und Android: „Zum Home-Bildschirm“ – startet wie eine App, funktioniert offline | auf dem Gerät |
| **Android-App (APK)** | Android-Handys | auf dem Gerät |

Geläute lassen sich zwischen Geräten mit **„Als JSON sichern“** und **„JSON laden“** übertragen.
Regelmässig sichern lohnt sich, weil ein Browser gespeicherte Daten beim Löschen des Verlaufs entfernt.

## Einmalig einrichten (ca. 10 Minuten, kostenlos)

1. Auf <https://github.com> ein Konto anlegen (falls noch keines vorhanden).
2. Ein neues Repository anlegen, z. B. `gelaeut-erfassung` (öffentlich – nötig für kostenlose GitHub Pages).
3. Den gesamten Inhalt dieses Ordners hochladen („Add file → Upload files“, auch den Ordner `.github`).
   *Tipp:* Wird `.github` beim Hochladen im Browser ausgeblendet, die beiden Dateien aus `.github/workflows`
   über „Add file → Create new file“ mit Namen `.github/workflows/website.yml` bzw. `android-apk.yml` anlegen und den Inhalt einfügen.
4. Im Repository: **Settings → Pages → Source: „GitHub Actions“** wählen.
5. Unter **Actions** laufen nun zwei Abläufe:
   - **Website veröffentlichen** – danach ist die Web-App unter `https://<benutzername>.github.io/gelaeut-erfassung/` erreichbar.
   - **Android-App bauen** – nach ca. 5–8 Minuten liegt die APK unter **Releases → „Geläut-Erfassung – Android-App“**.

Jede spätere Änderung an den Dateien (z. B. neue Version von `www/index.html`) baut Website und App automatisch neu.

## Auf dem Handy

**Android – als App (APK):** Auf dem Handy die Release-Seite öffnen, `Gelaeut-Erfassung.apk` herunterladen und öffnen.
Beim ersten Mal fragt Android, ob Installationen aus dieser Quelle erlaubt sind – zustimmen.

**Android – als Web-App:** Website in Chrome öffnen → Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.

**iPhone / iPad:** Website in Safari öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.
Eine echte App im Apple App Store erfordert einen Mac mit Xcode und ein Apple-Entwicklerkonto (99 USD/Jahr);
die Web-App auf dem Home-Bildschirm bietet dieselben Funktionen.

**Excel-Export auf dem Handy:** In der Android-App öffnet sich das Teilen-Menü (speichern, per Mail senden, in Drive ablegen …).
In der Web-App landet die Datei im Download-Ordner.

## Für Entwickler: lokal bauen

```bash
npm install
npx cap add android
npx capacitor-assets generate --android   # App-Icon aus assets/
npx cap sync android
npx cap open android                       # öffnet Android Studio → Run / Build APK
```

Für den Play Store wird eine signierte Release-Version benötigt (Android Studio → Build → Generate Signed App Bundle).

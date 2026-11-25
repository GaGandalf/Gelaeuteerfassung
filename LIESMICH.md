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

## Geläute über Dropbox abgleichen

Statt JSON-Dateien hin und her zu laden, können alle Geräte ihre Geläute über die eigene Dropbox abgleichen.
Die App sieht dabei nur ihren eigenen Ordner `Dropbox/Apps/<App-Name>/gelaeute/`; jedes Geläut ist dort eine JSON-Datei
(mit dem Versionsverlauf von Dropbox). Gespeichert wird immer zuerst auf dem Gerät – ohne Netz (z. B. im Turm) wird
später automatisch nachgeladen. Ändert man dasselbe Geläut auf zwei Geräten, gewinnt die neuere Fassung.

**Einmalig: Dropbox-App anlegen (ca. 5 Minuten)**

1. <https://www.dropbox.com/developers/apps> öffnen und mit dem eigenen Dropbox-Konto anmelden.
2. **Create app** → **Scoped access** → **App folder** → Namen wählen (muss weltweit eindeutig sein, z. B. `Gelaeut-Erfassung-XY`).
3. Im Reiter **Permissions** diese drei Rechte ankreuzen und unten **Submit** klicken:
   `files.metadata.read`, `files.content.read`, `files.content.write`.
4. Im Reiter **Settings** den **App key** kopieren und in `www/js/dropbox.js` bei `DROPBOX_APP_KEY` eintragen.
   Der App key ist kein Geheimnis; das **App secret** wird nicht gebraucht und gehört nicht in die App.
   Eine Redirect-URI ist nicht nötig.

**Auf jedem Gerät einmal verbinden:** In der Seitenleiste unter „Dropbox“ auf **Verbinden** →
**Dropbox-Anmeldung öffnen** → bei Dropbox **Zulassen** → den angezeigten Code kopieren, in der App einfügen, **Verbinden**.
Beim ersten Verbinden werden die Geläute des Geräts hochgeladen und die der anderen Geräte heruntergeladen.
**Trennen** beendet den Abgleich; die Geläute bleiben auf dem Gerät.

## Auf dem Handy

**Android – als App (APK):** Auf dem Handy die Release-Seite öffnen, `Gelaeut-Erfassung.apk` herunterladen und öffnen.
Beim ersten Mal fragt Android, ob Installationen aus dieser Quelle erlaubt sind – zustimmen.

**Android – als Web-App:** Website in Chrome öffnen → Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.

**iPhone / iPad:** Website in Safari öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.
Eine echte App im Apple App Store erfordert einen Mac mit Xcode und ein Apple-Entwicklerkonto (99 USD/Jahr);
die Web-App auf dem Home-Bildschirm bietet dieselben Funktionen.

**Excel-Export auf dem Handy:** In der Android-App öffnet sich das Teilen-Menü (speichern, per Mail senden, in Drive ablegen …).
In der Web-App landet die Datei im Download-Ordner.

## Für Entwickler: Aufbau des Codes

Die App kommt ohne Build-Schritt aus: Der Ordner `www` wird so ausgeliefert, wie er ist.

| Datei | Inhalt |
|---|---|
| `www/index.html` | Aufbau der Seite (nur HTML) |
| `www/css/app.css` | Gestaltung inkl. Dunkelmodus |
| `www/js/daten.js` | Frequenz- und Rippentabelle sowie Excel-Vorlage aus dem Factsheet (nicht von Hand ändern) |
| `www/js/rechnung.js` | Berechnungskern: Töne, Nominal, Abweichungen, Rippe, Gewicht (wie Excel „Töne_Rippe“) |
| `www/js/motive.js` | Läutemotive (aus der App „Glockenmotive“) und Erkennung des Motivs aus den Nominalen |
| `www/js/spektrum.js` | FFT, Spitzensuche, Spektrum-Diagramm mit Zoom, Wellenform |
| `www/js/aufnahme.js` | Mikrofon-Aufnahme, Erkennung von Übersteuerung, WAV-Export |
| `www/js/app.js` | Zustand, Darstellung, Eingaben, Speichern auf dem Gerät |
| `www/js/dropbox.js` | Abgleich der Geläute mit Dropbox (Anmeldung, Hoch-/Herunterladen, Konflikte); hier steht der App key |
| `www/js/export.js` | Excel-, Text- und JSON-Export / -Import |
| `www/js/klanganalyse.js` | Bereich „Klanganalyse“ der Glocke |
| `www/js/start.js` | Startet die App (Entwurf oder Beispieldaten) |
| `www/sw.js` | Offline-Cache; bei jeder Änderung `VERSION` hochzählen und in `index.html` alle `?v=` gleich setzen, bei neuen Dateien die Liste ergänzen |

Lokal ansehen: im Ordner `www` z. B. `python3 -m http.server` starten und `http://localhost:8000` öffnen.

## Für Entwickler: lokal bauen

```bash
npm install
npx cap add android
npx capacitor-assets generate --android   # App-Icon aus assets/
npx cap sync android
npx cap open android                       # öffnet Android Studio → Run / Build APK
```

Für den Play Store wird eine signierte Release-Version benötigt (Android Studio → Build → Generate Signed App Bundle).

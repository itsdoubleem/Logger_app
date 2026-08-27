# Deploying 근무기록 Work Log

> **This file describes v1.** For v2 — the version that ships now — substitute
> `python3 build.py v2` and `dist-v2/` everywhere below, and `./build_apk.sh v2`
> for the APK. Everything else on this page (hosting, HTTPS, WebAuthn, TWA,
> assetlinks) is identical: both variants are one self-contained `index.html`
> with the same `applicationId`, so a v2 install upgrades a v1 one in place and
> the worker's records survive. See [`V2.md`](V2.md) for what changed.

## Build

```
python3 build.py
```

Everything to ship is in `dist/` — 7 files, ~730 KB, no dependencies, no build
toolchain. `build.py` unpacks the handoff bundle, swaps in the current
`WorkLogApp.dc.html`, adds the design-system tokens and the PWA head tags, and
re-seals it. Re-run it after any edit to `WorkLogApp.dc.html`, `ds-tokens.css`,
`pwa/sw.js` or `pwa/manifest.webmanifest`.

```
dist/index.html                the whole app
dist/manifest.webmanifest      installability
dist/sw.js                     offline shell
dist/icon-{180,192,512}.png    launcher icons
dist/icon-maskable-512.png     Android adaptive icon
```

Icons are regenerated from `pwa/icon-source.png` — the 근무기록 · LOGGER mark —
with `python3 pwa/make_icons.py`. That script also writes the Android launcher
bitmaps into `android/app/src/main/res/mipmap-*`. To change the icon, drop a new
square PNG (transparent outside the mark) at `pwa/icon-source.png` and rerun it.

Only `icon-512.png` carries the whole logo. Everything that renders small — the
launcher bitmaps, the maskable icon, the apple-touch icon, the favicon — drops
the clock and scales the wordmark up to fill the disc, because at 48px the clock
costs two fifths of the height and leaves the lettering unreadable.

> The PWA head tags live in `PWA_HEAD` inside `build.py`, not in
> `WorkLog.dc.html`. That wrapper is the design-canvas entry point; the build
> takes its outer template from the compiled bundle.

## Hosting — https, free, no account needed for the first one

**Netlify Drop** — https://app.netlify.com/drop — drag the `dist` *folder* onto
the page. You get `https://<name>.netlify.app` in about ten seconds. This is
what the existing `dainty-churros-fe875c.netlify.app` is; drop the new folder
on the same site to replace it and keep the URL.

Any of these work equally well, all free, all https:

| Host | How |
| --- | --- |
| Netlify Drop | drag `dist/` onto app.netlify.com/drop |
| Cloudflare Pages | Create project → Direct upload → drag `dist/` |
| GitHub Pages | push `dist/` contents to a repo, Settings → Pages |
| Vercel | `npx vercel deploy --prod dist` |

Requirements the host must meet — all four do:

- **https.** WebAuthn and service workers both refuse to run without it. This is
  the one reason the fingerprint punch cannot work from a `file://` copy.
- **`sw.js` served from the site root** (or the same folder as `index.html`), so
  its scope covers the app. Don't move it into a subfolder.
- No caching header longer than a few minutes on `index.html`. The service
  worker updates itself on the next launch after a redeploy; a hard CDN cache
  in front of it just delays that.

### Keep the domain stable

Two things are bound to the origin and do **not** follow the app to a new URL:

- the worker's records — `localStorage` is per-origin;
- the registered fingerprint credential — WebAuthn binds it to the domain.

Moving hosts means every user re-registers their fingerprint on first punch
(one tap, harmless) and **loses their logged shifts unless they export first**.
So: pick the domain before handing the link around, and if you ever do move,
tell people to hit 설정 → 백업 → 파일로 내보내기 *before* they open the new URL,
then 파일에서 불러오기 once they are there.

## Backup

설정 → **백업 BACKUP**, at the bottom of the settings tab.

- **파일로 내보내기** writes `근무기록-YYYYMMDD.json` — settings, every day
  record, and any open session. On a phone it opens the OS share sheet
  (KakaoTalk, Drive, Files); the app never picks the destination. Where there is
  no share sheet it falls back to a normal download. In the APK neither exists:
  `FileShim` supplies a `navigator.share` backed by the Storage Access
  Framework, so the "내보냈습니다" message appears only after the bytes are on
  disk — see below.
- **파일에서 불러오기** parses the file and shows what it holds — how many days,
  when it was saved, and how many days are about to be destroyed — and waits for
  **덮어쓰기**. A file that is not a Work Log backup is refused by name and
  changes nothing.
- Nothing is uploaded at any point. There is no account and no sync.

The fingerprint credential is deliberately **not** in the file: WebAuthn keys
cannot leave the device they were made on. Restoring onto a new phone brings
back every record, and the first punch there registers that phone's own finger.

### Why the APK needs extra code for this

A WebView has no file picker and no downloads unless the host activity supplies
them. Both directions of the backup failed silently without it:

- **불러오기** — `<input type="file">` does nothing at all unless the host
  implements `WebChromeClient.onShowFileChooser`. The tap is swallowed, no
  picker opens, and the page never hears back. `MainActivity` now implements it
  with `ACTION_OPEN_DOCUMENT` and type `*/*` (a backup that came back from Drive
  or KakaoTalk is often `octet-stream`, and filtering on `application/json`
  hides it — the page validates the contents anyway).
- **내보내기** — `navigator.share` does not exist in a WebView, so the page fell
  through to `<a download>`, and a `blob:` download dies unless a
  `DownloadListener` catches it. The page then said "내보냈습니다" over a file
  that had never been written. `FileShim` installs a real `navigator.share`
  whose promise resolves only once `ACTION_CREATE_DOCUMENT` has written the
  bytes, and rejects with `AbortError` if the sheet is dismissed — which the app
  already reads as "nothing happened". The `DownloadListener` remains as a
  fallback for a WebView too old for document-start scripts.

Neither uses a storage permission, and the app still holds no INTERNET
permission — SAF hands back a `content://` the worker picked themselves.

## The test APK (no hosting needed)

```
./build_apk.sh v2       ->  worklog-debug.apk         (sideload / testing)
./build_apk.sh          ->  worklog-frozen-debug.apk  (the frozen original)
./build_apk.sh release  ->  worklog-release.apk       (release APK)
./build_apk.sh bundle   ->  worklog-release.aab       (what the Play Store takes)
```

The first two are debug-signed and for your own phone. `release` and `bundle`
are the store route — see [Releasing to the Play Store](#releasing-to-the-play-store).

`worklog-debug.apk` is the whole app inside an Android package — no server, no
URL, works with the phone in airplane mode. Sideload it: send it to the phone,
open it, allow install from that source. Package id `app.worklog.punch`.

This is **not** the TWA described below. It exists so you can hold the app in
your hand before deciding anything about hosting. Differences that matter:

- The page is served by `WebViewAssetLoader` from
  `https://appassets.androidplatform.net`, not `file://`, so it is a real
  secure origin — localStorage persists and the service worker registers.
- Android WebView has no WebAuthn platform authenticator, so the punch pad
  would fall back to press-and-hold. `BioShim` supplies one: the app's own
  `navigator.credentials` calls are answered by Android's `BiometricPrompt`.
  The app source is unmodified and does not know it is in an APK. The
  guarantee is the same — the phone verified its holder, locally, and nothing
  left the device — but the mechanism is Android's, not WebAuthn's. Nothing is
  signed either way, because there is no server; that is the app's design.
- The APK holds **no INTERNET permission**, and cloud backup and device
  transfer are both switched off in the manifest. The 백업 export is the only
  way data leaves the phone, and the worker picks where it goes.
- Debug-signed with `~/.android/debug.keystore`. Fine for sideloading and
  testing; the Play Store needs a release build signed with your own upload
  key — `./build_apk.sh bundle`, described below.

Records made in this APK are stored under the APK's own WebView origin. They
are **not** shared with the hosted site — a TWA would share them, a WebView
APK does not. Treat the two as separate installs.

### Putting it on a phone over USB

```sh
adb devices                            # must print "device"
adb install -r worklog-debug.apk       # -r upgrades in place
```

`-r` is the part that matters: it reinstalls over the existing app instead of
replacing it, so the WebView's localStorage — the worker's entire record — comes
through. Never uninstall first to "get a clean install"; that erases the data the
app exists to hold. Both variants share `applicationId app.worklog.punch`, so a v2
install upgrades a v1 one the same way.

If `adb devices` says **`unauthorized`**, the phone has not been told to trust this
computer. Unlock it and accept the "Allow USB debugging?" dialog (tick "Always allow"
so it stops asking). If no dialog appears, `adb kill-server && adb start-server` will
raise it again. `offline` usually means replugging the cable is enough. `adb` ships
at `~/Library/Android/sdk/platform-tools/adb` if it is not on PATH.

The debug keystore is per-machine. An APK built on a different computer is signed by
a different key and Android will refuse to upgrade over it — that install needs the
app removed first, which loses the records, so build and install from one machine.

**Confirm the phone is running what you just installed.** A successful `adb install`
only means the new assets are on disk; the service worker decides what the WebView
actually loads. Until 2026-08-13 it served the previous build on the first launch after
an update (see `V2.md` §6c). The check is one line — attach to the debug WebView and
ask the app what it has:

```sh
adb forward tcp:9333 localabstract:webview_devtools_remote_$(adb shell pidof app.worklog.punch)
curl -s http://127.0.0.1:9333/json/list        # gives you the WebSocket URL
```

then evaluate something only the new build has, e.g. a method on
`window.__dcRegistry.WorkLogApp.Logic.prototype` or a key in `Logic.STR`.

## Releasing to the Play Store

The APK route above is a real, shippable app — it does not need hosting, a URL,
or the TWA described further down. What it needs is a version number and your
own signing key.

### 1. Bump the version

```sh
./bump_version.sh --show     # what it is now
./bump_version.sh minor      # versionCode +1, 1.0 -> 1.1
```

`versionCode` is the only number the store orders releases by, and **it can
never be reused or reduced** — once a code is uploaded it is spent, even if you
delete the draft. `versionName` is the string a worker sees and means nothing to
that ordering. The script touches `android/app/build.gradle` and nothing else;
in particular it does not touch the 근무내역서's `작성 도구` line, which is a
separate decision.

### 2. Make the upload key — once, and back it up

```sh
keytool -genkeypair -v -keystore ~/worklog-upload.jks \
  -alias worklog -keyalg RSA -keysize 4096 -validity 10000

cp android/keystore.properties.example android/keystore.properties
# then edit it to point at the .jks and hold the two passwords
```

`keystore.properties` and every `*.jks` are gitignored, and must stay that way.

**Back the key up somewhere that is not this laptop, before you ship anything.**
Play signs the delivered app with a key Google holds, but every update you
upload must be signed with *this* key. Lose it and you cannot update the app the
workers already have — they would have to uninstall, which **destroys their
records**, and install a fresh listing. There is no recovery process.

A CI machine can supply the same four values as `WORKLOG_STORE_FILE`,
`WORKLOG_STORE_PASSWORD`, `WORKLOG_KEY_ALIAS`, `WORKLOG_KEY_PASSWORD` instead of
a file.

### 3. Build the bundle

```sh
./build_apk.sh bundle     # -> worklog-release.aab
```

With no key configured this still builds, unsigned, and says so — an unsigned
artifact cannot be uploaded. With a key it prints the signing certificate.

Release builds differ from the debug ones in one way worth knowing: **they are
not debuggable**, so the `webview_devtools_remote` CDP trick in `CLAUDE.md` does
not work against them. Verify behaviour on a debug build; use the release build
to check it starts, punches, and exports.

### R8 is off, deliberately

`classes.dex` is about 2.7 MB — larger than the app itself (~1.2 MB of assets) —
because androidx's biometric, fragment and activity libraries come along.
Turning R8 on would cut a lot of that.

It is off anyway, because everything Java does here is reached **by name**:
WebView looks up `@JavascriptInterface` methods from a string, and
`BioShim`/`FileShim` call `window.WorkLogNative.<name>`. If R8 renames one of
them the punch pad falls back to press-and-hold and the worker just experiences
"the fingerprint stopped working". There are no tests over the Java — the 1296
assertions are all on the web app — so nothing would catch it.

`android/app/proguard-rules.pro` already holds the keep rules. To turn it on,
set `minifyEnabled true` (and optionally `shrinkResources true`) in the release
buildType, then **verify on a real phone by hand**: fingerprint punch in and
out, 백업 내보내기, and 백업 불러오기.

### Before the first upload

- Data safety form: nothing is collected and nothing is shared. The missing
  `INTERNET` permission, `allowBackup=false` and `data_extraction_rules.xml` all
  back that up.
- Store listing needs a 512×512 icon and a 1024×500 feature graphic; neither is
  in this repo (`pwa/icon-512.png` is the app icon, not the listing one).
- A privacy policy URL is required even when nothing is collected.

## Wrapping the URL into an APK

Use a **Trusted Web Activity** (TWA), not a WebView wrapper. A TWA runs the page
in the user's real Chrome, so the fingerprint prompt, the service worker and
localStorage all behave exactly as they do in the browser — and the APK shares
storage with the site, so anyone who used the web version keeps their records.
A plain WebView (`android.webkit.WebView`, most "site to app" generators) does
not reliably expose the platform authenticator, and the punch pad would silently
fall back to press-and-hold.

### Option A — PWABuilder, no local toolchain

1. https://www.pwabuilder.com → paste the https URL → **Start**.
2. **Package for stores → Android → Generate**. Defaults are fine; set
   package id to something like `app.worklog.punch`.
3. Download the zip. It contains `app-release-signed.apk` (sideload this),
   `app-release-bundle.aab` (Play Store), `signing.keystore` + `signing-key-info.txt`,
   and `assetlinks.json`.
4. **Keep the keystore.** Without it you can never ship an update to the same
   app id.

### Option B — Bubblewrap, local

```
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://<your-host>/manifest.webmanifest
bubblewrap build          # → app-release-signed.apk
```

`bubblewrap init` asks for a signing key; let it generate one and keep the
`.keystore` file safe.

### Removing the URL bar (both options)

A TWA shows a Chrome address bar until the site proves it owns the app. Take the
`assetlinks.json` the tool produced and host it at:

```
https://<your-host>/.well-known/assetlinks.json
```

Netlify/Cloudflare/Vercel serve `dist/.well-known/` as-is — put the file there
and re-deploy. Reinstall the APK; the bar disappears. Without this the app still
works, it just looks like a browser.

### Sideloading

`app-release-signed.apk` installs directly: send it over KakaoTalk, USB or a
download link. The phone will ask the user to allow installing from that source.
No Play Store account and no developer fee involved.

## What did not change

The wage engine is untouched — `calc()`, `snapIn()`, `snapOut()`, `detectShift()`,
`period()`, `legalGap()` and every rate are byte-for-byte the handoff versions.
The only edits to `WorkLogApp.dc.html` are the punch pad's gesture and the copy
on the pad itself.

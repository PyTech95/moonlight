# Moonlight Neurocare Android app

One app for everyone: parents, therapists, school staff and the center admin each sign in with their own
account, exactly as on the website. Built with [Capacitor](https://capacitorjs.com) 8.

## How it works

The app is a native Android shell around the live portal. It opens `https://moonlightneurocare.com/login`
(the "app URL") in a full-screen WebView, so every change deployed to the website shows in the app at once,
with no app update needed.

| Behaviour | Detail |
| --- | --- |
| Sign-in | Same accounts, cookies and 2-step sign-in as the website |
| Identifies itself | The WebView user agent ends with `MoonlightApp/1.0`, so the website can tell it is running in the app |
| Links | `moonlightneurocare.com` and `www.` stay in the app. Every other site (payment links, WhatsApp, Google Maps), and `tel:` / `mailto:` links, open in the phone's own apps |
| Back button | Goes back inside the portal; closes the app from the first page |
| Photos and videos | `<input type="file">` offers camera and gallery; in-app video recording asks for camera and microphone permission when first used |
| Downloads | Files the portal serves as downloads (PDFs, attachments) are saved to Downloads with the signed-in session |
| No connection | A branded "Can't connect right now" page (`www/error.html`) with a Try again button |
| Status bar | Deep teal (`#123f46`) strip with light icons; the page sits below it |

## Build a new APK

Everything builds on GitHub Actions (`.github/workflows/android.yml`); no Android Studio needed.

- **From the Actions tab:** Android app → Run workflow. Optionally enter a different app URL (e.g. a staging
  server). The signed APK and AAB appear under Releases as `app-build-<number>`.
- **With a tag:** `git tag app-v1.0.1 && git push origin app-v1.0.1`.

Each run gets version `1.0.<run number>` with a matching, always-increasing version code.

The workflow signs with four repository secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. The keystore itself is never committed.

## Build locally (optional)

Needs Node 22, JDK 21 and the Android SDK (Android Studio).

```bash
cd mobile
npm ci
APP_URL=https://moonlightneurocare.com/login npm run sync   # writes capacitor.config.json, copies into android/
npx cap open android                                        # build or run from Android Studio
```

`npm run assets` regenerates icons and splash screens from `assets/` (logo on deep teal).

## Change the URL the app opens

Set `APP_URL` (workflow input, or environment variable for `npm run sync`). It must be `https://`. The app's
host and its `www.` twin stay inside the app; everything else opens outside.

## Google Play

- Upload the **AAB** from a release. Use Play App Signing; the key in this repo's secrets is the **upload key**.
  Keep the keystore and its password safe: every future update must be signed with the same upload key
  (Google can reset a lost upload key, but it takes days).
- Play reviews apps that mainly show a website under its "minimum functionality" policy. What helps: the
  app-only features the portal already has (sign-in for each role, camera uploads, in-app video recording,
  downloads), a clear store listing for existing families and staff, and, next, push notifications for session
  reminders and messages (needs a Firebase project and `google-services.json`).
- Store listing needs: privacy policy URL (`https://moonlightneurocare.com/policies/privacy`), data-safety form
  (accounts, child records, photos/videos), a test account for the reviewer, screenshots, 512 px icon
  (`assets/icon-only.png` resized).

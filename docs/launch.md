# Launch checklist

Three places to launch, in this order: the web (needed by the other two, because the store listings and the apps point to it), then the App Store and Google Play.

`npm run check:launch` lists any placeholders still left in the code.

## What's already done in this repo
- Web app with a production server (`server/node.ts`): serves the app and `/api/timestamp`, with security headers, a per-device and a total rate limit, and a health check at `/api/health`.
- `Dockerfile` for Dokploy (or any Docker host), and `functions/api/timestamp.ts` + `public/_headers` if you choose Cloudflare Pages instead.
- Privacy policy (`/privacy`) and help page (`/support`), linked from the app.
- iOS and Android projects (Capacitor 8) in `ios/` and `android/`: app id `us.varuntx.depositkit`, camera and photo-library permission text, iPhone-only, Android target API 36, icons and splash screens, native "save and share" for the PDF and zip.
- Store icon and feature graphic in `store/`, listing text and privacy answers in `store/listing.md`.

## 1. Decisions and details only you can provide
- [ ] **Support email** for the privacy and help pages and both store listings. Replace `CONTACT_EMAIL` in `public/privacy.html` and `public/support.html`.
- [ ] **Domain**, for example `depositkit.app` or a subdomain of a domain you own. Then set `VITE_TIMESTAMP_URL=https://<domain>/api/timestamp` in `.env.native`.
- [ ] **Hosting**: Dokploy (Docker) or Cloudflare Pages.
- [ ] **App id**: `us.varuntx.depositkit` is set in `capacitor.config.ts`, `android/app/build.gradle` and the Xcode project. It can't change after the first upload, so change it now if you want a different one.
- [ ] **Name check**: search "Deposit Kit" in both stores and a trademark search (USPTO) before paying for anything.
- [ ] **FreeTSA terms**: read freetsa.org's terms of use for this kind of use.

## 2. Accounts and money (only you can do these)
- [ ] **Apple Developer Program**: $99 a year. Enroll as an individual (fast) or an organization (needs a D-U-N-S number).
- [ ] **Google Play Console**: $25 once. Important: new *personal* developer accounts must run a **closed test with at least 12 testers for 14 days** before they can publish to everyone. Organization accounts are exempt. Plan around this; it's the longest wait in the whole launch.

## 3. Tools on this Mac
- [ ] **Xcode**: you have Xcode 26.3 in `~/Downloads`. Move it to `/Applications`, open it once, and install **iOS 26.2** under Xcode > Settings > Components (several GB). Without that component Xcode can't build for any iPhone. Then run, once:
  `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
- [ ] **Android Studio** (free; includes the Java it needs). Open `android/` once so it downloads the Android SDK.

## 4. Web launch (I can do this once you give the go-ahead and the details above)
- [ ] Deploy with Dokploy (`Dockerfile`, port 8080, env `TRUST_PROXY=1`) or Cloudflare Pages (build command `npm run build`, output `dist`).
- [ ] Check in a real browser on the live site: the app installs to the home screen, works offline, and `/privacy` and `/support` load. (The in-app test browser here doesn't support offline service workers, so this has only been tested at the code level.)
- [ ] Optional: a Cloudflare rate-limiting rule for `/api/timestamp` if you use Cloudflare.

## 5. iOS (App Store)
- [ ] `npm run build:native`, then `npm run ios` to open Xcode.
- [ ] In Xcode: select your team under Signing & Capabilities (automatic signing).
- [ ] Run it on your iPhone. Check: camera, choose from photos, timestamp appears, save PDF and zip ("Save to Files"), restore from the zip.
- [ ] Take screenshots in the iPhone 17 Pro Max Simulator (6.9", 1320 x 2868). The list is in `store/listing.md`.
- [ ] App Store Connect: create the app, paste the text from `store/listing.md`, App Privacy: "Data Not Collected", age rating 4+, price free.
- [ ] Product > Archive in Xcode, upload, then submit for review with the review notes from `store/listing.md`. Review usually takes 1–3 days.

## 6. Android (Google Play)
- [ ] `npm run build:native`, then `npm run android` to open Android Studio.
- [ ] Run it on an Android phone or emulator and do the same checks as iOS. Also check that the **Back button** moves between screens.
- [ ] Build > Generate Signed App Bundle. Create an upload key and **back it up** (losing it is painful; Play App Signing keeps the real signing key).
- [ ] Play Console: create the app, paste the listing, upload `store/play-icon-512.png` and `store/play-feature-graphic-1024x500.png`, screenshots, Data safety (no data collected), content rating (Everyone), privacy policy URL.
- [ ] Closed testing track with 12+ testers for 14 days (personal accounts), then apply for production.

## Every later release
1. Bump the version: iOS `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in Xcode, Android `versionName` / `versionCode` in `android/app/build.gradle`.
2. `npm run build:native`, then archive or upload as above.
3. Web updates go live on deploy. The app shows "Deposit Kit just updated" if needed.

## Known gaps before or soon after launch
- Not yet tested on a real phone (you asked to leave this for later). Store review will exercise the camera and save flow.
- Memory with very large records (80+ photos) on older phones hasn't been measured.
- Move-out comparison, state rules, the demand letter and reminders are not built yet. v1 launches as move-in only.

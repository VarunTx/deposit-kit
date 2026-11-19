# Launch checklist (web)

Deposit Kit launches as a website that installs like an app, with no app stores and no store fees:
- **Phones:** "Add to Home Screen" (iPhone: Share > Add to Home Screen; Android: menu > Install app).
- **Computers:** Chrome and Edge show an "Install" button; Safari on Mac uses File > Add to Dock.

The app shows the right instructions for each browser. `npm run check:launch` lists any placeholders still left.

The iOS and Android store projects were removed on 2026-11-18 to keep this web-only. They're in git history at commit `52e1f00` if ever wanted (`git checkout 52e1f00 -- ios android capacitor.config.ts`).

## Already done
- Production server (`server/node.ts`): serves the app and `/api/timestamp`, with security headers, per-device and total rate limits, a health check at `/api/health`, and `/privacy` and `/support` pages.
- `Dockerfile` for Dokploy; `functions/api/timestamp.ts` and `public/_headers` if you choose Cloudflare Pages instead.
- Tested with a large record: 40 photos at about 5 MB each (199 MB) saved and timestamped in about 5 s. Building the PDF (17 MB) and zip (199 MB) took under 1 s, and restoring the full zip took under 10 s, on this Mac. Phones will be slower, and older phones haven't been tested.

## 1. Details only you can provide
- [x] **Support email**: `depositkit@varuntx.us` (Cloudflare Email Routing alias).
- [x] **Domain**: `https://depositkit.varuntx.us` (Cloudflare Tunnel to Dokploy on the home server).
- [ ] **Name check**: search for "Deposit Kit" (web, USPTO trademark search) before announcing it.
- [ ] **FreeTSA terms**: read freetsa.org's terms of use for this kind of use.

## 2. Deploy (I can do this once you say go)
Dokploy (recommended, you already run it):
- [ ] New application from this repo, build type **Dockerfile**, port **8080**.
- [ ] Environment: `TRUST_PROXY=1` (so rate limits see real visitor IPs behind Traefik).
- [ ] Domain with HTTPS (Let's Encrypt in Dokploy). HTTPS is required for photo fingerprints and for installing the app.
- [ ] Health check path: `/api/health`.

Or Cloudflare Pages: build command `npm run build`, output directory `dist`, then add a rate-limiting rule for `/api/timestamp` in the Cloudflare dashboard.

## 3. Check on the live site
- [ ] Desktop Chrome or Edge: install the app, open it from the dock or Start menu, and do a short move-in (drag photos into a room, save the PDF and zip).
- [ ] Safari on Mac: File > Add to Dock works.
- [ ] Turn off Wi-Fi after the first visit: the app still opens, and photos are saved and marked "waiting for a timestamp" until you're back online. (Offline support can't be tested in the in-app test browser, so this is its first real check.)
- [ ] `/privacy` and `/support` load.
- [ ] Phone (whenever you get to it): Add to Home Screen, take photos with the camera, save to Files, restore from the zip.

## Every later release
Deploy again. Open copies of the app pick up the update on their next load; if someone is mid-save at that moment, the app shows "Deposit Kit just updated. Reload".

## Not built yet
Move-out comparison, state rules, the demand letter and reminders (see `docs/spec.md`). v1 launches as move-in only.

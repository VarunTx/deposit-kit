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

## 2. Deploy (done 2026-11-18)
Live at **https://depositkit.varuntx.us**, set up like the portfolio:
- [x] GitHub: public repo `VarunTx/deposit-kit`. The Dokploy GitHub app (`Dokploy-2026-11-15-19n7uw`) has access to it.
- [x] Dokploy: project **Deposit Kit**, application **Web app** (`deposit-kit-xoe335`), GitHub source `main`, build type Dockerfile, env `TRUST_PROXY=1`, **Autodeploy on**: every push to `main` redeploys (checked: about 6 s after a push).
- [x] Domain in Dokploy: `depositkit.varuntx.us`, port 8080, HTTP (Cloudflare handles HTTPS).
- [x] Cloudflare: no change needed. The existing `*.varuntx.us` DNS record and tunnel route (tunnel "Acer" to `http://localhost:80`, Traefik) already cover it. The app itself redirects `http://` to `https://` and sends HSTS.
- [x] Email: Cloudflare Email Routing rule `depositkit@varuntx.us` to your Gmail.

## 3. Checks on the live site
- [x] Pages, security headers, 404s, `/privacy`, `/support`, `/api/health`, a real FreeTSA timestamp through `/api/timestamp`, bad input rejected, http to https redirect.
- [x] In desktop Chrome: service worker active and controlling the page; app and PDF code in the offline cache; a full move-in (home, room, photo, timestamp, PDF and zip) worked. The test data was deleted afterwards.
- [ ] Desktop Chrome or Edge: click the install icon in the address bar, open the installed app, and try it with Wi-Fi off.
- [ ] Safari on Mac: File > Add to Dock.
- [ ] Phone (whenever you get to it): Add to Home Screen, take photos with the camera, save to Files, restore from the zip.

## Every later release
Push to `main`. Dokploy rebuilds and swaps the container (the old one keeps serving until the new one passes its health check). Open copies of the app pick up the update on their next load; if someone is mid-save at that moment, the app shows "Deposit Kit just updated. Reload".

## Not built yet
Move-out comparison, state rules, the demand letter and reminders (see `docs/spec.md`). v1 launches as move-in only.

# Deposit Kit

Free web app that helps US renters prove their rental's condition at move-in and get their security deposit back at move-out. Photos stay on the user's device.

- Spec and decisions: [`docs/spec.md`](docs/spec.md)
- Develop: `npm install`, then `npm run dev` (serves the app and the timestamp endpoint together)
- Test: `npm test`
- Build: `npm run build` (strict TypeScript, output in `dist/`)
- Check a real timestamp end to end: `npm run verify:tsa` (calls FreeTSA, then runs `openssl ts -verify`)
- Production server: `npm run build`, then `node server/node.ts` (or `docker build -t deposit-kit .`)
- Launching: [`docs/launch.md`](docs/launch.md) and `npm run check:launch`

Deposit Kit provides templates and deadlines, not legal advice.

## Test on your phone

Phones only allow the camera flow and photo hashing (`crypto.subtle`) on HTTPS, so plain `http://<your-ip>` won't work.

1. Put your computer and phone on the same Wi-Fi.
2. Run `npm run dev:phone`. It makes a local self-signed certificate (in `.cert/`, git-ignored) and prints a `Network: https://192.168.x.x:5173` address.
3. Open that address on your phone. You'll see a certificate warning, which is expected for this local test:
   - iPhone (Safari): tap **Show Details**, then **visit this website**, then **Visit Website**.
   - Android (Chrome): tap **Advanced**, then **Proceed to 192.168.x.x (unsafe)**.
4. If your Mac asks whether to allow incoming connections for `node`, allow it.

`npm run preview:phone` does the same with the production build.

Installing to the home screen and working offline need a trusted certificate, so for those, use a real HTTPS address: either a tunnel (for example `npm run dev`, then `ngrok http 5173`, which makes a temporary public URL) or a deployment.

On a computer, the room screen offers **Add photos** and drag-and-drop instead of the camera button, and Chrome, Edge and Safari can install the app.

To check the PDF layout without a phone: `PDF_OUT=/tmp/sample.pdf npx vitest run test/render-pdf.test.ts`.

## Move-in evidence flow (v1)

1. The user adds their home (address label, move-in date, state), then rooms.
2. In each room they take or pick photos (`<input type="file" accept="image/*" capture="environment">`) and add an optional note.
3. For each photo the browser hashes the **original bytes** with SHA-256, keeps the original, and makes a smaller JPEG (longest side 2000px, quality 0.85) for the screen and the PDF.
4. The photo is saved to IndexedDB first, then the hash (never the photo) goes to `/api/timestamp`, which asks FreeTSA for an RFC 3161 token. If that fails, the photo stays "not yet timestamped" and is retried on "Try again", on reload, and when the device comes back online.
5. "Save my record" builds a PDF report and a zip (original photos, `.tsr` tokens, `manifest.json`, README, FreeTSA certificates). The app prompts for this after each room visit with new photos, because iOS can delete web storage after 7 days without use.
6. "I have a saved record" (intro) or "Restore from a saved file" (home) loads that zip back, for a new phone or after the phone cleared the app's data. Each photo is re-hashed and each `.tsr` token is checked against it, and the times come from the signed tokens, not from the editable manifest. A photo whose token doesn't match is kept and gets a fresh timestamp. The restore replaces the device's record in one transaction, so a bad file changes nothing.

Why the original is kept as well as the small copy: the timestamp covers the original's hash, so the original must be in the export or the proof can't be checked.

## Code map

| Path | What it does |
| --- | --- |
| `src/lib/tsp.ts` | Builds the RFC 3161 request and reads the response (DER). Shared by browser and server. |
| `src/lib/db.ts` | Small IndexedDB wrapper (properties, rooms, photos). |
| `src/lib/session.ts` | Add photo → hash → save → timestamp queue with retry. |
| `src/lib/export.ts`, `src/lib/pdf.ts` | Manifest, zip and PDF. |
| `src/lib/restore.ts` | Reads a saved zip back into records, checking hashes and tokens. |
| `server/timestamp.ts` | Web-standard `Request → Response` handler with provider fallback. |
| `server/node.ts` | Standalone Node server for it (`npm run server`, port 8787). |
| `scripts/verify-timestamp.ts` | Live FreeTSA + OpenSSL check; `RECORD_FIXTURE=1` refreshes `test/fixtures`. |

## Timestamp endpoint

`POST /api/timestamp` with `{"sha256": "<64 hex chars>"}` returns `{"provider", "tsr" (base64 TimeStampResp), "genTime", "serialNumber"}`. It accepts bodies up to 1 KB, so a photo can't be sent. Providers are tried in order: FreeTSA, then DigiCert. The server checks that each token is granted and matches the hash and nonce before returning it, and the browser checks the hash again.

To check a photo from an export:

```
openssl ts -verify -data photos/01-kitchen/01.jpg -in photos/01-kitchen/01.jpg.tsr \
  -CAfile certificates/freetsa-cacert.pem -untrusted certificates/freetsa-tsa.crt
```

## Dependencies added

- **fflate** (zip): about 8 KB, no dependencies, and its streaming API adds one photo at a time instead of holding everything twice in memory.
- **jspdf** (PDF): widely used, maintained, and works fully in the browser. It is loaded only when the user saves a report. Its optional html2canvas, DOMPurify and canvg imports are replaced with an empty module in `vite.config.ts`, since the app doesn't use them.
- **vitest**, **fake-indexeddb** (dev only): tests, including IndexedDB storage in Node.

No library is used for IndexedDB or DER: each takes under 200 lines here.

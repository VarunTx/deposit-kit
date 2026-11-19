# Deposit Kit — v1 spec

Working name; check it's free before launch. Started 2026-11-18.

## Problem

About 1 in 4 US renters say they have lost a security deposit (Rent.com survey via Baselane). In the UK, 22% report unfair deductions, but only 4% use the formal dispute process (Generation Rent). The gap is not knowledge alone. Proving the unit's condition and acting before deadlines is tedious, so most people give up.

Existing tools charge $14.99–$49.99 (TenantCircle, SecurityDepositBack) or offer generic letter templates. **Deposit Kit is free**, works on a phone, and covers the whole path: prove the condition at move-in, then claim the deposit back at move-out with the right state deadline.

## Users

US renters who are not technical, mostly on phones, moving in or out within the next few weeks.

## v1 scope

1. **Move-in evidence.** A guided walk through each room. Photos are taken in the app and labelled by room and item, and each photo's SHA-256 hash is timestamped by a public timestamp authority (RFC 3161, FreeTSA). That timestamp proves the photo existed at that time without uploading it.
2. **Evidence export.** A dated PDF report with photos, labels, hashes and timestamp receipts, plus the original photos as a zip. Saving it is a required step, not optional (see storage rules).
3. **Move-out.** The same walk-through, shown side by side with the move-in photos.
4. **Deposit rules by state.** The landlord's return deadline, whether an itemized statement is required, penalties, and the statute citation, each with a last-verified date. v1 covers only states whose rules have been checked line by line against the statute: start with CA, NY, TX, FL, IL and add more. Unverified states show "not yet covered" instead of a guess.
5. **Demand letter.** Filled from the state rules, the dates and the evidence summary. Plain English, cites the statute, ready to send (print, PDF or copy). It is generated from templates; no AI is needed.
6. **Deadline reminder.** "Your landlord must return the deposit or send an itemized list by <date>." Optional email reminders, and the user can also add the date to their calendar (.ics).

## Not in v1

Accounts, payments, landlord-side features, small-claims filing, non-US laws, and AI photo damage detection (it is risky if wrong, so it can come later as a clearly labelled hint).

AI planned for v2: reading a landlord's itemized deduction list from a photo and flagging items that are commonly normal wear and tear under the user's state rules. It always shows its source, and is evaluated on labelled examples before shipping.

## Non-negotiable rules

1. **Free to run at any scale.** Nothing per user may cost money:
   - photos stay on the user's device (and in their export);
   - the server stores no photos;
   - the core needs no AI calls;
   - hosting is static, plus one tiny endpoint.
2. **Evidence must survive.** iOS Safari deletes script-written storage after 7 days without use. Home-screen web apps reportedly have their own counter, but Apple doesn't document that. So the app treats on-device storage as a cache and the export as the record. It prompts the user to save the export after every session, and offers "Add to Home Screen".
3. **Not a lawyer.**
   - Never say "lawyer", "legal advice" or "guaranteed". The FTC fined DoNotPay $193,000 over its "robot lawyer" claims.
   - Every rule shows its statute and verified date.
   - Every letter says it is a template, not legal advice.
4. **Privacy.** No accounts and no tracking. Email is collected only for reminders, with one-click deletion. Photos are never uploaded; only their hashes are sent, to the timestamp authority.
5. **Accuracy beats coverage.** A wrong deadline harms someone, so a state goes live only after its rules are checked.

## Architecture

| Part | Choice | Cost |
| --- | --- | --- |
| App | Installable web app (PWA): Vite, Preact, TypeScript; works on phone and desktop | $0 |
| Storage | IndexedDB on the device; export to PDF and zip | $0 |
| Timestamps | FreeTSA (RFC 3161), reached through the tiny endpoint because browsers block direct calls (CORS) | $0; check FreeTSA's terms, and keep a fallback timestamp authority |
| Endpoint | One small service: timestamp proxy plus reminder scheduling | Existing Dokploy server, or a free serverless tier |
| Email | Resend free tier: 3,000 a month, 100 a day | $0 until about 100 reminders a day |
| Hosting | Same Dokploy setup as varuntx.us, or Cloudflare Pages | $0 extra |

## Success for v1

- Real people complete a move-in report and save the export.
- No evidence is lost, and support reports are taken seriously.
- At least one user reports getting deposit money back. That is the story worth telling.

## Risks

- **Getting found:** competitors already publish state-by-state guide pages that rank in search.
- **Rare use:** people move every year or two.
- **Rules change:** for example, Colorado's rules changed on 2026-01-01, so each rule needs a re-check date.
- **iOS storage:** handled by export-first design, but users who skip the export can still lose data.
- **FreeTSA availability:** it is a free service, so keep a second timestamp authority as fallback.

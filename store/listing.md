# Store listing (copy to paste)

Same text for the App Store and Google Play unless noted. Character limits are in brackets.

## Name [App Store 30, Play 30]
Deposit Kit

## Subtitle [App Store 30]
Move-in photos with timestamps

## Short description [Play 80]
Prove your rental's move-in condition with timestamped photos. Free and private.

## Keywords [App Store 100, comma-separated, no spaces needed]
security deposit,renter,tenant,move in,checklist,rental,inspection,apartment,condition,photos

## Promotional text [App Store 170]
Walk through each room, photograph what's already worn or broken, and save a dated report you can show at move-out. Free, no account, photos stay on your phone.

## Description [App Store 4000, Play 4000]
Moving into a rental? Protect your security deposit from day one.

Deposit Kit walks you through each room so you can record what was already there: the scratch on the floor, the chipped tile, the stain on the carpet. Every photo gets a signed timestamp from a public timestamp service, which shows the photo existed at that time and hasn't been changed since.

HOW IT WORKS
• Add your home and move-in date
• Go room by room: kitchen, bathroom, bedroom and more
• Take photos and add a short note to anything damaged
• Save your record: a PDF report plus a zip of the original photos and their timestamp files

PRIVATE BY DESIGN
• No account and no sign-in
• No ads, no tracking, no analytics
• Your photos stay on your device. Only a fingerprint of each photo is sent to get its timestamp, and the fingerprint can't be turned back into the photo.

YOUR RECORD, YOUR FILES
• A clear PDF report with every photo, note and timestamp, easy to print or email
• A zip with the original photos and timestamp files anyone can check
• Restore your record on a new phone from the saved zip

FREE
Deposit Kit is free, with no in-app purchases.

Deposit Kit gives you templates and deadlines, not legal advice. Check your state's law or a tenant rights group if you're unsure.

## Category
- App Store: Productivity (secondary: Lifestyle)
- Google Play: House & Home

## Age rating
- App Store: 4+ (answer "None" to every content question)
- Google Play (IARC questionnaire): Utility/Productivity app, no violence, no user-to-user interaction, no sharing of location, no purchases. Expected rating: Everyone.

## URLs (fill in the domain once hosted)
- Privacy policy: https://YOUR-DOMAIN/privacy
- Support: https://YOUR-DOMAIN/support
- Marketing (optional): https://YOUR-DOMAIN/

## Privacy answers

### App Store "App Privacy": Data Not Collected
Apple counts data as "collected" when it is sent off the device and kept longer than needed to answer the request. Deposit Kit:
- keeps photos, notes and address on the device only;
- sends a SHA-256 fingerprint of each photo to our server, which forwards it to the timestamp service and stores nothing;
- has no accounts, analytics, ads or tracking.
So "Data Not Collected" is accurate. Re-check this answer if anything starts logging fingerprints or adds analytics.

### Google Play "Data safety"
- Does your app collect or share any of the required user data types? No.
  (Photo fingerprints are processed ephemerally to get a timestamp and are not stored, which Google lets you leave out.)
- Is all data encrypted in transit? Yes (HTTPS).
- Account deletion: not applicable (no accounts).

### Export compliance (App Store)
The app only uses standard encryption (HTTPS) and hashing. `ITSAppUsesNonExemptEncryption` is already set to NO in Info.plist, so App Store Connect won't ask.

## Notes for App Review (App Store)
Deposit Kit needs no login. To try it: tap "Start my move-in record", enter any address, add a room, and take or choose a photo. Within a few seconds the photo shows "Timestamped": the app sends only the photo's SHA-256 fingerprint to our server, which gets an RFC 3161 timestamp from FreeTSA. "Save my record" creates a PDF and a zip on the device and opens the share sheet. All photo storage, PDF and zip creation happen on the device and work offline; only the timestamp step needs a connection.

## Screenshots to take (from the Simulator / emulator once builds run)
1. Intro screen ("Prove your rental's condition from day one")
2. A room with two or three photos and notes, showing "Timestamped"
3. Home screen with the progress ring and rooms
4. Save screen showing "Your record is saved"
5. A page of the PDF report

Sizes: App Store needs 6.9" iPhone screenshots (1320 x 2868). The app is iPhone-only, so no iPad screenshots are needed. Play needs at least 2 phone screenshots (any size between 320 and 3840 px per side, 9:16 works well).

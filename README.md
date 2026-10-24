# Candid Project

About Candid

Job adverts tell you what an employer wants you to hear. Candid tells you what the people who left would say if it were safe to say it.
Why it exists

In Kenya, leaving a job quietly is often the safest option. Delayed salaries, missing NSSF and SHA deductions, contracts that never arrive, and management that treats staff as disposable rarely make it into public view. Candid collects those accounts in one place so the next candidate can walk into an interview informed.
What you can do here

    Read exit stories by employer, industry or county.
    Check a company's red flags, ratings and whether people would work there again.
    See what roles actually pay, contributed by people who held them.
    Follow a company or a story and get told when something new lands.
    Message other members privately, on your own privacy terms.

Your account and privacy

    You need an account so votes and stories cannot be spammed.
    Your email and legal name are not published. Your Candid handle may appear with posts.
    Employers cannot see your account email or legal name.
    Never include your own full name, ID number, or a colleague's name in a story.

Staying signed in safely

So you are not typing a password every time, Candid keeps you signed in on your own device and instead hides the app behind your fingerprint or face after a period of inactivity. You choose how long that is in your profile settings.
How stories are screened

Every submission passes an automated screening step that looks for personal identifying details, defamatory accusations of crime stated as fact, and abuse. Borderline stories are held for review rather than published. Anything can also be reported by readers.
How company scores work

Culture scores average member ratings across five things Kenyan workers repeatedly raise: pay punctuality, statutory compliance, respect, workload, and growth. Company background summaries are AI-researched and clearly labelled — treat them as context, not verified fact.
Right of reply

Employers who believe a story is false can request a reply or a review. Stories are the personal opinions of contributors, and we correct or remove content that breaks the guidelines.
How to reach us

Contact details have not been published yet. In the meantime, report anything urgent straight from the story it concerns — reports reach the team immediately.

Mobile push notifications

Push alerts are opt-in per browser/device from Settings. They use Firebase Cloud Messaging and the existing Firestore notification inbox; message alerts remain in Messages.

Before deploying push notifications:

For presence and calls, create a Firebase Realtime Database, deploy \`database.rules.json\`, and set \`VITE_FIREBASE_DATABASE_URL\` to the database URL in Firebase Console. Set \`FIREBASE_DATABASE_URL\` in the server environment too, then rebuild and redeploy.

Call cleanup and expired-account deletion run as Netlify Scheduled Functions; Firebase Cloud Functions are not used. They run only on a published Netlify deploy. The call cleanup runs every two minutes and the account purge runs every fifteen minutes. Configure the Main App's Firebase service-account JSON (or the server-side client email/private key variables) in Netlify's runtime environment, never in a `VITE_` variable. The service account must be allowed to manage the app's Realtime Database, Firestore, and Firebase Authentication users. Netlify's Free plan has a shared monthly credit cap; reaching it pauses the site until the next billing cycle rather than charging over the cap.

Voice and video calling need a TURN relay to work reliably across mobile carriers and restrictive networks. Configure \`VITE_TURN_SERVER_URL\`, \`VITE_TURN_USERNAME\`, and \`VITE_TURN_CREDENTIAL\` with short-lived credentials from your TURN provider. The browser can only install a web app when its native install prompt is available; otherwise Candid shows platform-specific instructions.

1. In Google Cloud Console, select the same project used by the Firebase web app and enable **Firebase Cloud Messaging Registration API** under APIs & Services → Library. Current Firebase web SDKs require it.
2. In the Main App's build environment, set `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID` from that project's Firebase web app configuration.
3. In Firebase Console, open Project settings → Cloud Messaging → Web configuration and create a Web Push certificate key pair. Set its public key as `VITE_FIREBASE_VAPID_KEY` in the Main App's build environment.
4. Rebuild and deploy the Main App after changing any `VITE_` values; they are embedded in the browser bundle. Set `PUBLIC_APP_URL` to the deployed Main App origin in both app environments. The Main App also needs its Firebase service account credentials to send FCM messages.
5. Deploy the Owner Admin App with its Firebase Admin service account. Both apps and all browser configuration values must use the same Firebase project.

Members must allow notifications in their browser. On iPhone and iPad, install Candid to the Home Screen first; iOS web push is available for installed web apps. Push alerts preview the sender and message text or notification title and description. These previews may be visible on the device lock screen; members can change lock-screen preview behavior in their device settings.

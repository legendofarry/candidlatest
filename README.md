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

1. In Firebase Console, open Project settings → Cloud Messaging → Web configuration and create a Web Push certificate key pair.
2. Set the public key as `VITE_FIREBASE_VAPID_KEY` in the Main App's build environment, then rebuild and deploy the Main App.
3. Set `PUBLIC_APP_URL` to the deployed Main App origin in both app environments. The Main App also needs its existing Firebase service account credentials so it can send FCM messages.
4. Deploy the Owner Admin App with its existing Firebase Admin service account. Both apps must use the same Firebase project.

Members must allow notifications in their browser. On iPhone and iPad, install Candid to the Home Screen first; iOS web push is available for installed web apps. Push previews intentionally use generic text so private story details do not appear on a lock screen.

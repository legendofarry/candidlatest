# Fix: preview and live site show "This page didn't load"

## What is actually wrong (confirmed from the hosting logs)

Every request to the preview and live site fails with:

```text
Error: No such module "node:process"
  at @google-cloud/firestore ... firebase-admin ...
```

The app uses Google's official Firebase admin library on the server to read and write your Firestore data. That library is built for a normal computer server. The hosting where Lovable runs your app (the preview link and candidlatest.lovable.app) can't load it, so every page crashes before it shows. My test copy loaded fine because it runs on a normal computer server. Small fixes like passing your keys through can't solve this. The library has to go.

## The fix

Swap the Firebase admin library for a small built-in replacement that talks to Firebase over plain web requests. That works on this hosting. Your Firebase project, data, accounts and sign-in stay exactly the same. Nothing moves and nothing is lost.

1. **New lightweight Firestore connector.** It uses the same service-account keys already saved. It gets a Google access token by signing with the web's built-in crypto, then calls the Firestore web API.
2. **Same calling style as today.** It supports `collection / doc / get / set / update / delete / add / where / orderBy / limit`, simple batches and the 2 small transactions. That way the roughly 12 server files that read and write data need few or no changes.
3. **Sign-in check without the admin library.** Verify each user's Firebase sign-in token against Google's public keys, using a small edge-safe library (`jose`). This replaces `verifyIdToken`.
4. **Remove `firebase-admin`.** This also cuts about 5 MB from the server bundle, so first loads get faster and the preview's cold-start errors stop.
5. **Verify on the real hosting**, not only on my test copy. Build the app, then check the preview link's server logs and load Home, Companies, Salaries, a story, Sign in, and posting a comment. Then you click Publish → Update.

## Technical details

- New `src/lib/firestore-rest.server.ts`: JWT (RS256 via `crypto.subtle`, scope `datastore`) → token cached until expiry. Value encoding/decoding to/from Firestore REST `Value` types (strings, numbers, booleans, null, timestamps → ISO strings as today, arrays, maps). Queries via `:runQuery`. Batches/transactions via `:commit` (transactions use `beginTransaction` + `commit`).
- `firebase.server.ts` keeps `getFirestoreDb()` / `getFirebaseAuth()` exports but returns the REST shim and a `verifyIdToken` built on `jose` `createRemoteJWKSet` (securetoken issuer `https://securetoken.google.com/candid-431db`, audience = project id).
- Only call sites using features the shim doesn't cover get adjusted. A quick audit found no `FieldValue`/`Timestamp` imports, 1 batch and 2 transactions.
- `bun remove firebase-admin`, `bun add jose`.
- Also: rotating the Firebase key (your action) is still recommended.

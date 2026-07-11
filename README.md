# APERTURE — Firebase Auth/Firestore + Cloudflare Worker

This is the no-credit-card version. Two separate free services, each doing the
part it's actually good at:

- **Firebase (Spark plan, free, no card)** — real user accounts (Auth) and each
  user's saved "My List" (Firestore).
- **Cloudflare Workers (free, no card)** — proxies TMDB requests so your API key
  never reaches the browser.

## Honest trade-off vs. the Firebase-Functions version

The earlier version used Firebase App Check, which cryptographically verifies a
request came from your real deployed site. Cloudflare Workers on the free tier
doesn't have an equivalent, so this version relies on:
- **CORS** — browsers block cross-origin calls from other sites.
- **Best-effort rate limiting** — capped per IP, but it's in-memory per Worker
  instance, not globally enforced (see the comment in `worker/src/index.js`).

This is meaningfully weaker than App Check against a determined attacker
directly calling your Worker URL with a spoofed Origin header (trivial with curl).
It's genuinely fine against casual scraping and accidental overuse. If you want
App Check-level protection later without paying for Cloud Functions, revisit —
Cloudflare does have paid bot-management tools, or you could add basic HMAC
request signing between your frontend and Worker as a middle ground.

## What's protected, what isn't

Same as before: your TMDB key and your bill are protected. What's rendered in
the browser (posters, titles, synopses) is inherently visible to anyone visiting
the site — no frontend architecture changes that.

---

## Part 1 — Cloudflare Worker (TMDB proxy)

1. Sign up at https://dash.cloudflare.com (free, no card for Workers).
2. Install Wrangler and log in:
   ```bash
   npm install -g wrangler
   wrangler login
   ```
3. From the `worker/` folder, set your TMDB key as a secret:
   ```bash
   cd worker
   wrangler secret put TMDB_API_KEY
   ```
   Paste your TMDB API key when prompted. It's stored encrypted by Cloudflare,
   not in any file here.
4. Deploy:
   ```bash
   wrangler deploy
   ```
   This prints your Worker URL, e.g. `https://aperture-tmdb.yoursubdomain.workers.dev`.
5. Open `public/index.html` and replace `WORKER_BASE` near the top of the main
   `<script>` block with that URL.
6. Open `worker/src/index.js` and replace the placeholder entries in
   `ALLOWED_ORIGINS` with your real Firebase Hosting URL(s) (you'll get these in
   Part 2). Redeploy with `wrangler deploy` after updating.

## Part 2 — Firebase (Auth + Firestore + Hosting)

1. Go to https://console.firebase.google.com → **Add project**.
2. **Project Settings → General** → add a **Web app** → copy the `firebaseConfig`
   object into `public/index.html` (near the top of the first
   `<script type="module">` block).
3. **Build → Authentication → Get started** → enable the **Email/Password**
   sign-in provider.
4. **Build → Firestore Database → Create database** → start in production mode
   (the rules in `firestore.rules` lock it down already).
5. Install the CLI and log in:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
6. Edit `.firebaserc`, replace `YOUR-PROJECT-ID` with your real project ID.
7. Deploy hosting and Firestore rules:
   ```bash
   firebase deploy --only hosting,firestore:rules
   ```
   This prints your live URL, e.g. `https://YOUR-PROJECT-ID.web.app`.
8. Go back and make sure that URL (and the `.firebaseapp.com` variant) is in
   the Worker's `ALLOWED_ORIGINS` (Part 1, step 6), then redeploy the Worker.

## Testing it end to end

- Visit your `.web.app` URL.
- Click **Sign In** → **Create an account** → sign up with an email/password.
- Browse to any title, tap the **+** button (Add to My List).
- Go to **My List** in the nav — it should show what you saved, pulled live
  from Firestore.
- Sign out, sign back in — your list should persist (it's tied to your account,
  not the browser).

## Costs to watch

- **Firebase Auth:** free up to 50,000 monthly active users.
- **Firestore:** free tier covers 50K reads/20K writes per day — a personal
  or small-audience site won't come close.
- **Firebase Hosting:** free tier covers 360MB/day transfer.
- **Cloudflare Workers:** free tier covers 100,000 requests/day.

None of this requires a credit card on either platform.

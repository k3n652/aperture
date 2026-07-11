# APERTURE — Firebase Auth/Firestore + Cloudflare Worker

This is the no-credit-card version. Two separate free services, each doing the
part it's actually good at:

- **Firebase (Spark plan, free, no card)** — real user accounts (Auth) and each
  user's saved "My List" (Firestore).
- **Cloudflare Workers (free, no card)** — proxies TMDB requests so your API key
  never reaches the browser.

## Honest trade-off vs. the Firebase-Functions version

The earlier version used Firebase App Check tied to Cloud Functions specifically.
This version adds App Check back for **Auth and Firestore directly** (which works
fine on the free Spark plan — no Cloud Functions needed for that part) plus
**Cloudflare Turnstile** on signup. The TMDB proxy itself still relies on CORS +
best-effort rate limiting rather than App Check, since Workers on the free tier
can't verify Firebase App Check tokens without extra plumbing. Layered together,
this covers the realistic abuse paths: bots hitting Firestore/Auth directly
(App Check), scripted mass account creation (Turnstile), and casual scraping of
the TMDB proxy (CORS + rate limit).

## Part 3 — App Check (Auth + Firestore)

1. Firebase Console → **App Check** → register your web app.
2. Choose **reCAPTCHA v3** → follow the link to create a site key at
   https://www.google.com/recaptcha/admin (register your Firebase domain(s)).
3. Paste that site key into `RECAPTCHA_V3_SITE_KEY` in `public/index.html`
   (in the same `<script type="module">` block as `firebaseConfig`).
4. Deploy, open the live site, sign in/out a few times to generate traffic.
5. Back in Firebase Console → App Check → find **Authentication** and
   **Cloud Firestore** in the list → **Enforce**. Do this only after confirming
   the site still works — enforcing before the site key is wired up correctly
   will lock out real users too.

## Part 4 — Cloudflare Turnstile (bot-resistant signup)

1. Cloudflare dashboard → **Turnstile** → **Add site**. For local testing you
   can use Cloudflare's documented test keys; for production, register your
   real domain.
2. Copy the **site key** into `TURNSTILE_SITE_KEY` in `public/index.html`.
3. Copy the **secret key**, then from the `worker/` folder:
   ```bash
   wrangler secret put TURNSTILE_SECRET_KEY
   ```
4. Redeploy the Worker: `wrangler deploy`.

The widget only appears on the **Create an account** form — signing in stays
frictionless. On submit, the token is sent to your Worker's `/verify-turnstile`
route, which checks it against Cloudflare's servers before the account is created.

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

## Part 5 — Once you have a real domain

- **Route DNS through Cloudflare**, not your registrar's default nameservers
  and not Vercel. Add the domain in the Cloudflare dashboard, switch its
  nameservers to Cloudflare's, keep the proxy ("orange cloud") on. This puts
  Cloudflare in front of your *entire* site, not just the Worker — free DDoS
  protection, managed WAF rules, and:
- **Bot Fight Mode** — Cloudflare dashboard → Security → Bots → turn on. Free,
  throttles obvious bot/scraper traffic sitewide.
- **Firebase sign-up throttling** — Firebase Console → Authentication →
  Settings → cap new account creation per IP per day. One toggle, free.

## Costs to watch

- **Firebase Auth:** free up to 50,000 monthly active users.
- **Firestore:** free tier covers 50K reads/20K writes per day — a personal
  or small-audience site won't come close.
- **Firebase Hosting:** free tier covers 360MB/day transfer.
- **Cloudflare Workers:** free tier covers 100,000 requests/day.

None of this requires a credit card on either platform.

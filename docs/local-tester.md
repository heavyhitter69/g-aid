# Local desktop tester (existing Supabase account)

Use this flow to sign in to unpackaged G-AID with an **existing** Supabase user. It does not create a guest login path, deploy the website, or publish a Linux package.

## 1. Ignored environment files

Copy the tracked templates, then paste values from the Supabase dashboard (Project Settings → API). Do not paste keys into Git, chat, or the Linux pack.

```bash
cp website/.env.example website/.env.local
cp software/.env.example software/.env.local
```

In **both** `website/.env.local` and `software/.env.local` set:

- `NEXT_PUBLIC_SUPABASE_URL` — Project URL (`https://<project-ref>.supabase.co`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon / publishable key from the same project

Use the same project on both files so the website login and the desktop session share one Auth user.

Leave `GAID_DESKTOP_AUTH_STORE=memory` in `website/.env.local`. That keeps one-time PKCE codes in the local website process. It is for this local tester only. Do not use `memory` on a deployed website.

Do **not** put any of these in Git, `software/.env.local`, or a Linux package:

- `SUPABASE_SERVICE_ROLE_KEY` / `sb_secret_…`
- `DESKTOP_AUTH_TOKEN_KEY`
- account password
- refresh tokens
- database passwords

`.env.local` is gitignored. `.env.example` is tracked and must stay empty of real keys.

## 2. Supabase URL allowlist (local only)

In Auth → URL configuration, for this tester only:

- Site URL: `http://127.0.0.1:3000`
- Additional Redirect URLs: `http://127.0.0.1:3000`, `http://127.0.0.1:3000/auth/desktop`, `http://127.0.0.1:3000/auth/desktop/confirm`, `http://127.0.0.1:3000/auth/desktop/done`, `http://127.0.0.1:3000/signin`, `http://127.0.0.1:3000/signup`

The desktop callbacks `gaid://auth/callback` (packaged) and `http://127.0.0.1:<port>/auth/callback` (unpackaged Electron) are enforced by G-AID, not as Supabase OAuth redirects for email/password sign-in.

## 3. Run the website and desktop

From the repo root, after `npm install`:

```bash
npm run dev:website
```

The public website must be at `http://127.0.0.1:3000`.

In a second terminal, point Electron at the **website**, not port 47821. Unpackaged Electron starts its own software Next server; do not also run `npm run dev:software` in parallel (it will hold the `.next` lock).

```bash
cd software
GAID_AUTH_BASE_URL=http://127.0.0.1:3000 npm run dev:electron
```

On Linux, unpackaged Electron ships `chrome-sandbox` without a root SUID bit. Chromium aborts before G-AID can disable the sandbox from JavaScript. `dev:electron` therefore passes `--no-sandbox`, matching `launch-g-aid.sh`. If you are still on an older checkout, run:

```bash
cd software
GAID_AUTH_BASE_URL=http://127.0.0.1:3000 npm run dev:electron -- --no-sandbox
```

Do not `chown`/`chmod` `node_modules/electron/dist/chrome-sandbox` for this tester. Leave `dev:website` running in the other terminal.

## 4. Sign in with the existing account

1. In G-AID, open Log In (not a guest/continue path).
2. The default browser should open `http://127.0.0.1:3000/auth/desktop?client_id=gaid-desktop&…`.
3. Sign in with the existing email and password for that Supabase project.
4. Confirm **Sign in to G-AID desktop**.
5. The browser should hit a loopback callback such as `http://127.0.0.1:<port>/auth/callback?code=…&state=…` (authorization code only).
6. Return to G-AID. The workspace at `/workspace` should be authenticated.

## 5. Success vs failure

**Success**

- Website shows the desktop login form (not “Desktop sign-in is not configured”).
- Electron does not stay on “Online sign-in is not configured yet”.
- Callback URL has `code` and `state` only — never `access_token`, `refresh_token`, or `id_token`.
- After confirm, the desktop workspace opens and the session user is the existing account.
- You can Open folder on a local survey directory.

**Failure**

| Symptom | Likely cause |
| --- | --- |
| Website: “Desktop sign-in is not configured” / “Sign-in is not available” | `website/.env.local` missing, still placeholder, or Next was started before the file was saved |
| Electron: “Online sign-in is not configured yet” | `GAID_AUTH_BASE_URL` unset, or not `http://127.0.0.1:3000` |
| `authentication_unconfigured` / `desktop_auth_unconfigured` | Website env incomplete, or `GAID_DESKTOP_AUTH_STORE` not `memory` without a service-role store |
| Browser opens port 47821 | Auth base pointed at the software Next server |
| Sign-in rejected | Wrong project, wrong password, or unconfirmed user |
| Callback contains tokens | Stop; that is not this PKCE flow |
| Workspace still redirects to `/signin` | Desktop did not receive or apply the session (software env still placeholder, or token exchange failed) |
| `chrome-sandbox` / SUID / SIGTRAP on Linux | Chromium sandbox helper is not root-owned. Use `dev:electron` from this branch, or pass `-- --no-sandbox` |

Restart `dev:website` and `dev:electron` after changing `.env.local`. `NEXT_PUBLIC_*` values are read at process start.

## 6. Out of scope

Do not download Ollama models, build `dist:linux`, deploy the website, or set a production `GAID_AUTH_BASE_URL` as part of this tester.

# G-AID

Local Electron desktop workspace for geophysical survey files, plus a truthful public website.

This repository is split:

- `website/` — public site, docs, legal, download status, and public authentication UI
- `software/` — Electron, workspace UI, catalog/DAG, Python kernels, tests, fixtures, and packaging
- `packages/branding` — product name and logo assets
- `packages/auth-contract` — client-safe desktop PKCE contract (no server secrets)

## Run separately

Install once from the repo root:

```bash
npm install
```

Public website (http://127.0.0.1:3000):

```bash
npm run dev:website
```

Desktop workspace Next server (http://127.0.0.1:47821):

```bash
npm run dev:software
```

Electron shell (run from `software/` after the software Next server is up, or use):

```bash
npm run dev:electron
```

Electron does not treat the software Next origin as an auth base. Packaged and unpackaged online sign-in stay fail-closed until `GAID_AUTH_BASE_URL` is set. For a local full-stack check with an existing Supabase account, see [docs/local-tester.md](docs/local-tester.md). Copy `website/.env.example` and `software/.env.example` to ignored `.env.local` files, then:

```bash
GAID_AUTH_BASE_URL=http://127.0.0.1:3000 npm run dev:electron
```

## Test and build

```bash
npm test
npm run build:website
npm run build:software
npm run test:python
```

## Desktop online sign-in

Packaged and production desktop sign-in stay **fail-closed**. `GAID_AUTH_BASE_URL` is required and unset until a public domain and production services exist. The app shows “online sign-in is not configured yet”.

Do not put service-role keys, encryption keys, passwords, or refresh tokens in Git or the Linux package. Do not deploy the website, publish installers, or configure production Supabase from this split.

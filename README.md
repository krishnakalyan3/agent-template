# Agent Workshop

A small NVIDIA-inspired workshop app for building agent templates. Attendees fill out an editable soul, personality, skills, and extra instructions; facilitators collect and compare the ingredients before running their demo.

## Run locally

Requires **Node.js 24 or later** (SQLite uses Node's built-in `node:sqlite`).

```sh
npm ci
cp .env.example .env
npm run dev
```

Open **http://localhost:5173**. Share `/` with attendees; `/admin` is the facilitator view. On first startup, if `ADMIN_PASSWORD` is not configured, a random password is written to **data/admin-password.txt**. Set `ADMIN_PASSWORD` in `.env` before hosting a public workshop.

## What it does

- Explains soul and personality with three editable starter examples each.
- Generates an editable random agent name and previews changes live.
- Offers six skills, custom skills, and additional instructions.
- Saves templates to SQLite and returns a private link for future edits.
- Optionally sends a plain-text template and edit link by email, with explicit attendee opt-in.
- Protects the admin collection with password login and an HttpOnly session cookie.
- Lets admins search, inspect, copy, download, and compare templates with a labeled workshop reference.
- Exports the full template or individual soul, personality, and skills sections as Markdown.

The app stores agent ingredients. It does not install tools or execute OpenClaw or Hermes agents. Paste the exported ingredients into the agent configuration used by your demo, adapting filenames and settings for that setup.

## Email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and `PUBLIC_URL`. Set `SMTP_USER` and `SMTP_PASSWORD` if the server requires authentication. Port 465 uses implicit TLS; other ports support SMTP STARTTLS when advertised by the server. Email is disabled in the attendee form until the required settings exist. Delivery failure never discards a saved template; the attendee sees a message asking them to keep their edit link. No live emails are sent by the test suite.

`PUBLIC_URL` should be your externally accessible URL, for example `https://workshop.example.org`. Use HTTPS when shared publicly. Admin cookies are marked Secure when `PUBLIC_URL` begins with `https:`. Sessions last eight hours and are invalidated when the server restarts.

An attendee email is optional and visible only in the admin view and private edit view. Anyone holding an edit link can view and change that template, including its email. Tokens are random and stored as hashes, never listed in the admin API. Keep edit links private.

## Production

```sh
npm run build
npm start
```

The Node server serves the built frontend and API on **port 3001**, configurable with `PORT`. Run one instance with a persistent disk. SQLite defaults to `data/templates.sqlite`; set `DATABASE_PATH` to use another location. Back up that database using SQLite backup tools. Ephemeral serverless filesystems will lose data, so use a server or container with persistent storage.

A Dockerfile is included. Mount `/app/data` as a persistent volume and supply environment variables:

```sh
docker build -t agent-workshop .
docker run --env-file .env -p 3001:3001 -v agent-workshop-data:/app/data agent-workshop
```

## Checks

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

API tests exercise authentication, validation, hashed edit tokens, SQLite persistence, editing, and rate limits. DOM tests exercise the attendee and admin interactions. Browser tests cover submission, download, editing, admin login, search, comparison, exports, required fields, invalid links, and viewport overflow on desktop and mobile. GitHub Actions runs all checks and retains browser screenshots/traces.

The requested `Leonxlnx/taste-skill` bundle is installed under `.agents/skills`, with its source tracked in `skills-lock.json`. This app applies its restrained layout, typography, form, and interaction guidance to an NVIDIA-inspired product interface.

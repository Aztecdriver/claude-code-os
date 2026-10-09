# Steady

A small iPhone web app for keeping screen time and your day in check. Add it to your home screen and it runs full-screen and offline, like a regular app.

It has four tabs:

- **Today**: one intention for the day, a time-blocked plan (the block you're in shows at the top of every screen), and a short task list.
- **Focus**: a Pomodoro timer (25/5 by default) that starts from any task, logs your sessions and keeps a daily streak. It keeps the screen awake while it runs.
- **Limits**: a checklist that sets up Apple's Screen Time so you can't quietly switch it off, plus a daily budget for total screen time and for each app you name.
- **Review**: a two-minute evening check-in. Copy your numbers from Screen Time, rate the day and pick one change for tomorrow (that change becomes tomorrow's intention). It also shows 7-day charts of screen time against your goal and of time spent focused.

## What it can't do

iOS doesn't let a web app see or block other apps. Only Screen Time can, and the Limits tab is there to set it up properly. The step that matters most is having someone else set your Screen Time passcode. A web app also can't alert you in the background, so keep Steady open during a focus session.

Data lives only on your phone, in the app's local storage. Use **Review → Export backup** now and then.

## Getting it on your phone

The app is static files (`index.html`, `app.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icons/`) with no build step. It needs to be served over HTTPS.

**GitHub Pages** (the workflow is already in `.github/workflows/pages.yml`):

1. GitHub Pages is free for public repos. Private repos need GitHub Pro. The code holds nothing personal, because your data never leaves your phone.
2. Repo → Settings → Pages → Source: **GitHub Actions**.
3. Merge to `main`. The workflow deploys to `https://<username>.github.io/claude-code-os/`.

**Without GitHub Pages**: drag the folder onto [Netlify Drop](https://app.netlify.com/drop) to get an HTTPS link in under a minute.

Then on your iPhone: open the link in Safari → Share → **Add to Home Screen**.

## Running locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. When you ship changes, bump `CACHE` in `sw.js` so installed copies pick them up.

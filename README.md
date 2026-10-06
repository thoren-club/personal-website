# Gleb Zyablov — portfolio

Interactive portfolio with rotating rings, depth travel, camera zoom, selective motion blur, a permanent white vignette, font shuffle on entrance, and greetings in the browser title on 20 languages.

## Production

Requires Node.js, with no npm dependencies. Run `npm start` (or `node index.js`). The server listens on `PORT`, default 3000, and serves only `dist/`. This is the Ohoster entry point. All artwork previews, full images, SVG icons and Inter font files are included locally.

## Local image updates

`Start Gallery.cmd` starts the live gallery on 127.0.0.1:8787. Put PNG/JPG/WebP/AVIF/TIFF files into `images/` inside this repository. The parser creates optimized WebP images and refreshes the open page. Originals are not committed. This optional parser requires `sharp` (the configured Codex runtime is supported on Windows; otherwise install sharp locally with npm). Production serves the prepared snapshot and does not need sharp.

## Controls

Scroll or swipe to travel in either direction. Click a card to approach it. Escape or the Close button returns to the rings. Header and contact elements stay fixed. Social profiles use thorenclub.

Deploy only when the user explicitly asks to push/deploy, as described in AGENTS.md. Webhook credentials must never be stored in the repository.

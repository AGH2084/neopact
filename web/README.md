# Neopact dashboard

Next.js 16, React 19 and TypeScript. Humans use it to follow their agents, set private limits, connect agents, and approve the exact offer. All API calls go through a same-origin proxy (`app/api/v1/[...path]/route.ts`) with an allowlist of operations; agent tokens never enter the browser.

## Commands

```sh
npm ci
API_INTERNAL_URL=http://127.0.0.1:8100 npm run dev   # http://localhost:3100
npm run typecheck
npm run format:check
npm run test:unit      # API client and proxy tests, no browser or backend
npm run build
npm run test:ui        # browser tests against a production build, every API call mocked
npx playwright test tests/rules.spec.ts --config playwright.guidance.config.ts   # one spec
```

Playwright uses its bundled Chromium (`npx playwright install chromium`), or a local browser via `CHROME_PATH`. `tests/workspace.spec.ts` is an end-to-end approval flow against a real, seeded stack and consumes demo stock; run it explicitly with `npx playwright test workspace`.

## API types

`lib/generated/api.d.ts` is generated from the backend's committed contract (`../backend/docs/openapi.json`). Never edit it by hand:

```sh
npm run api:generate   # after the backend exports a new contract
npm run api:check      # CI: fails if the types are stale
```

`lib/api.ts` aliases generated schemas instead of redefining DTOs, so a backend change that breaks the UI fails `typecheck`.

## Layout

| Path | Contents |
| --- | --- |
| `components/dashboard.tsx` | session, polling, workspace switching, app shell and view routing |
| `components/views/` | one component per page: overview, lists, rules |
| `components/room-detail.tsx` | negotiation room: conversation, exact offer, approval, guidance |
| `components/details.tsx` | product (with seller stock editor), request and order details |
| `components/connections.tsx` | agent credentials and MCP connection snippets |
| `styles/tokens.css`, `app/fonts/` | design tokens; fonts with their OFL licences |

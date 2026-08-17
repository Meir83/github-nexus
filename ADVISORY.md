# AI Discovery Hub — Technical Advisory

_Prepared 2026-08-17. Advisory only: no project code was changed to produce this._

---

## 1. Where the project stands

**What exists and works.** A zero-dependency, single-file static web app. `index-v2.html`
(1,375 lines) contains the whole V2 product: cyberpunk UI, GitHub + HuggingFace + LLM Arena
tabs, date-range picker, bookmarks in `localStorage`, three view modes, multi-language
filtering, 7-day client-side cache. GitHub Actions deploys the repo to GitHub Pages on every
push to `master`, and the last run (2026-08-16) succeeded. MIT licensed, disciplined
CHANGELOG, no dependencies, and — verified — **no secrets committed anywhere in the repo**.
For an AI-built project that is genuinely better hygiene than average.

**The finding that matters most: production is serving V1.** GitHub Pages serves
`index.html` at `/`, and `index.html` is byte-for-byte identical to `github-shop.html` — the
legacy V1 GitHub-only version. `vercel.json` rewrites `/` → `/index-v2.html`, but that file
is only read by Vercel; GitHub Pages ignores it entirely. So unless there is also a live
Vercel deployment, **every visitor to the live site sees V1**. The entire V2.0.0 release is
sitting in the repo, deployed, and unreachable.

**What's fragile or wrong.**

| Issue | Where | Severity |
|---|---|---|
| Root route serves V1, not V2 | `vercel.json` vs. GitHub Pages | **Blocking** |
| LLM Arena tab is hardcoded mock data — GPT-4, Claude 3.5 Sonnet, Gemini Pro with invented ELOs | `index-v2.html:1040-1046` | **Blocking** (public credibility) |
| XSS: API-supplied `name` / `description` / `url` interpolated raw into `innerHTML` and into an inline `onclick="window.open('${item.url}')"` | `index-v2.html:1124-1140` | **Blocking** for a public site |
| No rate-limit handling at all — zero references to 403/429 in the codebase | all three fetch functions | High |
| "Trending" is really `created:from..to` sorted by stars — newly-created repos, not repos gaining stars | `index-v2.html:~948` | Product correctness |
| `index.html` and `github-shop.html` are identical duplicates of dead V1 code | repo root | Cleanup |
| Compare button is an `alert('coming soon')` | `index-v2.html:1352-1354` | Cosmetic |
| No tests, no build, no error monitoring | — | Debt |

Two verified facts behind the numbers above: unauthenticated GitHub **search** requests are
capped at **10 requests per minute** (stricter than the familiar 60/hour primary limit), and
the mock LLM Arena data is roughly eighteen months stale — as of August 2026 the top of the
text leaderboard is around 1525 ELO, not the 1365 hardcoded in the file.

The single-file, zero-dependency architecture is a real asset, not a flaw: no supply chain
surface, no build step to rot, no `node_modules`. Do not let anyone talk you into a
framework rewrite. The debt here is concentrated in a handful of specific lines, not in the
architecture.

---

## 2. Options

### Option A — Ship what you already built, honestly

Make V2 the thing visitors actually see, and stop shipping claims the code doesn't back up.
Rename `index-v2.html` → `index.html`, delete the two dead V1 duplicates, escape HTML in
`renderCard`, and either remove the LLM Arena tab or label it "sample data" in the UI. Rename
the GitHub tab's promise from "trending" to what it actually shows ("new & rising"). Hide the
Compare placeholder. No new services, no new files.

- **Effort:** 2–3 hours.
- **Cost:** $0/month. GitHub Pages free tier is 1 GB storage / 100 GB bandwidth per month —
  a static site with client-side caching will not approach it.
- **Risks:** Still capped at 10 GitHub search req/min per visitor IP, so heavy date-range
  browsing will hit errors — mitigated by handling 403/429 with a readable message rather
  than a generic failure. Still one 1,375-line file with no tests, so the next feature is as
  hard to add as the last one.

### Option B — Give the data a real backend (a free Cloudflare Worker)

Put a ~100-line Cloudflare Worker between the app and the upstream APIs. It holds a GitHub
PAT server-side (5,000 req/hour instead of 10/min), computes actual trending by star delta,
fetches real LMArena standings from the public `lmarena-ai/lmarena-leaderboard` HuggingFace
space rather than faking them, and caches responses at the edge so every visitor shares one
upstream call instead of making their own. The frontend stays a static file on Pages.

- **Effort:** 1–2 days on top of Option A (do A first — B does not replace it).
- **Cost:** $0/month. Cloudflare Workers' free tier is 100,000 requests/day; edge caching
  means real traffic per user is a handful of requests. Optional custom domain ~$10–12/year.
  The free tier breaks only at sustained six-figure daily traffic, at which point the paid
  tier starts around $5/month.
- **Risks:** You now own a secret (the PAT) and a deployed service — meaning token rotation,
  a second deploy pipeline, and something that can be down while the site is up. Scraping a
  HuggingFace space for LMArena data is inherently brittle; it will break when they change
  their format, so it needs a graceful "leaderboard temporarily unavailable" path rather
  than silently serving stale numbers.

### Option C — Restructure before adding anything

Split the monolith into `index.html` + `css/` + `js/` modules, add Vite, add a Playwright
smoke test in CI that asserts each platform tab renders cards, then resume feature work on a
foundation that can take it.

- **Effort:** ~1 week.
- **Cost:** $0/month (GitHub Actions free tier covers the CI).
- **Risks:** This is the option that most often kills hobby projects. It produces zero
  visible improvement for a week, it reintroduces a build step and a dependency tree you
  currently don't have, and it does nothing about the fact that production is serving V1
  today. The honest version of this work is small enough to do incrementally inside Option B.

---

## 3. Gaps to PROD

**Blocking**

- [ ] `/` serves V2 — rename `index-v2.html` to `index.html` (works on Pages *and* Vercel;
      `vercel.json` then becomes deletable)
- [ ] Escape HTML in `renderCard` before interpolating API strings; drop the inline
      `onclick` in favour of an event listener reading a `data-url` attribute
- [ ] Remove or visibly label the mock LLM Arena data — publishing invented ELO scores as
      real rankings is the one thing here that could actually cost you credibility
- [ ] Handle 403/429 from the GitHub API with a message that names the rate limit
- [ ] Delete `github-shop.html` and the V1 `index.html` (git history keeps them)

**Nice-to-have**

- [ ] Rename the GitHub view to reflect what it queries (created-in-window, not trending) —
      or implement real trending, which is Option B
- [ ] Playwright smoke test in the existing Actions workflow
- [ ] "Export bookmarks to JSON" — `localStorage` is the only user data here, and it dies
      with a cleared browser cache; a one-click export *is* the backup story for this app
- [ ] Custom domain (~$10–12/yr) — HTTPS is already free and automatic on Pages
- [ ] Split CSS/JS out of the HTML file, incrementally

Not needed: server backups (no server-side data), auth (nothing to protect), staging
environment (solo project), error monitoring at this stage (a static page with no backend —
revisit if you do Option B).

---

## 4. Recommendation

**Do Option A this week. Then decide on B with a live V2 in front of you.**

The reasoning is unglamorous: you have already built V2, already paid for it, and it is
already deployed — it is simply behind the wrong filename. Three hours of work converts a
finished-but-invisible release into a live product. Every other improvement on this list is
worth less than that until it's done.

Skip Option C as a standalone phase. The restructuring is real debt, but a week of
zero-visible-progress refactoring is how projects like this quietly stop being worked on. Do
the file split incrementally during Option B, when you have a reason to be in the code
anyway.

One judgment call worth stating plainly: the mock LLM Arena data is the item I'd move first
if you only fix one thing. A stale UI is forgivable; publishing fabricated benchmark numbers
under a real leaderboard's name is the kind of thing that follows a project around.

**Next three actions:**

1. `git mv index-v2.html index.html`, delete `github-shop.html` and `vercel.json`, push —
   V2 goes live on the existing Pages pipeline in about a minute.
2. Add an `escapeHtml()` helper and route the four interpolated fields in `renderCard`
   through it; replace the inline `onclick` with a delegated listener.
3. Delete the LLM Arena tab (fastest) or gate it behind a visible "sample data" badge, and
   add the 403/429 branch to the GitHub fetch.

Say the word and I'll switch from advisor to execution mode and implement any of these.

---

**Sources consulted for the verified claims above:**
[GitHub REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api),
[GitHub unauthenticated rate limit changelog](https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/),
[lmarena-ai/lmarena-leaderboard on HuggingFace](https://huggingface.co/spaces/lmarena-ai/lmarena-leaderboard),
[HuggingFace trending models API discussion](https://discuss.huggingface.co/t/search-trending-models-in-hfapi/65398)

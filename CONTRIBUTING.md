# Contributing to Orbital Nexus

Thanks for helping out. This project follows GitHub Flow: `main` is always deployable, and every change lands through a pull request.

## Getting started

```bash
npm ci
npm run dev
```

Node.js 22 (or 20.19+) is required.

## Workflow

1. Branch off `main` with a short, descriptive name: `feat/pass-prediction`, `fix/tle-parser`, `chore/bump-three`.
2. Keep pull requests small — under ~400 lines of meaningful diff whenever possible.
3. Open the PR as a draft early so CI runs and feedback arrives sooner.
4. Describe *what* changed and *why*. Link the issue it closes.
5. Every PR needs a passing `ci` check and at least one approving review before merge.
6. Merge with **squash**; `main` keeps a linear history. Delete the branch afterwards.

## Before you push

Run the same checks CI runs:

```bash
npm run lint
npm run typecheck
npm run build
```

A red CI is not a review problem — fix it before requesting review.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add visible-pass prediction for observer location
fix: correct SGP4 epoch handling across year boundary
chore(deps): bump three to 0.185.1
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `ci`.

## Data sources

Satellite elements come from public TLE/OMM providers (CelesTrak and friends). If you add or change a data source, update `docs/SURSE-DE-DATE.md` and make sure `npm run verify:sources` still passes.

## Security

Never commit secrets, API keys, or `.env` files. Changes under `.github/workflows/` require a review from a code owner. Report anything sensitive privately instead of opening a public issue.

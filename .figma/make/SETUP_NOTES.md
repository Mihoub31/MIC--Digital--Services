# Initial import setup

- Added executable `install` and `dev` scripts and dependency-change triggers.
- Installation uses the npm lockfile and the matching headers bundled with Node
  when available, avoiding the observed node-gyp header-download assertion.
- Bootstrap preflight and installation pass.
- Development startup is blocked by the application's existing validation:
  `SESSION_SECRET` is missing or shorter than 32 characters. Set or update it
  securely in Make settings → Environment variables, then rerun
  `figma make verify-bootstrap`. No secret values are stored here.
- Installation reported seven dependency vulnerabilities: two low, four high,
  and one critical. Dependencies and lockfile were not changed; remediation
  requires a separate review.
- Deployment verification is deferred until bootstrap succeeds. This repository
  needs a custom Express runtime and SQLite storage and has no static production
  build. Confirm a supported runtime deployment approach before configuring
  publishing; do not substitute a static-only site that drops the backend.
- Once bootstrap is ready, run `figma make verify-deploy` and
  `figma make verify-deploy-preview`. For the unsupported custom runtime, follow
  the preview skill's explicit skip procedure rather than inventing an adapter.
- Application source code is unchanged.

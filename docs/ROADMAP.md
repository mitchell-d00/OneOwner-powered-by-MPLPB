# Release acceptance and deferred work

## This first product integration candidate

- [x] Separate repository and pinned immutable research-engine dependency.
- [x] Original JavaScript API calls for strict Ask, page Explore, supplied-text Import / Revise, and History.
- [x] Conservative display mapping that never upgrades non-supported reader decisions into answers.
- [x] Raw decision traces, citations and sealed hash on displayed supported answers.
- [x] Inspection-only continuity action (page and source history).
- [x] Offline-oriented packaging script for WASM/browser, Python server and CLI, with ZIP content hashes.
- [x] Local adapter kill-style tests and build checks.

## Not yet demonstrated / release blockers

- [ ] Actual full upstream test, kill-test and JS API results for the pinned commit **recorded for this OneOwner revision**.
- [ ] Actual pinned Pyodide/WASM build and test from a OneOwner candidate archive.
- [ ] Real Chromium journey exercising the **OneOwner panel** across supported, ambiguous, refusal, imported source, successor, and history cases.
- [ ] Browser persistence and offline-after-download tests of packaged OneOwner HTML, including storage failure visibility.
- [ ] Dedicated export of collection as a self-contained folder of HTML pages with seal and lineage metadata (not an ad hoc export from JavaScript storage).
- [ ] Human-scoring harness surfaced as an interface, with human ratings clearly separated from automated source checks.
- [ ] URL capture UX with explicit opt-in and accurate transport provenance; the current product panel deliberately supports **supplied text only**.
- [ ] End-to-end error/rollback evidence from a ZIP-first candidate and post-deploy smoke tests.
- [ ] Product documentation and packaged starter walkthrough verified with an unaffiliated new user.

## One-owner kill-test matrix

| Probe | Required behavior |
| --- | --- |
| Single current eligible owner with exact supported relation | `source_supported` only with original citation and hash |
| Two simultaneous eligible owners | `ambiguous` and no chosen answer |
| No eligible owner / out-of-ledger question | `refusal` and no generated answer |
| Reader returns candidate material | `candidate_only`; not supported |
| Retrieval finds a page but body lacks support | Inspection only; not supported |
| Missing citation/hash or `answer_supported:false` | Fail closed; never display text as a supported answer |
| Retired predecessor and valid successor | Original MPLPB picks successor; original predecessor stays historical |
| Damaged new revision, wrong lineage pin or retired derived basis | Original MPLPB refuses invalid ownership and maintains historical record |
| Pasted source with URL metadata | Explicit unknown authorship; never misrepresent as fetched/authenticated |
| Failed import/invalid save | Show error; no optimistic success or silent overwrite |

**Do not claim product-ready until all release blockers pass and their outputs are retained.**

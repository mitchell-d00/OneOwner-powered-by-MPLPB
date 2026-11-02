# OneOwner product implementation contract

This repository is the **OneOwner product only**. Never change or publish Combined MPLPB's own repository or research webpage as part of a OneOwner change. Both applications must have separate pages, separate GitHub Pages workflows, and no redirects between them.

Read `README.md`, `docs/ARCHITECTURE.md`, `docs/PRODUCT_SITE.md`, `docs/ROADMAP.md` and `upstream.lock.json` before implementation. Treat the upstream research engine commit and Pyodide release as immutable, read-only dependencies. If an engine feature is absent (for example genuine URL-free authoring through the browser API), do **not** fake provenance or silently implement an alternate ledger.

Core invariants: exactly one eligible current owner may produce a strict source-supported return; multiple owners are ambiguous; none is refusal. All eligibility, seals, citations, lineage, supersession and provenance are decided only by the original engine. Never replace a page; only request engine-managed successor writes. No direct file overwrite. No model-generated answer or candidate promoted to source-supported. Assisted mode is opt-in only and always `answer_supported:false`.

The page must look like a user product, not a floating panel on the original research UI. Users should see a full-page independent OneOwner workspace and visible outcomes, with detailed raw decision trace for inspection. Use `textContent` for all user data. Keep local defaults and no accidental network calls.

Every product change needs negative probes and an actual browser journey. Run the original upstream tests, ZIP-first checks, JavaScript API, real WASM, browser persistence and exact artifact verification before asserting a release. Preserve historical documents and third-party licenses. Candidate CI is separate from live deployment. Do not merge a red pipeline, and never claim unrun tests passed.

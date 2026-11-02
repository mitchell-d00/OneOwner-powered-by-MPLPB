# OneOwner

**One eligible current page owns a question: return its supported answer with evidence. Competing owners: ambiguous. No owner: refuse.**

OneOwner is a polished, offline-first evidence workspace, powered by **Combined MPLPB**. It has its **own application page and GitHub repository**, separate from the Combined MPLPB research application.

- **OneOwner product repository:** https://github.com/mitchell-d00/OneOwner-powered-by-MPLPB
- **OneOwner independent website (after successful deployment):** https://mitchell-d00.github.io/OneOwner-powered-by-MPLPB/
- **Unchanged MPLPB research application:** https://mitchell-d00.github.io/Combined-MPLPB-A-closed-local-ledger-of-pages-that-answers-only-from-those-pages/
- **Pinned engine revision:** `acf7800a5f8320ec29ee957d002eaaba8ed4e816`

The two websites do not redirect to each other and use separate GitHub Pages deployments. OneOwner's build consumes a **read-only, hash-pinned checkout** of the research engine; it **does not commit to or deploy the research repository**.

## Your OneOwner workspace

OneOwner opens as a dedicated **full-page product**, not a popup on top of the research UI. Its own navigation offers:

1. **Overview:** accessible introduction and the single-owner guarantee.
2. **Ask:** strict deterministic reader, explicit citation and sealed hash for supported responses, transparent refusal and ambiguity, full raw trace when needed.
3. **Explore pages:** source inventory, eligibility labels, and inspection-only lineage context.
4. **Add or revise:** paste source text or choose a text/Markdown/HTML file, create a collection, seal imported content, create a successor for the same source identity.
5. **History:** original retained capture and revision history.
6. **About:** clear explanation of support, hashes, provenance, and offline storage.

No independent owner-ranking or answer-generating path exists in OneOwner. The local page calls the original `window.MPLPB` JavaScript API, which runs the unchanged Python engine in the embedded WASM worker. The original UI remains part of the bundled engine but is **not shown as the OneOwner product page**.

## Importing a document like your research notes

Choose **Add or revise**, create or select a collection, supply a title and the genuine public HTTPS origin URL, and paste its text or choose a local `.txt`, `.md`, or `.html` file. Import uses `window.MPLPB.importSource` and does **not fetch the URL**. Original source authorship is marked **unknown**; the hash certifies the retained bytes, not their truth. Reimporting the same title and URL creates an engine-managed successor and retains the previous record.

**Current input limitation:** this frozen MPLPB browser API requires a real public HTTPS source URL even for supplied text. Do not invent one. Original unpublished pages with no genuine URL can be authored using the packaged existing MPLPB CLI `write` and `revise`; adding a browser-native URL-free authoring path requires a reviewed extension to the engine API and is not included here.

## Three ways to run OneOwner

After a successful OneOwner validation workflow produces `OneOwner.zip`:

| Mode | Open |
| --- | --- |
| Standalone, offline-capable browser | Extract the ZIP, open `OneOwner.html` in a supported browser; browser policies for local `file:` URLs can limit persistence |
| Local Python server | `cd desktop && python3 launch.py`, then open the localhost URL to use the OneOwner page |
| Original CLI | `cd desktop && python3 -m mplpb_answers --help` — engine command syntax is unchanged |

The standalone bundle includes the pinned Pyodide runtime, the original engine, and bundled starter research fixtures. No model provider is needed. Local collection and chat storage follows MPLPB's original browser-origin and local-save rules; avoid clearing storage without backups.

## Developer build

Build only from the reviewed commit:

```bash
git clone https://github.com/mitchell-d00/OneOwner-powered-by-MPLPB.git
git clone https://github.com/mitchell-d00/Combined-MPLPB-A-closed-local-ledger-of-pages-that-answers-only-from-those-pages.git combined-engine
git -C combined-engine checkout acf7800a5f8320ec29ee957d002eaaba8ed4e816
(cd combined-engine && python3 -m unittest discover -s tests -q)
(cd combined-engine && python3 tools/build_browser_runtime.py)
python3 scripts/build_oneowner.py --engine combined-engine \
  --standalone combined-engine/dist/MPLPB_Browser.html \
  --output dist/OneOwner.html --zip dist/OneOwner.zip
```

For full safety, use **GitHub Actions**: it confirms the pinned engine, runs the original Python, JavaScript, WASM and archive-first tests, extracts the OneOwner ZIP, runs the product's own full-page Chromium journey and retains the tested artifact. The standalone build builder requires the **unmodified upstream checkout**, and the exact validated HTML artifact is the only input to the separate OneOwner Pages deployment workflow.

Run the focused product tests:

```bash
node --check oneowner/app.js
node --check oneowner/adapter.js
node --test tests/adapter.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

## Synthetic first-time user acceptance

The exact extracted `OneOwner.html` is exercised in **real Chromium with the original embedded Python/WebAssembly engine** using `tests/synthetic_user_oneowner.py`. This is not a toy UI mock or a second answer algorithm. Four scripted personas test practical tasks: first-time orientation, a policy researcher importing and citing a policy with an exception, a policy editor creating a successor with an updated answer, and a source auditor detecting contradictory current policy claims. The script also checks refusal, explanatory next steps, unknown authorship, sealed citation/hash, stale predecessor rejection, persisted offline query, small screens, and unexpected network calls.

It records a JSON report with each check's result and optional screenshots. **Synthetic completion is a developer-authored proxy for usability, not independent human evidence or a usability score.** A user's private notes still need a genuine public HTTPS source URL for the current browser import API; that limitation remains visible in the product.

## Release status and honest boundaries

A polished UI cannot change the supported-answer grammar. An eligible retrieved page, a candidate, or a gated source is not by itself an answered question. A sealed hash proves integrity of the page as written, not author identity, accuracy, or factual truth. All unsupported states fail closed.

**Do not describe OneOwner as deployed or production-validated until the exact main-branch GitHub workflow and separate Pages deployment have succeeded.** Current acceptance and deferred items are documented in [ROADMAP](docs/ROADMAP.md), [architecture](docs/ARCHITECTURE.md) and [separate website and publishing rules](docs/PRODUCT_SITE.md).

Combined MPLPB copyright, source licenses, and the original third-party attributions remain present in the packaged `desktop/` tree.

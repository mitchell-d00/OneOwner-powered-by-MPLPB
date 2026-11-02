# OneOwner

**One eligible current page owns a question: return its supported answer with evidence. Competing owners: ambiguous. No owner: refuse.**

OneOwner is a polished, offline-first evidence workspace, powered by **Combined MPLPB**. It has its **own application page and GitHub repository**, separate from the Combined MPLPB research application.

- **OneOwner product repository:** https://github.com/mitchell-d00/OneOwner-powered-by-MPLPB
- **OneOwner independent website (after successful deployment):** https://mitchell-d00.github.io/OneOwner-powered-by-MPLPB/
- **Unchanged MPLPB research application:** https://mitchell-d00.github.io/Combined-MPLPB-A-closed-local-ledger-of-pages-that-answers-only-from-those-pages/
- **Pinned engine revision:** `acf7800a5f8320ec29ee957d002eaaba8ed4e816`

The two websites do not redirect to each other and use separate GitHub Pages deployments. OneOwner's build consumes a **read-only, hash-pinned checkout** of the research engine; it **does not commit to or deploy the research repository**.

## Your OneOwner workspace

OneOwner is the **user-friendly, offline-first product built from Combined MPLPB research**, not a new ledger. People can chat, manage notes and memories, build recipe collections, organize research, and maintain factual libraries without needing to learn hash or lineage terminology.

The product now has an independent **Chat** workspace powered directly by the pinned native `window.MPLPB.chat` API. Its purpose is comfortable everyday interaction. The native engine still decides all chat replies, saved context, support labels, topic handling, and source eligibility. OneOwner adds readable conversations, discoverable examples, follow-ups, native session resume, visible notes, explicit deletion, and verified transcript export.

Chat can help with daily tasks, help commands, remembered notes, and exploration; **a casual chat reply or saved memory is not automatically an evidence-supported answer or a sealed page**. Use **Ask · cited answers** for a deterministic answer requiring one eligible current owner and a valid citation/hash. Full native support labels and source references remain visible in chat, and raw evidence metadata is inspectable without replacing the engine's authority.

The other product views remain **Explore pages**, **Add or revise**, **History**, and **About**. Collections can hold source documents for research, recipes and reference topics. A factual database here means a searchable and revisable collection of sealed source pages, **not** an unbounded AI-generated database or a guarantee that imported information is true.

Optional Wikipedia lookup in Chat uses native MPLPB commands such as `search Cat`. The **Allow Wikipedia lookup** switch is off by default and resets after each message. Permission applies only to that one chat call. The browser API does not expose the optional general-web crawler. Unhosted local documents still require a real HTTPS source URL in the current browser import API; original CLI authoring is available in the packaged desktop tree.

All chat and collection data uses the original local persistence. OneOwner indexes recently used session IDs per collection locally; it never silently replaces source pages or confuses conversation history with ledger lineage. Exports back up **chat transcripts only**, not entire source collections. Deleting a conversation does not delete source pages. No language model is required.


## Search, link, and save snapshots

Open **Add or revise**, create or select your own collection, and use **Search Google** to discover a source. Google opens in a separate tab; OneOwner does **not** scrape Google result pages or treat search snippets as evidence. Copy the selected source webpage's real public HTTPS address, paste it into **Webpage address**, and choose **Read and save snapshot**. The product suggests a page name from the URL path; you can edit it.

The actual capture is performed by the **original Combined MPLPB `/api/source/fetch` browser bridge**, not by a OneOwner crawler or a separate ledger. That bridge performs an HTTPS browser CORS fetch, accepts HTML or plain text within the engine's limits, extracts visible text, retains the response bytes and capture metadata, and runs the original sealed source import and successor workflow. The saved snapshot contains source URL, capture/provenance metadata, pinned source bytes, and the resulting generated collection page. The engine remains responsible for eligibility and answer support.

**Important:** Browser capture does not work with every website. Google search, logins, PDFs, websites blocking cross-origin fetches, and browser policies can prevent direct capture. OneOwner must show a failed capture rather than pretend the page was read. In that case, users can paste the page's text manually and it is labeled **user-supplied**, not a verified fetch. A page hash proves integrity of what was recorded, not factual accuracy, original authorship or long-term page availability.

The optional native MPLPB Wikipedia `search` and `import` commands remain in Chat with explicit per-call network permission. The optional hosted general-web crawler in MPLPB needs a separately configured backend and access token; that hosted service has not been bundled into or claimed for OneOwner. This link-first workflow is a smaller, transparent convenience layer on MPLPB's already implemented source fetch.

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

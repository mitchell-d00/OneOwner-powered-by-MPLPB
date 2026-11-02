# Two independent pages, one immutable research engine

## Separate applications and repositories

| Product | Repository | Website |
| --- | --- | --- |
| Combined MPLPB (research) | [Combined MPLPB](https://github.com/mitchell-d00/Combined-MPLPB-A-closed-local-ledger-of-pages-that-answers-only-from-those-pages) | [Existing research website](https://mitchell-d00.github.io/Combined-MPLPB-A-closed-local-ledger-of-pages-that-answers-only-from-those-pages/) |
| OneOwner (customer product) | [OneOwner-powered-by-MPLPB](https://github.com/mitchell-d00/OneOwner-powered-by-MPLPB) | Separate site after publishing: https://mitchell-d00.github.io/OneOwner-powered-by-MPLPB/ |

**Do not edit, redeploy, rename, or redirect the research website from this repository.** OneOwner deploys only its own product page to its own GitHub Pages environment. The product uses a read-only checkout of the exact Combined MPLPB Git revision in `upstream.lock.json`.

## OneOwner page design

OneOwner has an independent full-page interface, with its own masthead, navigation, typography, palette, overview, Ask, Explore pages, Add or revise, History, and About views. It is **not a launch bubble or a floating drawer** and it does not present the MPLPB research UI as the default product experience.

The original source HTML, runtime, bridge and `window.MPLPB` API are bundled inside the generated standalone artifact to preserve its Python engine and compatible local storage. The research controls are visually hidden inside the OneOwner product artifact only; OneOwner's full-page controls call the original `window.MPLPB` methods. The original research repository and separately published page are unaffected.

Untrusted source bytes are always rendered with DOM `textContent` or as escaped JSON, never executable markup. A supported display requires the adapter's fail-closed conditions and the original sealed citation; inspection, candidate, ambiguous and refusal states never become source-supported answers.

## Publishing the distinct product website

The OneOwner validation workflow first tests its own interface and the pinned original engine, builds the WebAssembly runtime using Combined MPLPB's unchanged builder, tests the extracted release archive, and runs a Chromium OneOwner product journey. Only if **all jobs in that workflow succeed on main**, the separate `oneowner-pages.yml` workflow downloads the exact tested OneOwner HTML artifact and publishes it under the **OneOwner** repository.

GitHub Pages must be enabled in the OneOwner repository Settings > Pages with **GitHub Actions** as the source. The site must not be called live until the OneOwner deployment workflow succeeds and an independent post-deploy browser check confirms it.

A CI green check means tested candidate bytes passed. It is not automatically proof that the live deployment succeeded or that the engine's bounded reader understands arbitrary human language.

## Supplied documents

Paste a page or select a local `.txt`, `.md`, or HTML file, and provide a **genuine public HTTPS source URL** as required by the unchanged Combined MPLPB import contract. This is URL **metadata**, not a claimed fetch or authenticated authorship. The engine seals the imported content, and repeated identical title+URL submissions create successor pages, not overwrites.

For truly original or private notes with no real public HTTPS source URL, the current browser import API cannot create a standalone URL-free source page without additional reviewed engine support. **Do not invent URLs** to work around this limitation. The original Python CLI has `write` and `revise` operations for local source pages; those remain available through the packaged CLI, but are not the OneOwner browser import API.

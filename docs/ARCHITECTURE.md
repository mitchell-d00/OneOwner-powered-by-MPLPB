# OneOwner architecture boundary

The Combined MPLPB repo is the source of record; `upstream.lock.json` pins its Git commit and Pyodide core release. OneOwner never modifies it in place. Its generated HTML **adds** CSS and scripts to the official build; the underlying Python engine and page-local `window.MPLPB` API remain intact.

```text
OneOwner panel (visualization and human controls)
  -> OneOwnerAdapter (strict API invocation and conservative display mapping)
     -> window.MPLPB (original API; local, no external calls by default)
        -> original Python ledger / reader / gate / supersession
           -> sealed pages, capture manifests, pinned lineage, saved history
```

## Authority and failure handling

- `query(..., {mode:'supported'})` is the **only answer operation** used by this product layer. `return` is displayed as supported only if the original reader includes both citation and seal and does not explicitly mark `answer_supported:false`; all other cases are non-supported.
- `retrieve()` and `readPage()` are **inspection only**. The product must never show them as answers. `continueFrom` loads page content plus retained source history into an inspection panel, not into a new authority-bearing corpus or model context.
- `listPages()` is inventory only. Its eligibility flags are provided by MPLPB, not computed by OneOwner.
- `importSource()` is an explicit user action requiring caller-supplied text and a genuine public HTTPS URL. MPLPB performs the capture, sealing, lineage and successor write. OneOwner neither overwrites page files nor mutates stored hashes.
- No independent fetch, search, suggestion-answer, model provider, silent fallback, or unlabelled response path exists in the overlay. The underlying original UI has optional user-triggered network acquisition; that interface retains its own consent and labels.
- Every displayed response shows its authority status. On strict answer success, display both citation and hash, plus the full original raw response as a decision trace. For errors or missing evidence, fail closed rather than displaying a partial answer.
- Browser page text is rendered using `textContent`, never `innerHTML`, to avoid executing imported source text.

## Source retention and release

The release script refuses an altered or wrong-head Combined MPLPB Git checkout and checks that the WASM HTML input is inside that checkout. The original Combined builder verifies the pinned Pyodide core archive hash. The OneOwner ZIP contains `OneOwner.html`, an original tracked-source `desktop/` tree (with only its **packaged** `index.html` presentation copy adapted), notices, and a SHA-256 manifest. It includes hidden workflows and licenses from the source repository, but no development machine saves or untracked dependencies. On unpacking, the contained manifest must be verified and all tests rerun from extracted bytes.

Do not interpret a generated HTML SHA or verified page hash as a truth claim. Source integrity, source eligibility, semantic answer support, and factual correctness are separate questions.

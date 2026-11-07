# Hub, conversation lineage, working notes and handoffs

The **Hub** is inside OneOwner and scoped to the selected collection. It is local
workflow storage, not a second MPLPB ledger or an authentication service.

## Everyday use

Start a conversation or resume one from Hub. OneOwner assigns a local instance ID
and records references to native transcript turns alongside separately labeled
workspace activity. Native replies are reconstructed only from a successfully
verified engine transcript. AI and guided activity are unverified, including when
resumed. Provider access tokens and per-message network permissions are not saved.

Hub can keep the latest eight literal user excerpts as working notes and refresh
a handoff after completed interactions. Both switches are visible under **Local
automations** and can be disabled independently. They run during app interaction,
not on a background schedule when the app is closed. Excerpts are not inferred
facts, task completions, or a model-generated summary.

Create notes in Hub, choose note/task/decision, edit the text, mark it done or reopen
it, and delete it. In Chat, `/note TEXT`, `/task TEXT`, `/decision TEXT`, `/handoff`
and `/hub` provide direct controls. Native `remember ...` commands keep their
original engine meaning. A task's done status is a user declaration, not a verified
real-world outcome. Note text is limited to 4,000 characters.

**Export hub** downloads the local collection's workflow records. **Export handoff**
produces a working packet with the instance, parent checkpoint, recent user
excerpts, native-session references, native notes, manual notes/tasks/decisions,
and an empty permissions list. Neither export is a source collection backup or an
independently verified native transcript. Use native chat export for its verified
transcript chain. Local hub records can be edited by anyone controlling that
browser profile; they do not prove identity, authorship, authorization or truth.

## Forking and available context

**Fork with handoff** creates a distinct local instance with a parent reference and
a snapshot of its handoff. It begins with no native session, no loaded native
history and no inherited access permissions. The parent snapshot is recorded but
is not automatically supplied to MPLPB or an AI service.

**Use parent handoff in message** places an explicitly unverified excerpt in the
composer. The user must send it. A successful native send records that a handoff
excerpt was supplied; it does not assert that the full parent state was restored.
AI use remains separately opt-in. A resumed instance retains its local identity,
while the original engine verifies the native transcript that is actually loaded.
The product cannot observe a provider's hidden state, model identity, or silent
context truncation and does not claim to do so.

This applies the Mayfly paper's useful distinction between model and trajectory
without asserting that its empirical ontology hypotheses have been established.
An instance ID is not a cryptographic identity. OwnerGate integration would still
need a separately tested authorization adapter; a hub record grants no capability.

## Storage and recovery

Hub keys use `oneowner-hub-v1:<collection>`, separate from engine storage and UI
preferences. Data persists only in the same browser profile and origin. It does
not sync across devices or send handoffs to other people automatically. Export
before clearing browser data. Native sources and original transcripts remain in
the engine's own store. Removing a hub record removes its local notes; source
pages and native conversations are retained.

The hub has explicit limits of 64 instances and 1,000 manual notes per collection,
and 1,000 timeline events per instance. Product events each record one message;
a native event references a complete verified native turn. Limits fail visibly
rather than silently deleting history. The engine's independent session and turn
limits still apply. For concurrent editing use one tab per collection; the hub is
not a distributed collaboration database.

Quota failures are shown separately from native chat success. Native turns that
were saved by MPLPB but not checkpointed by the hub are recovered from verified
native history on resume. A missing referenced native turn blocks reconstruction.
Damaged JSON or unsupported hub formats are not silently replaced. Automatic
handoffs contain bounded working excerpts; the native transcript remains the
record of the full native conversation.

## Synthetic evaluation

`tests/run_hub_2000.py` runs **2,000 distinct normalized user messages** across
20 scripted personas and 100 projects. It uses 20 disclosed action templates,
recombined with domain-specific goals, audiences and constraints. Template reuse
is reported. This is not 2,000 independent users or 2,000 unique assistant replies.
The report counts assistant repetition separately.

The counted acceptance run uses the **original Python HTTP server from the exact
extracted product ZIP**, with the visible OneOwner composer and Send control.
Four isolated browser processes each execute 500 non-overlapping messages.
Of the 2,000 interactions, 1,400 invoke native MPLPB and 600 exercise local hub
note/task/decision commands. No model provider or live external site is used.
All 2,000 messages, response excerpts, instance references, timings and outcomes
are retained as JSONL with a hash recorded in the aggregate report.

Each interaction checks native-turn counts, note counts, literal excerpts and
handoff authority boundaries. Every persona verifies its native transcript chain,
exports the hub and reloads its complete mixed timeline. Separate correctness
probes test quota recovery, damaged records, missing native references, editable
notes, automation switches and explicit handoff loading. The standalone WebAssembly
runtime is tested in separate real-browser journeys on the same packaged UI.

Nonempty replies and safe refusals are not evidence of useful open-ended answers.
Response kinds, repetitions, failures and runtime are reported. Independent human
review and live provider/OwnerGate integration remain separate work.

```bash
python tests/run_hub_2000.py \
  --html extracted/desktop/index.html --desktop extracted/desktop \
  --browser-executable /path/to/chromium --output /tmp/oneowner-2000
python tests/browser_hub_negative.py --html extracted/OneOwner.html \
  --browser-executable /path/to/chromium --output /tmp/oneowner-hub-negative.json
```

Use a new output directory for each execution. Failed and incomplete runs are
retained; they are not relabeled as passed or combined into the final 2,000 count.

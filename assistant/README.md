# Optional OneOwner assistant service

Native MPLPB chat, Wikipedia search, and local drafts need no model or backend.
GitHub Pages hosts static files and cannot hold provider secrets or run this server.
This service adds optional AI brainstorming and broader web search. It has no ledger
access, source capture route, filesystem write tool, or source-support authority.

Use Python 3.12+. Configure environment variables through your deployment's secret
manager or local shell (never in repository files or browser JavaScript):

- `ONEOWNER_ALLOWED_ORIGIN`: exact OneOwner origin, for example `https://mitchell-d00.github.io` (no path or trailing slash).
- `ONEOWNER_ASSISTANT_TOKEN`: a randomly generated service access token of at least 24 characters. Visitors supply this token; it is not the provider key.
- `OPENAI_API_KEY`: server-side OpenAI credential for optional AI.
- `ONEOWNER_AI_MODEL`: a Chat Completions compatible model available to that account.
- `BRAVE_SEARCH_API_KEY`: server-side Brave Search credential for optional general-web search.

Run `python assistant/server.py --port 8787`. It binds to localhost by default.
For a public deployment, run behind an HTTPS reverse proxy using your host's secret
manager and request/body/connection limits. Forward `/brainstorm` and `/search`,
preserve the Origin header, and set a provider spending cap. The service enforces
an exact browser origin, bearer authentication, 40 KB request limit, two concurrent
provider calls, and a global 20 requests/minute cap. It does not trust forwarded
client IPs. Add individual visitor authentication and quotas at the gateway before
issuing broad public access; a shared access token is intended for controlled use.

In Chat, open **Optional AI and web search service**, enter the HTTPS
`https://your-service.example/brainstorm` URL and service access token.
Neither is saved; the token remains in memory while the chat is mounted.
For local development HTTP is permitted only on loopback. Configure the exact
local website origin; do not use `file:` origins for the service. A deployment's
Content Security Policy must permit this endpoint. The original MPLPB desktop
server restricts connections to self; use the standalone page served by a local
static server or an explicitly configured HTTPS host for optional assistance.

Checking **Use AI for this message** sends that message and at most eight previous
AI turns, each capped at 4,000 characters. Native chat, collections, and source pages
are not sent. It resets after every request, including failures. Provider retention
and billing follow the chosen provider account's policies. The service logs no
messages, access tokens, provider credentials, or provider error bodies.

Clicking **Search web · online** sends only the displayed search phrase to Brave
Search through the service. Results are discovery excerpts, not saved evidence.
**Read & save snapshot · online** invokes the original MPLPB CORS capture path.
Many sites disallow that fetch; a failure remains a failure. No search snippet is
silently imported as a source. Wikipedia result imports use the native revision-
pinned Wikipedia capture and do not need this server.

Missing provider configuration returns an unavailable error. AI and search are
separately configurable. No live-provider success is claimed by fixture tests.

AI and product discovery exchanges are retained locally by the OneOwner Hub as
unverified working activity. Native MPLPB conversations retain their verified
persistence, and hub resume resolves native replies from verified native history. Drafts are collection-scoped browser records,
not ledger pages; they can be exported, reused in a message, or deleted. They are
not included in the native transcript hash chain. Their storage never creates a
URL, evidence hash, eligibility decision, or sealed source.

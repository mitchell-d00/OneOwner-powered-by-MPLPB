/* OneOwner: presentation-only adapter for the existing MPLPB JavaScript API.
 * No independent owner selection, answer synthesis, or hash verification.
 */
(function (root, factory) {
  'use strict';
  const product = factory();
  if (typeof module === 'object' && module.exports) module.exports = product;
  else root.OneOwnerAdapter = product;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function unwrap(envelope, operation) {
    if (!envelope || envelope.ok !== true) {
      throw new Error((envelope && envelope.error) || operation + ' failed; nothing was accepted.');
    }
    return envelope.data;
  }

  function interpret(data) {
    const reader = data && data.reader;
    if (!reader || typeof reader.kind !== 'string') {
      return { status: 'refusal', authority: 'not_supported', supported: false,
        message: 'Missing reader decision. No answer can be claimed.', trace: data || null };
    }
    const kind = reader.kind;
    const evidence = typeof reader.citation === 'string' && reader.citation.trim() &&
      typeof reader.hash === 'string' && reader.hash.trim();
    const supported = kind === 'return' && reader.answer_supported !== false && Boolean(evidence);
    const status = supported ? 'supported' :
      kind === 'ambiguous' ? 'ambiguous' :
      kind === 'not_in_corpus' ? 'refusal' :
      kind === 'candidate_only' ? 'candidate_only' : 'not_supported';
    const explanations = {
      ambiguous: 'More than one eligible page may own this question. No answer selected.',
      refusal: 'No supported answer is available from the selected ledger.',
      candidate_only: 'A lexical candidate is for inspection only, not a supported answer.',
      not_supported: 'The engine did not return a complete supported answer with a citation and hash.'
    };
    return {
      status, supported, authority: supported ? 'source_supported' :
        status === 'candidate_only' ? 'candidate_only' : 'not_supported',
      message: supported ? reader.text : explanations[status],
      citation: supported ? reader.citation : null,
      hash: supported ? reader.hash : null,
      // Preserve the full engine decision and diagnostics, including excluded owners.
      trace: data
    };
  }

  function create(api) {
    if (!api || typeof api.query !== 'function' || typeof api.listCorpora !== 'function') {
      throw new Error('OneOwner requires the original window.MPLPB engine API.');
    }
    return Object.freeze({
      async ready() { return unwrap(await api.ready(), 'Engine startup'); },
      async collections() { return unwrap(await api.listCorpora(), 'Collection inventory'); },
      async ask(question, corpus, profile = 'internal') {
        if (typeof question !== 'string' || !question.trim()) throw new Error('Enter a question.');
        const data = unwrap(await api.query(question.trim(), { corpus, profile, mode: 'supported' }), 'Strict query');
        return interpret(data);
      },
      async pages(corpus, profile = 'internal') {
        const result = unwrap(await api.listPages({ corpus, profile }), 'Page inventory');
        return result.pages;
      },
      async page(path, corpus, profile = 'internal') {
        // Eligibility and path validation belong to MPLPB, never this adapter.
        return unwrap(await api.readPage(path, { corpus, profile }), 'Read page');
      },
      async history(corpus) { return unwrap(await api.getHistory({ corpus }), 'Source history'); },
      async chat(message, {corpus, profile = 'internal', session, allowNetwork = false, wiki = 'simple'} = {}) {
        if (typeof api.chat !== 'function') throw new Error('Native MPLPB chat is unavailable.');
        if (typeof message !== 'string' || !message.trim() || message.length > 4000) throw new Error('Chat message must be 1 to 4000 characters.');
        if (typeof corpus !== 'string' || !corpus.trim()) throw new Error('Choose a collection for this chat.');
        if (typeof allowNetwork !== 'boolean') throw new Error('Network permission must be an explicit boolean.');
        if (!['simple', 'english'].includes(wiki)) throw new Error('Choose Simple or English Wikipedia.');
        if (session !== undefined && (typeof session !== 'string' || !session.trim())) throw new Error('Invalid session ID.');
        const options = {corpus, profile, allowNetwork, wiki};
        if (session !== undefined) options.session = session;
        return unwrap(await api.chat(message.trim(), options), 'Native chat');
      },
      async resumeChat(session) {
        if (typeof api.resumeChat !== 'function') throw new Error('Chat resume unavailable.');
        if (typeof session !== 'string' || !session.trim()) throw new Error('Enter a session ID.');
        const data = unwrap(await api.resumeChat(session), 'Resume chat');
        if (data.chain_intact !== true) throw new Error('Chat history hash chain failed; refusing to display the transcript.');
        if (!Array.isArray(data.turns) || data.session !== session) throw new Error('Invalid saved chat transcript.');
        return data;
      },
      async exportChat(session) {
        if (typeof api.exportChat !== 'function') throw new Error('Chat export unavailable.');
        if (typeof session !== 'string' || !session.trim()) throw new Error('Enter a session ID.');
        const data = unwrap(await api.exportChat(session), 'Export chat');
        if (data.chain_intact !== true || !Array.isArray(data.turns)) throw new Error('Chat export integrity failed; refusing export.');
        return data;
      },
      async resetChat(session) {
        if (typeof api.resetChat !== 'function') throw new Error('Chat reset unavailable.');
        if (typeof session !== 'string' || !session.trim()) throw new Error('Enter a session ID.');
        return unwrap(await api.resetChat(session), 'Delete chat');
      },
      async createCollection(name) { return unwrap(await api.createCollection(name), 'Create collection'); },
      async importSource({ corpus, title, url, text }) {
        if (!corpus || !String(corpus).startsWith('mind-')) throw new Error('Select a user-created collection.');
        if (!title || !String(title).trim()) throw new Error('Enter a source title.');
        if (!/^https:\/\//i.test(url || '')) throw new Error('Enter the true public HTTPS source URL. Do not invent a URL.');
        if (!text || !String(text).trim()) throw new Error('Paste or select a source file containing text.');
        // The existing engine seals the new capture and performs any supersession.
        return unwrap(await api.importSource({ corpus, title, url, text }), 'Source import');
      },
      async continueFrom(path, corpus, profile = 'internal') {
        const source = await this.page(path, corpus, profile);
        const history = await this.history(corpus);
        return { source, history, authority: 'inspection_only', answer_supported: false,
          notice: 'Inspect the pinned source and lineage before a new question or revision. This action does not establish answer support.' };
      }
    });
  }
  return Object.freeze({ create, interpret });
});

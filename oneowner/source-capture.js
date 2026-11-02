/* OneOwner link snapshot bridge. Calls the original Combined MPLPB browser route.
 * DO NOT replace this with a fetch + homemade sealing algorithm.
 *
 * The pinned MPLPB bridge /api/source/fetch performs CORS GET, MIME/size checks,
 * source text extraction, original capture metadata, hashing and successor writes.
 * A link that does not allow browser CORS fails closed. Nothing is saved by this
 * overlay on fetch failure. This is not Google-results scraping.
 */
(function (root) {
  'use strict';
  const capture = async request => {
    if (typeof api !== 'function') throw Error('The original MPLPB browser source transport is unavailable.');
    if (!request || typeof request !== 'object') throw Error('Choose a source link.');
    const {corpus,title,url} = request;
    const payload={corpus,title,url};
    return api('/api/source/fetch', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
  };
  root.OneOwnerSourceCapture = Object.freeze({capture});
})(typeof globalThis !== 'undefined' ? globalThis : this);

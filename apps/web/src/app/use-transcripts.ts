import { useState } from 'react';

const KEY = 'speak-your-way.show-transcripts.v1';

/** A local presentation preference; hiding text never changes speech provenance or quest rules. */
export function useTranscripts() {
  const [showTranscripts, setShow] = useState(() => {
    try { return localStorage.getItem(KEY) !== 'false'; } catch { return true; }
  });
  const setShowTranscripts = (show: boolean) => {
    setShow(show);
    try { localStorage.setItem(KEY, String(show)); } catch { /* Storage is optional. */ }
  };
  return { showTranscripts, setShowTranscripts };
}

import React, { useState, useRef, useEffect, useCallback } from 'react';

// Searchable, paginated Lead picker (replaces the old native <select> of all leads).
// Loads 10 leads at a time, fetches the next 10 on scroll, and does debounced
// server-side search. It is API-agnostic: the parent passes `fetchPage({ q, offset, limit })`
// which returns an array of leads (already scope/permission-filtered on the server).
// `onSelect(lead)` fires with the chosen lead object (or null when cleared) so the form
// can autofill exactly as before. Eligibility/permission rules live on the server + parent.
const LIMIT = 10;
const labelOf = (l) => (l ? (l.name ? `${l.id} — ${l.name}` : (l.id || '')) : '');

export default function LeadPicker({ fetchPage, onSelect, placeholder = 'Select Lead ID', initialLabel = '', disabled = false, inputStyle }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [label, setLabel] = useState(initialLabel);
  const [typing, setTyping] = useState(false);
  const boxRef = useRef(null);
  const debRef = useRef(null);
  const reqRef = useRef(0);

  useEffect(() => { setLabel(initialLabel); }, [initialLabel]);

  const load = useCallback(async (q, off, append) => {
    const my = ++reqRef.current;
    setLoading(true);
    try {
      const page = await fetchPage({ q: q || '', offset: off, limit: LIMIT });
      if (my !== reqRef.current) return; // a newer request superseded this one
      const arr = Array.isArray(page) ? page : [];
      setItems((prev) => (append ? [...prev, ...arr] : arr));
      setHasMore(arr.length === LIMIT);
      setOffset(off + arr.length);
    } catch (e) {
      if (my === reqRef.current) setHasMore(false);
    } finally {
      if (my === reqRef.current) setLoading(false);
    }
  }, [fetchPage]);

  const openList = () => {
    setOpen(true); setTyping(true);
    if (items.length === 0) load(query, 0, false);
  };

  // Debounced server-side search (300ms)
  useEffect(() => {
    if (!open) return undefined;
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => { setOffset(0); load(query, 0, false); }, 300);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); setTyping(false); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const onScroll = (e) => {
    const el = e.target;
    if (!loading && hasMore && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      load(query, offset, true);
    }
  };

  const pick = (l) => { setLabel(labelOf(l)); setOpen(false); setTyping(false); setQuery(''); if (onSelect) onSelect(l); };
  const clear = () => { setLabel(''); setQuery(''); setItems([]); setOffset(0); setHasMore(true); if (onSelect) onSelect(null); };

  const baseInput = inputStyle || { width: '100%', padding: '0.7rem 0.85rem', borderRadius: 8, border: '1px solid #CBD5E1', outline: 'none', fontSize: '0.9rem', background: '#fff', color: '#0F172A', boxSizing: 'border-box' };

  return (
    <div ref={boxRef} style={{ position: 'relative', width: '100%' }}>
      <input
        style={{ ...baseInput, paddingRight: 30 }}
        disabled={disabled}
        value={typing ? query : label}
        placeholder={placeholder}
        onFocus={openList}
        onChange={(e) => { setTyping(true); setOpen(true); setQuery(e.target.value); }}
        autoComplete="off"
      />
      {!!label && !typing && !disabled && (
        <button type="button" aria-label="Clear" onMouseDown={(e) => { e.preventDefault(); clear(); }}
          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
      )}
      {open && (
        <div onScroll={onScroll}
          style={{ position: 'absolute', zIndex: 60, top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: 240, overflowY: 'auto', background: '#fff', border: '1px solid #E5E9F0', borderRadius: 8, boxShadow: '0 12px 32px -10px rgba(0,0,0,.28)' }}>
          {items.map((l) => (
            <div key={l.id || l._id}
              onMouseDown={(e) => { e.preventDefault(); pick(l); }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.88rem', color: '#1F2937', borderBottom: '1px solid #F1F5F9' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F5F9')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}>
              <span style={{ fontWeight: 700, color: '#1E3A8A' }}>{l.id}</span>{l.name ? ` — ${l.name}` : ''}{l.phone ? `  ·  ${l.phone}` : ''}
            </div>
          ))}
          {loading && <div style={{ padding: '10px 12px', fontSize: '0.82rem', color: '#64748B' }}>Loading…</div>}
          {!loading && items.length === 0 && <div style={{ padding: '10px 12px', fontSize: '0.82rem', color: '#94A3B8' }}>No leads found</div>}
          {!loading && !hasMore && items.length > 0 && <div style={{ padding: '8px 12px', fontSize: '0.72rem', color: '#CBD5E1', textAlign: 'center' }}>— end of list —</div>}
        </div>
      )}
    </div>
  );
}

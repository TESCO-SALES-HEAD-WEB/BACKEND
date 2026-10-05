import React, { useState, useRef, useEffect } from 'react';

// Manual Lead ID entry with a lightweight single-lead validation lookup.
// The user types a Lead ID (e.g. LD-0001). After a short debounce (and on blur) the
// parent-supplied `validate(id)` runs a SINGLE lead lookup — never the whole list — and
// returns { status, lead } where status is 'ok' | 'notfound' | 'noaccess' | 'error'.
//   • ok       → onResolved(lead) so the form autofills exactly as before.
//   • notfound → clear message, onResolved(null).
//   • noaccess → permission message, onResolved(null).
// The typed id is reported live via onChange(id) so the form tracks it; the parent only
// commits the real lead on a valid lookup, so existing "Lead ID required" submit guards
// keep blocking invalid / unverified ids.
const normalizeId = (s) => String(s || '').trim().toUpperCase();

export default function LeadIdInput({
  value = '', onChange, validate, onResolved,
  placeholder = 'e.g. LD-0001', disabled = false, inputStyle, required = false,
}) {
  const [text, setText] = useState(value || '');
  const [status, setStatus] = useState('idle'); // idle | checking | ok | notfound | noaccess | error
  const [leadName, setLeadName] = useState('');
  const debRef = useRef(null);
  const reqRef = useRef(0);

  // Sync when the parent changes the id externally (edit-mode load, reset-after-submit).
  // The parent mirrors the typed value back via onChange, so this never fights typing.
  useEffect(() => {
    setText(value || '');
    if (!value) { setStatus('idle'); setLeadName(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const run = async (raw) => {
    const id = normalizeId(raw);
    if (!id) { setStatus('idle'); setLeadName(''); if (onResolved) onResolved(null); return; }
    const my = ++reqRef.current;
    setStatus('checking');
    let res;
    try { res = await validate(id); } catch { res = { status: 'error' }; }
    if (my !== reqRef.current) return; // superseded by a newer lookup
    if (res && res.status === 'ok' && res.lead) {
      setStatus('ok'); setLeadName(res.lead.name || '');
      if (onResolved) onResolved(res.lead);
    } else {
      setStatus((res && res.status) || 'notfound'); setLeadName('');
      if (onResolved) onResolved(null);
    }
  };

  const handleChange = (e) => {
    const v = normalizeId(e.target.value);
    setText(v);
    if (onChange) onChange(v);
    setLeadName('');
    setStatus(v ? 'checking' : 'idle');
    if (debRef.current) clearTimeout(debRef.current);
    if (v) debRef.current = setTimeout(() => run(v), 600);
    else if (onResolved) onResolved(null);
  };

  const handleBlur = () => { if (debRef.current) clearTimeout(debRef.current); run(text); };

  const base = inputStyle || { width: '100%', padding: '0.7rem 0.85rem', borderRadius: 8, border: '1px solid #CBD5E1', outline: 'none', fontSize: '0.9rem', background: '#fff', color: '#0F172A', boxSizing: 'border-box' };
  const bc = status === 'ok' ? '#16A34A'
    : (status === 'notfound' || status === 'noaccess' || status === 'error') ? '#DC2626'
    : null;
  const style = { ...base, textTransform: 'uppercase', ...(bc ? { border: `1px solid ${bc}` } : {}) };

  const msg = {
    checking: { t: 'Checking…', c: '#64748B' },
    ok: { t: leadName ? `✓ ${leadName}` : '✓ Valid Lead ID', c: '#16A34A' },
    notfound: { t: 'Lead ID not found. Please check and try again.', c: '#DC2626' },
    noaccess: { t: 'You don’t have access to this lead.', c: '#DC2626' },
    error: { t: 'Couldn’t verify right now. Please retry.', c: '#B45309' },
  }[status];

  return (
    <div style={{ width: '100%' }}>
      <input
        type="text"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        onChange={handleChange}
        onBlur={handleBlur}
        autoComplete="off"
        spellCheck={false}
        style={style}
      />
      {msg && <div style={{ marginTop: 4, fontSize: '0.75rem', fontWeight: 600, color: msg.c }}>{msg.t}</div>}
    </div>
  );
}

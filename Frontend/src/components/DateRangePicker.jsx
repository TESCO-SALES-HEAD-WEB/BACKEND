import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Compact From / To date filter.
//   • Two small fields: "From: <date> 📅" and "To: <date> 📅".
//   • Clicking either field opens a small single-month calendar.
//   • Quick ranges (Today / Yesterday / Last 7 / Last 30 / This Month) are kept as
//     chips at the top of the calendar popover.
// The filtering contract is UNCHANGED: onApply(startDate, endDate) is still called
// with Date objects whenever the range changes (same presets/calculations as before),
// so every page that consumes this component filters exactly as it did.
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PRESETS = ['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'This Month'];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const fmt = (date) => {
  if (!date) return '—';
  return `${date.toLocaleString('en-US', { month: 'short' })} ${String(date.getDate()).padStart(2, '0')}, ${date.getFullYear()}`;
};

export default function DateRangePicker({ onApply } = {}) {
  // null | 'from' | 'to' — which field's calendar is open
  const [openField, setOpenField] = useState(null);
  const containerRef = useRef(null);

  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return startOfDay(d); });
  const [endDate, setEndDate] = useState(() => startOfDay(new Date()));
  const [viewMonth, setViewMonth] = useState(() => startOfDay(new Date()));

  // Same contract as before: emit Date objects whenever the range changes.
  useEffect(() => {
    if (typeof onApply === 'function' && startDate && endDate) onApply(startDate, endDate);
  }, [startDate, endDate]);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpenField(null); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const openCalendar = (field) => {
    setOpenField((cur) => (cur === field ? null : field));
    setViewMonth(startOfDay((field === 'to' ? endDate : startDate) || new Date()));
  };

  // Quick ranges — identical calculations to the previous version.
  const applyPreset = (preset) => {
    const today = startOfDay(new Date());
    let s = today, e = today;
    if (preset === 'Today') { s = today; e = today; }
    else if (preset === 'Yesterday') { const y = new Date(today); y.setDate(y.getDate() - 1); s = y; e = y; }
    else if (preset === 'Last 7 Days') { const a = new Date(today); a.setDate(a.getDate() - 6); s = a; e = today; }
    else if (preset === 'Last 30 Days') { const a = new Date(today); a.setDate(a.getDate() - 29); s = a; e = today; }
    else if (preset === 'This Month') { s = new Date(today.getFullYear(), today.getMonth(), 1); e = new Date(today.getFullYear(), today.getMonth() + 1, 0); }
    setStartDate(s); setEndDate(e); setOpenField(null);
  };

  const handleDayClick = (dayNum) => {
    const clicked = startOfDay(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), dayNum));
    if (openField === 'to') {
      // Picking the end date; never let it fall before the start.
      if (startDate && clicked < startDate) setStartDate(clicked);
      setEndDate(clicked);
    } else {
      // Picking the start date; never let it fall after the end.
      setStartDate(clicked);
      if (endDate && clicked > endDate) setEndDate(clicked);
    }
    setOpenField(null);
  };

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const slots = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  // ── inline styles (self-contained; avoids cross-page CSS conflicts, matches brand) ──
  const field = {
    display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.5rem 0.75rem', border: '1px solid var(--border, #E5E9F0)', borderRadius: '0.6rem',
    background: 'var(--surface, #fff)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary, #1F2937)',
    minWidth: 150, justifyContent: 'space-between', fontFamily: 'inherit',
  };
  const fieldLabel = { fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--text-muted, #94A3B8)' };
  const fieldValue = { fontWeight: 600 };
  const popover = {
    position: 'absolute', top: 'calc(100% + 6px)', zIndex: 1000,
    background: '#fff', border: '1px solid #E5E9F0', borderRadius: '0.8rem',
    boxShadow: '0 12px 32px rgba(15,23,42,0.16)', padding: '0.75rem', width: 260,
  };

  const dayCellStyle = (dayNum) => {
    const base = { height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', borderRadius: '0.45rem', cursor: 'pointer', color: '#334155', userSelect: 'none' };
    if (!dayNum) return { ...base, visibility: 'hidden', cursor: 'default' };
    const d = startOfDay(new Date(year, month, dayNum));
    const isStart = startDate && d.getTime() === startDate.getTime();
    const isEnd = endDate && d.getTime() === endDate.getTime();
    const inRange = startDate && endDate && d > startDate && d < endDate;
    if (isStart || isEnd) return { ...base, background: '#4f46e5', color: '#fff', fontWeight: 700 };
    if (inRange) return { ...base, background: '#EEF2FF', color: '#4338CA' };
    return base;
  };

  const renderCalendar = () => (
    <div style={popover} onClick={(e) => e.stopPropagation()}>
      {/* Quick ranges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.6rem' }}>
        {PRESETS.map((p) => (
          <button key={p} type="button" onClick={() => applyPreset(p)}
            style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.25rem 0.5rem', borderRadius: '999px', border: '1px solid #E5E9F0', background: '#F8FAFC', color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>
            {p}
          </button>
        ))}
      </div>
      {/* Month header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
        <button type="button" onClick={() => setViewMonth(new Date(year, month - 1, 1))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', padding: 4 }}><ChevronLeft size={16} /></button>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#111827' }}>{MONTHS[month]} {year}</div>
        <button type="button" onClick={() => setViewMonth(new Date(year, month + 1, 1))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', padding: 4 }}><ChevronRight size={16} /></button>
      </div>
      {/* Weekday row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w) => (
          <div key={w} style={{ height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700, color: '#94A3B8' }}>{w}</div>
        ))}
      </div>
      {/* Days */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {slots.map((dayNum, idx) => (
          <div key={idx} style={dayCellStyle(dayNum)} onClick={() => dayNum && handleDayClick(dayNum)}>{dayNum || ''}</div>
        ))}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} style={{ display: 'inline-flex', gap: '0.6rem', position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <div style={field} className={openField === 'from' ? 'active' : ''} onClick={() => openCalendar('from')}>
          <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span style={fieldLabel}>From</span>
            <span style={fieldValue}>{fmt(startDate)}</span>
          </span>
          <CalendarIcon size={15} color="#64748B" />
        </div>
        {openField === 'from' && renderCalendar()}
      </div>

      <div style={{ position: 'relative' }}>
        <div style={field} className={openField === 'to' ? 'active' : ''} onClick={() => openCalendar('to')}>
          <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span style={fieldLabel}>To</span>
            <span style={fieldValue}>{fmt(endDate)}</span>
          </span>
          <CalendarIcon size={15} color="#64748B" />
        </div>
        {openField === 'to' && renderCalendar()}
      </div>
    </div>
  );
}

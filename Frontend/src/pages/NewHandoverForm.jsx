import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Plus, X, FileText, Calendar, Settings } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { showToast } from '../utils/toast';
import LeadPicker from '../components/LeadPicker';

const parseAmount = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isNaN(n) ? 0 : n; };

// Calendar days between two YYYY-MM-DD dates (exclusive: end − start).
const dayDiff = (start, end) => {
  if (!start || !end) return '';
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
  const days = Math.round((e - s) / 86400000);
  return days < 0 ? '' : days;
};
// Amount for a milestone from the quoted price and its percentage.
const milestoneAmount = (base, percentage) => {
  const pct = parseFloat(percentage);
  if (Number.isNaN(pct)) return '';
  return String(Math.round(base * pct) / 100);
};

const DEFAULT_TERMS = [
  { term: '10% Advance with PO', percentage: '10', value: '' },
  { term: '30% after Drawing Approval', percentage: '30', value: '' },
  { term: '40% after Structure Work Complete', percentage: '40', value: '' },
  { term: '20% after Completion', percentage: '20', value: '' },
];

const labelStyle = { display: 'block', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' };
const inputStyle = { width: '100%', padding: '0.75rem 0.9rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', outline: 'none', fontSize: '0.9rem', backgroundColor: 'var(--surface-color)', color: 'var(--text-main)', fontFamily: 'inherit', boxSizing: 'border-box' };
const cardStyle = { backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: '1.75rem', marginBottom: '1.5rem' };
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'var(--sidebar-bg)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: '0.8rem 1.5rem', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const btnOutline = { background: 'var(--surface-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.8rem 1.5rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };

const Req = () => <span style={{ color: '#EF4444' }}> *</span>;

const SectionHeader = ({ icon: Icon, title }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
    <span style={{ color: 'var(--secondary-color)', display: 'flex' }}><Icon size={20} /></span>
    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--secondary-color)' }}>{title}</h3>
  </div>
);

const Field = ({ label, required, children }) => (
  <div>
    <label style={labelStyle}>{label}{required && <Req />}</label>
    {children}
  </div>
);

// Map an existing project record back onto the form fields (for editing)
const toForm = (p) => ({
  leadId: p?.leadId || p?.id || '',
  clientName: p?.clientName || p?.client || '',
  projectLocation: p?.projectLocation || p?.location || '',
  contactDetails: p?.contactDetails || '',
  billingName: p?.billingName || '',
  mobileNumber: p?.mobileNumber || '',
  altMobile: p?.altMobile || '',
  siteAddress: p?.siteAddress || '',
  billingAddress: p?.billingAddress || '',
  gstNumber: p?.gstNumber || '',
  emailWhatsapp: p?.emailWhatsapp || '',
  salespersonName: p?.salespersonName || p?.salesperson || '',
  dateOfOrder: p?.dateOfOrder || '',
  proposalRefNo: p?.proposalRefNo || '',
  typeOfProject: p?.typeOfProject || p?.projectType || p?.type || '',
  projectSize: p?.projectSize || '',
  design3D: !!p?.design3D,
  design2D: !!p?.design2D,
  transportationScope: p?.transportationScope || 'Yes',
  scaffoldingScope: p?.scaffoldingScope || 'Yes',
  tentativeStartDate: p?.tentativeStartDate || '',
  tentativeCompletionDate: p?.tentativeCompletionDate || '',
  leadTimePromised: p?.leadTimePromised || '',
  quotedPrice: (p?.quotedPrice ?? p?.value ?? p?.quote ?? '') === '' ? '' : String(p?.quotedPrice ?? p?.value ?? p?.quote),
  paymentTerms: Array.isArray(p?.paymentTerms) && p.paymentTerms.length ? p.paymentTerms : DEFAULT_TERMS.map((t) => ({ ...t })),
  siteEngineerVisit: !!p?.siteEngineerVisit,
  salespersonDeclaration: !!p?.salespersonDeclaration,
});

export default function NewHandoverForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [record, setRecord] = useState(null);
  const [leads, setLeads] = useState([]);
  // Keep the Lead dropdown populated even if the initial load failed (cold start).
  useEffect(() => {
    const ll = () => api('/leads').then((d) => { if (Array.isArray(d) && d.length) setLeads(d); }).catch(() => {});
    const iv = setInterval(ll, 15000);
    return () => clearInterval(iv);
  }, []);
  const [quotes, setQuotes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState(() => toForm(null));
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // ── Load leads / quotations / projects so the Lead ID picker can be gated the
  //    same way as the Coordinator app (approved quotation + not yet ordered). ──
  useEffect(() => {
    let active = true;
    (async () => {
      const [ld, qt, pr] = await Promise.all([
        api('/leads').catch(() => []),
        api('/quotations').catch(() => []),
        api('/projects').catch(() => []),
      ]);
      if (!active) return;
      setLeads(Array.isArray(ld) ? ld : []);
      setQuotes(Array.isArray(qt) ? qt : []);
      setProjects(Array.isArray(pr) ? pr : []);
      // In edit mode, hydrate the form from the existing project record.
      if (isEdit) {
        const rec = (Array.isArray(pr) ? pr : []).find((p) => (p.id || p._id) === id) || null;
        if (rec) {
          setRecord(rec);
          setForm(toForm(rec));
        }
      }
    })();
    return () => { active = false; };
  }, [id, isEdit]);

  // ── Lifecycle gating for the Order Confirm lead picker ──
  //   • eligible = lead has an APPROVED quotation AND has not been order-confirmed yet.
  const leadHasApprovedQuote = (leadId) => quotes.some((q) => q.leadId === leadId && String(q.approvalStatus || '') === 'Approved');
  const leadHasOrder = (leadId) => projects.some((p) => (p.leadId || p.id) === leadId);
  const eligibleLeads = leads.filter((l) => l && l.id);
  const leadsForPicker = isEdit ? leads : eligibleLeads;

  const setTerm = (i, key, v) => setForm((f) => ({ ...f, paymentTerms: f.paymentTerms.map((t, idx) => (idx === i ? { ...t, [key]: v } : t)) }));
  const addTerm = () => setForm((f) => ({ ...f, paymentTerms: [...f.paymentTerms, { term: '', percentage: '', value: '' }] }));
  const removeTerm = (i) => setForm((f) => ({ ...f, paymentTerms: f.paymentTerms.filter((_, idx) => idx !== i) }));

  // Editable percentage — allow blank / 0–100 with up to 2 decimals.
  const setPercentage = (i, raw) => {
    let v = String(raw).replace(/[^0-9.]/g, '');
    const firstDot = v.indexOf('.');
    if (firstDot !== -1) v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
    if (firstDot !== -1) v = v.slice(0, firstDot + 3); // cap at 2 decimals
    if (v !== '' && parseFloat(v) > 100) v = '100';
    setTerm(i, 'percentage', v);
  };

  // ── Auto-calc: Lead Time Promised = days between start and completion ──
  useEffect(() => {
    const d = dayDiff(form.tentativeStartDate, form.tentativeCompletionDate);
    const val = d === '' ? '' : `${d} days`;
    setForm((f) => (f.leadTimePromised === val ? f : { ...f, leadTimePromised: val }));
  }, [form.tentativeStartDate, form.tentativeCompletionDate]);

  // ── Auto-calc: each milestone Amount = QuotedPrice × Percentage / 100 ──
  useEffect(() => {
    const base = parseAmount(form.quotedPrice);
    setForm((f) => {
      let changed = false;
      const next = f.paymentTerms.map((t) => {
        const amt = milestoneAmount(base, t.percentage);
        if (amt !== String(t.value ?? '')) changed = true;
        return { ...t, value: amt };
      });
      return changed ? { ...f, paymentTerms: next } : f;
    });
  }, [form.quotedPrice, form.paymentTerms]);

  // ── Payment-terms totals + validation ──
  const totalPercentage = useMemo(
    () => form.paymentTerms.reduce((s, t) => s + (parseFloat(t.percentage) || 0), 0),
    [form.paymentTerms]
  );
  const totalAmount = useMemo(
    () => form.paymentTerms.reduce((s, t) => s + parseAmount(t.value), 0),
    [form.paymentTerms]
  );
  const percentageValid = Math.abs(totalPercentage - 100) <= 0.01;
  const fmtNum = (n) => Number(n.toFixed(2)).toLocaleString('en-IN');

  // Selecting a Lead ID autofills the client/project details from that lead
  const onLeadIdChange = (lead) => {
    setForm((prev) => ({
      ...prev,
      leadId: lead ? lead.id : '',
      clientName: lead?.name || prev.clientName,
      projectLocation: lead?.appointmentLocation || lead?.location || prev.projectLocation,
      typeOfProject: lead?.projectType || prev.typeOfProject,
      salespersonName: lead?.manager || prev.salespersonName,
      mobileNumber: lead?.phone || prev.mobileNumber,
      contactDetails: lead?.phone || lead?.email || prev.contactDetails,
      emailWhatsapp: lead?.email || prev.emailWhatsapp,
      quotedPrice: (lead?.budget != null && lead.budget !== '') ? String(parseAmount(lead.budget)) : prev.quotedPrice,
    }));
  };

  const handleCancel = () => navigate(-1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.leadId) { showToast('Please select a Lead ID', 'error'); return; }
    // Only ONE order confirmation per lead — block a duplicate create with a toast.
    if (!isEdit && leadHasOrder(form.leadId)) {
      showToast('This lead already has an order confirmation. Only one is allowed per lead.', 'error');
      return;
    }
    if (!percentageValid) {
      showToast('Total payment percentage must be exactly 100%.', 'error');
      return;
    }
    setSaving(true);
    const recId = isEdit ? (record?.id || id) : form.leadId;
    const payload = {
      id: recId,
      leadId: form.leadId,
      ...form,
      // compatibility fields that drive the Order Confirm table
      client: form.clientName.trim(),
      location: form.projectLocation.trim(),
      projectType: form.typeOfProject.trim(),
      type: form.typeOfProject.trim(),
      salesperson: form.salespersonName.trim(),
      value: parseAmount(form.quotedPrice),
      status: 'Order Confirmed',
    };
    try {
      if (isEdit) {
        await api(`/projects/${recId}`, { method: 'PUT', body: payload });
        showToast('Handover updated', 'success');
      } else {
        await api('/projects', { method: 'POST', body: payload });
        showToast('Handover submitted', 'success');
      }
      // After the order confirmation is saved, advance the lead to the Payment
      // Collection stage (leads PUT). Idempotent — skipped if already at/after it.
      const lead = leads.find((l) => l.id === form.leadId);
      if (lead && !/payment collection|completed/i.test(String(lead.status || ''))) {
        const stamp = new Date().toLocaleDateString('en-GB') + ', ' + new Date().toLocaleTimeString('en-US', { hour12: false });
        const entry = { timestamp: stamp, message: 'Order confirmed — moved to Payment Collection stage', remark: '' };
        const history = Array.isArray(lead.history) ? [...lead.history, entry] : [entry];
        api(`/leads/${form.leadId}`, { method: 'PUT', body: { status: 'Payment Collection', history } })
          .catch((err) => console.error('Failed to advance lead to Payment Collection:', err));
      }
      navigate('/orders');
    } catch (err) {
      console.error('Failed to save handover form:', err);
      showToast('Could not save. Is the backend running?', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: '0.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="button" onClick={handleCancel} style={{ width: '44px', height: '44px', borderRadius: '50%', border: '1px solid var(--border-color)', background: 'var(--surface-color)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)' }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)' }}>{isEdit ? 'Edit Project File' : 'New Project File'}</h1>
            <p style={{ margin: '0.15rem 0 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>Sales to Project Handover Form</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" onClick={handleCancel} style={btnOutline}>Cancel</button>
          <button type="submit" disabled={saving || !percentageValid} title={!percentageValid ? 'Total payment percentage must be exactly 100%.' : undefined} style={{ ...btnPrimary, opacity: (saving || !percentageValid) ? 0.6 : 1, cursor: (saving || !percentageValid) ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving…' : 'Submit Handover'}</button>
        </div>
      </div>

      {/* 1. Client & Project Details */}
      <div style={cardStyle}>
        <SectionHeader icon={FileText} title="1. Client & Project Details" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem 1.5rem' }}>
          <Field label="Lead ID" required>
            <LeadPicker
              placeholder="Select Lead ID"
              disabled={isEdit}
              initialLabel={form.leadId}
              inputStyle={inputStyle}
              fetchPage={({ q, offset, limit }) =>
                api(`/leads?limit=${limit}&offset=${offset}${q ? `&q=${encodeURIComponent(q)}` : ''}`)
                  .then((d) => (Array.isArray(d) ? d : [])).catch(() => [])}
              onSelect={(lead) => onLeadIdChange(lead)}
            />
          </Field>
          <Field label="Client Name" required><input style={inputStyle} required placeholder="e.g. Sree Brindaavan Kindergarten" value={form.clientName} onChange={(e) => set('clientName', e.target.value)} /></Field>
          <Field label="Project Location" required><input style={inputStyle} required placeholder="e.g. Chitlapakkam" value={form.projectLocation} onChange={(e) => set('projectLocation', e.target.value)} /></Field>
          <Field label="Contact Details (Phone/Email)"><input style={inputStyle} placeholder="e.g. 9840714353 / ..." value={form.contactDetails} onChange={(e) => set('contactDetails', e.target.value)} /></Field>
          <Field label="Billing Name"><input style={inputStyle} placeholder="e.g. Sree Brindaavan Kindergarten" value={form.billingName} onChange={(e) => set('billingName', e.target.value)} /></Field>
          <Field label="Mobile Number" required><input style={inputStyle} required placeholder="e.g. 9551269990" value={form.mobileNumber} onChange={(e) => set('mobileNumber', e.target.value)} /></Field>
          <Field label="Alternate Mobile Number"><input style={inputStyle} placeholder="e.g. Alternate phone" value={form.altMobile} onChange={(e) => set('altMobile', e.target.value)} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem 1.5rem', marginTop: '1.25rem' }}>
          <Field label="Site Address" required><textarea style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }} required placeholder="e.g. 46, First main Road, Venkatraman Nagar, Chennai-600064" value={form.siteAddress} onChange={(e) => set('siteAddress', e.target.value)} /></Field>
          <Field label="Billing Address"><textarea style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }} placeholder="Enter billing address if different" value={form.billingAddress} onChange={(e) => set('billingAddress', e.target.value)} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem 1.5rem', marginTop: '1.25rem' }}>
          <Field label="GST Number"><input style={inputStyle} placeholder="Enter GST number" value={form.gstNumber} onChange={(e) => set('gstNumber', e.target.value)} /></Field>
          <Field label="Email ID / WhatsApp Number"><input style={inputStyle} placeholder="Enter WhatsApp / email" value={form.emailWhatsapp} onChange={(e) => set('emailWhatsapp', e.target.value)} /></Field>
          <Field label="Salesperson Name" required><input style={inputStyle} required placeholder="e.g. Saleem Khan" value={form.salespersonName} onChange={(e) => set('salespersonName', e.target.value)} /></Field>
          <Field label="Date of Order" required><input type="date" style={inputStyle} required value={form.dateOfOrder} onChange={(e) => set('dateOfOrder', e.target.value)} /></Field>
          <Field label="Proposal Ref No" required><input style={inputStyle} required placeholder="e.g. TES/ENT/176-R1" value={form.proposalRefNo} onChange={(e) => set('proposalRefNo', e.target.value)} /></Field>
        </div>
      </div>

      {/* 2. Scope of Work */}
      <div style={cardStyle}>
        <SectionHeader icon={FileText} title="2. Scope of Work" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem 1.5rem' }}>
          <Field label="Type of Project" required><input style={inputStyle} required placeholder="e.g. PU Sheet Roof with wall panel cladding" value={form.typeOfProject} onChange={(e) => set('typeOfProject', e.target.value)} /></Field>
          <Field label="Project Size/Area" required><input style={inputStyle} required placeholder="e.g. 760 Sqft." value={form.projectSize} onChange={(e) => set('projectSize', e.target.value)} /></Field>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, color: 'var(--text-main)' }}>
            <input type="checkbox" checked={form.design3D} onChange={(e) => set('design3D', e.target.checked)} /> 3D Design
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, color: 'var(--text-main)' }}>
            <input type="checkbox" checked={form.design2D} onChange={(e) => set('design2D', e.target.checked)} /> 2D Design
          </label>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={labelStyle}>Transportation Client Scope</span>
            {['Yes', 'No'].map((o) => (
              <label key={o} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', color: 'var(--text-main)' }}>
                <input type="radio" name="transport" checked={form.transportationScope === o} onChange={() => set('transportationScope', o)} /> {o}
              </label>
            ))}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={labelStyle}>Scaffolding Client Scope</span>
            {['Yes', 'No'].map((o) => (
              <label key={o} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', color: 'var(--text-main)' }}>
                <input type="radio" name="scaffold" checked={form.scaffoldingScope === o} onChange={() => set('scaffoldingScope', o)} /> {o}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Timeline & Delivery Commitment */}
      <div style={cardStyle}>
        <SectionHeader icon={Calendar} title="3. Timeline & Delivery Commitment" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem 1.5rem' }}>
          <Field label="Tentative Start Date" required>
            <input
              type="date"
              style={inputStyle}
              required
              value={form.tentativeStartDate}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => {
                  const next = { ...f, tentativeStartDate: v };
                  // If the end date is now before the new start date, clear it.
                  if (next.tentativeCompletionDate && next.tentativeCompletionDate < v) {
                    next.tentativeCompletionDate = '';
                  }
                  return next;
                });
              }}
            />
          </Field>
          <Field label="Tentative Completion Date" required>
            <input
              type="date"
              style={inputStyle}
              required
              min={form.tentativeStartDate || undefined}
              value={form.tentativeCompletionDate}
              onChange={(e) => set('tentativeCompletionDate', e.target.value)}
            />
          </Field>
          <Field label="Lead Time Promised">
            <input
              style={{ ...inputStyle, backgroundColor: '#F8FAFC', cursor: 'not-allowed' }}
              placeholder="Auto-calculated"
              value={form.leadTimePromised}
              readOnly
              disabled
            />
          </Field>
        </div>
      </div>

      {/* 4. Pricing & Payment Terms */}
      <div style={cardStyle}>
        <SectionHeader icon={() => <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>₹</span>} title="4. Pricing & Payment Terms" />
        <Field label="Quoted Price" required>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0 0.85rem', maxWidth: '420px' }}>
            <span style={{ color: 'var(--text-muted)' }}>₹</span>
            <input style={{ border: 'none', outline: 'none', padding: '0.75rem 0.5rem', width: '100%', background: 'transparent', color: 'var(--text-main)', fontFamily: 'inherit', fontSize: '0.9rem' }} required inputMode="numeric" placeholder="Amount" value={form.quotedPrice} onChange={(e) => set('quotedPrice', e.target.value)} />
          </div>
        </Field>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1.5rem 0 0.75rem' }}>
          <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>Payment Terms Schedule</span>
          <button type="button" onClick={addTerm} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#EEF2FF', color: 'var(--primary-color)', border: 'none', borderRadius: 'var(--radius-md)', padding: '0.55rem 1rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem' }}>
            <Plus size={15} /> Add Milestone
          </button>
        </div>

        <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 200px 40px', gap: '0.75rem', padding: '0.85rem 1rem', background: '#F8FAFC', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            <span>Term / Milestone</span><span>Percentage (%)</span><span>Value (₹)</span><span />
          </div>
          {form.paymentTerms.map((t, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 200px 40px', gap: '0.75rem', padding: '0.6rem 1rem', alignItems: 'center', borderTop: '1px solid var(--border-color)' }}>
              <input style={inputStyle} placeholder="Milestone" value={t.term} onChange={(e) => setTerm(i, 'term', e.target.value)} />
              <input style={inputStyle} inputMode="decimal" placeholder="%" value={t.percentage} onChange={(e) => setPercentage(i, e.target.value)} />
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0 0.6rem', background: '#F8FAFC' }}>
                <span style={{ color: 'var(--text-muted)' }}>₹</span>
                <input style={{ border: 'none', outline: 'none', padding: '0.6rem 0.4rem', width: '100%', background: 'transparent', fontFamily: 'inherit', color: 'var(--text-main)', cursor: 'not-allowed' }} placeholder="Auto" value={t.value} readOnly disabled title="Auto-calculated from Quoted Price × Percentage" />
              </div>
              <button type="button" onClick={() => removeTerm(i)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex', justifyContent: 'center' }}><X size={18} /></button>
            </div>
          ))}
          {/* Totals row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 200px 40px', gap: '0.75rem', padding: '0.85rem 1rem', alignItems: 'center', borderTop: '2px solid var(--border-color)', background: '#F8FAFC', fontWeight: 700, color: 'var(--text-main)' }}>
            <span>Total</span>
            <span style={{ color: percentageValid ? '#16A34A' : '#DC2626' }}>{fmtNum(totalPercentage)}%</span>
            <span>₹ {fmtNum(totalAmount)}</span>
            <span />
          </div>
        </div>

        {!percentageValid && (
          <p style={{ margin: '0.75rem 0 0', color: '#DC2626', fontSize: '0.85rem', fontWeight: 600 }}>
            Total payment percentage must be exactly 100%.
          </p>
        )}
      </div>

      {/* 5 & 6. Confirmations & Declarations */}
      <div style={cardStyle}>
        <SectionHeader icon={Settings} title="5 & 6. Confirmations & Declarations" />
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1.1rem 1.25rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.6rem', color: 'var(--text-main)' }}>5. Site Engineer Visit Completed</div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>
            <input type="checkbox" checked={form.siteEngineerVisit} onChange={(e) => set('siteEngineerVisit', e.target.checked)} /> Visit Completed
          </label>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1.1rem 1.25rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.6rem', color: 'var(--text-main)' }}>6. Salesperson Declaration</div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: 1.5 }}>
            <input type="checkbox" checked={form.salespersonDeclaration} onChange={(e) => set('salespersonDeclaration', e.target.checked)} style={{ marginTop: '0.25rem' }} />
            <span>"I confirm that all details communicated to the client and project team are accurate and have been agreed upon. I also acknowledge that the project will commence once the design has been confirmed."</span>
          </label>
        </div>
      </div>

      {/* Bottom submit */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
        <button type="submit" disabled={saving || !percentageValid} title={!percentageValid ? 'Total payment percentage must be exactly 100%.' : undefined} style={{ ...btnPrimary, padding: '0.9rem 1.75rem', opacity: (saving || !percentageValid) ? 0.6 : 1, cursor: (saving || !percentageValid) ? 'not-allowed' : 'pointer' }}>
          <Settings size={18} /> {saving ? 'Saving…' : 'Generate Handover Form'}
        </button>
      </div>
    </form>
  );
}

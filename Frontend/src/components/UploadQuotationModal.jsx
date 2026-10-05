import React, { useState, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { api, getUser } from '../api/client';
import { showToast } from '../utils/toast';
import './CreateVisitModal.css'; // Reusing base modal styles
import './UploadQuotationModal.css';

// Highest numeric suffix across the given quotations (base 5000 so the first id is QT-5001).
const maxQuoteNum = (rows) => rows.reduce((m, q) => {
  const n = parseInt(String(q.id || '').replace(/\D/g, ''), 10);
  return isNaN(n) ? m : Math.max(m, n);
}, 5000);

// The next guaranteed-unique quotation id (derived from the max suffix, never a length count).
const nextQuoteId = (rows) => `QT-${maxQuoteNum(rows) + 1}`;

const EMPTY_QUOTE = {
  leadId: '', client: '', project: '', amount: '', gst: '', priority: 'Medium',
  quotationType: 'Initial Quotation', approvalStatus: 'Pending',
  quotationStatus: 'In Preparation', revision: 'Rev 0', fileName: null, fileData: null,
};

export default function UploadQuotationModal({ isOpen, onClose, onCreated }) {
  const [leads, setLeads] = useState([]);
  const [appts, setAppts] = useState([]); // appointments/visits — gate the Lead dropdown
  const [quotes, setQuotes] = useState([]);
  const [newQuote, setNewQuote] = useState(EMPTY_QUOTE);
  const [submitting, setSubmitting] = useState(false);

  // Load leads, appointments and existing quotations whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    (async () => {
      const [lds, aps, qs] = await Promise.all([
        api('/leads').catch(() => []),
        api('/appointments').catch(() => []),
        api('/quotations').catch(() => []),
      ]);
      if (!mounted) return;
      setLeads(Array.isArray(lds) ? lds : []);
      setAppts(Array.isArray(aps) ? aps : []);
      setQuotes(Array.isArray(qs) ? qs : []);
    })();
    return () => { mounted = false; };
  }, [isOpen]);

  // Only PDF quotations are accepted — images (or any non-PDF) are rejected so a quotation
  // can never bypass approval by being uploaded as a picture.
  const isPdfFile = (file) => file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));

  // Read the chosen PDF into the new-quote state (attached on Upload)
  const handleModalFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) { setNewQuote(prev => ({ ...prev, fileName: null, fileData: null })); return; }
    if (!isPdfFile(file)) {
      showToast('Only PDF files are allowed. Please upload the quotation as a PDF.', 'error');
      event.target.value = '';
      setNewQuote(prev => ({ ...prev, fileName: null, fileData: null }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const tooBig = file.size > 5 * 1024 * 1024;
      setNewQuote(prev => ({ ...prev, fileName: file.name, fileData: tooBig ? null : reader.result }));
    };
    reader.readAsDataURL(file);
  };

  /* ── Lifecycle gating (Visit completed → Quotation) ──
     A lead is eligible for a new quotation only when it has a COMPLETED visit and does
     not already have an ACTIVE quotation. "Active" = Pending or Approved. A Rejected
     quotation does not block re-upload, and all rejected quotations are kept for audit. */
  const isVisitDone = (a) => {
    const s = String(a.status || '').toLowerCase();
    return s.includes('complet') || String(a.progressStatus || '').toLowerCase() === 'completed' || !!a.completedAt;
  };
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const norm = (s) => String(s || '').trim().toLowerCase();
  // Resolve the lead a completed appointment/visit record belongs to (id → phone → name).
  const resolveLead = (a) => {
    if (a.leadId) { const byId = leads.find(l => l.id === a.leadId); if (byId) return byId; }
    const ap = digits(a.phone);
    if (ap) { const byPhone = leads.find(l => { const lp = digits(l.phone); return lp && lp.slice(-10) === ap.slice(-10); }); if (byPhone) return byPhone; }
    const nm = norm(a.client || a.customerName || a.title);
    const byName = nm ? leads.find(l => norm(l.name) === nm) : null;
    if (byName) return byName;
    return a.leadId ? { id: a.leadId, name: a.client || a.customerName || a.title || 'Customer', phone: a.phone || '' } : null;
  };
  const completedRecords = (Array.isArray(appts) ? appts : []).filter(a => isVisitDone(a));
  // The lead's active (non-rejected) quotation, if any — its existence blocks a new upload.
  const leadActiveQuote = (leadId) => quotes.find(q => q.leadId === leadId && String(q.approvalStatus || '') !== 'Rejected');
  // Lifecycle made independent: a quotation can be created for ANY lead with no active
  // (non-rejected) quotation — a completed visit is no longer required.
  const eligibleLeads = (Array.isArray(leads) ? leads : []).filter((l) => l && l.id);
  const leadHasCompletedVisit = (leadOrId) => {
    const id = typeof leadOrId === 'object' && leadOrId !== null ? leadOrId.id : leadOrId;
    return completedRecords.some(a => { const l = resolveLead(a); return l && l.id === id; });
  };

  const resetAndClose = () => {
    setNewQuote(EMPTY_QUOTE);
    onClose && onClose();
  };

  const handleGenerateQuote = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!newQuote.fileName) {
      showToast('A PDF quotation file is required before uploading.', 'error');
      return;
    }
    const newId = nextQuoteId(quotes);

    // Ensure the amount value carries a ₹ symbol; keep GST empty when not provided
    const formattedAmount = newQuote.amount.startsWith('₹') ? newQuote.amount : `₹${newQuote.amount}`;
    const formattedGst = newQuote.gst ? (newQuote.gst.startsWith('₹') ? newQuote.gst : `₹${newQuote.gst}`) : '';

    const payload = {
      ...newQuote,
      id: newId,
      amount: formattedAmount,
      gst: formattedGst,
      // A file attached at upload time means the quotation is prepared
      quotationStatus: newQuote.fileName ? 'Prepared' : newQuote.quotationStatus,
    };

    setSubmitting(true);
    try {
      await api('/quotations', { method: 'POST', body: payload });

      // Record the quotation on the lead's shared history (visible across apps)
      if (newQuote.leadId) {
        const lead = leads.find(l => l.id === newQuote.leadId);
        if (lead) {
          const stamp = new Date().toLocaleDateString('en-GB') + ', ' + new Date().toLocaleTimeString('en-US', { hour12: false });
          const entry = { timestamp: stamp, message: `Quotation ${newId} generated (${formattedAmount}) by ${getUser()?.name || 'Sales Head'}`, remark: newQuote.project || '' };
          const history = Array.isArray(lead.history) ? [...lead.history, entry] : [entry];
          await api(`/leads/${lead.id}`, { method: 'PUT', body: { history } }).catch(() => {});
        }
      }

      showToast('Quotation uploaded successfully!', 'success');
      setNewQuote(EMPTY_QUOTE);
      onCreated && onCreated();
      onClose && onClose();
    } catch (err) {
      showToast(err.message || 'Failed to upload quotation', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const submitDisabled = submitting || !newQuote.leadId || !newQuote.client || !newQuote.project || !newQuote.amount || !newQuote.fileName;

  return (
    <div className="modal-overlay">
      <div className="upload-quotation-content">
        <div className="visit-modal-header">
          <h2 className="visit-modal-title">Upload Quotation</h2>
          <button className="btn-close" onClick={resetAndClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleGenerateQuote}>
          <div className="upload-quotation-body">
            <div className="form-grid-2-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* Row 1: Lead ID | Client Name */}
              <div className="form-group">
                <label className="form-label">Lead ID</label>
                <div className="custom-select-wrapper">
                  <select
                    className="form-select"
                    required
                    value={newQuote.leadId}
                    onChange={(e) => {
                      const val = e.target.value;
                      const lead = leads.find(l => l.id === val);
                      setNewQuote({ ...newQuote, leadId: val, client: lead ? (lead.name || newQuote.client) : newQuote.client });
                    }}
                  >
                    <option value="">Select lead</option>
                    {eligibleLeads.map(l => (
                      <option key={l.id} value={l.id}>{l.name ? `${l.id} — ${l.name}` : l.id}</option>
                    ))}
                    {eligibleLeads.length === 0 && <option value="" disabled>No leads available for a quotation</option>}
                  </select>
                  <ChevronDown size={16} className="select-icon" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Client Name</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. Acme Corp"
                  value={newQuote.client}
                  onChange={(e) => setNewQuote({ ...newQuote, client: e.target.value })}
                />
              </div>

              {/* Row 2: Services | Project Value */}
              <div className="form-group">
                <label className="form-label">Services</label>
                <div className="custom-select-wrapper">
                  <select
                    className="form-select"
                    required
                    value={newQuote.project}
                    onChange={(e) => setNewQuote({ ...newQuote, project: e.target.value })}
                  >
                    <option value="">Select type</option>
                    <option value="PEB">PEB</option>
                    <option value="Tensile">Tensile</option>
                    <option value="Other roofing">Other roofing</option>
                  </select>
                  <ChevronDown size={16} className="select-icon" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Project Value (₹)</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="Enter project value"
                  value={newQuote.amount}
                  onChange={(e) => setNewQuote({ ...newQuote, amount: e.target.value })}
                />
              </div>

              {/* Row 3: Quotation Type | Upload File (PDF) */}
              <div className="form-group">
                <label className="form-label">Quotation Type</label>
                <div className="custom-select-wrapper">
                  <select
                    className="form-select"
                    value={newQuote.quotationType}
                    onChange={(e) => setNewQuote({ ...newQuote, quotationType: e.target.value })}
                  >
                    <option value="Initial Quotation">Initial Quotation</option>
                    <option value="Revised Quotation">Revised Quotation</option>
                    <option value="Final Quotation">Final Quotation</option>
                  </select>
                  <ChevronDown size={16} className="select-icon" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Priority</label>
                <div className="custom-select-wrapper">
                  <select
                    className="form-select"
                    value={newQuote.priority}
                    onChange={(e) => setNewQuote({ ...newQuote, priority: e.target.value })}
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                  <ChevronDown size={16} className="select-icon" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Upload File (PDF)</label>
                <div className="file-input-wrapper">
                  <input type="file" accept="application/pdf,.pdf" onChange={handleModalFileChange} />
                </div>
              </div>
            </div>
          </div>

          <div className="visit-modal-footer">
            <button type="button" className="btn btn--secondary" onClick={resetAndClose}>Cancel</button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={submitDisabled}
              style={{ background: '#1e1b4b', borderColor: '#1e1b4b', opacity: submitDisabled ? 0.5 : 1 }}
            >
              Upload
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

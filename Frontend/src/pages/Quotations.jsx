import React, { useState, useEffect } from 'react';
import {
  FileText,
  Clock,
  Send,
  ThumbsUp,
  ChevronDown,
  Plus,
  Eye,
  Download,
  Upload,
  CheckCircle2
} from 'lucide-react';
import DateRangePicker from '../components/DateRangePicker';
import ScopeFilter from '../components/ScopeFilter';
import UploadQuotationModal from '../components/UploadQuotationModal';
import { api } from '../api/client';
import useAutoRefresh from '../hooks/useAutoRefresh';
import { useViewMode } from '../context/ViewModeContext';
import './Quotations.css';

const parseMoney = (v) => {
  if (v == null) return 0;
  let s = String(v).toLowerCase().replace(/[₹,\s]/g, '');
  let x = 1;
  if (s.endsWith('cr')) { x = 1e7; s = s.slice(0, -2); }
  else if (s.endsWith('l')) { x = 1e5; s = s.slice(0, -1); }
  else if (s.endsWith('k')) { x = 1e3; s = s.slice(0, -1); }
  else if (s.endsWith('m')) { x = 1e6; s = s.slice(0, -1); }
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n * x;
};

const fmtMoney = (n) => {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const trim = (x) => { const s = x.toFixed(1); return s.endsWith('.0') ? s.slice(0, -2) : s; };
  if (abs >= 1e7) { const val = trim(v / 1e7); return `₹${val} ${val === '1' ? 'Crore' : 'Crores'}`; }
  if (abs >= 1e5) { const val = trim(v / 1e5); return `₹${val} ${val === '1' ? 'Lakh' : 'Lakhs'}`; }
  return '₹' + Math.round(v).toLocaleString('en-IN');
};

// Trigger a browser download of a base64 data-URI PDF.
const downloadDataUri = (dataUri, fileName) => {
  if (!dataUri) return;
  const a = document.createElement('a');
  a.href = dataUri;
  a.download = fileName || 'quotation.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
};
// Open a base64 data-URI PDF in a new browser tab.
const openDataUri = (dataUri, fileName) => {
  if (!dataUri) return;
  const w = window.open('', '_blank');
  if (w) { w.document.write(`<title>${fileName || 'Quotation'}</title><iframe src="${dataUri}" style="border:0;width:100vw;height:100vh"></iframe>`); w.document.close(); }
};

export default function Quotations() {
    const { view: viewMode, setView: setViewMode, manager, setManager } = useViewMode();
  const [quotationStatusDropdownOpen, setQuotationStatusDropdownOpen] = useState(false);
  const [isUploadQuotationModalOpen, setIsUploadQuotationModalOpen] = useState(false);
  const [quotations, setQuotations] = useState([]);
  const [leads, setLeads] = useState([]);
  const [managers, setManagers] = useState([]);

  const reloadQuotations = async () => {
    const qs = await api('/quotations').catch(() => []);
    setQuotations(Array.isArray(qs) ? [...qs].sort((a, b) => (new Date(b.createdAt || 0) - new Date(a.createdAt || 0)) || String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true })) : []);
  };
  useAutoRefresh(() => {
    reloadQuotations();
    api('/leads').then((d) => setLeads(Array.isArray(d) ? d : [])).catch(() => {});
  });

  // The list omits the heavy base64 fileData now (it made the response huge and slow).
  // Fetch it for one quotation on demand from GET /quotations/:id.
  const getFileData = async (quote) => {
    if (quote.fileData) return quote.fileData;
    if (!quote.id) return null;
    try { const full = await api(`/quotations/${quote.id}`); return full && full.fileData ? full.fileData : null; }
    catch { return null; }
  };
  const previewQuote = async (quote) => { const d = await getFileData(quote); if (d) openDataUri(d, quote.fileName); };
  const downloadQuote = async (quote) => { const d = await getFileData(quote); if (d) downloadDataUri(d, quote.fileName); };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [qs, lds, mgrs] = await Promise.all([
          api('/quotations').catch(() => []),
          api('/leads').catch(() => []),
          api('/auth/managers').catch(() => [])
        ]);
        if (!mounted) return;
        setQuotations(Array.isArray(qs) ? [...qs].sort((a, b) => (new Date(b.createdAt || 0) - new Date(a.createdAt || 0)) || String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true })) : []);
        setLeads(Array.isArray(lds) ? lds : []);
        setManagers(Array.isArray(mgrs) ? mgrs : []);
      } catch (e) {
        if (!mounted) return;
        setQuotations([]);
        setLeads([]);
        setManagers([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const leadById = (id) => leads.find(l => l && l.id === id) || null;
  const resolveName = (q) => {
    const lead = leadById(q.leadId);
    return q.client || (lead && lead.name) || (lead && lead.manager) || '—';
  };

  const leadManagerById = {};
  leads.forEach(l => { if (l && l.id != null) leadManagerById[l.id] = l.manager; });

  // Manager View scopes to the selected manager's leads; Coordinator View is org-wide
  const scopeMgr = viewMode === 'manager' ? manager : 'all';
  const filteredQuotations = (scopeMgr && scopeMgr !== 'all')
    ? quotations.filter(q => leadManagerById[q.leadId] === scopeMgr)
    : quotations;

  const requestedCount = filteredQuotations.length;
  const pendingCount = filteredQuotations.filter(q => q.approvalStatus === 'Pending').length;
  const approvedCount = filteredQuotations.filter(q => q.approvalStatus === 'Approved').length;
  const preparedCount = filteredQuotations.filter(q => q.quotationStatus === 'Prepared').length;

  return (
    <div className="quotations-page">
      <div className="dashboard-header-bar">
        <div className="view-toggle">
          <button
            className={`toggle-btn ${viewMode === 'manager' ? 'active' : ''}`}
            onClick={() => setViewMode('manager')}
          >
            Manager View
          </button>
          <button
            className={`toggle-btn ${viewMode === 'coordinator' ? 'active' : ''}`}
            onClick={() => setViewMode('coordinator')}
          >
            Coordinator View
          </button>
        </div>
      </div>

      <div className="quotations-header">
        <div>
          <h1>Quotations</h1>
          {viewMode === 'manager' && <p className="header-subtitle text-muted" style={{marginTop: '0.25rem', fontSize: '0.875rem'}}>Generate, send, and track project estimates</p>}
        </div>
        {viewMode === 'coordinator' && (
          <button className="btn btn--primary btn-icon" onClick={() => setIsUploadQuotationModalOpen(true)}>
            <Plus size={18} />
            Upload Quotation
          </button>
        )}
      </div>

      <div className="quotations-filters">
        <DateRangePicker />
        <ScopeFilter />
      </div>

      {viewMode === 'manager' ? (
        <div className="quotations-metrics quotations-metrics-3col">
          <div className="metric-card card-blue">
            <div className="metric-header">
              <span className="metric-title text-muted">Requested Quotations</span>
              <FileText size={18} className="metric-icon" />
            </div>
            <div className="metric-value">{requestedCount}</div>
            <div className="metric-subtitle text-muted">New requests this week</div>
          </div>
          <div className="metric-card card-orange">
            <div className="metric-header">
              <span className="metric-title text-muted">Pending Quotations</span>
              <Clock size={18} className="metric-icon" />
            </div>
            <div className="metric-value">{pendingCount}</div>
            <div className="metric-subtitle text-muted">Awaiting approval</div>
          </div>
          <div className="metric-card card-green">
            <div className="metric-header">
              <span className="metric-title text-muted">Approved Quotations</span>
              <CheckCircle2 size={18} className="metric-icon" />
            </div>
            <div className="metric-value">{approvedCount}</div>
            <div className="metric-subtitle text-muted">Signed this month</div>
          </div>
        </div>
      ) : (
        <div className="quotations-metrics">
          <div className="metric-card card-blue">
            <div className="metric-header">
              <span className="metric-title text-muted">Requested Quotations</span>
              <FileText size={18} className="metric-icon" />
            </div>
            <div className="metric-value">{requestedCount}</div>
            <div className="metric-subtitle text-muted">Draft & initial requests</div>
          </div>
          <div className="metric-card card-orange">
            <div className="metric-header">
              <span className="metric-title text-muted">Pending Quotations</span>
              <Clock size={18} className="metric-icon" />
            </div>
            <div className="metric-value">{pendingCount}</div>
            <div className="metric-subtitle text-muted">Awaiting client/mgr approval</div>
          </div>
          <div className="metric-card card-cyan">
            <div className="metric-header">
              <span className="metric-title text-muted">Completed Quotations</span>
              <Send size={18} className="metric-icon" />
            </div>
            <div className="metric-value">{preparedCount}</div>
            <div className="metric-subtitle text-muted">Prepared & sent to clients</div>
          </div>
          <div className="metric-card card-green">
            <div className="metric-header">
              <span className="metric-title text-muted">Approved Quotations</span>
              <ThumbsUp size={18} className="metric-icon" />
            </div>
            <div className="metric-value">{approvedCount}</div>
            <div className="metric-subtitle text-muted">Accepted quotations</div>
          </div>
        </div>
      )}

      <div className="quotations-table-container">
        {viewMode === 'manager' ? (
          <table className="quotations-table">
            <thead>
              <tr>
                <th>LEAD ID</th>
                <th>CUSTOMER NAME</th>
                <th>APPROVALS</th>
                <th>QUOTATION UPLOAD</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted" style={{textAlign: 'center', padding: '1.5rem'}}>No quotations found</td>
                </tr>
              ) : filteredQuotations.map(quote => {
                const isApproved = quote.approvalStatus === 'Approved';
                return (
                  <tr key={quote.id}>
                    <td className="fw-600">{quote.leadId || quote.id}</td>
                    <td className="fw-600" style={{color: '#334155'}}>{resolveName(quote)}</td>
                    <td>
                      {isApproved ? (
                        <span className="badge-status badge-approved-green">
                          <CheckCircle2 size={12} style={{marginRight: '0.25rem', display: 'inline', verticalAlign: 'middle'}}/>
                          APPROVED
                        </span>
                      ) : quote.approvalStatus === 'Rejected' ? (
                        <span className="badge-status" style={{ background: '#FEE2E2', color: '#991B1B' }}>
                          <Clock size={12} style={{marginRight: '0.25rem', display: 'inline', verticalAlign: 'middle'}}/>
                          REJECTED
                        </span>
                      ) : quote.approvalStatus === 'Changes Requested' ? (
                        <span className="badge-status" style={{ background: '#FEF3C7', color: '#B45309' }}>
                          <Clock size={12} style={{marginRight: '0.25rem', display: 'inline', verticalAlign: 'middle'}}/>
                          CHANGES REQUESTED
                        </span>
                      ) : (
                        <span className="badge-status badge-inprogress-yellow">
                          <Clock size={12} style={{marginRight: '0.25rem', display: 'inline', verticalAlign: 'middle'}}/>
                          IN PROGRESS
                        </span>
                      )}
                    </td>
                    <td>
                      {(quote.fileName || quote.fileData) ? (
                        <a
                          onClick={() => downloadQuote(quote)}
                          download={quote.fileName ? (quote.fileName || 'quotation.pdf') : undefined}
                          title={quote.fileName || 'Quotation'}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', maxWidth: '220px', padding: '0.35rem 0.6rem', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#F8FAFC', textDecoration: 'none', color: '#334155', fontSize: '0.8rem', fontWeight: 500, cursor: quote.fileName ? 'pointer' : 'default' }}
                        >
                          <Download size={14} style={{ flexShrink: 0, color: '#6366F1' }} />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{quote.fileName || 'Quotation.pdf'}</span>
                        </a>
                      ) : (
                        <span className="text-muted">Not uploaded</span>
                      )}
                    </td>
                    <td>
                      <div className="action-buttons-group">
                        {isApproved
                          ? <button className="btn-action-disabled">Approved</button>
                          : <button className="btn-action-solid">Request</button>}

                        <button
                          className="action-btn"
                          title={quote.fileName ? 'Download quotation' : 'No file uploaded'}
                          onClick={() => downloadQuote(quote)}
                          disabled={!quote.fileName}
                          style={{border: '1px solid #e2e8f0', marginLeft: '0.5rem', opacity: quote.fileName ? '1' : '0.5', cursor: quote.fileName ? 'pointer' : 'not-allowed'}}
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="quotations-table">
            <thead>
              <tr>
                <th>Lead ID</th>
                <th>Customer Name</th>
                <th>Approval Status</th>
                <th>Quotations Status</th>
                <th>Upload Quotation</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted" style={{textAlign: 'center', padding: '1.5rem'}}>No quotations found</td>
                </tr>
              ) : filteredQuotations.map(quote => (
                <tr key={quote.id}>
                  <td className="fw-600">{quote.leadId || quote.id}</td>
                  <td>
                    <div className="customer-info">
                      <span className="customer-name">{resolveName(quote)}</span>
                      <span className="customer-subtitle text-muted">{quote.project}</span>
                    </div>
                  </td>
                  <td>
                    <span className="badge-status badge-pending">
                      {quote.approvalStatus}
                    </span>
                  </td>
                  <td>
                    <div className="status-select-wrapper badge-in-prep" onClick={() => setQuotationStatusDropdownOpen(!quotationStatusDropdownOpen)}>
                      <select className="status-select" value={quote.quotationStatus} onChange={() => {}} style={{ pointerEvents: 'none' }}>
                        <option value={quote.quotationStatus}>{quote.quotationStatus}</option>
                      </select>
                      <ChevronDown size={14} className="status-chevron" />

                      {quotationStatusDropdownOpen && (
                        <div className="dark-dropdown-menu">
                          <div className="dark-dropdown-item active">In Preparation</div>
                          <div className="dark-dropdown-item">Sent</div>
                          <div className="dark-dropdown-item">Approved</div>
                          <div className="dark-dropdown-item">Rejected</div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    {quote.fileName ? (
                      <a
                        onClick={() => downloadQuote(quote)}
                        download={quote.fileName ? (quote.fileName || 'quotation.pdf') : undefined}
                        title={quote.fileName || 'Quotation'}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', maxWidth: '220px', padding: '0.35rem 0.6rem', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#F8FAFC', textDecoration: 'none', color: '#334155', fontSize: '0.8rem', fontWeight: 500, cursor: quote.fileName ? 'pointer' : 'default' }}
                      >
                        <Download size={16} style={{ flexShrink: 0, color: '#6366F1' }} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{quote.fileName || 'Quotation.pdf'}</span>
                      </a>
                    ) : (
                      <span className="text-muted">Not uploaded</span>
                    )}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="action-btn"
                        title={quote.fileName ? 'View quotation' : 'No file uploaded'}
                        onClick={() => previewQuote(quote)}
                        disabled={!quote.fileName}
                        style={{ opacity: quote.fileName ? 1 : 0.5, cursor: quote.fileName ? 'pointer' : 'not-allowed' }}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        className="action-btn"
                        title={quote.fileName ? 'Download quotation' : 'No file uploaded'}
                        onClick={() => downloadQuote(quote)}
                        disabled={!quote.fileName}
                        style={{ opacity: quote.fileName ? 1 : 0.5, cursor: quote.fileName ? 'pointer' : 'not-allowed' }}
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <UploadQuotationModal
        isOpen={isUploadQuotationModalOpen}
        onClose={() => setIsUploadQuotationModalOpen(false)}
        onCreated={reloadQuotations}
      />
    </div>
  );
}

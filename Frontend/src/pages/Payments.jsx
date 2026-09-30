import React from 'react';
import {
  Plus,
  ChevronDown,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  CalendarDays,
  Eye,
  Edit2,
  Download,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import DateRangePicker from '../components/DateRangePicker';
import ScopeFilter from '../components/ScopeFilter';
import RecordPaymentModal from '../components/RecordPaymentModal';
import PaymentDrawer, { deriveStatus, parseAmount } from '../components/PaymentDrawer';
import { api } from '../api/client';
import useAutoRefresh from '../hooks/useAutoRefresh';
import { useViewMode } from '../context/ViewModeContext';
import { showToast } from '../utils/toast';
import './Payments.css';

// Sales team — matches the roster used across the app (same as the Coordinator app)
const SALES_TEAM = ['Azar Abdullah A', 'Praveenraja P', 'Suresh P', 'Agsal A'];

const fmtMoney = (n) => {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const trim = (x) => { const s = x.toFixed(1); return s.endsWith('.0') ? s.slice(0, -2) : s; };
  if (abs >= 1e7) { const val = trim(v / 1e7); return `₹${val} ${val === '1' ? 'Crore' : 'Crores'}`; }
  if (abs >= 1e5) { const val = trim(v / 1e5); return `₹${val} ${val === '1' ? 'Lakh' : 'Lakhs'}`; }
  return '₹' + Math.round(v).toLocaleString('en-IN');
};

const todayStr = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

export default function Payments() {
  const { view: viewMode, setView: setViewMode, manager, setManager } = useViewMode();
  const [isRecordPaymentModalOpen, setIsRecordPaymentModalOpen] = React.useState(false);
  const [selectedPayment, setSelectedPayment] = React.useState(null);
  const [paymentsData, setPaymentsData] = React.useState([]);
  const [managers, setManagers] = React.useState([]);
  const [leads, setLeads] = React.useState([]);
  const [statusFilter, setStatusFilter] = React.useState('');
  const [searchTerm, setSearchTerm] = React.useState('');

  // ── Payment Collection detail drawer (View / Edit) ──
  const [drawer, setDrawer] = React.useState(null);           // the payment record shown in the drawer
  const [drawerMode, setDrawerMode] = React.useState('view'); // 'view' | 'edit'
  const [drawerTab, setDrawerTab] = React.useState('overview');
  const [editForm, setEditForm] = React.useState(null);       // editable copy (edit mode)
  const [drawerSaving, setDrawerSaving] = React.useState(false);
  const [newNote, setNewNote] = React.useState('');
  const [uploadForm, setUploadForm] = React.useState({ invoiceValue: '', fileName: '', fileData: '' });

  // Log Payment modal
  const [logPayOpen, setLogPayOpen] = React.useState(false);
  const [logPayAmount, setLogPayAmount] = React.useState('');

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api('/payments');
        if (active) setPaymentsData(Array.isArray(data) ? [...data].sort((a, b) => new Date(b.createdAt || b.paymentDate || b.dueDate || 0) - new Date(a.createdAt || a.paymentDate || a.dueDate || 0)) : []);
      } catch {
        if (active) setPaymentsData([]);
      }
      try {
        const mgrs = await api('/auth/managers');
        if (active) setManagers(Array.isArray(mgrs) ? mgrs : []);
      } catch {
        if (active) setManagers([]);
      }
      try {
        const ld = await api('/leads');
        if (active) setLeads(Array.isArray(ld) ? ld : []);
      } catch {
        if (active) setLeads([]);
      }
    })();
    return () => { active = false; };
  }, []);

  const refreshPayments = async () => {
    const data = await api('/payments');
    setPaymentsData(Array.isArray(data) ? [...data].sort((a, b) => new Date(b.createdAt || b.paymentDate || b.dueDate || 0) - new Date(a.createdAt || a.paymentDate || a.dueDate || 0)) : []);
  };
  useAutoRefresh(() => {
    refreshPayments();
    api('/leads').then((d) => setLeads(Array.isArray(d) ? d : [])).catch(() => {});
  });

  // ── Manager options for the drawer (roster + managers seen on the leads) ──
  const managerOptions = React.useMemo(() => {
    const set = new Set(SALES_TEAM);
    leads.forEach((l) => { if (l && l.manager) set.add(l.manager); });
    return Array.from(set);
  }, [leads]);

  // ── Download — download the ACTUAL uploaded receipt/invoice document if one exists;
  // otherwise open a clean, print-ready branded invoice (native print-to-PDF, with a
  // fixed-width label column so the two-column layout never collapses — matching the
  // Manager and Coordinator apps).
  const downloadRecord = (payment) => {
    if (!payment) return;
    const fileData = payment.invoiceFileData || payment.fileData || payment.receiptData;
    const fileName = payment.invoiceFileName || payment.fileName || payment.receiptName;
    if (fileData) {
      const a = document.createElement('a');
      a.href = fileData;
      a.download = fileName || `${payment.id || 'payment'}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      return;
    }
    const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const row = (k, v) => `<tr><td class="lbl">${k}</td><td class="val">${v}</td></tr>`;
    const overview = [
      row('Order Value', inr(payment.orderValue)),
      row('Amount Collected', inr(payment.amountCollected)),
      row('Upcoming Dues', inr(payment.upcomingDues)),
      row('Pending Payments', inr(payment.pendingPayments)),
      row('Overdue Payments', inr(payment.overduePayments)),
      row('Invoice Value', inr(payment.invoiceValue)),
    ].join('');
    const billing = [
      row('Customer', payment.customer || '-'),
      row('Lead ID', payment.leadId || '-'),
      row('Payment Method', payment.method || '-'),
      row('Due Date', payment.dueDate || '-'),
      row('Manager', payment.manager || '-'),
    ].join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${payment.id || 'Invoice'}</title>
      <style>
        *{box-sizing:border-box;} body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1F2937;padding:32px;}
        .rcpt{max-width:720px;margin:0 auto;border:1px solid #E5E9F0;border-radius:10px;overflow:hidden;}
        .head{display:flex;justify-content:space-between;align-items:flex-start;padding:22px 32px;border-bottom:3px solid #8DC63F;}
        .brand{font-size:22px;letter-spacing:9px;font-weight:800;color:#2B2B2B;}
        .brand small{display:block;font-size:10px;letter-spacing:6px;color:#6B7280;margin-top:4px;}
        .meta{display:flex;gap:24px;padding:16px 32px;font-size:13px;color:#4B5563;border-bottom:1px solid #EEF1F5;}
        .meta b{color:#111827;}
        .sec{padding:18px 32px 4px;}
        .sec h3{margin:0 0 8px;font-size:13px;font-weight:800;color:#1E3A8A;text-transform:uppercase;letter-spacing:0.4px;}
        table{width:100%;border-collapse:collapse;margin-bottom:14px;}
        td{padding:9px 12px;border-bottom:1px solid #EEF1F5;font-size:13px;}
        td.lbl{color:#6B7280;width:45%;}
        td.val{color:#111827;font-weight:700;text-align:right;}
        .foot{margin-top:8px;background:#8DC63F;color:#fff;text-align:center;font-size:11px;font-weight:700;padding:12px 8px;}
        @media print{body{padding:0;} .rcpt{border:none;border-radius:0;}}
      </style></head><body>
      <div class="rcpt">
        <div class="head">
          <div class="brand">TESCO<small>STRUCTURES</small></div>
          <div style="font-size:12px;color:#4B5563;">tescostructures@gmail.com</div>
        </div>
        <div class="meta">
          <div><b>Invoice No:</b> ${payment.id || '-'}</div>
          <div><b>Date:</b> ${today}</div>
          <div><b>Status:</b> ${payment.status || deriveStatus(payment) || '-'}</div>
        </div>
        <div class="sec"><h3>Payment Overview</h3><table>${overview}</table></div>
        <div class="sec"><h3>Billing Details</h3><table>${billing}</table></div>
        <div class="foot">www.tescostructures.com&nbsp;&nbsp;|&nbsp;&nbsp;+91 90033 28229</div>
      </div>
      <script>window.onload=function(){setTimeout(function(){window.print();},150);};<\/script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const handleOpenNewPayment = () => {
    setSelectedPayment(null);
    setIsRecordPaymentModalOpen(true);
  };

  const handleDateChange = (id, newDateStr) => {
    if (!newDateStr) return;
    setPaymentsData(prev => prev.map(p => p.id === id ? { ...p, dueDate: newDateStr } : p));
    api('/payments/' + id, { method: 'PUT', body: { dueDate: newDateStr } }).catch(() => {});
  };

  // ── Create/edit via RecordPaymentModal (top "Record Payment" button, new payments) ──
  const handleSave = async (obj) => {
    try {
      if (selectedPayment) {
        await api('/payments/' + selectedPayment.id, { method: 'PUT', body: obj });
      } else {
        const id = obj.id || ('INV-' + Date.now());
        await api('/payments', { method: 'POST', body: { ...obj, id } });
        // Lifecycle: recording a lead's (single) payment locks it from duplication and
        // marks the lead Completed — the final stage of the pipeline.
        if (obj.leadId) {
          try {
            await api(`/leads/${obj.leadId}`, { method: 'PUT', body: { status: 'Completed' } });
          } catch (e) { /* payment still saved even if the lead sync fails */ }
        }
      }
      await refreshPayments();
      setIsRecordPaymentModalOpen(false);
      setSelectedPayment(null);
    } catch (err) {
      console.error('Failed to save payment', err);
    }
  };

  // ── Drawer: build the editable form (record + linked-lead fallbacks, never invents) ──
  const buildEditForm = (p) => {
    const lead = leads.find((l) => l.id === p.leadId);
    const num = (v) => (v === 0 || v ? String(v) : '');
    return {
      ...p,
      clientName: p.clientName || p.customer || '',
      billingName: p.billingName || p.customer || '',
      projectLocation: p.projectLocation || lead?.appointmentLocation || '',
      contactDetails: p.contactDetails || [lead?.phone, lead?.email].filter(Boolean).join(' / '),
      mobileNumber: p.mobileNumber || lead?.phone || '',
      altMobile: p.altMobile || '',
      siteAddress: p.siteAddress || lead?.appointmentLocation || '',
      billingAddress: p.billingAddress || '',
      gstNumber: p.gstNumber || '',
      email: p.email || lead?.email || '',
      salesperson: p.salesperson || p.manager || lead?.manager || '',
      orderValue: num(p.orderValue),
      amountCollected: num(p.amountCollected),
      upcomingDues: num(p.upcomingDues),
      pendingPayments: num(p.pendingPayments),
      overduePayments: num(p.overduePayments),
      invoiceValue: num(p.invoiceValue),
      dueDate: p.dueDate || '',
      method: p.method || '',
      status: deriveStatus(p),
    };
  };

  const openDrawer = (p, mode = 'view') => {
    setDrawer(p);
    setDrawerMode(mode);
    setDrawerTab('overview');
    setNewNote('');
    setUploadForm({ invoiceValue: p.invoiceValue ? String(p.invoiceValue) : '', fileName: p.invoiceFileName || '', fileData: p.invoiceFileData || '' });
    setEditForm(buildEditForm(p));
  };
  const closeDrawer = () => { setDrawer(null); setEditForm(null); setNewNote(''); };

  // Persist a partial update (PUT via api) and sync both the drawer and the table.
  const patchRecord = async (record, patch, successMsg) => {
    if (!record) return null;
    const id = record.id;
    try {
      const result = await api('/payments/' + id, { method: 'PUT', body: patch });
      const updated = (result && (result.id || result._id)) ? result : { ...record, ...patch };
      setPaymentsData((prev) => prev.map((x) => (x.id === id ? { ...x, ...updated } : x)));
      setDrawer((cur) => (cur && cur.id === id ? { ...cur, ...updated } : cur));
      await refreshPayments();
      if (successMsg) showToast(successMsg, 'success');
      return updated;
    } catch (err) {
      console.error('Failed to update payment:', err);
      showToast('Could not save changes. Is the backend running?', 'error');
      return null;
    }
  };

  // Header Edit → Save: persist all editable fields from the drawer's edit form
  const saveDrawerEdits = async () => {
    if (!editForm) return;
    setDrawerSaving(true);
    const payload = {
      customer: (editForm.customer || '').trim(),
      manager: (editForm.manager || '').trim(),
      orderValue: parseAmount(editForm.orderValue),
      amountCollected: parseAmount(editForm.amountCollected),
      upcomingDues: parseAmount(editForm.upcomingDues),
      pendingPayments: parseAmount(editForm.pendingPayments),
      overduePayments: parseAmount(editForm.overduePayments),
      invoiceValue: parseAmount(editForm.invoiceValue),
      dueDate: editForm.dueDate || '',
      method: (editForm.method || '').trim(),
      status: editForm.status || '',
      clientName: (editForm.clientName || '').trim(),
      projectLocation: (editForm.projectLocation || '').trim(),
      contactDetails: (editForm.contactDetails || '').trim(),
      billingName: (editForm.billingName || '').trim(),
      mobileNumber: (editForm.mobileNumber || '').trim(),
      altMobile: (editForm.altMobile || '').trim(),
      siteAddress: (editForm.siteAddress || '').trim(),
      billingAddress: (editForm.billingAddress || '').trim(),
      gstNumber: (editForm.gstNumber || '').trim(),
      email: (editForm.email || '').trim(),
      salesperson: (editForm.salesperson || '').trim(),
    };
    const updated = await patchRecord(drawer, payload, 'Payment updated');
    setDrawerSaving(false);
    if (updated) { setDrawerMode('view'); setEditForm(buildEditForm({ ...drawer, ...updated })); }
  };

  // Notes tab — append a note to the record's notesLog
  const saveNote = async () => {
    const text = newNote.trim();
    if (!text || !drawer) return;
    const entry = { text, timestamp: new Date().toISOString() };
    const notesLog = Array.isArray(drawer.notesLog) ? [...drawer.notesLog, entry] : [entry];
    setDrawerSaving(true);
    const updated = await patchRecord(drawer, { notesLog }, 'Note saved');
    setDrawerSaving(false);
    if (updated) setNewNote('');
  };

  // Upload Invoice tab — store invoiceValue + the file (base64) on the record
  const onInvoiceFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setUploadForm((f) => ({ ...f, fileName: file.name, fileData: reader.result }));
    reader.readAsDataURL(file);
  };
  const submitInvoiceUpload = async () => {
    if (!drawer) return;
    setDrawerSaving(true);
    const patch = {
      invoiceValue: parseAmount(uploadForm.invoiceValue),
      invoiceFileName: uploadForm.fileName || '',
      invoiceFileData: uploadForm.fileData || '',
    };
    await patchRecord(drawer, patch, 'Invoice uploaded');
    setDrawerSaving(false);
  };

  // Footer — Reminder: add a "Payment Reminder Sent" timeline entry dated now
  const sendReminder = async () => {
    if (!drawer) return;
    setDrawerSaving(true);
    await patchRecord(drawer, { reminderSentAt: new Date().toISOString() }, 'Reminder logged');
    setDrawerSaving(false);
  };

  // Footer — Log Payment: open a styled in-app modal (no native prompt)
  const openLogPayment = () => {
    if (!drawer) return;
    setLogPayAmount(String(Number(drawer.amountCollected) || 0));
    setLogPayOpen(true);
  };
  const closeLogPayment = () => { setLogPayOpen(false); setLogPayAmount(''); };
  const confirmLogPayment = async () => {
    if (!drawer) return;
    const amt = parseAmount(logPayAmount);
    const invoice = Number(drawer.invoiceValue) || Number(drawer.orderValue) || 0;
    const pending = Math.max(0, invoice - amt);
    const patch = {
      amountCollected: amt,
      pendingPayments: pending,
      paymentDate: todayStr(),
      status: invoice > 0 && amt >= invoice ? 'Paid' : amt > 0 ? 'Partial' : 'Pending',
    };
    setDrawerSaving(true);
    await patchRecord(drawer, patch, 'Payment logged');
    setDrawerSaving(false);
    closeLogPayment();
  };

  // Manager View scopes to the selected manager; Coordinator View is org-wide
  const scopeMgr = viewMode === 'manager' ? manager : 'all';
  const filteredPayments = paymentsData.filter(p => {
    if (scopeMgr !== 'all' && p.manager !== scopeMgr) return false;
    if (statusFilter && String(p.status || '').toLowerCase() !== statusFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const hay = `${p.id || ''} ${p.customer || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sumBy = (key) => filteredPayments.reduce((acc, p) => acc + (Number(p[key]) || 0), 0);
  const totalCollected = sumBy('amountCollected');
  const totalUpcoming = sumBy('upcomingDues');
  const totalPending = sumBy('pendingPayments');
  const totalOverdue = sumBy('overduePayments');

  return (
    <div className="payments-page">
      <div className="breadcrumbs" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
        Pages / Payment Collection
      </div>
      <div className="dashboard-header-bar" style={{ marginBottom: '1rem' }}>
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

      <div className="payments-header">
        <h1>Payment Collection</h1>
        <button
          className="btn btn--primary btn-icon"
          style={{ background: '#1e1b4b', borderColor: '#1e1b4b' }}
          onClick={handleOpenNewPayment}
        >
          <Plus size={18} />
          Record Payment
        </button>
      </div>

      <div className="payments-filters-top">
        <DateRangePicker />
        <ScopeFilter />
      </div>

      <div className="payments-metrics">
        <div className="payments-metric-card">
          <div className="metric-icon-box icon-green">
            <CheckCircle2 size={24} />
          </div>
          <div className="metric-content">
            <div className="metric-val">{fmtMoney(totalCollected)}</div>
            <div className="metric-lbl">Total Collected</div>
          </div>
        </div>

        <div className="payments-metric-card">
          <div className="metric-icon-box icon-blue">
            <Clock size={24} />
          </div>
          <div className="metric-content">
            <div className="metric-val">{fmtMoney(totalUpcoming)}</div>
            <div className="metric-lbl">Upcoming Dues</div>
          </div>
        </div>

        <div className="payments-metric-card">
          <div className="metric-icon-box icon-orange">
            <AlertCircle size={24} />
          </div>
          <div className="metric-content">
            <div className="metric-val">{fmtMoney(totalPending)}</div>
            <div className="metric-lbl">Pending Payments</div>
          </div>
        </div>

        <div className="payments-metric-card">
          <div className="metric-icon-box icon-red">
            <X size={24} />
          </div>
          <div className="metric-content">
            <div className="metric-val">{fmtMoney(totalOverdue)}</div>
            <div className="metric-lbl">Overdue Payments</div>
          </div>
        </div>
      </div>

      <div className="payments-table-container">
        <div className="payments-table-filters" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {viewMode === 'manager' && (
            <div className="input-with-icon" style={{ width: '240px' }}>
              <span className="input-icon-left" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </span>
              <input
                type="text"
                className="form-input"
                placeholder="Search Invoice..."
                style={{ paddingLeft: '2rem', height: '36px', fontSize: '0.875rem' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          )}
          <div className="custom-select-wrapper" style={{ width: '160px' }}>
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ height: '36px', fontSize: '0.875rem' }}
            >
              <option value="" disabled>Filter by Status</option>
              <option value="collected">Collected</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
            <ChevronDown size={14} className="text-muted select-icon" style={{ right: '10px' }} />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="payments-table">
            <thead>
              <tr>
                <th style={{ width: '10%' }}>LEAD ID</th>
                <th style={{ width: '12%' }}>CUSTOMER</th>
                <th style={{ width: '12%' }}>ORDER VALUE</th>
                <th style={{ width: '14%' }}>AMOUNT COLLECTED</th>
                <th style={{ width: '12%' }}>UPCOMING DUES</th>
                <th style={{ width: '12%' }}>PENDING PAYMENTS</th>
                <th style={{ width: '12%' }}>OVERDUE PAYMENTS</th>
                <th style={{ width: '14%' }}>DUE DATE</th>
                <th style={{ width: '12%' }}>STATUS</th>
                {viewMode === 'coordinator' && <th style={{ width: '12%' }}>INVOICE VALUE</th>}
                <th style={{ width: '10%' }}>METHOD</th>
                <th style={{ width: '12%' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={viewMode === 'coordinator' ? 12 : 11} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No payments found
                  </td>
                </tr>
              ) : (
                filteredPayments.map((payment, i) => {
                  const isOverdue = String(payment.status || '').toLowerCase() === 'overdue' || (Number(payment.overduePayments) || 0) > 0;
                  return (
                    <tr key={payment.id || i}>
                      <td className="fw-700 text-primary">{payment.leadId || '—'}</td>
                      <td>{payment.customer || '—'}</td>
                      <td className="fw-700 text-primary">{fmtMoney(payment.orderValue)}</td>
                      <td className={(Number(payment.amountCollected) || 0) !== 0 ? 'text-primary fw-700' : 'text-primary'}>{fmtMoney(payment.amountCollected)}</td>
                      <td>{fmtMoney(payment.upcomingDues)}</td>
                      <td>{fmtMoney(payment.pendingPayments)}</td>
                      <td>{fmtMoney(payment.overduePayments)}</td>
                      <td>
                        <label className="custom-date-picker">
                          <span className={isOverdue ? 'text-red' : ''}>{payment.dueDate}</span>
                          <CalendarDays size={16} className="calendar-icon" />
                          <input
                            type="date"
                            className="hidden-date-input"
                            value={payment.dueDate || ''}
                            onChange={(e) => handleDateChange(payment.id, e.target.value)}
                          />
                        </label>
                      </td>
                      <td>{payment.status || deriveStatus(payment) || '-'}</td>
                      {viewMode === 'coordinator' && <td>{fmtMoney(payment.invoiceValue)}</td>}
                      <td>{payment.method || '—'}</td>
                      <td>
                        <div className="action-buttons-group">
                          <button
                            className={`action-btn-sm ${drawer?.id === payment.id && drawerMode === 'view' ? 'active' : ''}`}
                            title="View"
                            onClick={() => openDrawer(payment, 'view')}
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            className={`action-btn-sm ${drawer?.id === payment.id && drawerMode === 'edit' ? 'active' : ''}`}
                            title="Edit"
                            onClick={() => openDrawer(payment, 'edit')}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            className="action-btn-sm"
                            title="Download"
                            onClick={() => downloadRecord(payment)}
                          >
                            <Download size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination-footer">
          <div className="text-muted" style={{ fontSize: '0.875rem' }}>
            Showing {filteredPayments.length === 0 ? 0 : 1} to {filteredPayments.length} of {filteredPayments.length} invoices
          </div>
          <div className="pagination-controls">
            <button className="page-btn"><ChevronLeft size={16} /></button>
            <button className="page-btn active">1</button>
            <button className="page-btn"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      <RecordPaymentModal
        isOpen={isRecordPaymentModalOpen}
        onClose={() => {
          setIsRecordPaymentModalOpen(false);
          setSelectedPayment(null);
        }}
        payment={selectedPayment}
        onSave={handleSave}
      />

      {/* Payment Collection detail drawer (View / Edit) — bound to the LIVE record */}
      {drawer && (
        <PaymentDrawer
          record={drawer}
          mode={drawerMode}
          setMode={setDrawerMode}
          tab={drawerTab}
          setTab={setDrawerTab}
          editForm={editForm}
          setEditForm={setEditForm}
          rebuildEditForm={() => buildEditForm(drawer)}
          saving={drawerSaving}
          onClose={closeDrawer}
          onSaveEdits={saveDrawerEdits}
          newNote={newNote}
          setNewNote={setNewNote}
          onSaveNote={saveNote}
          uploadForm={uploadForm}
          setUploadForm={setUploadForm}
          onInvoiceFile={onInvoiceFile}
          onSubmitUpload={submitInvoiceUpload}
          onSendReminder={sendReminder}
          onLogPayment={openLogPayment}
          onDownload={() => downloadRecord(drawer)}
          leads={leads}
          managerOptions={managerOptions}
        />
      )}

      {/* Log Payment modal (replaces the native prompt) */}
      {logPayOpen && drawer && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
          <div style={{ width: '100%', maxWidth: '420px', padding: '2rem', borderRadius: '1rem', margin: 'auto', background: 'var(--surface-color,#ffffff)', boxShadow: '0 20px 60px rgba(15,23,42,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700', color: 'var(--text-main,#1F2937)' }}>Log Payment</h3>
              <button onClick={closeLogPayment} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted,#64748B)' }}><X size={22} /></button>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted,#64748B)', marginBottom: '1.25rem' }}>
              Invoice <span style={{ fontWeight: '700', color: 'var(--text-main,#1F2937)' }}>{drawer.id || '—'}</span>
              {drawer.customer ? <> · {drawer.customer}</> : null}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); confirmLogPayment(); }} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-main,#1F2937)' }}>Amount Collected (₹)</label>
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  value={logPayAmount}
                  onChange={(e) => setLogPayAmount(e.target.value)}
                  placeholder="e.g. 425000"
                  style={{ width: '100%', padding: '0.7rem 0.85rem', borderRadius: 'var(--radius-md,8px)', border: '1px solid var(--border-color,#E2E8F0)', outline: 'none', fontSize: '0.9rem', backgroundColor: 'var(--surface-color,#ffffff)', color: 'var(--text-main,#1F2937)' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.25rem' }}>
                <button type="button" onClick={closeLogPayment} style={{ padding: '0.6rem 1.4rem', borderRadius: 'var(--radius-md,8px)', border: '1px solid var(--border-color,#E2E8F0)', background: '#ffffff', color: 'var(--text-main,#1F2937)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={drawerSaving} style={{ padding: '0.6rem 1.6rem', borderRadius: 'var(--radius-md,8px)', backgroundColor: '#16A34A', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', opacity: drawerSaving ? 0.6 : 1 }}>
                  {drawerSaving ? 'Saving…' : 'Log Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

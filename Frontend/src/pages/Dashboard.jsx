import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar, ChevronDown, Users, Sparkles, Flame, Thermometer, Snowflake,
  CalendarCheck, FileText, CheckCircle, Trash2, XCircle,
  CalendarDays, CheckCircle2, Flag,
  FileSignature, Clock, Send, ThumbsUp,
  AlertCircle, Activity, Archive, FileArchive
} from 'lucide-react';
import DateRangePicker from '../components/DateRangePicker';
import ScopeFilter from '../components/ScopeFilter';
import { api } from '../api/client';
import useAutoRefresh from '../hooks/useAutoRefresh';
import { useViewMode } from '../context/ViewModeContext';
import './Dashboard.css';

// ---- helpers ----------------------------------------------------------------
const S = (v) => String(v || '').toLowerCase();

// Parse money strings that may carry ₹, commas or k / L / Cr / M suffixes
const parseMoney = (v) => {
  if (v == null) return 0;
  let s = String(v).toLowerCase().replace(/[₹,\s]/g, '');
  let mult = 1;
  if (s.endsWith('cr')) { mult = 1e7; s = s.slice(0, -2); }
  else if (s.endsWith('l')) { mult = 1e5; s = s.slice(0, -1); }
  else if (s.endsWith('k')) { mult = 1e3; s = s.slice(0, -1); }
  else if (s.endsWith('m')) { mult = 1e6; s = s.slice(0, -1); }
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n * mult;
};

const fmtMoney = (n) => {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const trim = (x) => { const s = x.toFixed(1); return s.endsWith('.0') ? s.slice(0, -2) : s; };
  if (abs >= 1e7) { const val = trim(v / 1e7); return `₹${val} ${val === '1' ? 'Crore' : 'Crores'}`; }
  if (abs >= 1e5) { const val = trim(v / 1e5); return `₹${val} ${val === '1' ? 'Lakh' : 'Lakhs'}`; }
  return '₹' + Math.round(v).toLocaleString('en-IN');
};

const inPipeline = (l) => (l.projectValue || l.value || l.budget) && !S(l.status).includes('lost') && !S(l.status).includes('junk');
const leadAmount = (l) => parseMoney(l.projectValue || l.value || l.budget);

const Card = ({ tone, title, value, subtitle, icon: Icon }) => (
  <div className={`metric-card ${tone}`}>
    <div className="metric-header"><span className="metric-title">{title}</span>{Icon && <Icon size={16} />}</div>
    <div className="metric-value">{value}</div>
    <div className="metric-subtitle">{subtitle}</div>
  </div>
);

export default function Dashboard() {
  // app-wide role + selected manager + selected coordinator (shared across every page)
  const { view: viewMode, setView: setViewMode, manager: selManager, setManager: setSelManager, coordinator: selCoordinator, setCoordinator: setSelCoordinator } = useViewMode();

  const [leads, setLeads] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [projects, setProjects] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loginManagers, setLoginManagers] = useState([]); // managers with a login account
  const [loginCoordinators, setLoginCoordinators] = useState([]); // coordinators with a login account
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [range, setRange] = useState({ start: null, end: null });

  // Pull all live data from the shared CRM database
  const load = async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      setLoadError('');
      const safe = (p) => p.then((d) => (Array.isArray(d) ? d : [])).catch(() => null);
      const [ld, ap, qt, pr, pm, mg, co] = await Promise.all([
        safe(api('/leads')), safe(api('/appointments')), safe(api('/quotations')), safe(api('/projects')), safe(api('/payments')),
        safe(api('/auth/managers')), safe(api(`/users?role=${encodeURIComponent('Sales Coordinator')}`)),
      ]);
      if (ld === null && ap === null && qt === null && pm === null) {
        setLoadError('Could not reach the server. Start the Sales Head backend to see live data.');
      }
      setLeads(ld || []);
      setAppointments(ap || []);
      setQuotations(qt || []);
      setProjects(pr || []);
      setPayments(pm || []);
      setLoginManagers((mg || []).map((u) => u.name).filter(Boolean));
      setLoginCoordinators((co || []).map((u) => u.name).filter(Boolean));
      setLoading(false);
  };
  useEffect(() => { load(true); }, []);
  useAutoRefresh(() => load(false));

  // Only managers who actually have a login account appear in the filter.
  // (Falls back to managers seen in the data if the accounts endpoint is unavailable.)
  const managers = useMemo(() => {
    if (loginManagers.length) return [...loginManagers].sort();
    const set = new Set();
    leads.forEach((l) => { if (l.manager && l.manager !== 'Unassigned') set.add(l.manager); });
    payments.forEach((p) => { if (p.manager) set.add(p.manager); });
    appointments.forEach((a) => { if (a.manager) set.add(a.manager); });
    return Array.from(set).sort();
  }, [loginManagers, leads, payments, appointments]);

  // Coordinators who have a login account (for the Coordinator View filter)
  const coordinators = useMemo(() => [...loginCoordinators].sort(), [loginCoordinators]);

  const leadManagerById = useMemo(() => {
    const m = {};
    leads.forEach((l) => { if (l.id) m[l.id] = l.manager; });
    return m;
  }, [leads]);

  // In Manager View, metrics are scoped to the selected manager. In Coordinator
  // View there is no per-record coordinator field, so metrics show org-wide totals.
  const scopeManager = viewMode === 'manager' ? selManager : 'all';

  // Metrics for the current scope.
  // IMPORTANT: these must match the REAL Manager / Coordinator dashboards exactly, so the
  // appointment / quotation / order counts are derived from the actual APPOINTMENT, QUOTATION
  // and PROJECT records (type-aware) — NOT from lead status — using the same filters as those
  // modules. Manager View scopes to the selected manager; Coordinator View is org-wide.
  const m = useMemo(() => {
    const isManagerView = viewMode === 'manager';
    const inMgr = (mgr) => scopeManager === 'all' || mgr === scopeManager;
    const inDate = (v) => { if (!range.start || !range.end) return true; const t = new Date(v).getTime(); if (isNaN(t)) return true; const a = new Date(range.start); a.setHours(0,0,0,0); const b = new Date(range.end); b.setHours(23,59,59,999); return t >= a.getTime() && t <= b.getTime(); };

    const fLeads = leads.filter((l) => inMgr(l.manager) && inDate(l.date || l.createdAt));
    // Appointments: Manager View scopes by the appointment's manager; Coordinator View = all
    const fAppts = (isManagerView ? appointments.filter((a) => inMgr(a.manager)) : appointments).filter((a) => inDate(a.date || a.createdAt));
    const fPays = payments.filter((p) => inMgr(p.manager) && inDate(p.date || p.createdAt));
    // Quotations: Manager View = quotations raised against this manager's leads (matches the
    // Manager dashboard's myQuotes); Coordinator View = all quotations (matches the Coordinator).
    const myLeadIds = new Set(fLeads.map((l) => l.id));
    const fQuotes = (isManagerView ? quotations.filter((q) => myLeadIds.has(q.leadId)) : quotations).filter((q) => inDate(q.date || q.createdAt));
    // Order Confirmations are the real handover/project documents (both real dashboards use
    // the full projects list length).
    const fProjects = projects.filter((p) => inDate(p.date || p.createdAt));

    // Appointment type + completion helpers (identical to the Coordinator/Manager appt pages)
    const isVisit = (a) => /visit/i.test(a.type || a.visitType || '');
    const isDone = (a) => S(a.status).includes('complet') || a.status === 'Completed' || a.progressStatus === 'completed';

    const countLead = (pred) => fLeads.filter(pred).length;
    const sumPay = (k) => fPays.reduce((t, x) => t + (Number(x[k]) || 0), 0);

    return {
      // leads (status substring — same as both modules)
      totalLeads: fLeads.length,
      newLeads: countLead((l) => S(l.status).includes('new') || S(l.status).includes('received')),
      hot: countLead((l) => S(l.status).includes('hot')),
      warm: countLead((l) => S(l.status).includes('warm')),
      cold: countLead((l) => S(l.status).includes('cold')),
      lost: countLead((l) => S(l.status).includes('lost')),
      junk: countLead((l) => S(l.status).includes('junk')),
      // record-based overview counts (match the real modules)
      apptFixed: fAppts.filter((a) => !isVisit(a)).length,
      quotationSend: fQuotes.length,
      orderConfirmed: fProjects.length,
      // appointments (type-aware, matches the appointment pages)
      apptTotal: fAppts.filter((a) => !isVisit(a)).length,
      // Manager dashboard counts ALL planned visits; Coordinator counts only not-yet-completed
      apptPlanned: isManagerView
        ? fAppts.filter((a) => isVisit(a)).length
        : fAppts.filter((a) => isVisit(a) && !isDone(a)).length,
      apptCompleted: fAppts.filter((a) => !isVisit(a) && isDone(a)).length,
      visitComplete: fAppts.filter((a) => isVisit(a) && isDone(a)).length,
      apptRescheduled: fAppts.filter((a) => !!a.rescheduledAt).length,
      // quotations — match each module's own status filters
      qRequested: isManagerView
        ? fQuotes.length
        : fQuotes.filter((q) => !q.quotationStatus || S(q.quotationStatus) === 'requested' || S(q.quotationStatus) === 'draft').length,
      qPending: isManagerView
        ? fQuotes.filter((q) => S(q.approvalStatus) !== 'approved').length
        : fQuotes.filter((q) => S(q.approvalStatus) === 'pending').length,
      qApproved: fQuotes.filter((q) => S(q.approvalStatus) === 'approved').length,
      qCompleted: fQuotes.filter((q) => S(q.quotationStatus).includes('prepared') || S(q.quotationStatus).includes('completed') || S(q.quotationStatus).includes('sent')).length,
      // pipeline
      pipelineValue: fLeads.filter(inPipeline).reduce((t, l) => t + leadAmount(l), 0),
      orderClosed: fProjects.length,
      // payments
      collected: sumPay('amountCollected'),
      upcoming: sumPay('upcomingDues'),
      pending: sumPay('pendingPayments'),
      overdue: sumPay('overduePayments'),
    };
  }, [leads, appointments, quotations, projects, payments, leadManagerById, scopeManager, viewMode, range]);

  // Per-manager summary rows (for the breakdown / drill-down table)
  const managerRows = useMemo(() => managers.map((mgr) => {
    const ml = leads.filter((l) => l.manager === mgr);
    const mp = payments.filter((p) => p.manager === mgr);
    const mLeadIds = new Set(ml.map((l) => l.id));
    const ma = appointments.filter((a) => a.manager === mgr);
    const mq = quotations.filter((q) => mLeadIds.has(q.leadId));
    const isVisit = (a) => /visit/i.test(a.type || a.visitType || '');
    return {
      manager: mgr,
      total: ml.length,
      hot: ml.filter((l) => S(l.status).includes('hot')).length,
      apptFixed: ma.filter((a) => !isVisit(a)).length,
      quotation: mq.length,
      confirmed: ml.filter((l) => S(l.status).includes('order confirmed')).length,
      pipeline: ml.filter(inPipeline).reduce((t, l) => t + leadAmount(l), 0),
      collected: mp.reduce((t, x) => t + (Number(x.amountCollected) || 0), 0),
    };
  }), [managers, leads, appointments, quotations, payments]);

  const scopeLabel = viewMode === 'coordinator'
    ? (selCoordinator === 'all' ? 'All Coordinators' : selCoordinator)
    : (selManager === 'all' ? 'All Managers' : selManager);

  return (
    <div className="dashboard-container">

      <div className="dashboard-header-bar">
        <div className="view-toggle">
          <button className={`toggle-btn ${viewMode === 'manager' ? 'active' : ''}`} onClick={() => setViewMode('manager')}>Manager View</button>
          <button className={`toggle-btn ${viewMode === 'coordinator' ? 'active' : ''}`} onClick={() => setViewMode('coordinator')}>Coordinator View</button>
        </div>

        <div className="dashboard-filters">
          <DateRangePicker onApply={(s, e) => setRange({ start: s, end: e })} />
          <ScopeFilter />
        </div>
      </div>

      <div className="welcome-banner mb-2">
        <div className="banner-content">
          <h1>Welcome Back, Saleem Khan 👋</h1>
          <p>{loading ? 'Loading live data…' : `Showing ${scopeLabel} • ${m.totalLeads} leads in scope`}</p>
        </div>
      </div>

      {loadError && (
        <div className="dashboard-section" style={{ color: '#B45309', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '0.85rem 1.1rem', fontSize: '0.9rem' }}>
          {loadError}
        </div>
      )}

      {/* Per-manager breakdown — every manager's counts at a glance; click to drill in */}
      {viewMode === 'manager' && managerRows.length > 0 && (
        <div className="dashboard-section">
          <h2 className="section-title border-title">Managers Overview</h2>
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-color, #E5E9F0)', borderRadius: 12 }}>
            <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#F6F8FB', textAlign: 'left' }}>
                  {['Manager', 'Total Leads', 'Hot', 'Appt Fixed', 'Quotations', 'Order Confirmed', 'Pipeline Value', 'Collected'].map((h, i) => (
                    <th key={h} style={{ padding: '0.8rem 1rem', fontWeight: 700, color: '#475569', textAlign: i === 0 ? 'left' : 'center', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {managerRows.map((r) => {
                  const active = selManager === r.manager;
                  return (
                    <tr
                      key={r.manager}
                      onClick={() => setSelManager(active ? 'all' : r.manager)}
                      style={{ borderTop: '1px solid #EEF1F5', cursor: 'pointer', background: active ? '#EEF4FF' : 'transparent' }}
                    >
                      <td style={{ padding: '0.8rem 1rem', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>{r.manager}</td>
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>{r.total}</td>
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>{r.hot}</td>
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>{r.apptFixed}</td>
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>{r.quotation}</td>
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>{r.confirmed}</td>
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'center', fontWeight: 700, color: '#0F9D8F' }}>{fmtMoney(r.pipeline)}</td>
                      <td style={{ padding: '0.8rem 1rem', textAlign: 'center', fontWeight: 700, color: '#166534' }}>{fmtMoney(r.collected)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748B)', marginTop: '0.5rem' }}>
            Click a manager to view only their progress below. Click again to return to all managers.
          </p>
        </div>
      )}

      {viewMode === 'coordinator' && (
        <>
          <div className="dashboard-section">
            <h2 className="section-title">Leads Overview</h2>
            <div className="grid-5-col">
              <Card tone="card-grey" title="Total Leads" value={m.totalLeads} subtitle="All leads in system" icon={Users} />
              <Card tone="card-blue" title="New Leads" value={m.newLeads} subtitle="Freshly received" icon={Sparkles} />
              <Card tone="card-red" title="Hot Leads" value={m.hot} subtitle="High conversion chance" icon={Flame} />
              <Card tone="card-orange" title="Warm Leads" value={m.warm} subtitle="Nurturing in progress" icon={Thermometer} />
              <Card tone="card-slate" title="Cold Leads" value={m.cold} subtitle="Need re-engagement" icon={Snowflake} />
              <Card tone="card-green" title="Appt. Fixed" value={m.apptFixed} subtitle="Meetings scheduled" icon={CalendarCheck} />
              <Card tone="card-purple" title="Quotation Send" value={m.quotationSend} subtitle="Awaiting response" icon={FileText} />
              <Card tone="card-emerald" title="Order Confirmed" value={m.orderConfirmed} subtitle="Successfully closed" icon={CheckCircle} />
              <Card tone="card-slate" title="Junk" value={m.junk} subtitle="Unqualified leads" icon={Trash2} />
              <Card tone="card-rose" title="Lost" value={m.lost} subtitle="Unconverted leads" icon={XCircle} />
            </div>
          </div>

          <div className="dashboard-section">
            <h2 className="section-title">Appointments</h2>
            <div className="grid-4-col">
              <Card tone="card-indigo" title="Total Appointments" value={m.apptTotal} subtitle="All scheduled appointments" icon={CalendarDays} />
              <Card tone="card-green" title="Completed Appointments" value={m.apptCompleted} subtitle="Successfully completed" icon={CheckCircle2} />
            </div>
          </div>

          <div className="dashboard-section">
            <h2 className="section-title">Quotations</h2>
            <div className="grid-4-col">
              <Card tone="card-indigo" title="Requested Quotations" value={m.qRequested} subtitle="Draft & initial requests" icon={FileSignature} />
              <Card tone="card-yellow" title="Pending Quotations" value={m.qPending} subtitle="Awaiting client/mgr approval" icon={Clock} />
              <Card tone="card-blue" title="Completed Quotations" value={m.qCompleted} subtitle="Prepared & sent to clients" icon={Send} />
              <Card tone="card-emerald" title="Approved Quotations" value={m.qApproved} subtitle="Accepted quotations" icon={ThumbsUp} />
            </div>
          </div>

          <div className="dashboard-section">
            <h2 className="section-title">Payments</h2>
            <div className="grid-4-col">
              <Card tone="card-green" title="Total Collected" value={fmtMoney(m.collected)} subtitle="Amount received" icon={CheckCircle} />
              <Card tone="card-indigo" title="Upcoming Dues" value={fmtMoney(m.upcoming)} subtitle="Due soon" icon={Clock} />
              <Card tone="card-yellow" title="Pending Payments" value={fmtMoney(m.pending)} subtitle="Awaiting clearance" icon={AlertCircle} />
              <Card tone="card-rose" title="Overdue Payments" value={fmtMoney(m.overdue)} subtitle="Past due date" icon={XCircle} />
            </div>
          </div>
        </>
      )}

      {viewMode === 'manager' && (
        <>
          <div className="dashboard-section">
            <h2 className="section-title border-title">Lead Management</h2>
            <div className="grid-4-col">
              <Card tone="card-purple" title="Total Leads" value={m.totalLeads} subtitle="All leads in scope" icon={Users} />
              <Card tone="card-blue" title="New Leads" value={m.newLeads} subtitle="Freshly received" icon={Sparkles} />
              <Card tone="card-red" title="Hot Leads" value={m.hot} subtitle="High conversion chance" icon={Flame} />
              <Card tone="card-orange" title="Warm Leads" value={m.warm} subtitle="Nurturing in progress" icon={Thermometer} />
              <Card tone="card-blue" title="Cold Leads" value={m.cold} subtitle="Need re-engagement" icon={Snowflake} />
              <Card tone="card-orange" title="Lost Deal" value={m.lost} subtitle="Unsuccessful deals" icon={XCircle} />
              <Card tone="card-slate" title="Junk" value={m.junk} subtitle="Unqualified leads" icon={Trash2} />
            </div>
          </div>

          <div className="dashboard-section">
            <h2 className="section-title border-title">Appointments</h2>
            <div className="grid-4-col">
              <Card tone="card-blue" title="Total Appointments" value={m.apptTotal} subtitle="Scheduled overall" icon={CalendarDays} />
              <Card tone="card-purple" title="Total Visit Planned" value={m.apptPlanned} subtitle="Planned site visits" icon={Activity} />
              <Card tone="card-green" title="Appointment Complete" value={m.apptCompleted} subtitle="Successfully completed" icon={Users} />
              <Card tone="card-yellow" title="Total Visit Completed" value={m.visitComplete} subtitle="Site visits wrapped up" icon={CheckCircle2} />
              <Card tone="card-slate" title="Rescheduled Appointment" value={m.apptRescheduled} subtitle="Needs follow-up" icon={Clock} />
            </div>
          </div>

          <div className="dashboard-section">
            <h2 className="section-title border-title">Quotations</h2>
            <div className="grid-4-col">
              <Card tone="card-blue" title="Requested Quotation" value={m.qRequested} subtitle="Total requests" icon={FileText} />
              <Card tone="card-orange" title="Pending Quotation" value={m.qPending} subtitle="Awaiting approval" icon={Clock} />
              <Card tone="card-green" title="Approved Quotation" value={m.qApproved} subtitle="Accepted quotations" icon={CheckCircle} />
            </div>
          </div>

          <div className="dashboard-section">
            <h2 className="section-title border-title">Order Confirmation</h2>
            <div className="grid-4-col">
              <Card tone="card-yellow" title="Order Confirmed" value={m.orderConfirmed} subtitle="Confirmed orders" icon={Archive} />
            </div>
          </div>

          <div className="dashboard-section">
            <h2 className="section-title border-title">Sales Pipeline</h2>
            <div className="grid-4-col">
              <Card tone="card-orange" title="Sales Pipeline Value" value={fmtMoney(m.pipelineValue)} subtitle="Active opportunities" icon={FileArchive} />
              <Card tone="card-yellow" title="Order Closed" value={m.orderClosed} subtitle="Confirmed this scope" icon={Flame} />
              <Card tone="card-green" title="Order Confirmed" value={m.orderConfirmed} subtitle="Successfully closed" icon={CheckCircle} />
            </div>
          </div>

          <div className="dashboard-section">
            <h2 className="section-title border-title">Payment Collection</h2>
            <div className="grid-4-col">
              <Card tone="card-green" title="Total Collected" value={fmtMoney(m.collected)} subtitle="Amount received" icon={CheckCircle2} />
              <Card tone="card-blue" title="Upcoming Dues" value={fmtMoney(m.upcoming)} subtitle="Due soon" icon={Clock} />
              <Card tone="card-orange" title="Pending Payments" value={fmtMoney(m.pending)} subtitle="Awaiting clearance" icon={AlertCircle} />
              <Card tone="card-rose" title="Overdue Payments" value={fmtMoney(m.overdue)} subtitle="Past due date" icon={XCircle} />
            </div>
          </div>
        </>
      )}

    </div>
  );
}

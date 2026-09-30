import React, { useState, useEffect } from 'react';
import {
  Calendar, ChevronDown, Filter, Flame, Activity, Snowflake, XCircle,
  ArrowDownUp, Eye, Edit2, Trash2, CalendarDays
} from 'lucide-react';
import DateRangePicker from '../components/DateRangePicker';
import ScopeFilter from '../components/ScopeFilter';
import { api } from '../api/client';
import { useViewMode } from '../context/ViewModeContext';
import { stageColor } from '../utils/statusColors';
import './Pipeline.css';

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

const PIPELINE_STAGES = ['New', 'Hot', 'Warm', 'Cold', 'Appointment Fixed', 'Lost'];

// Map a lead's status to a pipeline stage when stage is empty.
const mapStatusToStage = (status) => {
  const s = String(status || '').trim().toLowerCase();
  const found = PIPELINE_STAGES.find(st => st.toLowerCase() === s);
  return found || 'New';
};

// --- Coordinator-parity derivation helpers -------------------------------
// Parse any value representation (₹35,00,000 / "100k" / 100) into a plain number.
const parseVal = (v) => parseFloat(String(v == null ? '' : v).replace(/[^\d.]/g, '')) || 0;

// Map a lead's status onto one of the fixed pipeline stages (EXACT copy from Coordinator).
const toStage = (status) => {
  const s = String(status || '').toLowerCase();
  if (s.includes('hot')) return 'Hot';
  if (s.includes('warm') || s.includes('quotation')) return 'Warm';
  if (s.includes('lost')) return 'Lost';
  if (s.includes('cold') || s.includes('junk')) return 'Cold';
  if (s.includes('appoint')) return 'Appointment Fixed';
  return 'New';
};

const fmtExpected = (d) => {
  if (!d || d === 'Pending' || d === 'No Date') return '-';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '-' : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const toDateInput = (d) => {
  if (!d || d === 'Pending' || d === 'No Date') return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

// Build a stable opportunity id from a lead/pipeline id.
const digitsId = (id) => `OP-${String(id || '').replace(/\D/g, '') || id}`;

export default function Pipeline() {
    const { view: viewMode, setView: setViewMode, manager, setManager } = useViewMode();
  const [leads, setLeads] = useState([]);   // live leads from the backend
  const [extras, setExtras] = useState([]); // persisted stage/follow-up edits (/pipeline)
  const [leadsLoaded, setLeadsLoaded] = useState(false);
  const [managers, setManagers] = useState([]);
  const [openDropdownId, setOpenDropdownId] = useState(null);

  const [filterStage, setFilterStage] = useState('all');
  const [filterService, setFilterService] = useState('all');
  const [filterExecutive, setFilterExecutive] = useState('all');

  // Poll BOTH sources so the Head is a live mirror of the Coordinator pipeline.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api('/leads').then(d => { if (!cancelled && Array.isArray(d)) setLeads([...d].sort((a, b) => new Date(b.createdAt || b.updatedAt || b.date || 0) - new Date(a.createdAt || a.updatedAt || a.date || 0))); }).catch(() => {}).finally(() => { if (!cancelled) setLeadsLoaded(true); });
      api('/pipeline').then(d => { if (!cancelled && Array.isArray(d)) setExtras(d); }).catch(() => {});
    };
    load();
    const t = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const mgrs = await api('/auth/managers');
        if (!active) return;
        setManagers(Array.isArray(mgrs) ? mgrs : []);
      } catch {
        if (active) setManagers([]);
      }
    })();
    return () => { active = false; };
  }, []);

  // Derive an opportunity row from a live lead (Coordinator parity, mapped to Head fields).
  const deriveRow = (l, val) => ({
    id: digitsId(l.id),
    leadId: l.id,
    customer: l.name || l.customer || '—',
    company: l.company || '',
    service: l.projectType || l.services || l.service || '-',
    stage: toStage(l.status),
    assignedTo: l.manager || 'Unassigned',
    expectedClose: fmtExpected(l.followUp),
    projectValue: fmtMoney(val),
    value: val,
    lastActivity: 'Today',
    followUp: toDateInput(l.followUp),
  });

  // Build a row from a persisted (legacy / standalone) pipeline doc.
  const extraRow = (e) => {
    const val = parseVal(e.value);
    return {
      id: e.id || digitsId(e.leadId),
      leadId: e.leadId || e.id,
      customer: e.customer || '—',
      company: e.company || '',
      service: e.service || '-',
      stage: e.stage || 'New',
      assignedTo: e.assignedTo || 'Unassigned',
      expectedClose: (e.expectedClose && e.expectedClose !== '-') ? e.expectedClose : '-',
      projectValue: fmtMoney(val),
      value: val,
      lastActivity: e.lastActivity || 'Today',
      followUp: e.followUp || '',
    };
  };

  const scoreDoc = (e) => (e && e.stage && e.stage !== 'New' ? 2 : 0) + (e && e.followUp ? 1 : 0);

  // ONE ROW PER LEAD. Resolve every stored doc back to its lead (by leadId, canonical OP-id,
  // or customer name), keep only the best override per lead, and never render a stored doc as
  // its own row unless it truly matches no lead.
  const pipelineData = React.useMemo(() => {
    if (!leadsLoaded) return []; // wait for leads before matching docs (prevents duplicate flash)
    const map = new Map();
    const leadByOpId = new Map();
    const leadByName = new Map();
    leads.forEach((l) => {
      const val = parseVal(l.budget != null ? l.budget : l.value);
      if (val <= 0 || String(l.status || '').toLowerCase() === 'junk') return;
      map.set(l.id, deriveRow(l, val));
      leadByOpId.set(digitsId(l.id), l.id); leadByOpId.set('L' + parseInt(String(l.id || '').replace(/\D/g, ''), 10), l.id);
      if (l.name) leadByName.set(String(l.name).trim().toLowerCase(), l.id);
    });
    const resolveLead = (e) => {
      if (e.leadId && map.has(e.leadId)) return e.leadId;
      if (leadByOpId.has(e.id)) return leadByOpId.get(e.id);
      const _nk = 'L' + parseInt(String(e.leadId || e.id).replace(/\D/g, ''), 10); if (leadByOpId.has(_nk)) return leadByOpId.get(_nk);
      const n = String(e.customer || '').trim().toLowerCase();
      if (n && leadByName.has(n)) return leadByName.get(n);
      return null;
    };
    const bestByLead = new Map();
    const orphans = new Map();
    extras.forEach((e) => {
      const lid = resolveLead(e);
      if (lid) { const cur = bestByLead.get(lid); if (!cur || scoreDoc(e) > scoreDoc(cur)) bestByLead.set(lid, e); }
      else if (!orphans.has(e.id)) orphans.set(e.id, e);
    });
    bestByLead.forEach((e, lid) => {
      const base = map.get(lid);
      if (!base) return;
      map.set(lid, {
        ...base,
        stage: e.stage || base.stage,
        followUp: (e.followUp !== undefined && e.followUp !== '') ? e.followUp : base.followUp,
        expectedClose: (e.expectedClose && e.expectedClose !== '-') ? e.expectedClose : base.expectedClose,
      });
    });
    return [...Array.from(map.values()), ...Array.from(orphans.values()).map(extraRow)];
  }, [leads, extras, leadsLoaded]);

  // One-time self-heal: delete duplicate pipeline docs for the same lead from the shared
  // collection (older OP-id schemes / lost leadId), keeping the most-edited one.
  const healedRef = React.useRef(false);
  useEffect(() => {
    if (healedRef.current || leads.length === 0 || extras.length === 0) return;
    const leadIds = new Set(leads.map((l) => l.id));
    const leadByOpId = new Map();
    const leadByName = new Map();
    leads.forEach((l) => { leadByOpId.set(digitsId(l.id), l.id); leadByOpId.set('L' + parseInt(String(l.id || '').replace(/\D/g, ''), 10), l.id); if (l.name) leadByName.set(String(l.name).trim().toLowerCase(), l.id); });
    const resolveLead = (e) => {
      if (e.leadId && leadIds.has(e.leadId)) return e.leadId;
      if (leadByOpId.has(e.id)) return leadByOpId.get(e.id);
      const _nk = 'L' + parseInt(String(e.leadId || e.id).replace(/\D/g, ''), 10); if (leadByOpId.has(_nk)) return leadByOpId.get(_nk);
      const n = String(e.customer || '').trim().toLowerCase();
      if (n && leadByName.has(n)) return leadByName.get(n);
      return null;
    };
    const groups = new Map();
    extras.forEach((e) => { const lid = resolveLead(e); if (lid) { const a = groups.get(lid) || []; a.push(e); groups.set(lid, a); } });
    const removeIds = [];
    groups.forEach((docs) => { if (docs.length < 2) return; [...docs].sort((a, b) => scoreDoc(b) - scoreDoc(a)).slice(1).forEach((d) => { if (d.id) removeIds.push(d.id); }); });
    if (removeIds.length === 0) { healedRef.current = true; return; }
    healedRef.current = true;
    Promise.all(removeIds.map((id) => api(`/pipeline/${id}`, { method: 'DELETE' }).catch(() => {})))
      .then(() => api('/pipeline').then((d) => { if (Array.isArray(d)) setExtras(d); }).catch(() => {}))
      .catch(() => {});
  }, [leads, extras]);

  // Persist a stage / follow-up edit to the shared /pipeline collection.
  const toPayload = (row) => ({
    id: row.id,
    leadId: row.leadId,
    customer: row.customer,
    service: row.service,
    stage: row.stage,
    assignedTo: row.assignedTo,
    expectedClose: row.expectedClose,
    value: row.value,
    followUp: row.followUp,
  });

  const upsertExtra = (row, patch) => {
    const payload = toPayload({ ...row, ...patch });
    setExtras(prev => {
      const i = prev.findIndex(e => e.id === payload.id);
      return i >= 0 ? prev.map((e, j) => (j === i ? { ...e, ...payload } : e)) : [payload, ...prev];
    });
    api('/pipeline/bulk', { method: 'POST', body: [payload] }).catch(() => {});
  };

  const updateStage = (id, newStage) => {
    const row = pipelineData.find(d => d.id === id);
    if (row) upsertExtra(row, { stage: newStage });
    setOpenDropdownId(null);
  };

  const formatDateForInput = (dateStr) => {
    if (!dateStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const [d, m, y] = String(dateStr).split('/');
    if (!d || !m || !y) return '';
    return `${y}-${m}-${d}`;
  };

  const handleDateChange = (id, newDateStr) => {
    if (!newDateStr) return;
    const row = pipelineData.find(d => d.id === id);
    if (row) upsertExtra(row, { followUp: newDateStr });
  };

  // Manager View scopes to the selected manager; Coordinator View is org-wide.
  const scopeMgr = viewMode === 'manager' ? manager : 'all';
  const managerScoped = pipelineData.filter(deal =>
    scopeMgr === 'all' || deal.assignedTo === scopeMgr
  );

  const filteredPipeline = managerScoped.filter(deal => {
    if (filterStage !== 'all' && deal.stage !== filterStage) return false;
    if (filterService !== 'all' && deal.service !== filterService) return false;
    if (viewMode === 'coordinator' && filterExecutive !== 'all' && deal.assignedTo !== filterExecutive) return false;
    return true;
  });

  // Extract unique options for filters
  const uniqueStages = [...new Set(pipelineData.map(d => d.stage).filter(Boolean))];
  const uniqueServices = [...new Set(pipelineData.map(d => d.service).filter(Boolean))];
  const managerNames = [...new Set(managers.map(m => m.name).filter(Boolean))];
  const uniqueExecutives = managerNames.length
    ? managerNames
    : [...new Set(pipelineData.map(d => d.assignedTo).filter(Boolean))];

  // Metrics derived from real data (scoped to the globally selected manager)
  const stageCount = (stage) => managerScoped.filter(d => d.stage === stage).length;
  const totalCount = managerScoped.length;
  const lostCount = stageCount('Lost');
  // Hot / Warm / Cold cards show the TOTAL project value in each stage (not the count)
  const stageValue = (stage) => managerScoped.filter(d => d.stage === stage).reduce((t, d) => t + (Number(d.value) || 0), 0);
  const hotValue = stageValue('Hot');
  const warmValue = stageValue('Warm');
  const coldValue = stageValue('Cold');

  const totalEntries = filteredPipeline.length;

  return (
    <div className="pipeline-page">
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

      <div className="pipeline-header-area">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="page-title">Sales Pipeline</h1>
        </div>

        <div className="pipeline-filters-top">
          <DateRangePicker />

          <ScopeFilter />
        </div>
      </div>

      <div className="pipeline-metrics-grid">
        <div className="metric-card card-blue">
          <div className="metric-header"><span className="metric-title">Total Pipeline</span><Filter size={16} /></div>
          <div className="metric-value">{totalCount}</div><div className="metric-subtitle">All open deals</div>
        </div>
        <div className="metric-card card-red">
          <div className="metric-header"><span className="metric-title">Hot</span><Flame size={16} /></div>
          <div className="metric-value">{fmtMoney(hotValue)}</div><div className="metric-subtitle">Total value · high probability</div>
        </div>
        <div className="metric-card card-orange">
          <div className="metric-header"><span className="metric-title">Warm</span><Activity size={16} /></div>
          <div className="metric-value">{fmtMoney(warmValue)}</div><div className="metric-subtitle">Total value · medium probability</div>
        </div>
        <div className="metric-card card-slate">
          <div className="metric-header"><span className="metric-title">Cold</span><Snowflake size={16} /></div>
          <div className="metric-value">{fmtMoney(coldValue)}</div><div className="metric-subtitle">Total value · low probability</div>
        </div>
        <div className="metric-card card-rose">
          <div className="metric-header"><span className="metric-title">Lost</span><XCircle size={16} /></div>
          <div className="metric-value">{lostCount}</div><div className="metric-subtitle">Closed deals</div>
        </div>
      </div>

      <div className="pipeline-table-container">
        <div className="table-controls">
          {viewMode === 'coordinator' && (
            <input type="text" className="search-input" placeholder="Search Opportunity..." />
          )}

          <div className="filter-group">
            <div className="custom-select-wrapper">
              <select
                className="btn btn--secondary filter-dropdown filter-select"
                value={filterStage}
                onChange={(e) => setFilterStage(e.target.value)}
              >
                <option value="all">Filter by Stage</option>
                {uniqueStages.map(stage => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
              <ChevronDown size={14} className="text-muted select-icon" />
            </div>

            {viewMode === 'coordinator' && (
              <div className="custom-select-wrapper">
                <select
                  className="btn btn--secondary filter-dropdown filter-select"
                  value={filterExecutive}
                  onChange={(e) => setFilterExecutive(e.target.value)}
                >
                  <option value="all">Filter by Sales Executive</option>
                  {uniqueExecutives.map(exec => (
                    <option key={exec} value={exec}>{exec}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="text-muted select-icon" />
              </div>
            )}

            <div className="custom-select-wrapper">
              <select
                className="btn btn--secondary filter-dropdown filter-select"
                value={filterService}
                onChange={(e) => setFilterService(e.target.value)}
              >
                <option value="all">Filter by Service</option>
                {uniqueServices.map(service => (
                  <option key={service} value={service}>{service}</option>
                ))}
              </select>
              <ChevronDown size={14} className="text-muted select-icon" />
            </div>

            <button
              className="btn-text"
              onClick={() => { setFilterStage('all'); setFilterService('all'); setFilterExecutive('all'); setManager('all'); }}
            >
              Reset Filters
            </button>
          </div>
        </div>

        <div className="pipeline-table-scrollable">
          <table className="pipeline-table">
            <thead>
            <tr style={viewMode === 'manager' ? { textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.5px' } : {}}>
              <th>{viewMode === 'manager' ? 'Lead ID' : 'Lead id'}</th>
              <th>Customer</th>
              {viewMode === 'manager' && <th>Company</th>}
              <th>Service</th>
              <th>Stage</th>
              <th>Assigned to</th>
              <th>Expected close</th>
              <th>Project value <ArrowDownUp size={12} className="sort-icon" /></th>
              <th>Last activity</th>
              <th>Follow-up</th>
            </tr>
          </thead>
          <tbody>
            {filteredPipeline.map((deal) => (
              <tr key={deal.id}>
                <td className="fw-600 font-medium text-primary">{deal.leadId || deal.id}</td>
                <td className="fw-700">{deal.customer}</td>
                {viewMode === 'manager' && <td>{deal.company}</td>}
                <td className="text-muted">{deal.service}</td>
                <td style={{ position: 'relative' }}>
                  <div
                    className={`stage-pill stage-pill--${String(deal.stage || '').toLowerCase().replace(' ', '-')}`}
                    onClick={() => setOpenDropdownId(openDropdownId === deal.id ? null : deal.id)}
                    style={{ cursor: 'pointer', backgroundColor: stageColor(deal.stage).bg, color: stageColor(deal.stage).color, borderColor: stageColor(deal.stage).border }}
                  >
                    {deal.stage} <ChevronDown size={12} className="ml-1" />
                  </div>
                  {openDropdownId === deal.id && (
                    <div className="pipeline-dropdown-menu">
                      {['New', 'Hot', 'Warm', 'Cold', 'Appointment Fixed'].map(stage => (
                        <div
                          key={stage}
                          className={`pipeline-dropdown-item ${deal.stage === stage ? 'active' : ''}`}
                          onClick={() => updateStage(deal.id, stage)}
                        >
                          {deal.stage === stage && <span className="check-icon">✓</span>} {stage}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="text-muted">{deal.assignedTo}</td>
                <td className="text-muted">{deal.expectedClose}</td>
                <td className="fw-700 text-success-bright">{deal.projectValue}</td>
                <td className="text-muted">{deal.lastActivity}</td>
                <td>
                  <label className="custom-date-picker">
                    <span className={!deal.followUp ? 'placeholder-text' : ''}>
                      {deal.followUp || 'dd/mm/yyyy'}
                    </span>
                    <CalendarDays size={16} className="calendar-icon" />
                    <input
                      type="date"
                      className="hidden-date-input"
                      value={formatDateForInput(deal.followUp)}
                      onChange={(e) => handleDateChange(deal.id, e.target.value)}
                    />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="pagination-wrapper">
          <span className="pagination-info">
            {totalEntries === 0 ? 'Showing 0 entries' : `Showing 1 to ${totalEntries} of ${totalEntries} entries`}
          </span>
          <div className="pagination-controls">
            <button className="page-btn">&lt;</button>
            <button className="page-btn active">1</button>
            <button className="page-btn">2</button>
            <button className="page-btn">3</button>
            <button className="page-btn">&gt;</button>
          </div>
        </div>
      </div>
    </div>
  );
}

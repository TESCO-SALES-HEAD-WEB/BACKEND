import React, { useState, useEffect } from 'react';
import {
  Plus,
  ChevronDown,
  Edit2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DateRangePicker from '../components/DateRangePicker';
import ScopeFilter from '../components/ScopeFilter';
import { api } from '../api/client';
import useAutoRefresh from '../hooks/useAutoRefresh';
import { useViewMode } from '../context/ViewModeContext';
import './Orders.css';

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

export default function Orders() {
    const { view: viewMode, setView: setViewMode, manager, setManager } = useViewMode();
  const [orders, setOrders] = useState([]);
  const [managersList, setManagersList] = useState([]);
  const [leads, setLeads] = useState([]); // used to resolve a handover's original Lead ID by name
  const navigate = useNavigate();

  // Read the SAME `projects` (Order-Confirmation / handover) collection the Coordinator
  // and Manager apps read, so the Head's Orders list shows the exact same records —
  // each with its File ID (PF-xxxx) and its originating Lead ID — instead of being
  // re-derived from leads. Keeps the two views identical to their respective apps.
  const loadOrders = async () => {
      try {
        const projects = await api('/projects');
        const mapped = (Array.isArray(projects) ? [...projects].sort((a, b) => new Date(b.createdAt || b.updatedAt || b.date || 0) - new Date(a.createdAt || a.updatedAt || a.date || 0)) : [])
          .map(p => ({
            id: p.id,                                             // File ID e.g. PF-1001
            leadId: p.leadId || '',                               // originating Lead ID (may be blank on old records)
            clientName: p.client || p.clientName || p.name || '',
            projectType: p.type || p.projectType || '',
            location: p.location || '',
            salesperson: p.salesperson || p.manager || '',
            manager: p.manager || p.salesperson || '',
            value: fmtMoney(parseMoney(p.value != null ? p.value : (p.quote || p.orderValue || 0)))
          }));
        setOrders(mapped);
      } catch {
        setOrders([]);
      }
  };
  useEffect(() => { loadOrders(); }, []);
  useAutoRefresh(() => {
    loadOrders();
    api('/leads').then((d) => setLeads(Array.isArray(d) ? d : [])).catch(() => {});
  });

  useEffect(() => {
    let active = true;
    api('/leads')
      .then((d) => { if (active) setLeads(Array.isArray(d) ? d : []); })
      .catch(() => { if (active) setLeads([]); });
    return () => { active = false; };
  }, []);

  // Resolve the original Lead ID (LD-xxxx): prefer the stored leadId, else match a lead by
  // customer name, else fall back to the File ID — matching the Manager app's behaviour.
  const resolveLeadId = (order) => {
    if (order.leadId) return order.leadId;
    const nm = String(order.clientName || '').trim().toLowerCase();
    const byName = nm ? leads.find((l) => String(l.name || '').trim().toLowerCase() === nm) : null;
    return byName ? byName.id : order.id;
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api('/auth/managers');
        const names = (Array.isArray(data) ? data : [])
          .map(m => (typeof m === 'string' ? m : (m && (m.name || m.manager)) || ''))
          .filter(Boolean);
        if (active) setManagersList(names);
      } catch {
        if (active) setManagersList([]);
      }
    })();
    return () => { active = false; };
  }, []);

  // Manager View scopes to the selected manager; Coordinator View is org-wide
  const scopeMgr = viewMode === 'manager' ? manager : 'all';
  const filteredOrders = scopeMgr && scopeMgr !== 'all'
    ? orders.filter(o => o.manager === scopeMgr || o.salesperson === scopeMgr)
    : orders;

  return (
    <div className="orders-page">
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

      <div className="orders-header">
        <div>
          <h1>Order Confirmation</h1>
          <p className="header-subtitle text-muted">Manage all sales to project handovers.</p>
        </div>
        <button className="btn btn--primary btn-icon" onClick={() => navigate('/orders/new')}>
          <Plus size={18} />
          New Handover Form
        </button>
      </div>

      <div className="orders-filters">
        <DateRangePicker />
        <ScopeFilter />
      </div>

      <div className="orders-table-container">
        {viewMode === 'manager' ? (
          <table className="orders-table">
            <thead>
              <tr>
                <th>Lead ID</th>
                <th>Client Name</th>
                <th>Project Type</th>
                <th>Location</th>
                <th>Salesperson</th>
                <th>Value</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => (
                <tr key={order.id}>
                  <td className="fw-600 text-file-id-blue" title={order.id}>{resolveLeadId(order)}</td>
                  <td className="fw-700">{order.clientName}</td>
                  <td className="text-muted">{order.projectType}</td>
                  <td className="text-muted">{order.location}</td>
                  <td className="text-muted">{order.salesperson}</td>
                  <td className="fw-700 text-success-bright">{order.value}</td>
                  <td>
                    <button
                      className="btn-circle-edit"
                      title="Edit"
                      onClick={() => navigate(`/orders/edit/${order.id}`)}
                    >
                      <Edit2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="orders-table">
            <thead>
              <tr>
                <th>Lead id</th>
                <th>Client name</th>
                <th>Project type</th>
                <th>Location</th>
                <th>Salesperson</th>
                <th>Value</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => (
                <tr key={order.id}>
                  <td className="fw-600" style={{color: '#334155'}} title={order.id}>{resolveLeadId(order)}</td>
                  <td className="fw-700">{order.clientName}</td>
                  <td className="text-muted">{order.projectType}</td>
                  <td className="text-muted">{order.location}</td>
                  <td className="text-muted">{order.salesperson}</td>
                  <td className="fw-700 text-success-bright">{order.value}</td>
                  <td>
                    <button
                      className="btn-circle-edit"
                      title="Edit"
                      onClick={() => navigate(`/orders/edit/${order.id}`)}
                    >
                      <Edit2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

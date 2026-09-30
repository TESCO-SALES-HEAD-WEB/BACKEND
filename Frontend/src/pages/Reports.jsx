import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, PieChart, Pie, Cell
} from 'recharts';
import { Download, Calendar, Filter, Mail } from 'lucide-react';
import { api } from '../api/client';
import './Reports.css';

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];

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

const leadValue = (l) => parseMoney(l.projectValue || l.value || l.budget);

export default function Reports() {
  const [leads, setLeads] = useState([]);
  const [payments, setPayments] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [managers, setManagers] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [l, p, q, m] = await Promise.all([
          api('/leads').catch(() => []),
          api('/payments').catch(() => []),
          api('/quotations').catch(() => []),
          api('/auth/managers').catch(() => [])
        ]);
        if (!alive) return;
        setLeads(Array.isArray(l) ? l : []);
        setPayments(Array.isArray(p) ? p : []);
        setQuotations(Array.isArray(q) ? q : []);
        setManagers(Array.isArray(m) ? m : []);
      } catch (e) {
        if (!alive) return;
        setLeads([]); setPayments([]); setQuotations([]); setManagers([]);
      }
    };
    load();
    return () => { alive = false; };
  }, []);

  // Revenue: Actual vs Target (cumulative). Actual = collected payments (Cr),
  // target derived from active pipeline value spread cumulatively.
  const managerNames = managers.length
    ? managers.map((m) => m.name)
    : Array.from(new Set(leads.map((l) => l.manager).filter(Boolean)));

  const totalCollected = payments.reduce((s, p) => s + (Number(p.amountCollected) || 0), 0);
  const pipelineValue = leads
    .filter((l) => l.status !== 'Lost' && l.status !== 'Junk')
    .reduce((s, l) => s + leadValue(l), 0);

  // Build a cumulative actual-vs-target series across managers (real breakdown).
  const revData = (() => {
    if (!managerNames.length) return [];
    let cumActual = 0;
    let cumTarget = 0;
    return managerNames.map((name) => {
      const actual = payments
        .filter((p) => p.manager === name)
        .reduce((s, p) => s + (Number(p.amountCollected) || 0), 0);
      const target = leads
        .filter((l) => l.manager === name && l.status !== 'Lost' && l.status !== 'Junk')
        .reduce((s, l) => s + leadValue(l), 0);
      cumActual += actual / 1e7; // in Cr
      cumTarget += target / 1e7;
      return {
        name,
        actual: Number(cumActual.toFixed(2)),
        target: Number(cumTarget.toFixed(2))
      };
    });
  })();

  // Team Comparison: revenue collected vs target (pipeline) per manager, in Cr.
  const teamData = managerNames.map((name) => {
    const revenue = payments
      .filter((p) => p.manager === name)
      .reduce((s, p) => s + (Number(p.amountCollected) || 0), 0);
    const target = leads
      .filter((l) => l.manager === name && l.status !== 'Lost' && l.status !== 'Junk')
      .reduce((s, l) => s + leadValue(l), 0);
    return {
      name,
      revenue: Number((revenue / 1e7).toFixed(2)),
      target: Number((target / 1e7).toFixed(2))
    };
  });

  // Approval Breakdown: quotations by approval status (real counts).
  const approvalPie = (() => {
    const counts = {};
    quotations.forEach((q) => {
      const k = q.approvalStatus || 'Pending';
      counts[k] = (counts[k] || 0) + 1;
    });
    return Object.keys(counts).map((k) => ({ name: k, value: counts[k] }));
  })();

  return (
    <div className="reports-container">
      <div className="page-header">
        <h1>Reports & Analytics</h1>
        <div className="reports-actions">
          <button className="btn btn--secondary"><Mail size={16}/> Schedule</button>
          <button className="btn btn--secondary"><Download size={16}/> Export PDF</button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-item">Preset: YTD <Filter size={14}/></div>
        <div className="filter-item">Manager <Filter size={14}/></div>
        <div className="filter-item">Territory <Filter size={14}/></div>
        <div className="filter-item"><input type="checkbox"/> Compare to previous</div>
      </div>

      <div className="reports-grid">
        <div className="report-card full-width">
          <div className="report-header">
            <h2>Revenue: Actual vs Target (Cumulative)</h2>
          </div>
          <div className="chart-container-large">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={revData}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="target" stroke="var(--border)" fill="transparent" strokeDasharray="5 5" />
                <Area type="monotone" dataKey="actual" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="report-card">
          <div className="report-header">
            <h2>Team Comparison</h2>
          </div>
          <div className="chart-container-large">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={teamData}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip cursor={{fill: 'transparent'}}/>
                <Legend />
                <Bar dataKey="target" fill="var(--border)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenue" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="report-card">
          <div className="report-header">
            <h2>Approval Breakdown</h2>
          </div>
          <div className="chart-container-large" style={{ display: 'flex', justifyContent: 'center' }}>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={approvalPie} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {approvalPie.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

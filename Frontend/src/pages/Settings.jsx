import React, { useState, useEffect } from 'react';
import { Save, Plus, GripVertical, Trash2, Pencil, KeyRound, UserPlus, Check, X, Power } from 'lucide-react';
import { api } from '../api/client';
import './Settings.css';

// ---- shared inline styles (kept local so no global CSS/layout is affected) ----
const box = { border: '1px solid var(--border-color, #E5E9F0)', borderRadius: 12, padding: '1.1rem 1.25rem', marginBottom: '1.25rem', background: 'var(--surface-color, #fff)' };
const gridForm = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.9rem', alignItems: 'end' };
const fieldLabel = { display: 'block', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted, #64748B)', marginBottom: '0.35rem' };
const cellBtn = { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.65rem', borderRadius: 8, border: '1px solid var(--border-color, #E5E9F0)', background: 'var(--surface-color, #fff)', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-main, #1F2937)', fontFamily: 'inherit' };
const th = { textAlign: 'left', padding: '0.7rem 0.9rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569', background: '#F6F8FB', whiteSpace: 'nowrap' };
const td = { padding: '0.7rem 0.9rem', fontSize: '0.85rem', color: '#1F2937', borderTop: '1px solid #EEF1F5', verticalAlign: 'middle' };

function Field({ label, children }) {
  return (
    <div>
      <label style={fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

// Reusable account manager for a given role (Sales Manager / Sales Coordinator)
function AccountsManager({ role, label, endpoint }) {
  // Default to the shared /users API (Manager/Coordinator). Purchase Managers use
  // their own /purchase-managers API (separate purchase_managers collection).
  const base = endpoint || '/users';
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null); // { type, text }
  const [busy, setBusy] = useState(false);

  // Designation is a display-only role label — shown/editable for Manager accounts only.
  const isManager = role === 'Sales Manager';
  const DESIGNATIONS = ['Manager', 'Business Development Executive'];

  const [form, setForm] = useState({ name: '', email: '', employeeId: '', password: '', confirm: '', designation: 'Manager' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', employeeId: '', designation: 'Manager' });
  const [pwId, setPwId] = useState(null);
  const [pwForm, setPwForm] = useState({ newPassword: '', confirm: '' });

  const flash = (type, text) => setMsg({ type, text });

  const load = async () => {
    setLoading(true);
    try {
      const data = await api(base === '/users' ? `/users?role=${encodeURIComponent(role)}` : base);
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      flash('error', e.message || 'Failed to load accounts');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [role]);

  const createAccount = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password) return flash('error', 'Name, email and password are required');
    if (form.password.length < 8) return flash('error', 'Password must be at least 8 characters');
    if (form.password !== form.confirm) return flash('error', 'Passwords do not match');
    setBusy(true);
    try {
      await api(base, { method: 'POST', body: { name: form.name, email: form.email, employeeId: form.employeeId, role, password: form.password, ...(isManager ? { designation: form.designation } : {}) } });
      flash('success', `${label} account created`);
      setForm({ name: '', email: '', employeeId: '', password: '', confirm: '', designation: 'Manager' });
      load();
    } catch (e) { flash('error', e.message); } finally { setBusy(false); }
  };

  const startEdit = (u) => { setEditingId(u.id); setPwId(null); setEditForm({ name: u.name || '', email: u.email || '', employeeId: u.employeeId || '', designation: u.designation || 'Manager' }); };
  const saveEdit = async (id) => {
    if (!editForm.name.trim() || !editForm.email.trim()) return flash('error', 'Name and email are required');
    setBusy(true);
    try {
      await api(`${base}/${id}`, { method: 'PUT', body: { name: editForm.name, email: editForm.email, employeeId: editForm.employeeId, ...(isManager ? { designation: editForm.designation } : {}) } });
      flash('success', 'Account updated');
      setEditingId(null);
      load();
    } catch (e) { flash('error', e.message); } finally { setBusy(false); }
  };

  const startReset = (u) => { setPwId(u.id); setEditingId(null); setPwForm({ newPassword: '', confirm: '' }); };
  const saveReset = async (id) => {
    if (pwForm.newPassword.length < 8) return flash('error', 'Password must be at least 8 characters');
    if (pwForm.newPassword !== pwForm.confirm) return flash('error', 'Passwords do not match');
    setBusy(true);
    try {
      await api(`${base}/${id}/password`, { method: 'PUT', body: { newPassword: pwForm.newPassword } });
      flash('success', 'Password updated');
      setPwId(null);
      setPwForm({ newPassword: '', confirm: '' });
    } catch (e) { flash('error', e.message); } finally { setBusy(false); }
  };

  const toggleActive = async (u) => {
    setBusy(true);
    try {
      await api(`/users/${u.id}`, { method: 'PUT', body: { isActive: !u.isActive } });
      flash('success', !u.isActive ? 'Account activated' : 'Account deactivated');
      load();
    } catch (e) { flash('error', e.message); } finally { setBusy(false); }
  };

  return (
    <div className="settings-section">
      <p className="text-muted mb-4">Create and manage {label} login accounts — email, password, and active status.</p>

      {msg && (
        <div style={{
          padding: '0.7rem 1rem', borderRadius: 10, marginBottom: '1rem', fontSize: '0.85rem',
          background: msg.type === 'error' ? '#FEE2E2' : '#DCFCE7',
          color: msg.type === 'error' ? '#991B1B' : '#166534',
          border: `1px solid ${msg.type === 'error' ? '#FECACA' : '#BBF7D0'}`
        }}>
          {msg.text}
        </div>
      )}

      {/* Create account */}
      <div style={box}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <UserPlus size={18} /> Create New {label} Account
        </h3>
        <form onSubmit={createAccount}>
          <div style={gridForm}>
            <Field label="Full Name"><input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Enter name" /></Field>
            <Field label="Login Email (username)"><input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" /></Field>
            <Field label="Employee ID (optional)"><input className="form-input" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} placeholder="EMP-..." /></Field>
            {isManager && (
              <Field label="Designation / Role">
                <select className="form-input" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })}>
                  {DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
            )}
            <Field label="Password"><input className="form-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8 characters" /></Field>
            <Field label="Confirm Password"><input className="form-input" type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} placeholder="Re-enter password" /></Field>
            <div><button type="submit" className="btn btn--primary" disabled={busy} style={{ width: '100%' }}><Plus size={16} /> Create</button></div>
          </div>
        </form>
      </div>

      {/* Accounts list */}
      <div style={{ ...box, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Login Email</th>
                <th style={th}>Employee ID</th>
                {isManager && <th style={th}>Designation</th>}
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={td} colSpan={isManager ? 6 : 5}>Loading…</td></tr>
              ) : users.length === 0 ? (
                <tr><td style={{ ...td, textAlign: 'center', color: '#94A3B8', padding: '2rem' }} colSpan={isManager ? 6 : 5}>No {label} accounts yet. Create one above.</td></tr>
              ) : (
                users.map((u) => (
                  <React.Fragment key={u.id}>
                    <tr>
                      <td style={td}>
                        {editingId === u.id
                          ? <input className="form-input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                          : <span style={{ fontWeight: 600 }}>{u.name}</span>}
                      </td>
                      <td style={td}>
                        {editingId === u.id
                          ? <input className="form-input" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                          : u.email}
                      </td>
                      <td style={td}>
                        {editingId === u.id
                          ? <input className="form-input" value={editForm.employeeId} onChange={(e) => setEditForm({ ...editForm, employeeId: e.target.value })} placeholder="—" />
                          : (u.employeeId || '—')}
                      </td>
                      {isManager && (
                        <td style={td}>
                          {editingId === u.id
                            ? <select className="form-input" value={editForm.designation} onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}>
                                {DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                              </select>
                            : <span style={{
                                display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 9999, fontSize: '0.72rem', fontWeight: 700,
                                background: (u.designation === 'Business Development Executive') ? '#E0E7FF' : '#F1F5F9',
                                color: (u.designation === 'Business Development Executive') ? '#3730A3' : '#334155'
                              }}>
                                {u.designation || 'Manager'}
                              </span>}
                        </td>
                      )}
                      <td style={td}>
                        <span style={{
                          display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 9999, fontSize: '0.72rem', fontWeight: 700,
                          background: u.isActive ? '#DCFCE7' : '#F3F4F6', color: u.isActive ? '#166534' : '#6B7280'
                        }}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {editingId === u.id ? (
                          <span style={{ display: 'inline-flex', gap: '0.4rem' }}>
                            <button style={{ ...cellBtn, color: '#166534' }} onClick={() => saveEdit(u.id)} disabled={busy}><Check size={14} /> Save</button>
                            <button style={cellBtn} onClick={() => setEditingId(null)} disabled={busy}><X size={14} /> Cancel</button>
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', gap: '0.4rem' }}>
                            <button style={cellBtn} onClick={() => startEdit(u)} title="Edit profile / email"><Pencil size={14} /> Edit</button>
                            <button style={cellBtn} onClick={() => startReset(u)} title="Reset password"><KeyRound size={14} /> Reset Password</button>
                            <button
                              style={{ ...cellBtn, color: u.isActive ? '#991B1B' : '#166534', borderColor: u.isActive ? '#FECACA' : '#BBF7D0' }}
                              onClick={() => toggleActive(u)}
                              title={u.isActive ? 'Deactivate account' : 'Activate account'}
                            >
                              <Power size={14} /> {u.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                    {pwId === u.id && (
                      <tr>
                        <td style={{ ...td, background: '#F8FAFC' }} colSpan={isManager ? 6 : 5}>
                          <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'end', flexWrap: 'wrap' }}>
                            <Field label={`New Password for ${u.name}`}><input className="form-input" type="password" value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} placeholder="Min 8 characters" /></Field>
                            <Field label="Confirm Password"><input className="form-input" type="password" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} placeholder="Re-enter password" /></Field>
                            <button className="btn btn--primary" onClick={() => saveReset(u.id)} disabled={busy}>Update Password</button>
                            <button style={cellBtn} onClick={() => setPwId(null)} disabled={busy}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState('Approval Rules');

  const tabs = ['Approval Rules', 'Manager Accounts', 'Coordinator Accounts', 'Purchase Manager Accounts', 'Roles & Permissions', 'ID Format', 'Notifications', 'Organization', 'Security'];

  const isAccountTab = activeTab === 'Manager Accounts' || activeTab === 'Coordinator Accounts' || activeTab === 'Purchase Manager Accounts';

  return (
    <div className="settings-container">
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="settings-layout">
        <div className="settings-nav">
          {tabs.map(tab => (
            <button
              key={tab}
              className={`settings-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="settings-content">
          <div className="settings-header">
            <h2>{activeTab}</h2>
            {!isAccountTab && <button className="btn btn--primary"><Save size={16}/> Save Changes</button>}
          </div>

          {activeTab === 'Manager Accounts' && <AccountsManager role="Sales Manager" label="Manager" />}
          {activeTab === 'Coordinator Accounts' && <AccountsManager role="Sales Coordinator" label="Coordinator" />}
          {activeTab === 'Purchase Manager Accounts' && <AccountsManager role="Purchase Manager" label="Purchase Manager" endpoint="/purchase-managers" />}

          {activeTab === 'Approval Rules' && (
            <div className="settings-section">
              <p className="text-muted mb-4">Define auto-approval thresholds and escalation SLAs.</p>

              <div className="rule-builder">
                <div className="rule-row">
                  <GripVertical size={16} className="text-muted cursor-grab" />
                  <div className="rule-content">
                    <span>If</span>
                    <select className="form-input select-sm"><option>Discount</option></select>
                    <span>&gt;</span>
                    <input type="number" className="form-input input-sm" defaultValue={15} />
                    <span>% → requires</span>
                    <select className="form-input select-sm"><option>Sales Head</option></select>
                    <span>approval</span>
                  </div>
                  <button className="btn--icon text-danger"><Trash2 size={16}/></button>
                </div>

                <div className="rule-row">
                  <GripVertical size={16} className="text-muted cursor-grab" />
                  <div className="rule-content">
                    <span>If</span>
                    <select className="form-input select-sm"><option>Target change</option></select>
                    <span>&gt;</span>
                    <input type="number" className="form-input input-sm" defaultValue={10} />
                    <span>% → requires</span>
                    <select className="form-input select-sm"><option>Sales Head</option></select>
                    <span>approval</span>
                  </div>
                  <button className="btn--icon text-danger"><Trash2 size={16}/></button>
                </div>

                <button className="btn btn--secondary mt-3"><Plus size={16}/> Add Rule</button>
              </div>

              <div className="settings-group mt-4 pt-4 border-top">
                <h3>Global Policies</h3>
                <div className="policy-row mt-3">
                  <label className="checkbox-label">
                    <input type="checkbox" defaultChecked />
                    <span>Auto-approve requests below all thresholds</span>
                  </label>
                </div>
                <div className="policy-row mt-3 flex-align">
                  <span>Escalate pending requests after</span>
                  <input type="number" className="form-input input-sm" defaultValue={48} />
                  <span>hours</span>
                </div>
              </div>
            </div>
          )}

          {activeTab !== 'Approval Rules' && !isAccountTab && (
            <div className="settings-section">
              <p className="text-muted">Placeholder for {activeTab} settings.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { api } from '../api/client';
import { showToast } from '../utils/toast';
import './CreateVisitModal.css'; // Reusing base modal styles
import './ScheduleVisitModal.css';

// Convert a 24h "HH:MM" (from a native time input) into 12h "hh:MM AM/PM".
// Mirrors the Coordinator app so both write appointments in the same format.
function convertTo12Hour(time24) {
  if (!time24 || !String(time24).includes(':')) return time24 || '';
  const [hoursStr, minutesStr] = String(time24).split(':');
  let hours = parseInt(hoursStr, 10);
  if (isNaN(hours)) return time24;
  const minutes = minutesStr ?? '00';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursFormatted = hours < 10 ? '0' + hours : hours;
  return `${hoursFormatted}:${minutes} ${ampm}`;
}

const emptyVisit = { title: '', leadId: '', date: '', timeStart: '', timeEnd: '', manager: '', phone: '', location: '', status: 'Waiting', type: 'Appointment' };

export default function ScheduleVisitModal({ isOpen, onClose, onCreated = () => {} }) {
  const [leads, setLeads] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [managers, setManagers] = useState([]);
  const [newVisit, setNewVisit] = useState(emptyVisit);

  // Load leads (for the Lead ID selector), existing appointments (for lifecycle
  // gating) and managers (for the manual assignment dropdown) whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setNewVisit(emptyVisit);
    api('/leads').then((d) => setLeads(Array.isArray(d) ? d : [])).catch(() => setLeads([]));
    api('/appointments').then((d) => setAppointments(Array.isArray(d) ? d : [])).catch(() => setAppointments([]));
    api('/auth/managers').then((d) => setManagers(Array.isArray(d) ? d : [])).catch(() => setManagers([]));
  }, [isOpen]);

  if (!isOpen) return null;

  /* ── Lifecycle gating (strict sequence Lead → Appointment → Visit) — mirrors Coordinator ── */
  const digitsOnly = (s) => String(s || '').replace(/\D/g, '');
  const isVisitType = (a) => /visit/i.test(a.type || '');
  const isDone = (a) => {
    const s = String(a.status || '').toLowerCase();
    return s.includes('complet') || String(a.progressStatus || '').toLowerCase() === 'completed' || !!a.completedAt;
  };
  const asLead = (x) => (x && typeof x === 'object') ? x : (leads.find((l) => l.id === x) || { id: x });
  const apptMatchesLead = (a, l) => {
    if (a.leadId) return a.leadId === l.id;
    const ap = digitsOnly(a.phone), lp = digitsOnly(l.phone);
    return !!(ap && lp && ap.slice(-10) === lp.slice(-10));
  };
  const leadHasAppointment = (x) => { const l = asLead(x); return appointments.some((a) => !isVisitType(a) && apptMatchesLead(a, l)); };
  const leadHasCompletedAppointment = (x) => { const l = asLead(x); return appointments.some((a) => !isVisitType(a) && isDone(a) && apptMatchesLead(a, l)); };
  const leadHasVisit = (x) => { const l = asLead(x); return appointments.some((a) => isVisitType(a) && apptMatchesLead(a, l)); };

  const eligibleLeads = leads.filter((l) => {
    if (l.id === newVisit.leadId) return true;
    // Lifecycle made independent: appointments and visits no longer depend on each other.
    if (newVisit.type === 'Visits') return !leadHasVisit(l);
    return !leadHasAppointment(l);
  });

  // A lead that already carries an assigned manager locks the Manager field (read-only);
  // an Unassigned/empty lead lets the coordinator pick a manager manually.
  const managerLocked = !!(newVisit.leadId && newVisit.manager);
  const managerNames = managers.map((m) => m && m.name).filter(Boolean);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newVisit.type === 'Visits') {
      if (leadHasVisit(newVisit.leadId)) {
        showToast('This lead already has a visit. Only one visit is allowed per lead.', 'error');
        return;
      }
    } else if (leadHasAppointment(newVisit.leadId)) {
      showToast('This lead already has an appointment. Only one appointment is allowed per lead.', 'error');
      return;
    }
    // Status is derived from the manager assignment: none -> Waiting, manager chosen -> Assigned.
    const payload = {
      ...newVisit,
      status: newVisit.manager ? 'Assigned' : 'Waiting',
      timeStart: convertTo12Hour(newVisit.timeStart),
      timeEnd: convertTo12Hour(newVisit.timeEnd),
    };
    api('/appointments', { method: 'POST', body: payload })
      .then(() => {
        showToast('Appointment scheduled!', 'success');
        onCreated();
        onClose();
      })
      .catch((err) => {
        console.error('Failed to add appointment:', err);
        showToast(err.message || 'Failed to schedule appointment.', 'error');
      });
  };

  const canSubmit = newVisit.title && newVisit.leadId && newVisit.phone && newVisit.location && newVisit.date && newVisit.timeStart && newVisit.timeEnd;
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="modal-overlay">
      <form className="schedule-visit-content" onSubmit={handleSubmit}>
        <div className="visit-modal-header">
          <h2 className="visit-modal-title">Schedule New Appointment</h2>
          <button type="button" className="btn-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="schedule-visit-body">
          <div className="form-group">
            <label className="form-label">Title</label>
            <input
              type="text"
              className="form-input"
              value={newVisit.title}
              onChange={(e) => setNewVisit({ ...newVisit, title: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Lead (Customer)</label>
            <div className="custom-select-wrapper">
              <select
                className="form-select"
                value={newVisit.leadId}
                onChange={(e) => {
                  const lead = leads.find((l) => l.id === e.target.value);
                  // Auto-fill the manager from the lead's existing assignment. If the lead has
                  // no manager (Unassigned), leave it blank so a manager can be picked manually.
                  const assignedMgr = (lead?.manager && String(lead.manager).trim() && String(lead.manager).trim().toLowerCase() !== 'unassigned') ? String(lead.manager).trim() : '';
                  setNewVisit({
                    ...newVisit,
                    leadId: e.target.value,
                    phone: lead?.phone || newVisit.phone,
                    manager: assignedMgr,
                    status: assignedMgr ? 'Assigned' : 'Waiting',
                  });
                }}
                required
              >
                <option value="">Select lead</option>
                {eligibleLeads.map((l) => (
                  <option key={l.id} value={l.id}>{l.id}{l.name ? ` — ${l.name}` : ''}</option>
                ))}
                {eligibleLeads.length === 0 && (
                  <option value="" disabled>{newVisit.type === 'Visits' ? 'No leads with a completed appointment yet' : 'All leads already have an appointment'}</option>
                )}
              </select>
              <ChevronDown size={16} className="select-icon" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Assign to Manager</label>
            <div className="custom-select-wrapper">
              <select
                className="form-select"
                value={newVisit.manager}
                disabled={managerLocked}
                onChange={(e) => {
                  const val = e.target.value;
                  // Assigning a manager flips the status: none -> Waiting, chosen -> Assigned.
                  setNewVisit((prev) => ({ ...prev, manager: val, status: val ? 'Assigned' : 'Waiting' }));
                }}
              >
                <option value="">Select manager</option>
                {managerNames.map((n) => <option key={n} value={n}>{n}</option>)}
                {newVisit.manager && !managerNames.includes(newVisit.manager) && <option value={newVisit.manager}>{newVisit.manager}</option>}
              </select>
              <ChevronDown size={16} className="select-icon" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Phone</label>
            <input
              type="text"
              className="form-input"
              value={newVisit.phone}
              onChange={(e) => setNewVisit({ ...newVisit, phone: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Location</label>
            <input
              type="text"
              className="form-input"
              value={newVisit.location}
              onChange={(e) => setNewVisit({ ...newVisit, location: e.target.value })}
              required
            />
          </div>

          <div className="form-grid-3-col">
            <div className="form-group">
              <label className="form-label">Date</label>
              <input
                type="date"
                className="form-input"
                min={today}
                value={newVisit.date}
                onChange={(e) => setNewVisit({ ...newVisit, date: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Start Time</label>
              <input
                type="time"
                className="form-input"
                value={newVisit.timeStart}
                onChange={(e) => setNewVisit({ ...newVisit, timeStart: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">End Time</label>
              <input
                type="time"
                className="form-input"
                value={newVisit.timeEnd}
                onChange={(e) => setNewVisit({ ...newVisit, timeEnd: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-grid-2-col">
            <div className="form-group">
              <label className="form-label">Type</label>
              <div className="custom-select-wrapper">
                <select
                  className="form-select"
                  value={newVisit.type}
                  onChange={(e) => setNewVisit({ ...newVisit, type: e.target.value, leadId: '' })}
                >
                  <option value="Appointment">Appointment</option>
                  <option value="Visits">Visits</option>
                </select>
                <ChevronDown size={16} className="select-icon" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <div className="custom-select-wrapper">
                <select
                  className="form-select"
                  value={newVisit.status}
                  onChange={(e) => setNewVisit({ ...newVisit, status: e.target.value })}
                >
                  <option value="Waiting">Waiting</option>
                  <option value="Assigned">Assigned</option>
                </select>
                <ChevronDown size={16} className="select-icon" />
              </div>
            </div>
          </div>
        </div>

        <div className="visit-modal-footer">
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!canSubmit}
            style={{ background: '#2e2760', borderColor: '#2e2760', opacity: canSubmit ? 1 : 0.5 }}
          >
            Schedule Appointment
          </button>
        </div>
      </form>
    </div>
  );
}

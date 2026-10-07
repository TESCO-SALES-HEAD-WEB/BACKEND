import React, { useState, useEffect, useRef } from 'react';
import {
  Users, Sparkles, Flame, Thermometer, Snowflake,
  CalendarCheck, FileText, CheckCircle, Trash2, XCircle,
  ChevronDown, Activity, Edit2, Download, Trash, Edit3, Calendar,
  Phone, CheckCircle2, Clock, X, Search, UserX
} from 'lucide-react';
import DateRangePicker from '../components/DateRangePicker';
import ScopeFilter from '../components/ScopeFilter';
import AddLeadModal from '../components/AddLeadModal';
import AddLeadWizard from '../components/AddLeadWizard';
import LeadDetailsDrawer from '../components/LeadDetailsDrawer';
import StatusUpdateModal from '../components/StatusUpdateModal';
import GenerateQuotationModal from '../components/GenerateQuotationModal';
import DesignRequirementModal from '../components/DesignRequirementModal';
import { api, getUser } from '../api/client';
import useAutoRefresh from '../hooks/useAutoRefresh';
import { showToast } from '../utils/toast';
import { useViewMode } from '../context/ViewModeContext';
import { statusColor, sourceColor } from '../utils/statusColors';
import './Leads.css';

// --- Follow-up date/time helpers (12-hour AM/PM input; 24h "HH:mm" storage unchanged) ---
const fuTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const FU_HOURS12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const FU_MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const fuTo12 = (hhmm) => {
  if (!hhmm || !/^\d{1,2}:\d{2}/.test(hhmm)) return { h: '', m: '', ap: 'AM' };
  const [H, M] = hhmm.split(':');
  let h = parseInt(H, 10); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if (h === 0) h = 12;
  return { h: String(h).padStart(2, '0'), m: M, ap };
};
const fuFrom12 = (h, m, ap) => {
  if (!h) return '';
  let H = parseInt(h, 10) % 12; if (ap === 'PM') H += 12;
  return `${String(H).padStart(2, '0')}:${m || '00'}`;
};

// Parse any stored follow-up value into { dPart:'YYYY-MM-DD', tPart:'HH:mm' } (tPart may be '')
const parseFollowUp = (v) => {
  if (!v || typeof v !== 'string') return null;
  const s = v.trim();
  if (s === 'No Date' || s === 'Pending' || s === '') return null;
  let dPart = '', tPart = '', m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/))) { dPart = `${m[1]}-${m[2]}-${m[3]}`; tPart = `${m[4]}:${m[5]}`; }
  else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { dPart = `${m[1]}-${m[2]}-${m[3]}`; }
  else if ((m = s.match(/(\d{2})-(\d{2})-(\d{4})[,\s]+(\d{1,2}):(\d{2})\s*([AaPp][Mm])/))) { let h = parseInt(m[4], 10); const ap = m[6].toUpperCase(); if (ap === 'PM' && h !== 12) h += 12; if (ap === 'AM' && h === 12) h = 0; dPart = `${m[3]}-${m[2]}-${m[1]}`; tPart = `${String(h).padStart(2, '0')}:${m[5]}`; }
  else if ((m = s.match(/(\d{2})-(\d{2})-(\d{4})[,\s]+(\d{2}):(\d{2})/))) { dPart = `${m[3]}-${m[2]}-${m[1]}`; tPart = `${m[4]}:${m[5]}`; }
  else if ((m = s.match(/(\d{2})-(\d{2})-(\d{4})/))) { dPart = `${m[3]}-${m[2]}-${m[1]}`; }
  else { const d = new Date(s); if (!isNaN(d.getTime())) { dPart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; tPart = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } }
  if (!dPart) return null;
  return { dPart, tPart };
};

// Convert any stored follow-up value into a datetime-local value (YYYY-MM-DDTHH:mm)
const toFollowUpInput = (v) => {
  const p = parseFollowUp(v);
  if (!p) return '';
  return `${p.dPart}T${p.tPart || '09:00'}`;
};

// Display a follow-up value as "DD-MM-YYYY, hh:mm AM/PM" (date only when no time was set)
const fmtFollowUp = (v) => {
  const p = parseFollowUp(v);
  if (!p) return '';
  const [y, mo, d] = p.dPart.split('-');
  const dateStr = `${d}-${mo}-${y}`;
  if (!p.tPart) return dateStr;
  let h = parseInt(p.tPart.slice(0, 2), 10);
  const mm = p.tPart.slice(3, 5);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${dateStr}, ${String(h).padStart(2, '0')}:${mm} ${ap}`;
};

// Convert a stored follow-up value into an absolute millisecond deadline.
// When only a date was set (no time), end-of-day (23:59) is treated as the deadline.
const followUpMillis = (v) => {
  const p = parseFollowUp(v);
  if (!p) return null;
  const dt = new Date(`${p.dPart}T${p.tPart || '23:59'}`);
  const ms = dt.getTime();
  return isNaN(ms) ? null : ms;
};

// Build a tel: link from a phone value (digits only, keeps a leading +).
const telHref = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const cleaned = s.replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : '';
};

// Map the wizard's status option onto the exact table-status value stored on a lead
const WIZARD_STATUS_TO_TABLE = {
  'New': 'New Lead', 'Hot': 'Hot Leads', 'Warm': 'Warm Leads', 'Cold': 'Cold Leads',
  'Appt. Fixed': 'Appointment Fixed', 'Quotation Send': 'Quotation Send',
  'Order Confirmed': 'Order Confirmed', 'Junk': 'Junk', 'Lost': 'Lost',
};

export default function Leads() {
    const { view: viewMode, setView: setViewMode, manager, setManager } = useViewMode();
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [servicesDropdownOpen, setServicesDropdownOpen] = useState(false);
  const [leadSourceDropdownOpen, setLeadSourceDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [designReqDropdownOpen, setDesignReqDropdownOpen] = useState(false);
  const [assignDropdownOpen, setAssignDropdownOpen] = useState(false);

  const [selectedLead, setSelectedLead] = useState(null);
  const [drawerTab, setDrawerTab] = useState('specifications');
  const [leadsData, setLeadsData] = useState([]);
  const [managers, setManagers] = useState([]);
  // Lead ids whose "Assign To" change is still being saved. The 20s auto-refresh
  // (loadLeadsAll) replaces leadsData with the server snapshot; without this guard a
  // refresh landing before the assignment PUT is persisted would revert the dropdown.
  const pendingAssignRef = useRef(new Set());
  const [apptRecords, setApptRecords] = useState([]);   // appointments collection — for record-based Appt Fixed count
  const [quoteRecords, setQuoteRecords] = useState([]);  // quotations collection — for record-based Quotation Sent count
  const [pendingStatusChange, setPendingStatusChange] = useState(null);
  const [isQuotationModalOpen, setIsQuotationModalOpen] = useState(false);
  const [selectedQuotationLead, setSelectedQuotationLead] = useState(null);

  const [isDesignReqModalOpen, setIsDesignReqModalOpen] = useState(false);
  const [designReqModalLead, setDesignReqModalLead] = useState(null);
  const [designReqModalType, setDesignReqModalType] = useState('');

  // Lead being edited via the pencil action (null = adding a new lead)
  const [editLead, setEditLead] = useState(null);

  // Lead Edit wizard (pencil action opens the full multi-step wizard)
  const [wizardLead, setWizardLead] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Junk confirmation modal state (replaces the native confirm dialog)
  const [junkTarget, setJunkTarget] = useState(null);
  const [junkReason, setJunkReason] = useState('');
  const [junkSaving, setJunkSaving] = useState(false);

  // Merge a saved lead back into the list. Upsert: update it in place if it already
  // exists, otherwise insert a newly-created lead at the top (so an added lead shows
  // immediately without waiting for the next auto-refresh).
  const handleLeadSaved = (updated) => {
    if (!updated || !updated.id) return;
    setLeadsData((prev) => (
      prev.some((l) => l.id === updated.id)
        ? prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l))
        : [updated, ...prev]
    ));
  };

  // Name of the acting user, recorded on activity-timeline entries this Head creates.
  const currentUserName = () => { const u = getUser && getUser(); return (u && (u.name || u.email)) || 'Sales Head'; };

  // --- Follow-up / Overdue tracking (derived on the frontend; no API-shape changes) ---
  // A ticking clock so an "Overdue" pill appears the moment a follow-up time passes,
  // without needing a page refresh.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Leads already surfaced in an in-app overdue reminder this session (dedupe once each).
  const remindedRef = useRef(new Set());

  // Derive a lead's follow-up state:
  //   'completed' -> the call was made and recorded
  //   'overdue'   -> the scheduled date/time has passed with no call recorded
  //   'upcoming'  -> a follow-up is scheduled in the future
  //   'none'      -> no follow-up date set
  const getFollowUpState = (lead) => {
    if (!lead) return 'none';
    if (lead.followUpDone) return 'completed';
    const ms = followUpMillis(lead.followUp);
    if (ms == null) return 'overdue'; // no scheduled follow-up date → treat as Overdue
    return ms < nowTick ? 'overdue' : 'upcoming';
  };

  // In-app reminder: when a scheduled follow-up call becomes overdue, toast it once per
  // session (frontend-only; no backend). Naming up to 3 leads, with "+N more" beyond that.
  useEffect(() => {
    const overdue = leadsData.filter(
      (l) => getFollowUpState(l) === 'overdue' && !String(l.status || '').toLowerCase().includes('junk')
    );
    const fresh = overdue.filter((l) => !remindedRef.current.has(l.id));
    if (fresh.length === 0) return;
    fresh.forEach((l) => remindedRef.current.add(l.id));
    const names = fresh.slice(0, 3).map((l) => l.name || l.id).join(', ');
    const extra = fresh.length > 3 ? ` +${fresh.length - 3} more` : '';
    showToast(`Follow-up call due: ${names}${extra}`, 'info');
  }, [leadsData, nowTick]);

  // Record that the follow-up call was completed: clears Overdue, marks done, appends
  // a history entry, and persists via the SAME mechanism used for other lead edits
  // (local setLeadsData + api() PUT), so the change survives a refresh.
  const markFollowUpDone = (id) => {
    const now = new Date();
    const ts = `${now.toLocaleDateString('en-GB')}, ${now.toLocaleTimeString('en-US', { hour12: false })}`;
    const lead = leadsData.find((l) => l.id === id);
    const newHistory = [...((lead && lead.history) || []), { timestamp: ts, message: 'Follow-up call completed', user: currentUserName() }];
    const body = { followUpDone: true, followUpCompletedAt: ts, history: newHistory };
    setLeadsData((prev) => prev.map((l) => (l.id === id ? { ...l, ...body } : l)));
    api(`/leads/${id}`, { method: 'PUT', body }).catch(() => {});
    showToast('Follow-up marked as completed', 'success');
  };

  // --- Notes / Remarks popup: compact preview in the table, full editing/viewing in a modal ---
  const [notesModal, setNotesModal] = useState({ open: false, mode: 'view', leadId: null });
  const [notesDraft, setNotesDraft] = useState('');
  const openNotesEdit = (lead) => { setNotesDraft(lead.notes || ''); setNotesModal({ open: true, mode: 'edit', leadId: lead.id }); };
  const openNotesView = (lead) => { setNotesModal({ open: true, mode: 'view', leadId: lead.id }); };
  const closeNotesModal = () => setNotesModal({ open: false, mode: 'view', leadId: null });
  const submitNotesEdit = () => {
    const id = notesModal.leadId;
    if (!id) { closeNotesModal(); return; }
    const now = new Date();
    const ts = `${now.toLocaleDateString('en-GB')}, ${now.toLocaleTimeString('en-US', { hour12: false })}`;
    const lead = leadsData.find((l) => l.id === id);
    if (!lead || (lead.notes || '') === notesDraft) { closeNotesModal(); return; }
    const history = [...((lead && lead.history) || []), { timestamp: ts, message: `Updated notes: "${notesDraft}"` }];
    const body = { notes: notesDraft, history };
    setLeadsData((prev) => prev.map((l) => (l.id === id ? { ...l, ...body } : l)));
    api(`/leads/${id}`, { method: 'PUT', body }).catch(() => {});
    closeNotesModal();
    showToast('Remarks saved', 'success');
  };
  const latestNoteMeta = (lead) => {
    const hist = Array.isArray(lead && lead.history) ? lead.history : [];
    const by = (lead && lead.manager && lead.manager !== 'Unassigned') ? lead.manager : '';
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i] || {};
      const msg = String(h.message || h.event || '');
      if (h.remark || h.meetingRemarks || /note|remark/i.test(msg)) {
        return { when: h.timestamp || h.date || '', by };
      }
    }
    return { when: (lead && (lead.date || lead.createdAt)) || '', by };
  };

  // --- Remarks-first follow-up workflow ---
  // Remarks must be entered BEFORE a follow-up date/time can be saved. The modal opens in:
  //   mode 'schedule' -> set/adjust the next follow-up (date/time pre-filled from the lead)
  //   mode 'complete' -> log the completed call (blank next date/time), then reschedule or
  //                      tick "no further follow-up" to mark it Completed.
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [fuLeadId, setFuLeadId] = useState(null);
  const [fuMode, setFuMode] = useState('schedule'); // 'schedule' | 'complete'
  const [fuRemark, setFuRemark] = useState('');
  const [fuDate, setFuDate] = useState('');   // YYYY-MM-DD
  const [fuTime, setFuTime] = useState('');   // HH:mm
  const [fuNoFurther, setFuNoFurther] = useState(false); // no further follow-up -> Completed

  const openFollowUpModal = (lead, mode = 'schedule') => {
    setFuLeadId(lead.id);
    setFuMode(mode);
    setFuRemark('');
    setFuNoFurther(false);
    // Pre-fill date/time from the existing follow-up when scheduling; blank when completing.
    const p = mode === 'schedule' ? parseFollowUp(lead.followUp) : null;
    setFuDate(p ? p.dPart : '');
    setFuTime(p ? (p.tPart || '') : '');
    setIsFollowUpModalOpen(true);
  };

  const cancelFollowUpModal = () => {
    setIsFollowUpModalOpen(false);
    setFuLeadId(null);
    setFuRemark('');
    setFuDate('');
    setFuTime('');
    setFuNoFurther(false);
  };

  // On submit: require remarks; if not "no further" require BOTH date+time. Then either mark
  // Completed or set the exact next follow-up, appending a history entry with the remark.
  // Persists via the SAME mechanism used for other lead edits (setLeadsData + api() PUT).
  const handleFollowUpSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const remark = fuRemark.trim();
    if (!remark) { showToast("Please enter Remarks (the client's response) first.", 'error'); return; }
    if (!fuNoFurther && (!fuDate || !fuTime)) {
      showToast('Set the Follow-up Date and Time, or tick "No further follow-up".', 'error');
      return;
    }
    if (!fuNoFurther) {
      const dt = new Date(`${fuDate}T${fuTime}`);
      if (isNaN(dt.getTime()) || dt.getTime() < Date.now()) {
        showToast('Follow-up date/time cannot be in the past.', 'error');
        return;
      }
    }
    const id = fuLeadId;
    const now = new Date();
    const ts = `${now.toLocaleDateString('en-GB')}, ${now.toLocaleTimeString('en-US', { hour12: false })}`;
    const lead = leadsData.find((l) => l.id === id);
    const history = [...((lead && lead.history) || [])];
    let body;
    if (fuNoFurther) {
      history.push({ timestamp: ts, message: 'Follow-up completed — no further follow-up', remark, user: currentUserName() });
      body = { followUpDone: true, followUpCompletedAt: ts, history };
    } else {
      const value = `${fuDate}T${fuTime}`;
      history.push({ timestamp: ts, message: `Follow-up scheduled for: ${fmtFollowUp(value)}`, remark, user: currentUserName() });
      body = { followUp: value, followUpDone: false, followUpCompletedAt: '', history };
    }
    setLeadsData((prev) => prev.map((l) => (l.id === id ? { ...l, ...body } : l)));
    api(`/leads/${id}`, { method: 'PUT', body }).catch(() => {});
    setIsFollowUpModalOpen(false);
    setFuLeadId(null);
    setFuRemark('');
    setFuDate('');
    setFuTime('');
    setFuNoFurther(false);
    showToast(fuNoFurther ? 'Follow-up marked Completed.' : 'Follow-up scheduled.', 'success');
  };

  // Persist a lead created/edited via the multi-step wizard through the Head api() client
  const handleWizardSave = async (data) => {
    try {
      if (data._editId) {
        // EDIT existing lead
        const id = data._editId;
        const body = {
          name: data.name,
          company: data.company,
          phone: data.phone,
          email: data.email,
          projectType: data.projectType,
          location: data.location,
          budget: data.budget,
          source: data.source,
          status: WIZARD_STATUS_TO_TABLE[data.status] || data.status,
          notes: data.notes,
          manager: data.manager || 'Unassigned',
          followUp: data.followUp || 'Pending',
          _wizard: data._wizard,
        };
        // Setting a NEW follow-up date/time starts a fresh cycle, so clear any prior
        // "call completed" flag (a new call is now expected → it can go Overdue again).
        const prevLead = leadsData.find((l) => l.id === id);
        if (prevLead && prevLead.followUp !== body.followUp) {
          body.followUpDone = false;
          body.followUpCompletedAt = '';
        }
        const updated = await api(`/leads/${id}`, { method: 'PUT', body });
        setLeadsData((prev) => prev.map((l) => (l.id === id ? { ...l, ...body, ...(updated || {}) } : l)));
        setWizardOpen(false);
        setWizardLead(null);
        showToast('Lead updated successfully!', 'success');
      } else {
        // CREATE new lead (backend assigns the LD id)
        const body = {
          name: data.name,
          company: data.company,
          phone: data.phone,
          email: data.email,
          projectType: data.projectType,
          location: data.location,
          budget: data.budget,
          source: data.source,
          status: WIZARD_STATUS_TO_TABLE[data.status] || data.status,
          notes: data.notes,
          manager: data.manager || 'Unassigned',
          followUp: data.followUp || 'Pending',
          _wizard: data._wizard,
          type: 'new leads',
          priority: 'Medium',
        };
        await api('/leads', { method: 'POST', body });
        const fresh = await api('/leads');
        setLeadsData(Array.isArray(fresh) ? fresh : []);
        setWizardOpen(false);
        setWizardLead(null);
        showToast('Lead created successfully!', 'success');
      }
    } catch (e) {
      showToast(e.message || 'Failed to save lead', 'error');
    }
  };

  // Soft-delete: set status to 'Junk' and persist (matches the Coordinator's confirmDelete)
  const confirmJunk = async () => {
    if (!junkTarget) return;
    const id = junkTarget.id;
    setJunkSaving(true);
    const body = { status: 'Junk', ...(junkReason.trim() ? { junkReason: junkReason.trim() } : {}) };
    try {
      await api(`/leads/${id}`, { method: 'PUT', body });
      setLeadsData((prev) => prev.map((l) => (l.id === id ? { ...l, ...body } : l)));
      showToast('Lead moved to Junk', 'success');
      setJunkTarget(null);
      setJunkReason('');
    } catch (e) {
      showToast(e.message || 'Failed to move lead to Junk', 'error');
    } finally {
      setJunkSaving(false);
    }
  };

  // Fetch real data from the shared CRM backend on mount
  const loadLeadsAll = () => {
    api('/leads')
      .then((d) => {
        const server = Array.isArray(d) ? d : [];
        setLeadsData((prev) => {
          // Keep the locally-chosen manager for any lead whose assignment is still
          // being saved, so this refresh can't revert a just-picked Manager/BDE.
          if (pendingAssignRef.current.size === 0) return server;
          const prevById = new Map(prev.map((l) => [l.id, l]));
          return server.map((sv) =>
            pendingAssignRef.current.has(sv.id) && prevById.has(sv.id)
              ? { ...sv, manager: prevById.get(sv.id).manager }
              : sv
          );
        });
      })
      .catch(() => setLeadsData((prev) => (prev && prev.length ? prev : [])));
    api('/auth/managers')
      .then((d) => setManagers(Array.isArray(d) ? d : []))
      .catch(() => setManagers([]));
    // Appointments & quotations power the record-based Appt Fixed / Quotation Sent counts,
    // so the overview matches the Manager app (which counts records, not lead status).
    api('/appointments')
      .then((d) => setApptRecords(Array.isArray(d) ? d : []))
      .catch(() => setApptRecords([]));
    api('/quotations')
      .then((d) => setQuoteRecords(Array.isArray(d) ? d : []))
      .catch(() => setQuoteRecords([]));
  };
  useEffect(() => { loadLeadsAll(); }, []);
  useAutoRefresh(loadLeadsAll);

  const getStatusColor = (status) => {
    switch (String(status || '').toUpperCase()) {
      case 'NEW LEAD': return 'blue';
      case 'HOT LEADS':
      case 'HOT': return 'red';
      case 'WARM LEADS':
      case 'WARM': return 'yellow';
      case 'COLD LEADS':
      case 'COLD': return 'grey';
      case 'APPOINTMENT FIXED':
      case 'APPT FIXED': return 'green';
      case 'QUOTATION SEND': return 'slate';
      case 'NEGOTIATION': return 'orange';
      case 'ORDER CONFIRMED': return 'emerald';
      case 'JUNK': return 'grey';
      case 'LOST': return 'grey';
      default: return 'grey';
    }
  };

  // Map any stored status variant onto the EXACT status dropdown option value, so the
  // <select> shows the right label instead of falling back to the first option
  // (e.g. a lead saved as "Hot" would not match the option "Hot Leads").
  const STATUS_OPTION = {
    'new': 'New Lead', 'new lead': 'New Lead', 'new leads': 'New Lead',
    'hot': 'Hot Leads', 'hot leads': 'Hot Leads',
    'warm': 'Warm Leads', 'warm leads': 'Warm Leads',
    'cold': 'Cold Leads', 'cold leads': 'Cold Leads',
    'appointment fixed': 'Appointment Fixed', 'appt fixed': 'Appointment Fixed',
    'quotation send': 'Quotation Send', 'quotation sent': 'Quotation Send', 'qutation send': 'Quotation Send',
    'order confirmed': 'Order Confirmed', 'junk': 'Junk', 'lost': 'Lost',
  };
  const canonStatus = (v) => STATUS_OPTION[String(v || '').trim().toLowerCase()] || v || 'New Lead';

  const getSourceColor = (source) => {
    switch (String(source || '').toUpperCase()) {
      case 'WEBSITE ENQUIRY': return 'blue';
      case 'REFERRAL': return 'purple';
      case 'COLD CALLING': return 'orange';
      case 'META LEADS': return 'pink';
      case 'GOOGLE ADS': return 'red';
      case 'LINKEDIN LEADS': return 'cyan';
      case 'ORGANIC LEADS': return 'green';
      default: return 'grey';
    }
  };

  const handleSaveStatus = (remark) => {
    if (!pendingStatusChange) return;
    const { lead, newStatus } = pendingStatusChange;

    setLeadsData(prev => prev.map(l => {
      if (l.id === lead.id) {
        return { ...l, status: newStatus };
      }
      return l;
    }));

    // Persist to the shared DB so the change survives a refresh (matches the Coordinator)
    api(`/leads/${lead.id}`, { method: 'PUT', body: { status: newStatus } }).catch(() => {});

    setPendingStatusChange(null);
  };

  // Load html2pdf.js once (for a real downloadable, formatted PDF)
  const ensureHtml2Pdf = () => new Promise((resolve, reject) => {
    if (window.html2pdf) return resolve(window.html2pdf);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js';
    s.onload = () => resolve(window.html2pdf);
    s.onerror = () => reject(new Error('Failed to load html2pdf.js'));
    document.head.appendChild(s);
  });

  // Build the branded Tesco Structures lead document as { quoteNo, style, inner }.
  // Uses a normal (non-fixed) flow layout so it renders cleanly both as a PDF and in print.
  const leadDocParts = (lead) => {
    const w = lead._wizard || {};
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const or = (v, fb) => (v !== undefined && v !== null && String(v).trim() !== '' ? v : fb);
    // Hide 4 digits of a phone number in the exported PDF for privacy.
    const maskPhone = (v) => { const s = String(v ?? ''); const d = s.replace(/\D/g, ''); if (d.length < 6) return s; const a = d.length - 6, b = d.length - 2; let n = -1; return s.replace(/\d/g, (c) => { n += 1; return (n >= a && n < b) ? 'X' : c; }); };

    const idNum = (lead.id || '').replace(/\D/g, '') || '0000';
    const quoteNo = `TS-Q-${idNum}`;
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const budgetRaw = or(lead.budget, or(w.projectValue, ''));
    const budget = budgetRaw ? (String(budgetRaw).trim().startsWith('₹') ? String(budgetRaw) : `₹${budgetRaw}`) : '—';

    const clientName = or(lead.name, 'Client');
    const company = or(lead.company, clientName);
    const salesRep = (lead.manager && lead.manager !== 'Unassigned') ? lead.manager : 'Unassigned';

    const dq = String(lead.designReq || '').toLowerCase();
    const has3d = dq.includes('3d') || dq === 'both';
    const has2d = dq.includes('2d') || dq === 'both';
    const designServices = `3D: ${has3d ? 'Yes' : 'No'} | 2D: ${has2d ? 'Yes' : 'No'}`;

    const detailRow = (a, b, c) => `
      <div class="grid3 drow">
        <div class="field"><div class="k">${esc(a[0])}</div><div class="v">${esc(a[1])}</div></div>
        <div class="field"><div class="k">${esc(b[0])}</div><div class="v">${esc(b[1])}</div></div>
        <div class="field"><div class="k">${esc(c[0])}</div><div class="v">${esc(c[1])}</div></div>
      </div>`;
    const milestone = (n, label, pct) => `
      <div class="mrow"><span>${n}. ${esc(label)}</span><b>${esc(pct)}</b></div>`;

    const style = `<style>
  @page { size: A4; margin: 0; }
  .tsdoc, .tsdoc * { box-sizing: border-box; }
  .tsdoc { font-family: Arial, Helvetica, sans-serif; color: #1F2937; background: #fff; width: 794px; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .tsdoc .hdr { padding: 26px 48px 14px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #8DC63F; }
  .tsdoc .logo-wrap { display: flex; align-items: center; gap: 14px; }
  .tsdoc .logo-text .t1 { font-size: 22px; letter-spacing: 9px; font-weight: 800; color: #2B2B2B; line-height: 1; }
  .tsdoc .logo-text .t2 { font-size: 10px; letter-spacing: 6px; color: #6B7280; margin-top: 5px; }
  .tsdoc .hdr-email { color: #4B5563; font-size: 12px; margin-top: 12px; }
  .tsdoc .ftr { margin-top: 36px; background: #8DC63F; color: #fff; text-align: center; font-size: 11px; font-weight: 700; padding: 12px 8px; letter-spacing: 0.3px; }
  .tsdoc .content { padding: 22px 48px 0; }
  .tsdoc .pagebreak { page-break-before: always; height: 0; }
  .tsdoc .quotebox { border: 1px solid #E5E9F0; border-radius: 8px; padding: 15px 24px; display: flex; justify-content: space-between; font-size: 13px; color: #4B5563; margin-bottom: 8px; }
  .tsdoc .quotebox b { color: #111827; }
  .tsdoc .sec-title { color: #1E3A8A; font-size: 14px; font-weight: 800; letter-spacing: 0.3px; margin: 30px 0 7px; }
  .tsdoc .sec-rule { height: 2px; background: #E3E8F0; border-radius: 2px; margin-bottom: 20px; }
  .tsdoc .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .tsdoc .card2 { background: #F6F8FB; border: 1px solid #EBEFF5; border-radius: 10px; padding: 18px 22px; page-break-inside: avoid; }
  .tsdoc .card2 .lbl { font-size: 10px; letter-spacing: 1px; font-weight: 800; color: #64748B; text-transform: uppercase; margin-bottom: 12px; }
  .tsdoc .card2 .big { font-size: 16px; font-weight: 800; color: #111827; margin: 0 0 10px; }
  .tsdoc .card2 .row { font-size: 12.5px; color: #64748B; margin: 3px 0; }
  .tsdoc .card2 .row b { color: #374151; font-weight: 700; }
  .tsdoc .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px 26px; }
  .tsdoc .drow { padding: 14px 0; border-bottom: 1px solid #EEF1F5; }
  .tsdoc .field .k { font-size: 12px; color: #6B7280; margin-bottom: 5px; }
  .tsdoc .field .v { font-size: 13px; font-weight: 700; color: #1F2937; }
  .tsdoc .qtable { border: 1px solid #EBEFF5; border-radius: 10px; overflow: hidden; margin-top: 10px; page-break-inside: avoid; }
  .tsdoc .qhead { display: flex; justify-content: space-between; background: #F1F4F8; padding: 14px 20px; font-size: 12.5px; font-weight: 800; color: #475569; }
  .tsdoc .qbody { display: flex; justify-content: space-between; padding: 18px 20px; gap: 20px; }
  .tsdoc .qbody .desc-t { font-size: 14px; font-weight: 800; color: #111827; margin: 0 0 6px; }
  .tsdoc .qbody .desc-s { font-size: 11.5px; color: #94A3B8; line-height: 1.5; max-width: 460px; }
  .tsdoc .qbody .price { font-size: 14px; font-weight: 800; color: #111827; white-space: nowrap; }
  .tsdoc .qsub { display: flex; justify-content: flex-end; gap: 40px; background: #F6F8FB; padding: 14px 20px; font-size: 13px; color: #64748B; }
  .tsdoc .qsub b { color: #111827; }
  .tsdoc .qtotal { display: flex; justify-content: flex-end; gap: 40px; padding: 16px 20px; font-size: 15px; font-weight: 800; color: #0F9D8F; }
  .tsdoc .mtitle { font-size: 11.5px; font-weight: 800; letter-spacing: 0.6px; color: #334155; text-transform: uppercase; margin: 26px 0 10px; }
  .tsdoc .mhead { display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 800; color: #475569; padding: 8px 4px 12px; border-bottom: 1px solid #E3E8F0; }
  .tsdoc .mrow { display: flex; justify-content: space-between; font-size: 13px; color: #374151; padding: 14px 4px; border-bottom: 1px dashed #E5E9F0; }
  .tsdoc .mrow b { color: #111827; }
  .tsdoc .sign { margin-top: 40px; display: flex; justify-content: flex-end; }
  .tsdoc .sign .box { border-top: 1px solid #CBD5E1; padding-top: 8px; width: 230px; text-align: center; font-size: 11px; letter-spacing: 1px; color: #94A3B8; }
</style>`;

    const inner = `<div class="tsdoc">
  <div class="hdr">
    <div class="logo-wrap">
      <img src="/logo.png" alt="Tesco Structures" style="height:48px;display:block" />
    </div>
    <div class="hdr-email">tescostructures@gmail.com</div>
  </div>
  <div class="content">
    <div class="quotebox">
      <div><b>Quote No:</b> ${esc(quoteNo)}</div>
      <div><b>Date:</b> ${esc(today)}</div>
      <div><b>Validity:</b> 30 Days</div>
    </div>

    <div class="sec-title">1. BASIC INFO</div>
    <div class="sec-rule"></div>
    <div class="cards">
      <div class="card2">
        <div class="lbl">Client Details</div>
        <div class="big">${esc(clientName)}</div>
        <div class="row">Billing Name: ${esc(company)}</div>
        <div class="row">GST: ${esc(or(w.gst, '-'))}</div>
      </div>
      <div class="card2">
        <div class="lbl">Contact Info</div>
        <div class="row"><b>Mobile:</b> ${esc(maskPhone(or(lead.phone, '-')))}</div>
        <div class="row"><b>Alt Mobile:</b> ${esc(maskPhone(or(w.altPhone, '-')))}</div>
        <div class="row"><b>Email:</b> ${esc(or(lead.email, '-'))}</div>
      </div>
      <div class="card2">
        <div class="lbl">Location</div>
        <div class="row"><b>Site Location:</b> ${esc(or(lead.location, '-'))}</div>
        <div class="row"><b>Site Address:</b> ${esc(or(w.siteAddress, '-'))}</div>
        <div class="row"><b>Billing Address:</b> ${esc(or(w.billingAddress, 'Same as Site'))}</div>
      </div>
      <div class="card2">
        <div class="lbl">Sales Representative</div>
        <div class="big">${esc(salesRep)}</div>
        <div class="row">Tesco Structures Sales Division</div>
      </div>
    </div>

    <div class="sec-title">2. PROJECT DETAILS</div>
    <div class="sec-rule"></div>
    ${detailRow(
      ['Segment Category', or(w.service, or(lead.projectType, '-'))],
      ['Work Type / Segment', or(w.projectType, '-')],
      ['Structure Type', or(w.structureType, '-')]
    )}
    ${detailRow(
      ['Plot Dimensions', or(w.plotDimensions, '-')],
      ['Roof Area / Size', w.approximateArea ? `${w.approximateArea} sq.ft` : '-'],
      ['Heights (Roof/Clearance/Eave)', or(w.heights, '-')]
    )}
    ${detailRow(
      ['Roof Covering Sheeting', or(w.roofCovering, '-')],
      ['Site Condition / Soil Test', (w.siteCondition || w.soilTest) ? `${or(w.siteCondition, '-')} / ${or(w.soilTest, '-')}` : '-'],
      ['Insulation Work', or(w.insulation, '-')]
    )}
    ${detailRow(
      ['Site Access (Road/Crane/HV)', or(w.siteAccess, '-')],
      ['Environment (Sun/Wind/Drain)', or(w.environment, '-')],
      ['Working Space', or(w.workingSpace, '-')]
    )}

    <div class="pagebreak"></div>

    <div class="sec-title">3. QUOTATIONS</div>
    <div class="sec-rule"></div>
    ${detailRow(
      ['Design Services', designServices],
      ['Transportation Scope', or(w.transportation, '-')],
      ['Scaffolding Scope', or(w.scaffolding, '-')]
    )}
    <div class="qtable">
      <div class="qhead"><span>Description of Work</span><span>Total Price (INR)</span></div>
      <div class="qbody">
        <div>
          <div class="desc-t">Design, Fabrication, Supply, and Erection work charges</div>
          <div class="desc-s">Charge covers design calculation, raw material sourcing, structural framework columns, rafters, primary/secondary purlins, bracing rods, roofing sheets, fasteners, and site erection.</div>
        </div>
        <div class="price">${esc(budget)}</div>
      </div>
      <div class="qsub"><span>Subtotal:</span><b>${esc(budget)}</b></div>
    </div>
    <div class="qtotal"><span>Grand Total (All-Inclusive):</span><span>${esc(budget)}</span></div>

    <div class="mtitle">Pricing &amp; Payment Milestones Schedule</div>
    <div class="mhead"><span>Billing Milestone Event Description</span><span>Percentage</span></div>
    ${milestone(1, 'Advance with Purchase Order (PO)', '10%')}
    ${milestone(2, 'Dispatch / after Drawing Approval', '30%')}
    ${milestone(3, 'Erection / after Structure Work Completion', '40%')}
    ${milestone(4, 'Handover / after Completion Sign-off', '20%')}

    <div class="sec-title">4. ORDER CONFIRM</div>
    <div class="sec-rule"></div>
    ${detailRow(
      ['Order Date', or(w.confirmationDate, '-')],
      ['Proposal Ref', or(w.proposalRef, '-')],
      ['Lead Time', or(w.leadTime, '-')]
    )}
    ${detailRow(
      ['Start Date', or(w.expectedStartDate, '-')],
      ['Completion Date', or(w.completionDate, '-')],
      ['Salesperson Declaration', or(w.orderStatus, '-')]
    )}
    <div class="sign"><div class="box">AUTHORIZED SIGNATURE</div></div>
  </div>
  <div class="ftr">www.tescostructures.com&nbsp;&nbsp;|&nbsp;&nbsp;+91 90033 28229&nbsp;&nbsp;|&nbsp;&nbsp;37, 15th St, Gandhi Nagar, Ashok Nagar, Chennai, Tamil Nadu 600083</div>
</div>`;

    return { quoteNo, style, inner };
  };

  // Full standalone HTML doc (used for the print fallback)
  const buildLeadDocHtml = (lead) => {
    const { quoteNo, style, inner } = leadDocParts(lead);
    return `<!doctype html><html><head><meta charset="utf-8"><title>${quoteNo} - Tesco Structures</title>${style}</head><body>${inner}<scr` + `ipt>setTimeout(function(){window.print();},400);</scr` + `ipt></body></html>`;
  };

  // Download a single lead as a real branded PDF file (falls back to print-to-PDF)
  const downloadLead = async (lead) => {
    const { quoteNo, style, inner } = leadDocParts(lead);
    let host = null;
    const prevX = window.scrollX || 0, prevY = window.scrollY || 0;
    try {
      const html2pdf = await ensureHtml2Pdf();
      window.scrollTo(0, 0);
      // Render BEHIND the page (z-index:-1, hidden by the app background — never opened in a
      // tab or print preview) at A4 width; pin html2canvas to the scroll origin so the capture
      // is never offset/blank.
      host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:0;top:0;width:794px;background:#fff;z-index:-1;';
      host.innerHTML = style + inner;
      document.body.appendChild(host);
      const target = host.querySelector('.tsdoc') || host;
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }
      await new Promise((r) => setTimeout(r, 50));
      await html2pdf().set({
        margin: 0,
        filename: `${quoteNo}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 1.5, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0, x: 0, y: 0, windowWidth: 794, windowHeight: target.scrollHeight },
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      }).from(target).save();
      showToast('Lead PDF downloaded', 'success');
    } catch (err) {
      console.error('PDF download failed:', err);
      showToast('Could not generate the PDF. Please try again.', 'error');
    } finally {
      if (host && host.parentNode) host.parentNode.removeChild(host);
      window.scrollTo(prevX, prevY);
    }
  };

  // Filter States
  const [selectedService, setSelectedService] = useState('All');
  const [selectedLeadSource, setSelectedLeadSource] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedDesignReq, setSelectedDesignReq] = useState('All');
  // Assign To column filter (header dropdown). 'All' shows everyone; 'Unassigned' shows
  // leads with no manager; otherwise filters to the chosen manager's name.
  const [selectedAssign, setSelectedAssign] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [range, setRange] = useState({ start: null, end: null });

  // Manager View scopes to the selected manager (matching a real Manager account);
  // Coordinator View is org-wide (matching a real Coordinator account).
  const scopeMgr = viewMode === 'manager' ? manager : 'all';
  // Compare the assigned manager case/space-insensitively so the Head's Manager View
  // shows exactly the leads that manager sees in their own portal (which matches loosely).
  const sameMgr = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

  // Short designation label (Manager / BDE) for the "Assign To" display.
  const shortDesig = (d) => String(d || '').trim().toLowerCase() === 'business development executive' ? 'BDE' : 'Manager';
  const managerLabel = (m) => (m && m.designation) ? `${m.name} – ${shortDesig(m.designation)}` : (m ? m.name : '');
  // "Rajesh – Manager" / "Kumar – BDE" for an assigned name (looks up designation from the managers list).
  const assignedLabel = (name) => {
    if (!name || name === 'Unassigned') return 'Unassigned';
    const m = managers.find((x) => sameMgr(x.name, name));
    return (m && m.designation) ? `${name} – ${shortDesig(m.designation)}` : name;
  };
  const managerLeads = scopeMgr === 'all' ? leadsData : leadsData.filter(l => sameMgr(l.manager, scopeMgr));

  // A lead is in the picked calendar range (inclusive). Undated leads are never hidden.
  const inSelectedRange = (v) => {
    if (!range.start || !range.end) return true;
    const t = new Date(v).getTime();
    if (isNaN(t)) return true;
    const a = new Date(range.start); a.setHours(0, 0, 0, 0);
    const b = new Date(range.end); b.setHours(23, 59, 59, 999);
    return t >= a.getTime() && t <= b.getTime();
  };

  // Filter Logic
  const searchQ = searchQuery.trim().toLowerCase();
  const matchesSearch = (lead) => {
    if (!searchQ) return true;
    return [lead.name, lead.company, lead.phone, lead.email, lead.id, lead.location, lead.city, lead.projectType, lead.service, lead.manager]
      .some((v) => String(v || '').toLowerCase().includes(searchQ));
  };
  const snoMap = (() => {
    const tm = (l) => { const ms = new Date(l.createdAt || l.date || 0).getTime(); return isNaN(ms) ? 0 : ms; };
    const m = {};
    [...leadsData].sort((a, b) => (tm(a) - tm(b)) || String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true })).forEach((l, i) => { m[l.id] = i + 1; });
    return m;
  })();
  const filteredLeads = managerLeads.filter(lead => {
    if (!matchesSearch(lead)) return false;
    if (selectedService !== 'All' && String(lead.service || '').toUpperCase() !== selectedService.toUpperCase()) return false;
    if (selectedLeadSource !== 'All' && String(lead.source || '').toUpperCase() !== selectedLeadSource.toUpperCase()) return false;
    if (selectedStatus === 'Overdue') { if (getFollowUpState(lead) !== 'overdue') return false; }
    else if (selectedStatus !== 'All' && String(lead.status || '').toUpperCase() !== selectedStatus.toUpperCase()) return false;
    // Hide Junk leads from the default (All) view; they remain viewable via the Status filter (Junk).
    if (selectedStatus === 'All' && String(lead.status || '').toLowerCase().includes('junk')) return false;
    // Assign To filter (header dropdown).
    if (selectedAssign === 'Unassigned') {
      const m = String(lead.manager || '').trim();
      if (m && m.toLowerCase() !== 'unassigned') return false;
    } else if (selectedAssign !== 'All' && !sameMgr(lead.manager, selectedAssign)) {
      return false;
    }
    if (!inSelectedRange(lead.date || lead.createdAt)) return false;
    return true;
  }).sort((a, b) => {
    // Newest first — by the real backend create/update time (never by id or name)
    const da = new Date(a.createdAt || a.updatedAt || a.date || 0).getTime();
    const db = new Date(b.createdAt || b.updatedAt || b.date || 0).getTime();
    return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da);
  });

  // KPI counts — aligned with the Manager app so the overview matches across apps.
  // Status cards use SUBSTRING matching (a lead saved as "Cold" or "New" by the Manager
  // app still counts), and Appt Fixed / Quotation Sent are RECORD-based (appointments /
  // quotations collections) rather than lead-status based.
  const Sx = (v) => String(v || '').toLowerCase();
  const isNewStatus = (s) => {
    const x = Sx(s);
    return !(x.includes('hot') || x.includes('warm') || x.includes('cold') || x.includes('junk') ||
             x.includes('appoint') || x.includes('appt') || x.includes('quotation') ||
             x.includes('order') || x.includes('lost'));
  };
  // Scope every KPI to the chosen calendar range so the overview numbers match the table.
  const rangeLeads = managerLeads.filter(l => inSelectedRange(l.date || l.createdAt));
  const myApptRecords = apptRecords.filter(a => (scopeMgr === 'all' || sameMgr(a.manager, scopeMgr)) && inSelectedRange(a.date || a.createdAt));
  const myLeadIdSet = new Set(rangeLeads.map(l => l.id));
  const totalLeads = rangeLeads.length;
  const newLeadsCount = rangeLeads.filter(l => isNewStatus(l.status)).length;
  const hotCount = rangeLeads.filter(l => Sx(l.status).includes('hot')).length;
  const warmCount = rangeLeads.filter(l => Sx(l.status).includes('warm')).length;
  const coldCount = rangeLeads.filter(l => Sx(l.status).includes('cold')).length;
  const apptCount = myApptRecords.filter(a => !/visit/i.test(String(a.type || a.visitType || ''))).length;
  const quotationCount = quoteRecords.filter(q => myLeadIdSet.has(q.leadId) && inSelectedRange(q.date || q.createdAt)).length;
  const orderCount = rangeLeads.filter(l => Sx(l.status).includes('order')).length;
  const junkCount = rangeLeads.filter(l => Sx(l.status).includes('junk')).length;
  const lostCount = rangeLeads.filter(l => Sx(l.status).includes('lost')).length;
  const overdueCount = rangeLeads.filter(l => !(l.status || '').toLowerCase().includes('junk') && getFollowUpState(l) === 'overdue').length;
  const unassignedCount = rangeLeads.filter(l => !l.manager || String(l.manager).toLowerCase() === 'unassigned').length;

  return (
    <div className="leads-page">
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

      <div className="leads-header">
        <h1>Lead Management</h1>
        <button className="btn btn--primary" onClick={() => setIsAddLeadModalOpen(true)}>
          + Add New Lead
        </button>
      </div>

      <div className="leads-filters">
        <div className="leads-search" style={{ position: 'relative', flex: '1 1 280px', maxWidth: '360px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, phone, company, email, ID…"
            style={{ width: '100%', padding: '0.55rem 2.2rem 0.55rem 2.2rem', border: '1px solid var(--border, #e5e7eb)', borderRadius: '8px', fontSize: '0.875rem', fontFamily: 'inherit', color: 'var(--text-main, #111827)', background: 'var(--surface-color, #fff)', boxSizing: 'border-box', outline: 'none' }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              title="Clear search"
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'inline-flex', padding: '2px' }}
            >
              <X size={15} />
            </button>
          )}
        </div>
        <DateRangePicker onApply={(s, e) => setRange({ start: s, end: e })} />
        <ScopeFilter />
      </div>

      <div className="leads-overview">
        <h2 className="section-title">Overview</h2>
        <div className="grid-5-col">
          <div className="metric-card card-grey">
            <div className="metric-header"><span className="metric-title">Total Leads</span><Users size={16} /></div>
            <div className="metric-value">{totalLeads}</div><div className="metric-subtitle">All leads in system</div>
          </div>
          <div className={`metric-card card-indigo ${selectedAssign === 'Unassigned' ? 'active' : ''}`} onClick={() => setSelectedAssign(selectedAssign === 'Unassigned' ? 'All' : 'Unassigned')} style={{ cursor: 'pointer' }}>
            <div className="metric-header"><span className="metric-title">Unassigned Leads</span><UserX size={16} /></div>
            <div className="metric-value">{unassignedCount}</div><div className="metric-subtitle">Not yet assigned</div>
          </div>
          <div className="metric-card card-blue">
            <div className="metric-header"><span className="metric-title">New Leads</span><Sparkles size={16} /></div>
            <div className="metric-value">{newLeadsCount}</div><div className="metric-subtitle">Freshly received</div>
          </div>
          <div className="metric-card card-red">
            <div className="metric-header"><span className="metric-title">Hot Leads</span><Flame size={16} /></div>
            <div className="metric-value">{hotCount}</div><div className="metric-subtitle">High conversion chance</div>
          </div>
          <div className="metric-card card-orange">
            <div className="metric-header"><span className="metric-title">Warm Leads</span><Thermometer size={16} /></div>
            <div className="metric-value">{warmCount}</div><div className="metric-subtitle">Nurturing in progress</div>
          </div>
          <div className="metric-card card-slate">
            <div className="metric-header"><span className="metric-title">Cold Leads</span><Snowflake size={16} /></div>
            <div className="metric-value">{coldCount}</div><div className="metric-subtitle">Need re-engagement</div>
          </div>
          <div className="metric-card card-green">
            <div className="metric-header"><span className="metric-title">Appt. Fixed</span><CalendarCheck size={16} /></div>
            <div className="metric-value">{apptCount}</div><div className="metric-subtitle">Meetings scheduled</div>
          </div>
          <div className="metric-card card-purple">
            <div className="metric-header"><span className="metric-title">Quotation Sent</span><FileText size={16} /></div>
            <div className="metric-value">{quotationCount}</div><div className="metric-subtitle">Awaiting response</div>
          </div>
          <div className="metric-card card-emerald">
            <div className="metric-header"><span className="metric-title">Order Confirmed</span><CheckCircle size={16} /></div>
            <div className="metric-value">{orderCount}</div><div className="metric-subtitle">Successfully closed</div>
          </div>
          <div className="metric-card card-slate">
            <div className="metric-header"><span className="metric-title">Junk</span><Trash2 size={16} /></div>
            <div className="metric-value">{junkCount}</div><div className="metric-subtitle">Unqualified leads</div>
          </div>
          <div className={`metric-card card-red ${selectedStatus === 'Overdue' ? 'active' : ''}`} onClick={() => setSelectedStatus(selectedStatus === 'Overdue' ? 'All' : 'Overdue')} style={{ cursor: 'pointer' }}>
            <div className="metric-header"><span className="metric-title">Overdue</span><Clock size={16} /></div>
            <div className="metric-value">{overdueCount}</div><div className="metric-subtitle">Follow-up passed</div>
          </div>
        </div>
      </div>

      <div className="table-container leads-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>S.No.</th>
              <th>Date</th>
              <th>Lead ID</th>
              <th>Customer Name</th>
              <th>Work Type</th>
              <th>Project Location</th>
              <th className="th-interactive" onClick={() => setServicesDropdownOpen(!servicesDropdownOpen)}>
                {selectedService === 'All' ? 'SERVICES (ALL)' : `SERVICES (${selectedService.toUpperCase()})`} <ChevronDown size={14} style={{display:'inline', verticalAlign:'middle'}}/>

                {servicesDropdownOpen && (
                  <div className="dark-dropdown-menu">
                    <div className={`dark-dropdown-item ${selectedService === 'All' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setSelectedService('All'); setServicesDropdownOpen(false); }}>
                      {selectedService === 'All' && <span className="check-icon">✓</span>} SERVICES (ALL)
                    </div>
                    <div className={`dark-dropdown-item ${selectedService === 'PEB' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setSelectedService('PEB'); setServicesDropdownOpen(false); }}>
                      {selectedService === 'PEB' && <span className="check-icon">✓</span>} PEB
                    </div>
                    <div className={`dark-dropdown-item ${selectedService === 'Tensile' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setSelectedService('Tensile'); setServicesDropdownOpen(false); }}>
                      {selectedService === 'Tensile' && <span className="check-icon">✓</span>} TENSILE
                    </div>
                    <div className={`dark-dropdown-item ${selectedService === 'Other roofing' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setSelectedService('Other roofing'); setServicesDropdownOpen(false); }}>
                      {selectedService === 'Other roofing' && <span className="check-icon">✓</span>} OTHER ROOFING
                    </div>
                  </div>
                )}
              </th>
              <th>Project Value</th>
              <th>Phone Number</th>
              <th>Email</th>
              <th>City</th>
              <th>Expected Start</th>
              <th>Area (sq ft)</th>
              <th className="th-interactive" onClick={() => setLeadSourceDropdownOpen(!leadSourceDropdownOpen)}>
                {selectedLeadSource === 'All' ? 'LEAD SOURCE (ALL)' : selectedLeadSource.toUpperCase()} <ChevronDown size={14} style={{display:'inline', verticalAlign:'middle'}}/>

                {leadSourceDropdownOpen && (
                  <div className="dark-dropdown-menu" style={{right: 0, left: 'auto'}}>
                    <div className={`dark-dropdown-item ${selectedLeadSource === 'All' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setSelectedLeadSource('All'); setLeadSourceDropdownOpen(false); }}>
                      {selectedLeadSource === 'All' && <span className="check-icon">✓</span>} LEAD SOURCE (ALL)
                    </div>
                    {['REFERRAL', 'WEBSITE ENQUIRY', 'COLD CALLING', 'META LEADS', 'GOOGLE ADS', 'ORGANIC LEADS'].map(source => (
                      <div key={source} className={`dark-dropdown-item ${selectedLeadSource === source ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setSelectedLeadSource(source); setLeadSourceDropdownOpen(false); }}>
                        {selectedLeadSource === source && <span className="check-icon">✓</span>} {source}
                      </div>
                    ))}
                  </div>
                )}
              </th>

              {/* New Interactive Columns */}
              <th className="th-interactive" onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}>
                {selectedStatus === 'All' ? 'STATUS (ALL)' : selectedStatus.toUpperCase()} <ChevronDown size={14} style={{display:'inline', verticalAlign:'middle'}}/>

                {statusDropdownOpen && (
                  <div className="dark-dropdown-menu" style={{right: 0, left: 'auto'}}>
                    <div className={`dark-dropdown-item ${selectedStatus === 'All' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setSelectedStatus('All'); setStatusDropdownOpen(false); }}>
                      {selectedStatus === 'All' && <span className="check-icon">✓</span>} STATUS (ALL)
                    </div>
                    {['New Lead', 'Hot Leads', 'Warm Leads', 'Cold Leads', 'Appointment Fixed', 'Quotation Send', 'Order Confirmed', 'Junk', 'Lost'].map(status => (
                      <div key={status} className={`dark-dropdown-item ${selectedStatus === status ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setSelectedStatus(status); setStatusDropdownOpen(false); }}>
                        {selectedStatus === status && <span className="check-icon">✓</span>} {status.toUpperCase()}
                      </div>
                    ))}
                  </div>
                )}
              </th>
              <th className="th-interactive" onClick={() => setDesignReqDropdownOpen(!designReqDropdownOpen)}>
                {selectedDesignReq === 'All' ? 'DESIGN REQ' : selectedDesignReq.toUpperCase()} <ChevronDown size={14} style={{display:'inline', verticalAlign:'middle'}}/>

                {designReqDropdownOpen && (
                  <div className="dark-dropdown-menu" style={{right: 0, left: 'auto'}}>
                    <div className={`dark-dropdown-item ${selectedDesignReq === 'All' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setSelectedDesignReq('All'); setDesignReqDropdownOpen(false); }}>
                      {selectedDesignReq === 'All' && <span className="check-icon">✓</span>} Select
                    </div>
                    {['2D Design', '3D Design', 'Both'].map(req => (
                      <div key={req} className={`dark-dropdown-item ${selectedDesignReq === req ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setSelectedDesignReq(req); setDesignReqDropdownOpen(false); }}>
                        {selectedDesignReq === req && <span className="check-icon">✓</span>} {req.toUpperCase()}
                      </div>
                    ))}
                  </div>
                )}
              </th>
              <th className="th-interactive" onClick={() => setAssignDropdownOpen(!assignDropdownOpen)}>
                {selectedAssign === 'All' ? 'Assign To (All)' : selectedAssign} <ChevronDown size={14} style={{display:'inline', verticalAlign:'middle'}}/>

                {assignDropdownOpen && (
                  <div className="dark-dropdown-menu" style={{ right: 0, left: 'auto', maxHeight: '320px', overflowY: 'auto' }}>
                    <div className={`dark-dropdown-item ${selectedAssign === 'All' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setSelectedAssign('All'); setAssignDropdownOpen(false); }}>
                      {selectedAssign === 'All' && <span className="check-icon">✓</span>} Assign To (All)
                    </div>
                    <div className={`dark-dropdown-item ${selectedAssign === 'Unassigned' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setSelectedAssign('Unassigned'); setAssignDropdownOpen(false); }}>
                      {selectedAssign === 'Unassigned' && <span className="check-icon">✓</span>} Unassigned
                    </div>
                    {managers.map((m) => (
                      <div key={m.email || m.employeeId || m.name} className={`dark-dropdown-item ${selectedAssign === m.name ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); setSelectedAssign(m.name); setAssignDropdownOpen(false); }}>
                        {selectedAssign === m.name && <span className="check-icon">✓</span>} {managerLabel(m)}
                      </div>
                    ))}
                  </div>
                )}
              </th>
              <th>Follow Up</th>
              <th>Actions</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody className="leads-tbody">
            {filteredLeads.map((lead, idx) => (
              <tr
                key={lead.id}
                className={`lead-row ${selectedLead?.id === lead.id ? 'selected-row' : ''}`}
                onClick={() => { setSelectedLead(lead); setDrawerTab('specifications'); }}
                style={{ cursor: 'pointer' }}
              >
                <td className="text-muted">{snoMap[lead.id] || ''}</td>
                <td className="text-muted">{lead.date || '-'}</td>
                <td className="font-medium text-primary">{lead.id}</td>
                <td className="font-bold">{lead.name}</td>
                <td>{lead.projectType || '-'}</td>
                <td>{lead.location || '-'}</td>
                <td>{lead.service || '-'}</td>
                <td className="font-medium">{lead.value ?? lead.projectValue ?? '-'}</td>
                <td className="text-muted" onClick={(e) => e.stopPropagation()}>
                  {lead.phone ? (
                    <a
                      href={telHref(lead.phone)}
                      title={`Call ${lead.phone}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--primary-color, #2563eb)', fontWeight: 600, textDecoration: 'none' }}
                    >
                      <Phone size={12} />
                      {lead.phone}
                    </a>
                  ) : '-'}
                </td>
                <td className="text-muted">{lead.email || '-'}</td>
                <td className="text-muted">{lead.city || '-'}</td>
                <td className="text-muted">{lead.timeline ? String(lead.timeline).replace(/_/g, ' ') : '-'}</td>
                <td className="text-muted">{lead.area ? String(lead.area).replace(/_/g, ' ') : '-'}</td>
                <td>
                  <div className={`status-select-wrapper badge-${getSourceColor(lead.source)}`} style={{ backgroundColor: sourceColor(lead.source).bg, color: sourceColor(lead.source).color, borderColor: sourceColor(lead.source).border }}>
                    <span className="source-dot" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', background: sourceColor(lead.source).dot, width: '8px', height: '8px', borderRadius: '50%' }}></span>
                    <select className="status-select" defaultValue={lead.source} style={{ paddingLeft: '1.5rem', backgroundColor: 'transparent', color: 'inherit' }} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => { const v = e.target.value; setLeadsData(prev => prev.map(l => (l.id === lead.id ? { ...l, source: v } : l))); api(`/leads/${lead.id}`, { method: 'PUT', body: { source: v } }).catch(() => {}); }}
                    >
                      <option value={lead.source}>{lead.source}</option>
                      <option value="WEBSITE ENQUIRY">WEBSITE ENQUIRY</option>
                      <option value="REFERRAL">REFERRAL</option>
                      <option value="COLD CALLING">COLD CALLING</option>
                      <option value="META LEADS">META LEADS</option>
                      <option value="GOOGLE ADS">GOOGLE ADS</option>
                      <option value="ORGANIC LEADS">ORGANIC LEADS</option>
                    </select>
                    <ChevronDown size={14} className="status-chevron" />
                  </div>
                </td>

                {/* Status Column */}
                <td>
                  <div className={`status-select-wrapper badge-${getStatusColor(lead.status)}`} style={{ backgroundColor: statusColor(lead.status).bg, color: statusColor(lead.status).color, borderColor: statusColor(lead.status).border }}>
                    <select
                      className="status-select"
                      value={canonStatus(lead.status)}
                      style={{ backgroundColor: 'transparent', color: 'inherit' }}
                      onChange={(e) => {
                        e.stopPropagation();
                        setPendingStatusChange({ lead, newStatus: e.target.value });
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="New Lead">NEW LEAD</option>
                      <option value="Hot Leads">HOT LEADS</option>
                      <option value="Warm Leads">WARM LEADS</option>
                      <option value="Cold Leads">COLD LEADS</option>
                      <option value="Appointment Fixed">APPOINTMENT FIXED</option>
                      <option value="Quotation Send">QUOTATION SEND</option>
                      <option value="Order Confirmed">ORDER CONFIRMED</option>
                      <option value="Junk">JUNK</option>
                      <option value="Lost">LOST</option>
                    </select>
                    <ChevronDown size={14} className="status-chevron" />
                  </div>
                </td>

                {/* Design Req Column */}
                <td>
                  <div className="table-select-wrapper">
                    <select
                      className="table-select"
                      defaultValue="Select..."
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val && val !== 'Select...') {
                          setDesignReqModalLead(lead);
                          setDesignReqModalType(val);
                          setIsDesignReqModalOpen(true);
                        }
                      }}
                    >
                      <option value="Select...">Select...</option>
                      <option value="2D Design">2D Design</option>
                      <option value="3D Design">3D Design</option>
                      <option value="Both">Both</option>
                    </select>
                    <ChevronDown size={14} className="table-select-chevron" />
                  </div>
                </td>

                {/* Assign To Column — working dropdown; the Head assigns a Manager/BDE here. */}
                <td>
                  <div className="table-select-wrapper">
                    <select
                      className="table-select"
                      value={lead.manager || 'Unassigned'}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const v = e.target.value;
                        const prevManager = lead.manager || 'Unassigned';
                        // Optimistic update + protect this lead from the auto-refresh clobber
                        // until the assignment is confirmed saved to the shared DB.
                        pendingAssignRef.current.add(lead.id);
                        setLeadsData(prev => prev.map(l => (l.id === lead.id ? { ...l, manager: v } : l)));
                        api(`/leads/${lead.id}`, { method: 'PUT', body: { manager: v } })
                          .then(() => { pendingAssignRef.current.delete(lead.id); })
                          .catch(() => {
                            // Save failed — revert the dropdown and stop protecting it.
                            pendingAssignRef.current.delete(lead.id);
                            setLeadsData(prev => prev.map(l => (l.id === lead.id ? { ...l, manager: prevManager } : l)));
                          });
                      }}
                    >
                      <option value="Unassigned">Unassigned</option>
                      {managers.map((m) => (
                        <option key={m.email || m.employeeId || m.name} value={m.name}>{managerLabel(m)}</option>
                      ))}
                      {/* Preserve an existing assignment whose name isn't in the current managers list */}
                      {lead.manager && lead.manager !== 'Unassigned' && !managers.some((m) => m.name === lead.manager) && (
                        <option value={lead.manager}>{lead.manager}</option>
                      )}
                    </select>
                    <ChevronDown size={14} className="table-select-chevron" />
                  </div>
                </td>

                {/* Follow Up Column — remarks-first workflow (Log call / Schedule modal) */}
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="table-date-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.35rem' }}>
                    {(() => {
                      const st = getFollowUpState(lead);
                      const label = fmtFollowUp(lead.followUp);
                      return (
                        <>
                          <span title={label} style={{ fontSize: '0.8125rem', color: 'var(--text-main, #111827)', fontWeight: 600 }}>
                            {label || '—'}
                          </span>
                          {st === 'overdue' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#FEE2E2', color: '#DC2626', fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                              <Clock size={11} /> Overdue
                            </span>
                          )}
                          {st === 'completed' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#DCFCE7', color: '#166534', fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '999px' }}>
                              <CheckCircle2 size={11} /> Completed
                            </span>
                          )}
                          {(st === 'overdue' || st === 'upcoming') ? (
                            <button
                              type="button"
                              title="Log the follow-up call (enter remarks)"
                              onClick={(e) => { e.stopPropagation(); openFollowUpModal(lead, 'complete'); }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', background: 'var(--primary-color, #2563eb)', color: '#fff', border: 'none', fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '999px', cursor: 'pointer' }}
                            >
                              <Phone size={11} /> Log call
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="Schedule a follow-up (enter remarks first)"
                              onClick={(e) => { e.stopPropagation(); openFollowUpModal(lead, 'schedule'); }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', background: 'transparent', color: 'var(--primary-color, #2563eb)', border: '1px solid var(--primary-color, #2563eb)', fontSize: '0.7rem', fontWeight: 600, padding: '0.18rem 0.55rem', borderRadius: '999px', cursor: 'pointer' }}
                            >
                              <Calendar size={11} /> {st === 'completed' ? 'New follow-up' : 'Schedule'}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </td>

                {/* Actions Column */}
                <td>
                  <div className="action-buttons" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="action-btn btn-activity"
                      onClick={() => { setSelectedLead(lead); setDrawerTab('timeline'); }}
                    >
                      <Activity size={14} />
                    </button>
                    <button
                      className="action-btn btn-edit"
                      title="Edit lead"
                      onClick={(e) => { e.stopPropagation(); setWizardLead(lead); setWizardOpen(true); }}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      className="action-btn btn-download"
                      title="Download Lead PDF"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadLead(lead);
                      }}
                    >
                      <Download size={14} />
                    </button>
                    <button
                      className="action-btn btn-delete"
                      title="Delete lead"
                      onClick={(e) => { e.stopPropagation(); setJunkTarget(lead); }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>

                {/* Notes Column — compact preview + View More (full text opens in a popup) */}
                <td>
                  <div className="notes-cell" onClick={(e) => e.stopPropagation()}>
                    {lead.notes ? (
                      <>
                        <div className="notes-preview-row">
                          <span className="notes-text text-muted" title="Edit remarks" onClick={() => openNotesEdit(lead)}>{lead.notes}</span>
                          <Edit3 size={14} className="notes-edit-icon" onClick={() => openNotesEdit(lead)} />
                        </div>
                        <button type="button" className="notes-view-more" onClick={() => openNotesView(lead)}>View More</button>
                      </>
                    ) : (
                      <button type="button" className="notes-add-btn" title="Add remarks" onClick={() => openNotesEdit(lead)}>
                        <Edit3 size={12} /> Add
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(isAddLeadModalOpen || editLead) && (
        <AddLeadModal
          isOpen={isAddLeadModalOpen || !!editLead}
          editLead={editLead}
          managers={managers}
          onSaved={handleLeadSaved}
          onReload={loadLeadsAll}
          onCreateQuotation={(lead) => { setSelectedQuotationLead(lead); setIsQuotationModalOpen(true); }}
          onClose={() => { setIsAddLeadModalOpen(false); setEditLead(null); }}
        />
      )}

      <AddLeadWizard
        isOpen={wizardOpen}
        onClose={() => { setWizardOpen(false); setWizardLead(null); }}
        onSave={handleWizardSave}
        editLead={wizardLead}
        managers={managers}
      />

      <LeadDetailsDrawer
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        lead={selectedLead}
        initialTab={drawerTab}
      />

      <StatusUpdateModal
        isOpen={!!pendingStatusChange}
        onClose={() => setPendingStatusChange(null)}
        onSave={handleSaveStatus}
        newStatus={pendingStatusChange?.newStatus}
        statusColor={pendingStatusChange ? getStatusColor(pendingStatusChange.newStatus) : ''}
      />

      <GenerateQuotationModal
        isOpen={isQuotationModalOpen}
        onClose={() => setIsQuotationModalOpen(false)}
        lead={selectedQuotationLead}
      />

      <DesignRequirementModal
        isOpen={isDesignReqModalOpen}
        onClose={() => setIsDesignReqModalOpen(false)}
        lead={designReqModalLead}
        designType={designReqModalType}
      />

      {/* Remarks-first Follow-up modal: remarks required before a date/time can be set */}
      {isFollowUpModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)'
        }} onClick={cancelFollowUpModal}>
          <div className="card" style={{ width: '100%', maxWidth: '460px', padding: '2rem', background: 'var(--surface-color, #fff)', borderRadius: '12px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main, #111827)' }}>
                {fuMode === 'complete' ? 'Log Follow-up Call' : 'Schedule Follow-up'}
              </h3>
              <button onClick={cancelFollowUpModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #6b7280)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleFollowUpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {/* Step 1: Remarks (required first) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #111827)', marginBottom: '0.4rem' }}>
                  Remarks <span style={{ color: '#DC2626' }}>*</span>
                  <span style={{ fontWeight: 400, color: 'var(--text-muted, #6b7280)' }}> — client's response / discussion outcome</span>
                </label>
                <textarea
                  value={fuRemark}
                  onChange={(e) => setFuRemark(e.target.value)}
                  autoFocus
                  rows={3}
                  placeholder='e.g. "Client asked to call back after 2 days — comparing quotes."'
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '8px', fontSize: '0.875rem', fontFamily: 'inherit', color: 'var(--text-main, #111827)', background: 'var(--surface-color, #fff)', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              {/* Step 2: Next follow-up date + time (enabled once remarks are entered) */}
              <div style={{ opacity: fuRemark.trim() ? 1 : 0.5, pointerEvents: fuRemark.trim() ? 'auto' : 'none' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 45%' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #111827)', marginBottom: '0.4rem' }}>Follow-up Date</label>
                    <input type="date" value={fuDate} min={fuTodayStr()} disabled={fuNoFurther} onChange={(e) => setFuDate(e.target.value)}
                      style={{ width: '100%', padding: '0.55rem 0.6rem', border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '8px', fontSize: '0.875rem', fontFamily: 'inherit', color: 'var(--text-main, #111827)', background: 'var(--surface-color, #fff)', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: '1 1 45%' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main, #111827)', marginBottom: '0.4rem' }}>Follow-up Time</label>
                    {(() => {
                      const t = fuTo12(fuTime);
                      const sel = { flex: 1, padding: '0.55rem 0.4rem', border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '8px', fontSize: '0.875rem', fontFamily: 'inherit', color: 'var(--text-main, #111827)', background: 'var(--surface-color, #fff)', boxSizing: 'border-box' };
                      const setPart = (part, val) => { const n = { ...t, [part]: val }; setFuTime(n.h ? fuFrom12(n.h, n.m || '00', n.ap || 'AM') : ''); };
                      return (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <select value={t.h} disabled={fuNoFurther} onChange={(e) => setPart('h', e.target.value)} style={sel}>
                            <option value="">HH</option>
                            {FU_HOURS12.map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                          <select value={t.m} disabled={fuNoFurther} onChange={(e) => setPart('m', e.target.value)} style={sel}>
                            <option value="">MM</option>
                            {FU_MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <select value={t.ap} disabled={fuNoFurther} onChange={(e) => setPart('ap', e.target.value)} style={sel}>
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.85rem', fontSize: '0.85rem', color: 'var(--text-main, #111827)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={fuNoFurther} onChange={(e) => setFuNoFurther(e.target.checked)} />
                  No further follow-up required — mark as <strong>&nbsp;Completed</strong>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button type="button" onClick={cancelFollowUpModal}
                  style={{ padding: '0.55rem 1.1rem', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)', background: 'var(--surface-color, #fff)', color: 'var(--text-main, #111827)', fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={!fuRemark.trim() || (!fuNoFurther && (!fuDate || !fuTime))}
                  style={{ padding: '0.55rem 1.1rem', borderRadius: '8px', border: 'none', background: (!fuRemark.trim() || (!fuNoFurther && (!fuDate || !fuTime))) ? '#94A3B8' : 'var(--primary-color, #2563eb)', color: '#fff', fontWeight: 700, cursor: (!fuRemark.trim() || (!fuNoFurther && (!fuDate || !fuTime))) ? 'not-allowed' : 'pointer' }}>
                  {fuNoFurther ? 'Mark Completed' : 'Save Follow-up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notes / Remarks popup — comfortable editing + full-text viewing */}
      {notesModal.open && (() => {
        const nlead = leadsData.find((l) => l.id === notesModal.leadId);
        const meta = nlead ? latestNoteMeta(nlead) : { when: '', by: '' };
        return (
          <div onClick={closeNotesModal} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', width: 'min(560px, 94vw)', maxHeight: '85vh', overflow: 'auto', padding: '1.25rem 1.5rem', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>{notesModal.mode === 'edit' ? 'Edit Remarks' : 'Client Remarks'}</h3>
                <button onClick={closeNotesModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'inline-flex' }}><X size={18} /></button>
              </div>
              {notesModal.mode === 'edit' ? (
                <>
                  <textarea
                    autoFocus
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Type the complete remarks here…"
                    rows={8}
                    style={{ width: '100%', minHeight: '180px', resize: 'vertical', padding: '0.65rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem', lineHeight: 1.6, fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                    <button onClick={closeNotesModal} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                    <button onClick={submitNotesEdit} style={{ padding: '0.5rem 1.1rem', borderRadius: '8px', border: 'none', background: '#1e1b4b', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.92rem', lineHeight: 1.6, color: '#1e293b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.8rem 0.9rem', minHeight: '80px' }}>{(nlead && nlead.notes) || '—'}</div>
                  <div style={{ marginTop: '0.9rem', fontSize: '0.8rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {meta.by ? <div><strong>Salesperson:</strong> {meta.by}</div> : null}
                    {meta.when ? <div><strong>Date/Time:</strong> {meta.when}</div> : null}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                    <button onClick={() => nlead && openNotesEdit(nlead)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                    <button onClick={closeNotesModal} style={{ padding: '0.5rem 1.1rem', borderRadius: '8px', border: 'none', background: '#1e1b4b', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Close</button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

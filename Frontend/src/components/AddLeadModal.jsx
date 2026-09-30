import React, { useState, useEffect, useRef } from 'react';
import { X, Check, CalendarDays, FileText, LayoutList, UploadCloud, ChevronDown, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { showToast } from '../utils/toast';
import { uploadManyToCloudinary, isUploadConfigured, formatBytes } from '../utils/cloudinary';
import './AddLeadModal.css';

// ── Edit-mode option sets (match the Leads table dropdowns exactly) ──
const EDIT_STATUS_OPTIONS = ['New Lead', 'Hot Leads', 'Warm Leads', 'Cold Leads', 'Appointment Fixed', 'Quotation Send', 'Order Confirmed', 'Junk', 'Lost'];
const EDIT_SOURCE_OPTIONS = ['WEBSITE ENQUIRY', 'REFERRAL', 'COLD CALLING', 'META LEADS', 'GOOGLE ADS', 'ORGANIC LEADS'];
const EDIT_SERVICE_OPTIONS = ['PEB', 'Tensile', 'Other roofing', 'Other'];
const EDIT_PRIORITY_OPTIONS = ['High', 'Medium', 'Low'];
const EDIT_DESIGN_OPTIONS = ['', '2D Design', '3D Design', 'Both'];

// Normalise any stored status variant onto the exact dropdown option value.
const EDIT_STATUS_MAP = {
  'new': 'New Lead', 'new lead': 'New Lead', 'new leads': 'New Lead',
  'hot': 'Hot Leads', 'hot leads': 'Hot Leads',
  'warm': 'Warm Leads', 'warm leads': 'Warm Leads',
  'cold': 'Cold Leads', 'cold leads': 'Cold Leads',
  'appointment fixed': 'Appointment Fixed', 'appt fixed': 'Appointment Fixed',
  'quotation send': 'Quotation Send', 'quotation sent': 'Quotation Send',
  'order confirmed': 'Order Confirmed', 'junk': 'Junk', 'lost': 'Lost',
};
const editCanonStatus = (v) => EDIT_STATUS_MAP[String(v || '').trim().toLowerCase()] || v || 'New Lead';

// Convert any stored follow-up value into a datetime-local value (YYYY-MM-DDTHH:mm).
const toDateInput = (v) => {
  if (!v || typeof v !== 'string') return '';
  const s = v.trim();
  if (s === 'No Date' || s === 'Pending' || s === '') return '';
  let dPart = '', tPart = '', m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/))) { dPart = `${m[1]}-${m[2]}-${m[3]}`; tPart = `${m[4]}:${m[5]}`; }
  else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { dPart = `${m[1]}-${m[2]}-${m[3]}`; }
  else if ((m = s.match(/(\d{2})-(\d{2})-(\d{4})[,\s]+(\d{1,2}):(\d{2})\s*([AaPp][Mm])/))) { let h = parseInt(m[4], 10); const ap = m[6].toUpperCase(); if (ap === 'PM' && h !== 12) h += 12; if (ap === 'AM' && h === 12) h = 0; dPart = `${m[3]}-${m[2]}-${m[1]}`; tPart = `${String(h).padStart(2, '0')}:${m[5]}`; }
  else if ((m = s.match(/(\d{2})-(\d{2})-(\d{4})[,\s]+(\d{2}):(\d{2})/))) { dPart = `${m[3]}-${m[2]}-${m[1]}`; tPart = `${m[4]}:${m[5]}`; }
  else if ((m = s.match(/(\d{2})-(\d{2})-(\d{4})/))) { dPart = `${m[3]}-${m[2]}-${m[1]}`; }
  else { const d = new Date(s); if (!isNaN(d.getTime())) { dPart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; tPart = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } }
  if (!dPart) return '';
  return `${dPart}T${tPart || '09:00'}`;
};

const CustomDropdown = ({ options, value, onChange, placeholder = "Select...", openUpward = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="custom-dropdown-container" ref={dropdownRef}>
      <div className="custom-dropdown-trigger" onClick={() => setIsOpen(!isOpen)}>
        <span className={!value || value === placeholder ? "text-muted" : "truncate"}>{value || placeholder}</span>
        <ChevronDown size={16} color="#64748b" />
      </div>
      {isOpen && (
        <div className="custom-dropdown-menu" style={openUpward ? { bottom: '100%', top: 'auto', marginBottom: '4px' } : {}}>
          {options.map(opt => (
            <div key={opt} className="custom-dropdown-option" onClick={() => { onChange(opt); setIsOpen(false); }}>
              <div className="custom-dropdown-check">
                {value === opt && <Check size={14} color="white" strokeWidth={3} />}
              </div>
              <span style={{ color: opt === placeholder ? '#9ca3af' : 'white' }}>{opt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const managerSteps = [
  { id: 1, label: 'Basic Info' },
  { id: 2, label: 'Project Details' },
  { id: 3, label: 'Quotation' },
  { id: 4, label: 'Order confirmed' },
  { id: 5, label: 'Review' }
];

const coordinatorSteps = [
  { id: 1, label: 'Basic Info' },
  { id: 2, label: 'Project Details' },
  { id: 3, label: 'Quotations' },
  { id: 4, label: 'Order Confirm' },
  { id: 5, label: 'Review' }
];

export default function AddLeadModal({ viewMode = 'coordinator', onClose, editLead = null, managers = [], onSaved, onReload, onCreateQuotation }) {
  const isEdit = !!editLead;

  // ── Edit-mode form state (prefilled from the selected lead) ──
  const [editForm, setEditForm] = useState({
    name: '', company: '', phone: '', email: '', source: '', service: '', otherService: '',
    projectType: '', location: '', value: '', manager: 'Unassigned',
    priority: 'Medium', status: 'New Lead', designReq: '', followUp: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editLead) return;
    const svc = editLead.service || '';
    const known = EDIT_SERVICE_OPTIONS.includes(svc);
    setEditForm({
      name: editLead.name || '',
      company: editLead.company || '',
      phone: editLead.phone || '',
      email: editLead.email || '',
      source: editLead.source || '',
      service: (svc && !known) ? 'Other' : svc,
      otherService: (svc && !known) ? svc : '',
      projectType: editLead.projectType || '',
      location: editLead.location || '',
      value: editLead.value ?? editLead.projectValue ?? editLead.budget ?? '',
      manager: editLead.manager || 'Unassigned',
      priority: editLead.priority || 'Medium',
      status: editCanonStatus(editLead.status),
      designReq: editLead.designReq || '',
      followUp: editLead.followUp || '',
      notes: editLead.notes || '',
    });
  }, [editLead]);

  const setEF = (k, v) => setEditForm((f) => ({ ...f, [k]: v }));

  const handleUpdate = async () => {
    if (!editForm.name.trim()) { showToast('Customer name is required', 'error'); return; }
    if (!editForm.phone.trim()) { showToast('Phone number is required', 'error'); return; }
    const body = {
      name: editForm.name.trim(),
      company: editForm.company,
      phone: editForm.phone,
      email: editForm.email,
      source: editForm.source,
      service: (editForm.service === 'Other' && editForm.otherService.trim()) ? editForm.otherService.trim() : editForm.service,
      projectType: editForm.projectType,
      location: editForm.location,
      value: editForm.value,
      manager: editForm.manager,
      priority: editForm.priority,
      status: editForm.status,
      designReq: editForm.designReq,
      followUp: editForm.followUp,
      notes: editForm.notes,
      attachments,
    };
    setSaving(true);
    try {
      await api(`/leads/${editLead.id}`, { method: 'PUT', body });
      showToast('Lead updated successfully', 'success');
      if (onSaved) onSaved({ id: editLead.id, ...body });
      if (onClose) onClose();
    } catch (e) {
      showToast(e.message || 'Failed to update lead', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderEditForm = () => (
    <>
      <h3 className="step-title">Basic Information</h3>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Customer Name <span className="required-asterisk">*</span></label>
          <input type="text" className="form-input" placeholder="Enter customer name" value={editForm.name} onChange={(e) => setEF('name', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Company Name</label>
          <input type="text" className="form-input" placeholder="Enter company name" value={editForm.company} onChange={(e) => setEF('company', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Phone Number <span className="required-asterisk">*</span></label>
          <input type="text" className="form-input" placeholder="Enter phone number" value={editForm.phone} onChange={(e) => setEF('phone', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Email Address</label>
          <input type="email" className="form-input" placeholder="Enter email address" value={editForm.email} onChange={(e) => setEF('email', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Lead Source</label>
          <select className="form-input" value={editForm.source} onChange={(e) => setEF('source', e.target.value)}>
            <option value="">Select Lead Source</option>
            {EDIT_SOURCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Service</label>
          <select className="form-input" value={editForm.service} onChange={(e) => setEF('service', e.target.value)}>
            <option value="">Select Service</option>
            {EDIT_SERVICE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {editForm.service === 'Other' && (
            <input type="text" className="form-input" style={{ marginTop: '0.5rem' }} placeholder="Type the service name" value={editForm.otherService} onChange={(e) => setEF('otherService', e.target.value)} />
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Work Type / Project Type</label>
          <input type="text" className="form-input" placeholder="e.g. Warehouse" value={editForm.projectType} onChange={(e) => setEF('projectType', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Project Location</label>
          <input type="text" className="form-input" placeholder="Enter project location" value={editForm.location} onChange={(e) => setEF('location', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Project Value (₹)</label>
          <input type="text" className="form-input" placeholder="Enter project value" value={editForm.value} onChange={(e) => setEF('value', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Assign To</label>
          <select className="form-input" value={editForm.manager} onChange={(e) => setEF('manager', e.target.value)}>
            <option value="Unassigned">Unassigned</option>
            {managers.map((m) => <option key={m.email || m.employeeId || m.name} value={m.name}>{m.name}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Priority</label>
          <select className="form-input" value={editForm.priority} onChange={(e) => setEF('priority', e.target.value)}>
            {EDIT_PRIORITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-input" value={editForm.status} onChange={(e) => setEF('status', e.target.value)}>
            {EDIT_STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Design Requirement</label>
          <select className="form-input" value={editForm.designReq} onChange={(e) => setEF('designReq', e.target.value)}>
            {EDIT_DESIGN_OPTIONS.map((o) => <option key={o || 'none'} value={o}>{o || 'Select...'}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Next Follow-up Date &amp; Time</label>
          <input type="datetime-local" className="form-input" value={toDateInput(editForm.followUp)} onChange={(e) => setEF('followUp', e.target.value)} />
        </div>

        <div className="form-group" style={{ gridColumn: 'span 2' }}>
          <label className="form-label">Notes</label>
          <textarea className="form-input" rows="3" placeholder="Add notes..." value={editForm.notes} onChange={(e) => setEF('notes', e.target.value)}></textarea>
        </div>

        <div className="form-group" style={{ gridColumn: 'span 2' }}>
          <label className="form-label">Attachments</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.dwg,.dxf"
              style={{ display: 'none' }}
              onChange={(e) => { handleFilesPicked(e.target.files); e.target.value = ''; }}
            />
            <button type="button" className="btn btn--secondary" style={{ padding: '0.5rem 1rem' }} disabled={uploading} onClick={() => fileInputRef.current && fileInputRef.current.click()}>
              {uploading ? 'Uploading…' : 'Add file'}
            </button>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {attachments.length ? `${attachments.length} file${attachments.length > 1 ? 's' : ''} attached` : 'No files attached'}
            </span>
          </div>
          {renderAttachmentList()}
        </div>
      </div>
    </>
  );

  const [currentStep, setCurrentStep] = useState(1);
  const [projectType, setProjectType] = useState('Industrial');
  const [structureType, setStructureType] = useState('Clear Span');
  const [siteCondition, setSiteCondition] = useState('Flat');
  const [soilTest, setSoilTest] = useState('Done');
  const [siteVisit, setSiteVisit] = useState('Yes');
  const [startDate, setStartDate] = useState('Immediately');
  const [topService, setTopService] = useState('PEB Building');
  
  const [isServiceDropdownOpen, setIsServiceDropdownOpen] = useState(false);
  const [selectedService, setSelectedService] = useState('PEB Building');
  const serviceOptions = ['PEB Building', 'Tensile', 'Other roofing', 'Other Service'];

  const [isRoofingDropdownOpen, setIsRoofingDropdownOpen] = useState(false);
  const [selectedRoofing, setSelectedRoofing] = useState('Select Roofing Type');
  const roofingOptions = [
    'Select Roofing Type', 'Tensile Roofing', 'UPVC Roofing', 'Polycarbonate Roofing', 
    'Glass Roofing', 'Mangalore Tile Roofing', 'Shingles Roofing', 'GI Roofing', 'Retractable Roofing'
  ];

  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('NEW');
  const statusOptions = [
    'NEW', 'HOT', 'WARM', 'COLD', 'APPOINTMENT FIXED',
    'QUOTATION SEND', 'ORDER CONFIRMED', 'JUNK', 'LOST'
  ];

  const [leadSource, setLeadSource] = useState('WEBSITE ENQUIRY');
  const [budgetRange, setBudgetRange] = useState('5 - 10 Lakhs');
  const [expectedTimeline, setExpectedTimeline] = useState('Select Expected Timeline');
  const [step3Service, setStep3Service] = useState('PEB Building');
  const [quotationType, setQuotationType] = useState('Initial Quotation');

  // ── CREATE-MODE Basic Info (controlled) ──
  // These inputs were previously unbound (no value/onChange), so "Save Lead" had
  // nothing to persist — a new lead was never created and never appeared in the list.
  const [newForm, setNewForm] = useState({
    name: '', company: '', phone: '', email: '', location: '',
    manager: 'Unassigned', followUp: '',
  });
  const setNF = (k, v) => setNewForm((f) => ({ ...f, [k]: v }));

  // ── File attachments (uploaded directly to Cloudinary, stored on the lead) ──
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // In edit mode, start from the lead's existing attachments.
  useEffect(() => {
    setAttachments(Array.isArray(editLead?.attachments) ? editLead.attachments : []);
  }, [editLead]);

  // Upload one or more picked files and append the results to the attachments list.
  const handleFilesPicked = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (!isUploadConfigured()) {
      showToast('File upload is not set up yet. Add your Cloudinary keys to the app config.', 'error');
      return;
    }
    setUploading(true);
    try {
      const { ok, errors } = await uploadManyToCloudinary(files);
      if (ok.length) {
        setAttachments((prev) => [...prev, ...ok]);
        showToast(`${ok.length} file${ok.length > 1 ? 's' : ''} uploaded`, 'success');
      }
      if (errors.length) showToast(errors.join(' · '), 'error');
    } catch (e) {
      showToast(e.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx));

  // Uploaded-files list (shown under any upload control). Files open in a new tab.
  const renderAttachmentList = () => {
    if (!attachments.length) return null;
    return (
      <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {attachments.map((f, i) => (
          <div key={f.publicId || f.url || i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.6rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <FileText size={16} color="#6366f1" style={{ flexShrink: 0 }} />
            <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1e293b', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none' }} title={f.name}>
              {f.name}
            </a>
            {f.size ? <span style={{ fontSize: '0.72rem', color: '#94a3b8', flexShrink: 0 }}>{formatBytes(f.size)}</span> : null}
            <button type="button" onClick={() => removeAttachment(i)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'inline-flex', padding: 0, flexShrink: 0 }}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    );
  };

  // Map the create-form status label onto the exact status value the leads table stores.
  const CREATE_STATUS_MAP = {
    'NEW': 'New Lead', 'HOT': 'Hot Leads', 'WARM': 'Warm Leads', 'COLD': 'Cold Leads',
    'APPOINTMENT FIXED': 'Appointment Fixed', 'QUOTATION SEND': 'Quotation Send',
    'ORDER CONFIRMED': 'Order Confirmed', 'JUNK': 'Junk', 'LOST': 'Lost',
  };

  // Persist a brand-new lead to the shared CRM backend, then refresh the list.
  // When openQuote is true (the "Save & Create Quotation" button), the parent is
  // asked to open the quotation screen for the freshly-created lead.
  const handleCreate = async (openQuote = false) => {
    if (!newForm.name.trim()) { showToast('Customer name is required', 'error'); return; }
    if (!newForm.phone.trim()) { showToast('Phone number is required', 'error'); return; }
    const svc = selectedService === 'Other roofing'
      ? ((selectedRoofing && selectedRoofing !== 'Select Roofing Type') ? selectedRoofing : 'Other roofing')
      : selectedService;
    const body = {
      name: newForm.name.trim(),
      company: newForm.company.trim(),
      phone: newForm.phone.trim(),
      email: newForm.email.trim(),
      source: leadSource,
      service: svc,
      projectType: selectedService,
      location: newForm.location.trim(),
      budget: viewMode === 'manager' ? budgetRange : '',
      manager: newForm.manager || 'Unassigned',
      priority: 'Medium',
      status: CREATE_STATUS_MAP[selectedStatus] || 'New Lead',
      timeline: (expectedTimeline && expectedTimeline !== 'Select Expected Timeline') ? expectedTimeline : '',
      followUp: newForm.followUp.trim() || 'Pending',
      attachments,
      type: 'new leads',
    };
    setSaving(true);
    try {
      const created = await api('/leads', { method: 'POST', body });
      showToast('Lead created successfully', 'success');
      // Prefer a full refresh (backend assigns the LD-#### id) so the new lead
      // appears immediately; fall back to inserting the returned lead.
      if (onReload) onReload();
      else if (onSaved && created && created.id) onSaved(created);
      if (openQuote && created && created.id && onCreateQuotation) onCreateQuotation(created);
      if (onClose) onClose();
    } catch (e) {
      showToast(e.message || 'Failed to create lead', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleService = (service) => {
    setSelectedService(service);
    setIsServiceDropdownOpen(false);
  };

  const activeSteps = viewMode === 'manager' ? managerSteps : coordinatorSteps;

  const handleNext = () => {
    if (currentStep < 5) setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const renderPillGroup = (options, selected, setSelected) => (
    <div className="pill-group">
      {options.map(opt => (
        <div 
          key={opt}
          className={`pill-option ${selected === opt ? 'selected' : ''}`}
          onClick={() => setSelected(opt)}
        >
          {opt}
        </div>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <>
      <h3 className="step-title">Basic Information</h3>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Customer Name <span className="required-asterisk">*</span></label>
          <input type="text" className="form-input" placeholder="Enter customer name" value={newForm.name} onChange={(e) => setNF('name', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Company Name</label>
          <input type="text" className="form-input" placeholder="Enter company name" value={newForm.company} onChange={(e) => setNF('company', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Phone Number <span className="required-asterisk">*</span></label>
          <input type="text" className="form-input" placeholder="Enter phone number" value={newForm.phone} onChange={(e) => setNF('phone', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Email Address</label>
          <input type="email" className="form-input" placeholder="Enter email address" value={newForm.email} onChange={(e) => setNF('email', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Lead Source <span className="required-asterisk">*</span></label>
          <CustomDropdown 
            value={leadSource} 
            onChange={setLeadSource} 
            options={['WEBSITE ENQUIRY', 'REFERRAL', 'COLD CALL']} 
          />
        </div>
        <div className="form-group">
          <label className="form-label">Service <span className="required-asterisk">*</span></label>
          <div className="custom-dropdown-container">
            <div 
              className="custom-dropdown-trigger" 
              onClick={() => setIsServiceDropdownOpen(!isServiceDropdownOpen)}
            >
              <span className="truncate">{selectedService || 'Select Service'}</span>
              <ChevronDown size={16} color="#64748b" />
            </div>
            
            {isServiceDropdownOpen && (
              <div className="custom-dropdown-menu">
                {serviceOptions.map(opt => (
                  <div 
                    key={opt} 
                    className="custom-dropdown-option"
                    onClick={() => toggleService(opt)}
                  >
                    <div className="custom-dropdown-check">
                      {selectedService === opt && <Check size={14} color="white" strokeWidth={3} />}
                    </div>
                    {opt}
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedService === 'Other roofing' && (
            <div className="custom-dropdown-container" style={{marginTop: '0.5rem'}}>
              <div 
                className="custom-dropdown-trigger" 
                onClick={() => setIsRoofingDropdownOpen(!isRoofingDropdownOpen)}
              >
                <span className="truncate">{selectedRoofing}</span>
                <ChevronDown size={16} color="#64748b" />
              </div>
              
              {isRoofingDropdownOpen && (
                <div className="custom-dropdown-menu">
                  {roofingOptions.map(opt => (
                    <div 
                      key={opt} 
                      className="custom-dropdown-option"
                      onClick={() => {
                        setSelectedRoofing(opt);
                        setIsRoofingDropdownOpen(false);
                      }}
                    >
                      <div className="custom-dropdown-check">
                        {selectedRoofing === opt && <Check size={14} color="white" strokeWidth={3} />}
                      </div>
                      <span style={{ color: opt === 'Select Roofing Type' ? '#9ca3af' : 'white' }}>{opt}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedService === 'Other Service' && (
            <div style={{marginTop: '0.5rem'}}>
              <input type="text" className="form-input" placeholder="Enter Custom Service Type" />
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Project Location</label>
          <input type="text" className="form-input" placeholder="Enter project location" value={newForm.location} onChange={(e) => setNF('location', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Assigned Manager</label>
          <select className="form-input" value={newForm.manager} onChange={(e) => setNF('manager', e.target.value)}>
            <option value="Unassigned">Unassigned</option>
            {managers.map((m) => <option key={m.email || m.employeeId || m.name} value={m.name}>{m.name}</option>)}
          </select>
        </div>

        {viewMode === 'manager' && (
          <div className="form-group">
            <label className="form-label">Budget Range</label>
            <CustomDropdown 
              value={budgetRange} 
              onChange={setBudgetRange} 
              options={['5 - 10 Lakhs', '10 - 50 Lakhs']} 
            />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Expected Timeline</label>
          <CustomDropdown 
            value={expectedTimeline} 
            onChange={setExpectedTimeline} 
            placeholder="Select Expected Timeline"
            options={['Select Expected Timeline', 'Within 1 Month', '1-3 Months']} 
          />
        </div>
        {viewMode === 'coordinator' && <div className="form-group"></div>}

        <div className="form-group">
          <label className="form-label">Next Follow-up Date</label>
          <div className="input-with-icon">
            <input type="date" className="form-input" value={newForm.followUp} onChange={(e) => setNF('followUp', e.target.value)} />
            <CalendarDays size={16} className="input-icon-right" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Status <span className="required-asterisk">*</span></label>
          <div className="custom-dropdown-container">
            <div 
              className="custom-dropdown-trigger" 
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
            >
              <span className="truncate">{selectedStatus}</span>
              <ChevronDown size={16} color="#64748b" />
            </div>
            
            {isStatusDropdownOpen && (
              <div className="custom-dropdown-menu" style={{ bottom: '100%', top: 'auto', marginBottom: '4px' }}>
                {statusOptions.map(opt => (
                  <div 
                    key={opt} 
                    className="custom-dropdown-option"
                    onClick={() => {
                      setSelectedStatus(opt);
                      setIsStatusDropdownOpen(false);
                    }}
                  >
                    <div className="custom-dropdown-check">
                      {selectedStatus === opt && <Check size={14} color="white" strokeWidth={3} />}
                    </div>
                    {opt}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );

  const renderStep2 = () => {
    const topServiceOptions = viewMode === 'manager' 
      ? ['PEB Building', 'Tensile', 'Other roofing', 'Other Service'] 
      : ['PEB Building', 'Tensile', 'Other roofing', 'Other Service']; // Same in screenshot

    const projectTypeOptions = viewMode === 'manager'
      ? ['Industrial', 'Warehouse', 'Commercial', 'Cold Storage', 'Institutional', 'Other Service']
      : ['Industrial', 'Warehouse', 'Commercial', 'Cold Storage', 'Institutional', 'Other'];

    const structureTypeOptions = viewMode === 'manager'
      ? ['Clear Span', 'Multi span', 'Mezzanine', 'Multi storey', 'Other Service']
      : ['Clear Span', 'Multi-span', 'Mezzanine', 'Multi-storey', 'Other'];

    const siteConditionOptions = viewMode === 'manager'
      ? ['Flat', 'Slope', 'Filled', 'Rock', 'Other Service']
      : ['Flat', 'Slope', 'Filled', 'Rock', 'Other'];

    const startDateOptions = viewMode === 'manager'
      ? ['Immediately', 'Within 1 Month', 'Within 3 Months', 'Just Planning', 'Other Service']
      : ['Immediately', 'Within 1 Month', 'Within 3 Months', 'Just Planning', 'Other'];

    return (
      <>
        <h3 className="step-title">Project Details – {topService}</h3>
        {renderPillGroup(topServiceOptions, topService, setTopService)}
        
        <div style={{marginTop: '2rem'}}>
          <div className="form-group" style={{marginBottom: '1.5rem'}}>
            <label className="form-label">Project Type</label>
            {renderPillGroup(projectTypeOptions, projectType, setProjectType)}
          </div>
          
          <div className="form-group" style={{marginBottom: '1.5rem'}}>
            <label className="form-label">Structure Type</label>
            {renderPillGroup(structureTypeOptions, structureType, setStructureType)}
          </div>

          <div className="form-group" style={{marginBottom: '1.5rem'}}>
            <label className="form-label">Site Condition</label>
            {renderPillGroup(siteConditionOptions, siteCondition, setSiteCondition)}
          </div>

          <div className="form-group" style={{marginBottom: '1.5rem'}}>
            <label className="form-label">Soil Test Done?</label>
            {renderPillGroup(['Done', 'Not Done'], soilTest, setSoilTest)}
          </div>
        </div>

        <hr className="divider" />

        <h3 className="step-title" style={{fontSize: '1rem', marginBottom: '1rem'}}>Final Project Details</h3>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Approximate Area</label>
            <div className="input-with-icon">
              <input type="text" className="form-input" placeholder={viewMode === 'manager' ? "Less than 5,000 sq. ft." : "Enter Sq.ft"} />
              <span className="input-icon-right" style={{fontSize: '0.875rem'}}>sq.ft</span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Site Visit Required?</label>
            {renderPillGroup(['Yes', 'No'], siteVisit, setSiteVisit)}
          </div>
        </div>

        <div className="form-group" style={{marginTop: '1.5rem'}}>
          <label className="form-label">Expected Start Date</label>
          {renderPillGroup(startDateOptions, startDate, setStartDate)}
        </div>
      </>
    );
  };

  const renderStep3 = () => (
    <>
      <h3 className="step-title">Quotations Form</h3>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Lead ID</label>
          <input type="text" className="form-input" value="Pending Generation" disabled />
        </div>
        <div className="form-group">
          <label className="form-label">Client Name</label>
          <input type="text" className="form-input" placeholder="e.g. Acme Corp" />
        </div>

        <div className="form-group" style={{ gridColumn: 'span 2' }}>
          <label className="form-label">Services</label>
          <CustomDropdown
            value={step3Service}
            onChange={setStep3Service}
            options={['PEB Building', 'Tensile', 'Other roofing', 'Other Service']}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Quotation Type</label>
          <CustomDropdown 
            value={quotationType} 
            onChange={setQuotationType} 
            options={['Initial Quotation', 'Revised Quotation']} 
          />
        </div>
        {viewMode === 'coordinator' && (
          <div className="form-group">
            <label className="form-label">Project Value (₹)</label>
            <input type="text" className="form-input" placeholder="Enter project value" />
          </div>
        )}

        <div className="form-group" style={{ gridColumn: viewMode === 'manager' ? 'span 1' : 'span 2' }}>
          <label className="form-label">Upload File (PDF)</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.dwg,.dxf"
              style={{ display: 'none' }}
              onChange={(e) => { handleFilesPicked(e.target.files); e.target.value = ''; }}
            />
            <button type="button" className="btn btn--secondary" style={{ padding: '0.5rem 1rem' }} disabled={uploading} onClick={() => fileInputRef.current && fileInputRef.current.click()}>
              {uploading ? 'Uploading…' : 'Choose file'}
            </button>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {attachments.length ? `${attachments.length} file${attachments.length > 1 ? 's' : ''} attached` : 'No file chosen'}
            </span>
          </div>
          {renderAttachmentList()}
        </div>
      </div>
    </>
  );

  const renderStep4 = () => {
    if (viewMode === 'manager') {
      return (
        <>
          <h3 className="step-title">Project Attachments</h3>
          <div
            className="drag-drop-zone"
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); handleFilesPicked(e.dataTransfer.files); }}
          >
            <UploadCloud size={48} className="drag-drop-icon" strokeWidth={1.5} />
            <h4 className="drag-drop-title">Drag and drop files here</h4>
            <p className="drag-drop-subtitle">Supports Site Photos, CAD drawings, BOQ spreadsheets, Soil reports, and PDFs up to 50MB</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.dwg,.dxf"
              style={{ display: 'none' }}
              onChange={(e) => { handleFilesPicked(e.target.files); e.target.value = ''; }}
            />
            <button type="button" className="btn btn--secondary" disabled={uploading} onClick={() => fileInputRef.current && fileInputRef.current.click()}>
              {uploading ? 'Uploading…' : 'Select Files'}
            </button>
            {!attachments.length && (
              <p style={{fontSize: '0.75rem', color: '#94a3b8', marginTop: '2rem'}}>No files uploaded yet.</p>
            )}
            <div style={{ width: '100%', marginTop: attachments.length ? '1rem' : 0 }}>{renderAttachmentList()}</div>
          </div>
        </>
      );
    }

    return (
      <>
        <h3 className="step-title">Order Confirm Form</h3>
        
        {/* Section 1 */}
        <h4 className="step-subtitle"><FileText size={18} /> 1. Client & Project Details</h4>
        <div className="form-grid-3">
          <div className="form-group">
            <label className="form-label">Client Name <span className="required-asterisk">*</span></label>
            <input type="text" className="form-input" placeholder="e.g. Sree Brindavan Kindergarten" />
          </div>
          <div className="form-group">
            <label className="form-label">Project Location <span className="required-asterisk">*</span></label>
            <input type="text" className="form-input" placeholder="e.g. CN Rajapalayam" />
          </div>
          <div className="form-group">
            <label className="form-label">Contact Details (Phone/Email)</label>
            <input type="text" className="form-input" placeholder="e.g. 9840714353 / ..." />
          </div>

          <div className="form-group">
            <label className="form-label">Billing Name</label>
            <input type="text" className="form-input" placeholder="e.g. Sree Brindavan Kindergarten" />
          </div>
          <div className="form-group">
            <label className="form-label">Mobile Number <span className="required-asterisk">*</span></label>
            <input type="text" className="form-input" placeholder="e.g. 9001200000" />
          </div>
          <div className="form-group">
            <label className="form-label">Alternate Mobile Number</label>
            <input type="text" className="form-input" />
          </div>

          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label className="form-label">Site Address <span className="required-asterisk">*</span></label>
            <textarea className="form-input" rows="3" placeholder="e.g. 48, First Main Road..."></textarea>
          </div>
          <div className="form-group">
            <label className="form-label">Billing Address</label>
            <textarea className="form-input" rows="3"></textarea>
          </div>

          <div className="form-group">
            <label className="form-label">GST Number</label>
            <input type="text" className="form-input" />
          </div>
          <div className="form-group">
            <label className="form-label">Email ID / WhatsApp Number</label>
            <input type="text" className="form-input" />
          </div>
          <div className="form-group">
            <label className="form-label">Salesperson Name <span className="required-asterisk">*</span></label>
            <input type="text" className="form-input" defaultValue="Sarah Smith" />
          </div>

          <div className="form-group">
            <label className="form-label">Date of Order <span className="required-asterisk">*</span></label>
            <div className="input-with-icon">
              <input type="text" className="form-input" placeholder="dd/mm/yyyy" />
              <CalendarDays size={16} className="input-icon-right" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Proposal Ref No <span className="required-asterisk">*</span></label>
            <input type="text" className="form-input" placeholder="e.g. TESH/HO/179/R1" />
          </div>
        </div>

        <hr className="divider" style={{margin: '1.5rem 0'}} />

        {/* Section 2 */}
        <h4 className="step-subtitle"><LayoutList size={18} /> 2. Scope of Work</h4>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Type of Project <span className="required-asterisk">*</span></label>
            <input type="text" className="form-input" defaultValue="PEB Building" />
          </div>
          <div className="form-group">
            <label className="form-label">Project Size/Area <span className="required-asterisk">*</span></label>
            <input type="text" className="form-input" placeholder="e.g. 700 Sq.ft" />
          </div>
        </div>
        <div className="form-grid" style={{marginTop: '1rem'}}>
          <div className="form-group">
            <div className="checkbox-group">
              <label className="checkbox-label"><input type="checkbox" /> 3D Design</label>
              <label className="checkbox-label"><input type="checkbox" /> 2D Design</label>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" style={{textTransform: 'none'}}>Transportation Client Scope</label>
              <div className="radio-group">
                <label className="radio-label"><input type="radio" name="trans" /> Yes</label>
                <label className="radio-label"><input type="radio" name="trans" /> No</label>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" style={{textTransform: 'none'}}>Scaffolding Client Scope</label>
              <div className="radio-group">
                <label className="radio-label"><input type="radio" name="scaf" /> Yes</label>
                <label className="radio-label"><input type="radio" name="scaf" /> No</label>
              </div>
            </div>
          </div>
        </div>

        <hr className="divider" style={{margin: '1.5rem 0'}} />

        {/* Section 3 */}
        <h4 className="step-subtitle"><CalendarDays size={18} /> 3. Timeline & Delivery Commitment</h4>
        <div className="form-grid-3">
          <div className="form-group">
            <label className="form-label">Tentative Start Date <span className="required-asterisk">*</span></label>
            <div className="input-with-icon">
              <input type="text" className="form-input" placeholder="dd/mm/yyyy" />
              <CalendarDays size={16} className="input-icon-right" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Tentative Completion Date <span className="required-asterisk">*</span></label>
            <div className="input-with-icon">
              <input type="text" className="form-input" placeholder="dd/mm/yyyy" />
              <CalendarDays size={16} className="input-icon-right" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Lead Time Promised</label>
            <input type="text" className="form-input" placeholder="e.g. 30 days" />
          </div>
        </div>

        <hr className="divider" style={{margin: '1.5rem 0'}} />

        {/* Section 4 */}
        <h4 className="step-subtitle"><span style={{color: '#10b981', fontWeight: 'bold'}}>₹</span> 4. Pricing & Payment Terms</h4>
        <div className="form-group" style={{maxWidth: '400px'}}>
          <label className="form-label">Quoted Price <span className="required-asterisk">*</span></label>
          <input type="text" className="form-input" placeholder="₹ Amount" />
        </div>
        <div className="form-group" style={{marginTop: '1.5rem'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
            <label className="form-label">Payment Terms Schedule</label>
            <button className="btn btn--secondary" style={{padding: '0.25rem 0.75rem', fontSize: '0.75rem'}}>+ Add Milestone</button>
          </div>
          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label" style={{fontSize:'0.65rem'}}>Term / Milestone</label>
              <input type="text" className="form-input" placeholder="e.g. Advance Payment" />
            </div>
            <div className="form-group">
              <label className="form-label" style={{fontSize:'0.65rem'}}>Percentage (%)</label>
              <input type="text" className="form-input" placeholder="%" />
            </div>
            <div className="form-group">
              <label className="form-label" style={{fontSize:'0.65rem'}}>Value (₹)</label>
              <input type="text" className="form-input" placeholder="₹ Amount" />
            </div>
          </div>
        </div>

        <hr className="divider" style={{margin: '1.5rem 0'}} />

        {/* Section 5 */}
        <h4 className="step-subtitle"><Check size={18} /> 5. Confirmations & Declarations</h4>
        <div className="form-group" style={{marginTop: '1rem'}}>
          <label style={{fontWeight: 700, fontSize: '0.875rem', color: '#1e293b'}}>5. Salesperson Declaration</label>
          <label className="checkbox-label" style={{marginTop: '0.5rem', alignItems: 'flex-start'}}>
            <input type="checkbox" style={{marginTop: '0.25rem'}} />
            <span style={{fontSize: '0.875rem', color: '#64748b', lineHeight: 1.5}}>
              "I confirm that all details communicated to the client and project team are accurate and have been agreed upon. I also acknowledge that the project will commence once the design has been confirmed."
            </span>
          </label>
        </div>
        <div className="form-group signature-box">
          <label className="form-label" style={{textTransform:'none', fontWeight: 400}}>Signature of Salesperson:</label>
          <input type="text" className="signature-input" placeholder="Sign here..." />
        </div>
      </>
    );
  };

  const renderStep5 = () => {
    if (viewMode === 'manager') {
      return (
        <>
          <h3 className="step-title" style={{marginBottom: '0.25rem'}}>Review Lead Requirements</h3>
          <p style={{color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem'}}>Verify all parameters below before confirming saving lead records.</p>
          
          <div className="review-accordion">
            <div className="accordion-header">
              <span className="accordion-title">Customer & Basic Information</span>
              <ChevronDown size={16} color="#64748b" style={{transform: 'rotate(180deg)'}} />
            </div>
            <div className="accordion-content">
              <div className="review-grid" style={{gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem'}}>
                 <div className="review-item"><span className="review-label">Name:</span><span className="review-value">N/A</span></div>
                 <div className="review-item"><span className="review-label">Company:</span><span className="review-value">N/A</span></div>
                 <div className="review-item"><span className="review-label">Phone:</span><span className="review-value">N/A</span></div>
                 <div className="review-item"><span className="review-label">Email:</span><span className="review-value">N/A</span></div>
                 <div className="review-item"><span className="review-label">Location:</span><span className="review-value">N/A</span></div>
                 <div className="review-item"><span className="review-label">Sales Executive:</span><span className="review-value">Sarah Smith</span></div>
                 <div className="review-item"><span className="review-label">Priority:</span><span className="review-value">Medium</span></div>
                 <div className="review-item"><span className="review-label">Service:</span><span className="review-value">PEB Building</span></div>
              </div>
            </div>
          </div>
          
          <div className="review-accordion">
            <div className="accordion-header">
              <span className="accordion-title">Project Requirements (PEB Building)</span><ChevronDown size={16} color="#64748b" />
            </div>
          </div>
          <div className="review-accordion">
            <div className="accordion-header">
              <span className="accordion-title">Site Dimensions</span><ChevronDown size={16} color="#64748b" />
            </div>
          </div>
          <div className="review-accordion">
            <div className="accordion-header">
              <span className="accordion-title">Technical Details</span><ChevronDown size={16} color="#64748b" />
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <h3 className="step-title">Review Information</h3>
        
        <div className="review-card">
          <h4 className="review-card-title">1. Basic Information</h4>
          <div className="review-grid">
            <div className="review-item">
              <span className="review-label">Lead Source:</span>
              <span className="review-value">WEBSITE ENQUIRY</span>
            </div>
            <div className="review-item">
              <span className="review-label">Service:</span>
              <span className="review-value">PEB Building</span>
            </div>
            <div className="review-item">
              <span className="review-label">Assigned Manager:</span>
              <span className="review-value">Sarah Smith</span>
            </div>
            <div className="review-item">
              <span className="review-label">Status:</span>
              <span className="review-value">NEW</span>
            </div>
          </div>
        </div>

        <div className="review-card">
          <h4 className="review-card-title">2. Project Details</h4>
          <div className="review-grid">
            <div className="review-item">
              <span className="review-label">Priority:</span>
              <span className="review-value">Medium</span>
            </div>
            <div className="review-item">
              <span className="review-label">Structure Type:</span>
              <span className="review-value">Clear Span</span>
            </div>
            <div className="review-item">
              <span className="review-label">Installation Area:</span>
              <span className="review-value">Ground</span>
            </div>
            <div className="review-item">
              <span className="review-label">Existing Structure:</span>
              <span className="review-value">Yes</span>
            </div>
            <div className="review-item" style={{marginTop: '1rem'}}>
              <span className="review-label">Site Condition:</span>
              <span className="review-value">Flat</span>
            </div>
            <div className="review-item" style={{marginTop: '1rem'}}>
              <span className="review-label">Design 3D Required:</span>
              <span className="review-value">No</span>
            </div>
          </div>
        </div>

        <div className="review-card">
          <h4 className="review-card-title">3. Quotations</h4>
          <div className="review-grid">
            <div className="review-item">
              <span className="review-label">Quotation Generated:</span>
              <span className="review-value">Pending</span>
            </div>
            <div className="review-item">
              <span className="review-label">Estimated Revenue:</span>
              <span className="review-value">1000000</span>
            </div>
          </div>
        </div>

        <div className="review-card">
          <h4 className="review-card-title">4. Order Confirm</h4>
          <div className="review-grid">
            {/* Empty as per screenshot */}
          </div>
        </div>
      </>
    );
  };

  // ── EDIT MODE: single-page editable form (pencil action) ──
  if (isEdit) {
    return (
      <div className="modal-overlay">
        <div className="add-lead-modal">
          <div className="modal-header">
            <div className="modal-title-group">
              <h2>Edit Lead</h2>
              <div className="status-badge dot">{editLead.id}</div>
            </div>
            <button className="close-btn" onClick={onClose}><X size={20} /></button>
          </div>

          <div className="modal-content-body">
            {renderEditForm()}
          </div>

          <div className="modal-footer">
            <div className="footer-left">
              <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
            </div>
            <div className="footer-right">
              <button
                className="btn btn--primary"
                style={{ backgroundColor: '#1e1b4b' }}
                disabled={saving}
                onClick={handleUpdate}
              >
                {saving ? 'Saving…' : 'Update Lead'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="add-lead-modal">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <h2>Add New Lead</h2>
            <div className="status-badge dot">Saved to draft</div>
          </div>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Stepper */}
        <div className="stepper-container">
          {activeSteps.map((step) => {
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            let className = 'step-pill';
            if (isActive) className += viewMode === 'manager' ? ' manager-active' : ' active';
            if (isCompleted) className += viewMode === 'manager' ? ' manager-completed' : ' completed';
            
            return (
              <div key={step.id} className={className}>
                <span className="step-number">
                  {isCompleted ? <Check size={12} strokeWidth={3} /> : step.id}
                </span>
                {step.label}
              </div>
            );
          })}
        </div>

        {/* Body Area */}
        <div className="modal-content-body">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
          {currentStep === 5 && renderStep5()}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <div className="footer-left">
            <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-draft" disabled={saving} onClick={() => handleCreate(false)}>Save Draft</button>
          </div>
          <div className="footer-right">
            {currentStep > 1 && (
              <button className="btn-back" onClick={handleBack}>&larr; Back</button>
            )}
            {currentStep < 5 ? (
              <button className="btn btn--primary" style={viewMode === 'manager' ? {backgroundColor: '#1e1b4b'} : {}} onClick={handleNext}>Next &rarr;</button>
            ) : (
              <>
                <button className="btn btn--primary" style={{backgroundColor: '#1e1b4b'}} disabled={saving} onClick={() => handleCreate(false)}>{saving ? 'Saving…' : 'Save Lead'}</button>
                <button className="btn btn--primary" style={{backgroundColor: '#6366f1', color: 'white'}} disabled={saving} onClick={() => handleCreate(true)}>Save & Create Quotation</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

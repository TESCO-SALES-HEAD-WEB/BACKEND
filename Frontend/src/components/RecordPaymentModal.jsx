import React from 'react';
import { X, CreditCard, IndianRupee, ChevronDown } from 'lucide-react';
import { api } from '../api/client';
import { showToast } from '../utils/toast';
import './RecordPaymentModal.css';

const parseAmount = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isNaN(n) ? 0 : n; };

// Sales team — matches the roster used across the app (same as the Coordinator app)
const SALES_TEAM = ['Azar Abdullah A', 'Praveenraja P', 'Suresh P', 'Agsal A'];
const PAYMENT_METHODS = ['Bank Transfer', 'UPI', 'Cheque', 'Cash'];

const emptyForm = {
  id: '', leadId: '', customer: '', orderValue: '', invoiceValue: '',
  amountCollected: '', pendingPayments: '', upcomingDues: '', overduePayments: '',
  method: '', transactionId: '', cashPaidBy: '', paymentDate: '', dueDate: '', manager: '', notes: '',
};

export default function RecordPaymentModal({ isOpen, onClose, payment, onSave = () => {} }) {
  const [leads, setLeads] = React.useState([]);
  const [payments, setPayments] = React.useState([]);
  const [form, setForm] = React.useState(emptyForm);

  // Load leads + existing payments for the Lead ID dropdown whenever the modal opens.
  // Payments are needed to enforce one-payment-per-lead.
  React.useEffect(() => {
    if (!isOpen) return;
    api('/leads').then((d) => setLeads(Array.isArray(d) ? d : [])).catch(() => setLeads([]));
    api('/payments').then((d) => setPayments(Array.isArray(d) ? d : [])).catch(() => setPayments([]));
  }, [isOpen]);

  // Prefill when editing an existing invoice; reset for a new one
  React.useEffect(() => {
    if (!isOpen) return;
    setForm({
      id: payment?.id || '',
      leadId: payment?.leadId || '',
      customer: payment?.customer || '',
      orderValue: payment?.orderValue ?? '',
      invoiceValue: payment?.invoiceValue ?? '',
      amountCollected: payment?.amountCollected ?? '',
      pendingPayments: payment?.pendingPayments ?? '',
      upcomingDues: payment?.upcomingDues ?? '',
      overduePayments: payment?.overduePayments ?? '',
      method: payment?.method && payment.method !== '-' ? payment.method : '',
      transactionId: payment?.transactionId || '',
      cashPaidBy: payment?.cashPaidBy || '',
      paymentDate: payment?.paymentDate || '',
      dueDate: payment?.dueDate || '',
      manager: payment?.manager || '',
      notes: payment?.notes || '',
    });
  }, [isOpen, payment]);

  if (!isOpen) return null;

  const isEdit = !!payment;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Lead-lifecycle gating: a lead is eligible for payment only after its order
  // confirmation is completed (lead status "Order Confirmed") AND it has no payment yet.
  // Only ONE payment per lead. When editing, keep the payment's own lead selectable.
  const paidLeadIds = new Set(payments.map((p) => p && p.leadId).filter(Boolean));
  // Dropdown shows ALL leads — payment is independent and multiple payments per lead are allowed.
  const eligibleLeads = leads.filter((l) => !!l);

  // Manager options — start from the app's sales roster, then fold in any manager
  // seen on the leads (so a lead-autofilled manager is always selectable).
  const managerOptions = React.useMemo(() => {
    const seSet = new Set(SALES_TEAM);
    leads.forEach((l) => { if (l && l.manager) seSet.add(l.manager); });
    if (form.manager) seSet.add(form.manager);
    return Array.from(seSet);
  }, [leads, form.manager]);

  // Selecting a Lead ID autofills customer / manager / order value from that lead
  const onLeadSelect = (val) => {
    const lead = leads.find((l) => l.id === val);
    setForm((f) => ({
      ...f,
      leadId: val,
      customer: lead?.name || f.customer,
      manager: lead?.manager || f.manager,
      orderValue: lead?.budget ? parseAmount(lead.budget) : f.orderValue,
    }));
  };

  const handleSave = () => {
    if (!form.customer) return;
    // Enforce the payment stage rules for NEW payments (edits just update an existing one).
    if (!isEdit) {
      if (!form.leadId) {
        showToast('Select a lead to record a payment.', 'error');
        return;
      }
    }
    onSave({
      id: (form.id || '').trim() || ('INV-' + Date.now()),
      leadId: form.leadId || '',
      customer: form.customer.trim(),
      manager: (form.manager || '').trim(),
      orderValue: parseAmount(form.orderValue),
      invoiceValue: parseAmount(form.invoiceValue),
      amountCollected: parseAmount(form.amountCollected),
      pendingPayments: parseAmount(form.pendingPayments),
      upcomingDues: parseAmount(form.upcomingDues),
      overduePayments: parseAmount(form.overduePayments),
      method: (form.method || '').trim(),
      transactionId: (form.transactionId || '').trim(),
      cashPaidBy: form.method === 'Cash' ? (form.cashPaidBy || '').trim() : '',
      paymentDate: form.paymentDate || '',
      dueDate: form.dueDate || '',
      notes: (form.notes || '').trim(),
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="record-payment-content" onClick={(e) => e.stopPropagation()}>
        <div className="record-payment-header">
          <div className="record-payment-title-box">
            <div className="record-payment-icon">
              <CreditCard size={20} />
            </div>
            <div>
              <h2>{isEdit ? 'Edit Payment' : 'Record Payment'}</h2>
              <p>{isEdit ? `Update payment receipt for ${payment.id}` : 'Log a new payment receipt.'}</p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="record-payment-body">
          <div className="form-card">
            <h3 className="form-card-title">
              <IndianRupee size={18} />
              Transaction Details
            </h3>

            <div className="form-grid-2-col">
              <div className="form-group">
                <label className="form-label-caps">LEAD ID</label>
                <div className="custom-select-wrapper">
                  <select className="form-select" value={form.leadId} onChange={(e) => onLeadSelect(e.target.value)}>
                    <option value="">Select Lead ID</option>
                    {eligibleLeads.map((l) => (
                      <option key={l.id} value={l.id}>{l.name ? `${l.id} — ${l.name}` : l.id}</option>
                    ))}
                    {eligibleLeads.length === 0 && <option value="" disabled>No leads available for payment</option>}
                  </select>
                  <ChevronDown size={14} className="select-icon" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label-caps">INVOICE ID</label>
                <input type="text" className="form-input" placeholder="e.g. INV-1024" value={form.id} onChange={(e) => set('id', e.target.value)} disabled={isEdit} />
              </div>

              <div className="form-group form-group-2-span" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label-caps">CUSTOMER</label>
                <input type="text" className="form-input" placeholder="e.g. Akash Kumar" value={form.customer} onChange={(e) => set('customer', e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label-caps">ORDER VALUE (₹)</label>
                <input type="text" inputMode="numeric" className="form-input" placeholder="e.g. 425000" value={form.orderValue} onChange={(e) => set('orderValue', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label-caps">INVOICE VALUE (₹)</label>
                <input type="text" inputMode="numeric" className="form-input" placeholder="e.g. 425000" value={form.invoiceValue} onChange={(e) => set('invoiceValue', e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label-caps">AMOUNT COLLECTED (₹)</label>
                <input type="text" inputMode="numeric" className="form-input" placeholder="e.g. 425000" value={form.amountCollected} onChange={(e) => set('amountCollected', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label-caps">PENDING PAYMENTS (₹)</label>
                <input type="text" inputMode="numeric" className="form-input" placeholder="e.g. 0" value={form.pendingPayments} onChange={(e) => set('pendingPayments', e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label-caps">UPCOMING DUES (₹)</label>
                <input type="text" inputMode="numeric" className="form-input" placeholder="e.g. 0" value={form.upcomingDues} onChange={(e) => set('upcomingDues', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label-caps">OVERDUE PAYMENTS (₹)</label>
                <input type="text" inputMode="numeric" className="form-input" placeholder="e.g. 0" value={form.overduePayments} onChange={(e) => set('overduePayments', e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label-caps">PAYMENT METHOD</label>
                <div className="custom-select-wrapper">
                  <select className="form-select" value={form.method} onChange={(e) => set('method', e.target.value)}>
                    <option value="">Select Method</option>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <ChevronDown size={14} className="select-icon" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label-caps">TRANSACTION ID / CHEQUE NO.</label>
                <input type="text" className="form-input" placeholder="e.g. TXN123456 / CHQ-0012" value={form.transactionId} onChange={(e) => set('transactionId', e.target.value)} />
              </div>

              {form.method === 'Cash' && (
                <div className="form-group form-group-2-span" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label-caps">CASH RECEIVED FROM (PAID BY)</label>
                  <input type="text" className="form-input" placeholder="Name of the person who paid the cash" value={form.cashPaidBy} onChange={(e) => set('cashPaidBy', e.target.value)} />
                </div>
              )}

              <div className="form-group">
                <label className="form-label-caps">PAYMENT DATE</label>
                <input type="date" className="form-input" value={form.paymentDate} onChange={(e) => set('paymentDate', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label-caps">DUE DATE</label>
                <input type="date" className="form-input" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label-caps">MANAGER</label>
                <div className="custom-select-wrapper">
                  <select className="form-select" value={form.manager} onChange={(e) => set('manager', e.target.value)}>
                    <option value="">Select Manager</option>
                    {managerOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <ChevronDown size={14} className="select-icon" />
                </div>
              </div>

              <div className="form-group form-group-2-span" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label-caps">PAYMENT NOTES &amp; REMARKS</label>
                <textarea
                  className="form-input"
                  placeholder="Any notes or remarks about this payment"
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  style={{ minHeight: '90px', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="record-payment-footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-save-green" onClick={handleSave} disabled={!form.customer}>{isEdit ? 'Save Payment' : 'Record Payment'}</button>
        </div>
      </div>
    </div>
  );
}

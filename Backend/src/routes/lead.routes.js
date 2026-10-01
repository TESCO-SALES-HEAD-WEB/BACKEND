const mongoose = require('mongoose');
const router = require('express').Router();
const Lead = require('../models/Lead');
const verifyApiKey = require('../middleware/apiKey');

// Build a filter that matches a lead by EITHER its business id ("LD-xxxx") OR its
// Mongo _id. The frontend sends lead.id, which is the "LD-xxxx" value for leads that
// have one, but falls back to the Mongo _id for records written by the Manager/
// Coordinator apps into the shared collection without an LD id. Matching on both makes
// assignment (and delete) work for every lead instead of silently 404-ing.
const leadKeyFilter = (key) => {
  const or = [{ id: key }];
  if (mongoose.Types.ObjectId.isValid(key)) or.push({ _id: key });
  return { $or: or };
};

// Map raw channel keys to the source labels the frontend recognizes.
const SOURCE_MAP = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  website: 'Website Enquiry',
  meta_ads: 'Meta Leads',
  meta: 'Meta Leads',
  google_ads: 'Meta Leads',
  linkedin: 'LinkedIn Leads',
  referral: 'Referral',
  cold: 'Cold Calling'
};

// Next sequential lead id: LD-0018 after LD-0017. Only real sequential ids count —
// legacy timestamp ids (13-digit) are ignored so they never poison the sequence.
async function nextLeadId() {
  const rows = await Lead.find({ id: /^LD-\d+$/ }).select('id').lean();
  let max = 0;
  for (const r of rows) {
    const n = parseInt(String(r.id).replace(/\D/g, ''), 10);
    if (!Number.isNaN(n) && n < 1000000 && n > max) max = n;
  }
  return `LD-${String(max + 1).padStart(4, '0')}`;
}

// Create a lead with a freshly generated unique LD-#### id (retries if the id is taken).
async function createLeadUnique(payload) {
  const p = { ...payload };
  for (let i = 0; i < 50; i++) {
    p.id = await nextLeadId();
    try { return await Lead.create(p); }
    catch (e) { if (e && e.code === 11000) continue; throw e; }
  }
  throw new Error('Could not allocate a unique Lead ID');
}

// POST /api/leads/intake — secured endpoint for n8n automation.
// Maps the normalized n8n payload onto the Lead schema using the exact field
// values/format the frontend Lead Management view expects, then creates the lead.
router.post('/intake', verifyApiKey, async (req, res) => {
  try {
    const { fullName, name, email, phone, message, source, campaign, receivedAt } = req.body;
    const now = receivedAt ? new Date(receivedAt) : new Date();

    const srcKey = (source || 'email').toLowerCase();
    const displaySource = SOURCE_MAP[srcKey] || source || 'Email';
    const displayDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const stamp = now.toLocaleDateString('en-GB') + ', ' + now.toLocaleTimeString('en-US', { hour12: false });

    const payload = {
      type: 'new leads',
      date: displayDate,
      name: fullName || name || 'Unknown',
      phone: phone || '',
      email: email || '',
      campaign: campaign || '',
      source: displaySource,
      budget: '',
      status: 'New Lead',
      manager: 'Unassigned',
      followUp: 'No Date',
      priority: 'Medium',
      notes: message || '',
      history: [
        { timestamp: stamp, message: `Lead captured from ${displaySource}`, remark: campaign || '' }
      ]
    };

    const lead = await createLeadUnique(payload);

    res.status(201).json({ success: true, id: lead.id, _id: lead._id });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/leads — all leads
router.get('/', async (req, res) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 });
    res.json(leads);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/leads — create one lead (auto-generates an LD- id when none supplied)
router.post('/', async (req, res) => {
  try {
    const body = { ...req.body };
    delete body.id; // always assign a fresh sequential LD-#### id on create
    const lead = await createLeadUnique(body);
    res.status(201).json(lead);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST /api/leads/bulk — upsert leads (sync from frontend state)
router.post('/bulk', async (req, res) => {
  try {
    const leads = req.body;
    if (!Array.isArray(leads)) return res.status(400).json({ message: 'Expected an array' });
    const ops = leads.map(l => ({
      updateOne: {
        filter: { id: l.id },
        update: { $set: l },
        upsert: true
      }
    }));
    if (ops.length) await Lead.bulkWrite(ops);
    res.json({ success: true, count: leads.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/leads/:id — update one lead (by LD-xxxx id)
router.put('/:id', async (req, res) => {
  try {
    const body = { ...req.body };
    delete body._id; delete body.id; // never let a body overwrite the identity fields
    const lead = await Lead.findOneAndUpdate(leadKeyFilter(req.params.id), { $set: body }, { new: true });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json(lead);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/leads — clear all leads (admin/reset)
router.delete('/', async (req, res) => {
  try {
    await Lead.deleteMany({});
    res.json({ success: true, message: 'All leads cleared' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/leads/:id — delete one lead
router.delete('/:id', async (req, res) => {
  try {
    const lead = await Lead.findOneAndDelete(leadKeyFilter(req.params.id));
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

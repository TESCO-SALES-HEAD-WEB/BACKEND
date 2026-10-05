// User account management — used by the Sales Head Settings page to manage
// Manager and Coordinator login accounts (create / update / reset password / activate).
const router = require('express').Router();
const User = require('../models/User');
const { syncUserName } = require('../utils/syncUserName');
const Lead = require('../models/Lead');

const ALLOWED_ROLES = ['Sales Manager', 'Sales Coordinator', 'Sales Head'];

const safe = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  employeeId: u.employeeId,
  role: u.role,
  designation: u.designation || 'Manager',
  isActive: u.isActive,
  lastLoginAt: u.lastLoginAt,
});

// GET /api/users?role=Sales Manager  — list accounts (optionally by role)
router.get('/', async (req, res) => {
  try {
    const q = {};
    if (req.query.role) q.role = req.query.role;
    const users = await User.find(q).sort({ name: 1 });
    res.json(users.map(safe));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/users  { name, email, employeeId?, role, password }  — create an account
router.post('/', async (req, res) => {
  try {
    const { name, email, employeeId, role, password, designation } = req.body || {};
    if (!name || !email || !role || !password) {
      return res.status(400).json({ message: 'Name, email, role and password are required' });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    const user = await User.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      employeeId: employeeId ? String(employeeId).trim() : undefined,
      role,
      // Display-only designation (Manager Accounts). Defaults to 'Manager'.
      designation: designation ? String(designation).trim() : 'Manager',
      password,
    });
    res.status(201).json(safe(user));
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'An account with this email + role (or employee ID) already exists' });
    }
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/users/:id  { name?, email?, employeeId?, isActive? }
// Updates profile / login email / active status.
router.put('/:id', async (req, res) => {
  try {
    const { name, email, employeeId, isActive, designation } = req.body || {};
    const setOps = {};
    const unsetOps = {};
    if (name !== undefined) setOps.name = String(name).trim();
    if (email !== undefined) setOps.email = String(email).toLowerCase().trim();
    if (isActive !== undefined) setOps.isActive = !!isActive;
    if (designation !== undefined) setOps.designation = String(designation).trim() || 'Manager';
    if (employeeId !== undefined) {
      const v = employeeId ? String(employeeId).trim() : '';
      if (v) setOps.employeeId = v;
      else unsetOps.employeeId = '';
    }
    const update = {};
    if (Object.keys(setOps).length) update.$set = setOps;
    if (Object.keys(unsetOps).length) update.$unset = unsetOps;

    // Capture the previous name before the update so a rename can be propagated
    // retroactively to every record that references this person by name.
    const prev = setOps.name !== undefined
      ? await User.findById(req.params.id).select('name')
      : null;

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: 'Account not found' });

    // Renaming a Manager/Coordinator here must update their old leads, appointments,
    // payments, etc. across the shared salescrm DB (records store the display name).
    if (prev && user.name && user.name !== prev.name) {
      await syncUserName(prev.name, user.name).catch((e) =>
        console.warn('[users] name sync failed:', e && e.message)
      );
    }
    res.json(safe(user));
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'Email + role (or employee ID) already in use' });
    }
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/users/:id/password  { newPassword }  — reset / change the password
router.put('/:id/password', async (req, res) => {
  try {
    const { newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    const user = await User.findById(req.params.id).select('+password');
    if (!user) return res.status(404).json({ message: 'Account not found' });
    user.password = newPassword; // hashed by the pre-save hook
    await user.save();
    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


// POST /api/users/normalize-assignments           — preview only (no writes)
// POST /api/users/normalize-assignments?apply=1   — apply the corrections
// Canonicalizes each lead's `manager` / `assignedTo` to the EXACT current active-manager
// name (fixes case / whitespace / rename drift), matching on the manager's name, email OR
// employeeId. Any assignment value that matches NO current manager is reported as an
// `orphan` so it can be re-assigned. Safe + idempotent; existing correct values are untouched.
router.post('/normalize-assignments', async (req, res) => {
  try {
    const apply = String(req.query.apply || '') === '1' || req.body?.apply === true;
    const mgrs = await User.find({ role: 'Sales Manager', isActive: true }).select('name email employeeId').lean();
    const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();
    const keyToName = new Map();
    for (const m of mgrs) {
      for (const k of [m.name, m.email, m.employeeId]) { const kn = norm(k); if (kn) keyToName.set(kn, m.name); }
    }
    const leads = await Lead.find().select('id manager assignedTo').lean();
    let canonicalized = 0;
    const orphans = [];
    for (const l of leads) {
      const ops = {};
      for (const field of ['manager', 'assignedTo']) {
        const cur = l[field];
        const cn = norm(cur);
        if (!cn || cn === 'unassigned') continue;        // genuinely unassigned — leave it
        const canonical = keyToName.get(cn);
        if (canonical) { if (canonical !== cur) ops[field] = canonical; }  // drift -> fix
        else if (field === 'manager') orphans.push({ id: l.id, manager: cur }); // no such manager
      }
      if (apply && Object.keys(ops).length) { await Lead.updateOne({ _id: l._id }, { $set: ops }); canonicalized++; }
      else if (!apply && Object.keys(ops).length) { canonicalized++; }
    }
    res.json({ applied: apply, scanned: leads.length, canonicalized, orphanCount: orphans.length, orphans: orphans.slice(0, 100), managers: mgrs.map((m) => m.name) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

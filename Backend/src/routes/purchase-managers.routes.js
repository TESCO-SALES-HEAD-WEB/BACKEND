// Purchase Manager ACCOUNT management — used by the Sales Head Settings page.
// Accounts are stored in the separate `purchase_managers` collection with the
// fixed role `purchase_manager`. Login/dashboard for these accounts is served by
// the standalone Purchase Manager backend (same database, same collection).
const router = require('express').Router();
const PurchaseManager = require('../models/PurchaseManager');

const safe = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  employeeId: u.employeeId,
  role: u.role || 'purchase_manager',
  isActive: u.isActive,
  lastLoginAt: u.lastLoginAt,
});

// GET /api/purchase-managers — list all Purchase Manager accounts
router.get('/', async (req, res) => {
  try {
    const list = await PurchaseManager.find().sort({ name: 1 });
    res.json(list.map(safe));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/purchase-managers  { name, email, employeeId?, password } — create
router.post('/', async (req, res) => {
  try {
    const { name, email, employeeId, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    const user = await PurchaseManager.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      employeeId: employeeId ? String(employeeId).trim() : undefined,
      role: 'purchase_manager', // fixed — never taken from the request
      password,
    });
    res.status(201).json(safe(user));
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ message: 'A Purchase Manager with this email already exists' });
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/purchase-managers/:id  { name?, email?, employeeId?, isActive? }
router.put('/:id', async (req, res) => {
  try {
    const { name, email, employeeId, isActive } = req.body || {};
    const setOps = {};
    const unsetOps = {};
    if (name !== undefined) setOps.name = String(name).trim();
    if (email !== undefined) setOps.email = String(email).toLowerCase().trim();
    if (isActive !== undefined) setOps.isActive = !!isActive;
    if (employeeId !== undefined) {
      const v = employeeId ? String(employeeId).trim() : '';
      if (v) setOps.employeeId = v; else unsetOps.employeeId = '';
    }
    const update = {};
    if (Object.keys(setOps).length) update.$set = setOps;
    if (Object.keys(unsetOps).length) update.$unset = unsetOps;

    const user = await PurchaseManager.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: 'Account not found' });
    res.json(safe(user));
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ message: 'Email already in use' });
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/purchase-managers/:id/password  { newPassword } — reset / change password
router.put('/:id/password', async (req, res) => {
  try {
    const { newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    const user = await PurchaseManager.findById(req.params.id).select('+password');
    if (!user) return res.status(404).json({ message: 'Account not found' });
    user.password = newPassword; // hashed by the pre-save hook
    await user.save();
    res.json({ success: true, message: 'Password updated' });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

module.exports = router;

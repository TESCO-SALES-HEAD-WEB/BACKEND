// Login / Logout / Password-reset routes (controller logic merged in)
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { sendOtpEmail, isConfigured } = require('../utils/sendEmail');

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });

// POST /api/auth/login
// Body: { role, email (or employeeId), password }
router.post('/login', async (req, res) => {
  try {
    const { role, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please fill in all fields' });
    }

    // Allow login by email OR employee ID. The same email can hold multiple roles,
    // so when a role is selected we look up the account for that specific role.
    const identifier = email.trim();
    const baseOr = [{ email: identifier.toLowerCase() }, { employeeId: identifier }];
    const user = await User.findOne(
      role ? { role, $or: baseOr } : { $or: baseOr }
    ).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact admin.' });
    }

    if (role && user.role !== role) {
      return res.status(403).json({ success: false, message: `You are not registered as ${role}` });
    }

    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken(user);
    return res.json({ success: true, message: 'Login successful', token, user: user.toSafeJSON() });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// GET /api/auth/managers — Sales Managers who have a login account.
// Used by the Sales Head filters so only real, login-access managers are listed.
router.get('/managers', async (req, res) => {
  try {
    const managers = await User.find({ role: 'Sales Manager', isActive: true })
      .select('name email employeeId')
      .sort({ name: 1 });
    res.json(managers.map((u) => ({ name: u.name, email: u.email, employeeId: u.employeeId })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/push-token  (protected) — register this device's Expo push token
router.post('/push-token', protect, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string') return res.status(400).json({ success: false, message: 'token is required' });
    await User.updateOne({ _id: req.user._id }, { $addToSet: { pushTokens: token } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/auth/push-token  (protected) — unregister on logout
router.delete('/push-token', protect, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ success: false, message: 'token is required' });
    await User.updateOne({ _id: req.user._id }, { $pull: { pushTokens: token } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/logout  (protected)
// JWT is stateless: client removes the token. Endpoint exists to record
// the event and as a hook for future token blacklisting.
router.post('/logout', protect, async (req, res) => {
  return res.json({ success: true, message: 'Logged out successfully' });
});

// GET /api/auth/me  (protected)
router.get('/me', protect, async (req, res) => {
  return res.json({ success: true, user: req.user.toSafeJSON() });
});

// POST /api/auth/forgot-password
// Body: { email }  → generates 6-digit OTP valid for 10 minutes
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Please enter your email ID' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with this email' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetOtp = otp;
    user.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    user.resetOtpVerified = false;
    await user.save({ validateBeforeSave: false });

    // Send OTP via SendGrid email
    if (isConfigured()) {
      try {
        await sendOtpEmail(user.email, user.name, otp);
        return res.json({ success: true, message: `OTP sent to ${user.email}` });
      } catch (mailErr) {
        console.error('SendGrid error:', mailErr.response?.body || mailErr.message);
        // In development, fall back to returning the OTP so the flow still works
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Nexus CRM OTP fallback] ${user.email}: ${otp}`);
          return res.json({
            success: true,
            message: 'Email sending failed (dev fallback: OTP shown)',
            devOtp: otp,
          });
        }
        return res.status(500).json({ success: false, message: 'Failed to send OTP email. Try again later.' });
      }
    }

    // SendGrid not configured: dev fallback
    console.log(`[Nexus CRM OTP] ${user.email}: ${otp}`);
    const payload = { success: true, message: 'OTP generated (email not configured)' };
    if (process.env.NODE_ENV !== 'production') payload.devOtp = otp;
    return res.json(payload);
  } catch (err) {
    console.error('Forgot-password error:', err);
    return res.status(500).json({ success: false, message: 'Server error sending OTP' });
  }
});

// POST /api/auth/verify-otp
// Body: { email, otp }
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
      '+resetOtp +resetOtpExpires'
    );

    if (!user || !user.resetOtp || user.resetOtp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please enter the correct code.' });
    }
    if (user.resetOtpExpires < new Date()) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    user.resetOtpVerified = true;
    await user.save({ validateBeforeSave: false });

    return res.json({ success: true, message: 'OTP verified successfully' });
  } catch (err) {
    console.error('Verify-OTP error:', err);
    return res.status(500).json({ success: false, message: 'Server error verifying OTP' });
  }
});

// POST /api/auth/reset-password
// Body: { email, otp, newPassword }
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
      '+resetOtp +resetOtpExpires +resetOtpVerified +password'
    );

    if (!user || user.resetOtp !== otp || !user.resetOtpVerified) {
      return res.status(400).json({ success: false, message: 'OTP verification failed. Start over.' });
    }
    if (user.resetOtpExpires < new Date()) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    user.password = newPassword; // hashed by pre-save hook
    user.resetOtp = undefined;
    user.resetOtpExpires = undefined;
    user.resetOtpVerified = false;
    await user.save();

    return res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('Reset-password error:', err);
    return res.status(500).json({ success: false, message: 'Server error resetting password' });
  }
});

// POST /api/auth/change-password  { email, currentPassword, newPassword, role? }
// Self-service password change (used by the Sales Head from their portal).
router.post('/change-password', async (req, res) => {
  try {
    const { email, currentPassword, newPassword, role } = req.body || {};
    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
    }
    const cleanEmail = String(email).toLowerCase().trim();
    const filter = { email: cleanEmail };
    if (role) filter.role = role;
    let user = await User.findOne(filter).select('+password');

    // Self-heal: if the Sales Head portal account doesn't exist yet, create it with
    // the new password (first-time setup) so the head can always set their credentials.
    if (!user && cleanEmail === 'salestescostructures@gmail.com') {
      await User.create({ name: 'Saleem Khan', email: cleanEmail, employeeId: 'EMP-HEAD', role: 'Sales Head', password: newPassword });
      return res.json({ success: true, message: 'Password set successfully' });
    }

    if (!user) return res.status(404).json({ success: false, message: 'Account not found' });
    const ok = await user.comparePassword(currentPassword);
    if (!ok) return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    user.password = newPassword; // hashed by pre-save hook
    await user.save();
    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change-password error:', err);
    return res.status(500).json({ success: false, message: 'Server error changing password' });
  }
});

module.exports = router;

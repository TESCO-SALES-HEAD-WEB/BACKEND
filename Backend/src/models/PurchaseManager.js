const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Purchase Manager accounts live in their OWN `purchase_managers` collection,
// separate from the CRM `users` collection. The Sales Head creates them here;
// the standalone Purchase Manager backend reads this same collection to log them in.
// (Same bcrypt cost as the other backends so the password hash is cross-compatible.)
const purchaseManagerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    employeeId: { type: String, trim: true },
    role: { type: String, default: 'purchase_manager' },
    designation: { type: String, enum: ['Purchase Manager', 'Purchase Head'], default: 'Purchase Manager' }, // display-only label; role stays purchase_manager
    password: { type: String, required: true, minlength: 6, select: false },
    resetOtp: { type: String, select: false },
    resetOtpExpires: { type: Date, select: false },
    lastLoginAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'purchase_managers' }
);

purchaseManagerSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

module.exports = mongoose.model('PurchaseManager', purchaseManagerSchema);

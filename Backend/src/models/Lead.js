const mongoose = require('mongoose');

const HistorySchema = new mongoose.Schema(
  {
    timestamp: String,
    message: String,
    remark: String
  },
  { _id: false }
);

const LeadSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true }, // e.g. LD-1029
    type: { type: String, default: 'new leads' },
    date: String,
    name: String,
    projectType: String,
    phone: String,
    email: String,
    campaign: String,
    source: String,
    budget: String,
    status: String,
    manager: String,
    followUp: String,
    priority: String,
    notes: String,
    appointmentLocation: String,
    appointmentRemark: String,
    // --- Pipeline / opportunity fields (added for Sales Head pipeline) ---
    company: String,
    service: String,
    services: String,
    location: String,
    value: String,            // formatted display value e.g. "₹8,50,000"
    projectValue: String,     // raw value entered in the wizard; presence = in pipeline
    assignedTo: String,
    stage: String,
    expectedTimeline: String,
    expectedClose: String,
    clientName: String,
    quotationType: String,
    history: [HistorySchema]
  },
  // strict:false so every field the Coordinator/Manager apps write to the shared
  // `leads` collection is read back in full, keeping the Head's views in sync.
  { timestamps: true, strict: false }
);


// Indexes for fast lookups/sorting on the fields the CRM filters & sorts by
// (id already has a unique index). No effect on data or API shape — speed only.
LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ status: 1 });
LeadSchema.index({ manager: 1 });
LeadSchema.index({ followUp: 1 });
LeadSchema.index({ phone: 1 });
LeadSchema.index({ email: 1 });

module.exports = mongoose.model('Lead', LeadSchema);

const mongoose = require('mongoose');

const progressLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, default: Date.now },
    weight: { type: Number, required: true },
    bodyFat: { type: Number },
    muscleMass: { type: Number },
    note: { type: String },
  },
  { timestamps: true }
);

// Index for efficient chronological retrieval
progressLogSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('ProgressLog', progressLogSchema);

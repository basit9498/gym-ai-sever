const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user',
    },
    walletId: {
     id: {
      type: String,
      required: false,
     },
     state: {
      type: String,
      required: false,
     },
     walletSetId: {
      type: String,
      required: false,
     },
     custodyType: {
      type: String,
      required: false,
     },
     address: {
      type: String,
      required: false,
     },
     blockchain: {
      type: String,
      required: false,
     },
     accountType: {
      type: String,
      required: false,
     },
    },
    weight: { type: Number, required: false },
    height: { type: Number, required: false },
    goal: { type: String, enum: ['muscle', 'fat_loss', 'endurance', 'maintain'], required: false },
  },
  {
    timestamps: true,
  }
);

// Method to verify matched password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Middleware to hash the password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

const User = mongoose.model('User', userSchema);

module.exports = User;

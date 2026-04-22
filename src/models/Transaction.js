const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "deposit",      
        "transfer",     
        "payment",      
        "withdrawal",   
        "refund",
      ],
      required: true,
    },

    blockchain: {
      type: String,
      required: true, 
    },

    tokenSymbol: {
      type: String,
      default: "USDC",
    },

    tokenAddress: {
      type: String,
      default: null,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    fee: {
      type: Number,
      default: 0,
    },

    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    fromWalletId: {
      type:String,
      default: null,
    },

    toWalletId: {
      type:String,
      default: null,
    },

    fromAddress: {
      type: String,
      default: null,
    },

    toAddress: {
      type: String,
      default: null,
    },

    circleTransactionId: {
      type: String,
      default: null,
      index: true,
    },

    walletSetId: {
      type: String,
      default: null,
    },

    txHash: {
      type: String,
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "initiated",
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
      default: "initiated",
      index: true,
    },

    purpose: {
      type: String,
      default: null, // subscription / payout / wallet topup / transfer
    },

    note: {
      type: String,
      default: null,
    },

    // Extra metadata
    metadata: {
      type: Object,
      default: {},
    },

    
    failureReason: {
      type: String,
      default: null,
    },

    // Timestamps
    completedAt: {
      type: Date,
      default: null,
    },

    failedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, 
  }
);

// Useful indexes
TransactionSchema.index({ fromUserId: 1, createdAt: -1 });
TransactionSchema.index({ toUserId: 1, createdAt: -1 });
TransactionSchema.index({ status: 1, createdAt: -1 });
TransactionSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model("Transaction", TransactionSchema);
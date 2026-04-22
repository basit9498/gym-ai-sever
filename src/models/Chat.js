const mongoose = require('mongoose');

const chatThreadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      default: 'New Conversation',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    summaryContext: {
      type: String,
      default: '',
    },
    draftWorkoutPlan: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    draftMealPlan: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

const chatMessageSchema = new mongoose.Schema(
  {
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatThread',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['user', 'ai', 'system'],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    tokensUsed: {
      type: Number,
      default: 0,
    },
    inputTokens: {
      type: Number,
      default: 0,
    },
    outputTokens: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

const ChatThread = mongoose.model('ChatThread', chatThreadSchema);
const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = { ChatThread, ChatMessage };

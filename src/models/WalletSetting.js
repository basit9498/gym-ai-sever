const mongoose = require('mongoose');

const walletSettingSchema = new mongoose.Schema({
    name: { type: String, required: true },
    walletSetId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('WalletSetting', walletSettingSchema);
const { walletClient } = require('../wallets/walletClient');
const Transaction = require('../models/Transaction');
const dotenv = require('dotenv');
dotenv.config();

const getWalletBalance = async (walletId) => {
    try {
        const client = await walletClient();
        if (!client) {
            return res.status(400).json({ message: 'Failed to create wallet client' });
        }
        const balanceResponse = await client.getWalletTokenBalance({ id: walletId });
        return balanceResponse.data

    } catch (error) {
        console.error(error);
        throw error;
    }
}


const createAutomaticTransaction = async ({senderWalletAddress, amount, userId, adminId,adminWalletId,senderWalletId,purpose}) => {

    try {
        const client = await walletClient();
        if (!client) {
            return res.status(400).json({ message: 'Failed to create wallet client' });
        }
      
        const transactionResponse = await client.createTransaction({
            blockchain: process.env.CIRCLE_WALLET_BLOCKCHAIN,
            walletAddress: senderWalletAddress,
            destinationAddress: process.env.CIRCLE_WALLET_ADMIN_ADDRESS,
            amount: [Number(amount).toFixed(6).toString()],
            tokenAddress: process.env.CIRCLE_WALLET_TOKEN_ADDRESS,
            fee: { type: "level", config: { feeLevel: "MEDIUM" } },
        });
    
        await Transaction.create({
            type: 'transfer',
            blockchain: process.env.CIRCLE_WALLET_BLOCKCHAIN,
            fromAddress: senderWalletAddress,
            toAddress: process.env.CIRCLE_WALLET_ADMIN_ADDRESS,
            fromUserId: userId,
            toUserId: adminId,
            fromWalletId: senderWalletId,
            toWalletId: adminWalletId,
            amount: amount,
            tokenAddress: process.env.CIRCLE_WALLET_TOKEN_ADDRESS,
            status: 'completed',
            completedAt: new Date(),
            failureReason: null,
            purpose: purpose,
            metadata: {
                transactionId: transactionResponse.data.id,
                transactionHash: transactionResponse.data.txHash,
            },
        });
        return transactionResponse.data;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

module.exports = {
    getWalletBalance,
    createAutomaticTransaction,
}
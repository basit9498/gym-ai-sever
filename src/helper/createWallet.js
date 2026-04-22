
const createWallet = async (walletSetId, client) => {

    try {
        const wallet = await client.createWallets({
            walletSetId,
            count: 1,
            blockchains: ['ARC-TESTNET'],
            accountType: 'EOA',
        });
        if (!wallet.data.wallets[0].id) {
            return res.status(400).json({ message: 'Failed to create wallet' });
        }
        return wallet.data.wallets[0];
    } catch (error) {
        console.error(error);
        throw error;
    }
}

module.exports = {
    createWallet,
}
    
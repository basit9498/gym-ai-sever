const { createAutomaticTransaction } = require('../helper/walletManagementHepler');

const apiPayment = async (req, res, next) => {
    try {
      
        const purpose =
        req.originalUrl?.split('?')[0]?.split('/')?.pop()?.replace(/-/g, ' ') ||
        'api payment';

        
        await createAutomaticTransaction({
            senderWalletAddress: req.user.walletId.address,
            amount: 0.001,
            userId: req.user._id,
            adminId: process.env.ADMIN_ID,
            adminWalletId: process.env.ADMIN_WALLET_ID,
            senderWalletId: req.user.walletId._id,
            purpose: purpose
            });

        next();
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Server Error: Unable to process payment' });
    }
}

module.exports = {
    apiPayment,
}
    
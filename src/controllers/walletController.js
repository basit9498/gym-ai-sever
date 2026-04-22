const { getWalletBalance } = require('../helper/walletManagementHepler');
const Transaction = require('../models/Transaction');
const walletManagement = async (req, res) => {
    try {
        const { user } = req;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const walletBalance = await getWalletBalance(user.walletId.id);
        const amount = walletBalance?.tokenBalances?.map((token) => token.amount);
        const totalAmount = amount?.reduce((acc, curr) => acc + Number(curr), 0);

        // 1. Paginated transaction history
        const transactionQuery = {
            $or: [
                { fromUserId: user._id },
                { toUserId: user._id },
            ],
        };

        const totalTransactions = await Transaction.countDocuments(transactionQuery);
        const transactions = await Transaction.find(transactionQuery)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // 2. Today's stats aggregation
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const spentTodayResult = await Transaction.aggregate([
            { $match: { fromUserId: user._id, createdAt: { $gte: today } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const creditTodayResult = await Transaction.aggregate([
            { $match: { toUserId: user._id, createdAt: { $gte: today } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        // 3. Last 7 Days aggregation (for Chart)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const chartAggregation = await Transaction.aggregate([
            { $match: { 
                $or: [{ fromUserId: user._id }, { toUserId: user._id }],
                createdAt: { $gte: sevenDaysAgo }
            }},
            { $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                amount: { $sum: "$amount" }
            }},
            { $sort: { "_id": 1 } }
        ]);

        res.status(200).json({
            success: true,
            message: 'Wallet management fetched successfully',
            data:  {
                balance: totalAmount,
                transactions: transactions,
                wallet: {
                    address: user.walletId?.address,
                    blockchain: user.walletId?.blockchain
                },
                stats: {
                    spentToday: spentTodayResult[0]?.total || 0,
                    creditToday: creditTodayResult[0]?.total || 0,
                },
                chartData: chartAggregation.map(item => ({
                    date: item._id,
                    amount: item.amount
                })),
                pagination: {
                    page,
                    limit,
                    totalPages: Math.ceil(totalTransactions / limit),
                    totalTransactions
                }
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
}


module.exports = {
    walletManagement,
}
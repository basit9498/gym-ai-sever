const WalletSetting = require('../models/WalletSetting');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { ChatMessage } = require('../models/Chat');
const { walletClient, createWalletSet } = require('../wallets/walletClient');

const createWalletSetInstance = async (req, res) => {
    try {
        const { name  } = req.body;
        const client = await walletClient();
        if (!client) {
            return res.status(400).json({ message: 'Failed to create wallet client' });
        }
        const getWalletSet = await createWalletSet(name,client);
        if (!getWalletSet.data.walletSet.id) {
            return res.status(400).json({ message: 'Failed to get wallet set' });
        }
       
        const walletSet = await WalletSetting.create({ name, walletSetId: getWalletSet.data.walletSet.id });
        res.status(201).json({
            success: true,
            message: 'Wallet set created successfully',
            data: walletSet,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
}

const getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const { search, role, status } = req.query;
        let query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        if (role && role !== 'all') {
            query.role = role;
        }

        // Status is not in the schema yet, but for future-proofing or if I add it to the schema.
        // For now, I'll return all as 'active' if not specified, 
        // but the question asked for pagination work, so I'll assume standard model query.

        const totalUsers = await User.countDocuments(query);
        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            success: true,
            data: {
                users,
                page,
                totalPages: Math.ceil(totalUsers / limit),
                totalUsers
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
}

const getAdminTransactions = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const { search, type, status } = req.query;
        let query = {};

        if (search) {
            query.$or = [
                { txHash: { $regex: search, $options: 'i' } },
                { purpose: { $regex: search, $options: 'i' } }
            ];
        }

        if (type && type !== 'all') {
            query.type = type;
        }

        if (status && status !== 'all') {
            query.status = status;
        }

        const totalTransactions = await Transaction.countDocuments(query);
        const transactions = await Transaction.find(query)
            .populate('fromUserId', 'name email')
            .populate('toUserId', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Aggregate Stats (for the whole dashboard, not just the page)
        const stats = await Transaction.aggregate([
            {
                $group: {
                    _id: null,
                    totalVolume: { $sum: "$amount" },
                    count: { $sum: 1 },
                    successful: {
                        $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
                    }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                transactions,
                stats: stats[0] || { totalVolume: 0, count: 0, successful: 0 },
                page,
                totalPages: Math.ceil(totalTransactions / limit),
                totalTransactions
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
}

const getAdminOverview = async (req, res) => {
    try {
        // 1. Basic Counts
        const totalUsers = await User.countDocuments();
        const totalTransactions = await Transaction.countDocuments();
        
        // 2. Revenue (Completed Transactions)
        const revenueResult = await Transaction.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalRevenue = revenueResult[0]?.total || 0;

        // 3. AI Requests (AI messages)
        const aiRequests = await ChatMessage.countDocuments({ role: 'ai' });

        // 4. Active Today (Users with activity today)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const activeToday = await ChatMessage.distinct('userId', { createdAt: { $gte: today } });

        // 5. Growth Trend (Last 7 days)
        const growthTrend = [];
        for (let i = 6; i >= 0; i--) {
            const start = new Date();
            start.setDate(start.getDate() - i);
            start.setHours(0, 0, 0, 0);
            
            const end = new Date();
            end.setDate(end.getDate() - i);
            end.setHours(23, 59, 59, 999);

            const count = await User.countDocuments({ createdAt: { $gte: start, $lte: end } });
            const dayName = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            growthTrend.push({ date: dayName, users: count });
        }

        // 6. Recent Activity
        const recentUsers = await User.find().select('name email createdAt').sort({ createdAt: -1 }).limit(5);
        const recentTransactions = await Transaction.find().populate('fromUserId', 'name').sort({ createdAt: -1 }).limit(5);

        const activity = [
            ...recentUsers.map(u => ({ msg: `New user ${u.name} joined the platform`, time: u.createdAt, type: 'info' })),
            ...recentTransactions.map(t => ({ msg: `Transaction of ${t.amount} USDC confirmed`, time: t.createdAt, type: 'ok' }))
        ].sort((a, b) => b.time - a.time).slice(0, 5);

        res.status(200).json({
            success: true,
            data: {
                totalUsers,
                totalTransactions,
                totalRevenue,
                aiRequests,
                activeToday: activeToday.length,
                growthTrend,
                recentActivity: activity
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
}

module.exports = {
    createWalletSetInstance,
    getAllUsers,
    getAdminTransactions,
    getAdminOverview,
}
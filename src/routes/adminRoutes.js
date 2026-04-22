const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const { createWalletSetInstance, getAllUsers, getAdminTransactions, getAdminOverview } = require('../controllers/adminController');

router.use(protect);

// dash overview
router.get('/overview', protect, admin, getAdminOverview);

// user management
router.get('/users', protect, admin, getAllUsers);

// finance management
router.get('/finance/transactions', protect, admin, getAdminTransactions);

// wallet management
router.post('/wallet/set/create', protect, admin, createWalletSetInstance);


module.exports = router;
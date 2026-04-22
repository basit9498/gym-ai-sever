const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { walletManagement } = require('../controllers/walletController');



router.get('/', protect, walletManagement);

module.exports = router;
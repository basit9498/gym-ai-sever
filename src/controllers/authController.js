const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { walletClient } = require('../wallets/walletClient');
const { createWallet } = require('../helper/createWallet');
const WalletSetting = require('../models/WalletSetting');
// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, password, walletNetworkId } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const client = await walletClient();
      if (!client) {
        return res.status(400).json({ message: 'Failed to create wallet client' });
      }

      const walletSet = await WalletSetting.findById(walletNetworkId);
      
      const wallet = await createWallet(walletSet.walletSetId, client);
      
      if (!wallet) {
        return res.status(400).json({ message: 'Failed to create wallet' });
      }

    const user = await User.create({
      name,
      email,
      password,
      role: 'user',
      walletId: {
        id: wallet.id,
        state: wallet.state,
        walletSetId: walletSet.walletSetId,
        custodyType: wallet.custodyType,
        address: wallet.address,
        blockchain: wallet.blockchain,
        accountType: wallet.accountType,
      },
    });

    if (user) {
      
    
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        walletId: wallet.id,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Auth user & get token (Login)
// @route   POST /api/auth/login
// @access  Public
const authUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = {
  registerUser,
  authUser,
};

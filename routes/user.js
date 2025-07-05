const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../model/user');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Get all users (superadmin can see all, admin can see only users they created)
router.get('/', auth, authorize('superadmin', 'admin'), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      role,
      search,
      isActive 
    } = req.query;

    const query = {};

    // If admin, only show users they created
    if (req.user.role === 'admin') {
      query.createdBy = req.user._id;
    }

    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('createdBy', 'firstName lastName username');

    const total = await User.countDocuments(query);

    res.json({
      users,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single user
router.get('/:id', auth, authorize('superadmin', 'admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('createdBy', 'firstName lastName username');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if admin can view this user
    if (req.user.role === 'admin' && user.createdBy?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user
router.put('/:id', auth, authorize('superadmin', 'admin'), [
  body('firstName').optional().notEmpty().trim(),
  body('lastName').optional().notEmpty().trim(),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().trim(),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if admin can update this user
    if (req.user.role === 'admin' && user.createdBy?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check email uniqueness if being updated
    if (req.body.email && req.body.email !== user.email) {
      const existingUser = await User.findOne({ email: req.body.email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    // Update allowed fields
    const allowedUpdates = ['firstName', 'lastName', 'email', 'phone', 'address', 'isActive'];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    await user.save();

    res.json({
      message: 'User updated successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete user (soft delete)
router.delete('/:id', auth, authorize('superadmin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deleting superadmin
    if (user.role === 'superadmin') {
      return res.status(403).json({ message: 'Cannot delete superadmin' });
    }

    user.isActive = false;
    await user.save();

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
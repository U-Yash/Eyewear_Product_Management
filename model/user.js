const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'user'],
    default: 'user'
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  permissions: {
    canManageProducts: { type: Boolean, default: false },
    canManageInventory: { type: Boolean, default: false },
    canViewBilling: { type: Boolean, default: false },
    canManageUsers: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Set default permissions based on role
userSchema.pre('save', function(next) {
  if (this.role === 'superadmin') {
    this.permissions = {
      canManageProducts: true,
      canManageInventory: true,
      canViewBilling: true,
      canManageUsers: true
    };
  } else if (this.role === 'admin') {
    this.permissions = {
      canManageProducts: true,
      canManageInventory: true,
      canViewBilling: true,
      canManageUsers: false
    };
  } else {
    this.permissions = {
      canManageProducts: false,
      canManageInventory: false,
      canViewBilling: false,
      canManageUsers: false
    };
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
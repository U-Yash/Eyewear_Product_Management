const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  originalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  reviews: {
    type: Number,
    default: 0
  },
  inStock: {
    type: Boolean,
    default: true
  },
  stockCount: {
    type: Number,
    required: true,
    min: 0
  },
  sku: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  features: [{
    type: String,
    required: true
  }],
  specifications: {
    type: Map,
    of: String
  },
  colors: [{
    name: {
      type: String,
      required: true
    },
    label: {
      type: String,
      required: true
    },
    hex: {
      type: String,
      required: true
    }
  }],
  sizes: [{
    name: {
      type: String,
      required: true
    },
    label: {
      type: String,
      required: true
    },
    available: {
      type: Boolean,
      default: true
    }
  }],
  images: [{
    type: String,
    required: true
  }],
  category: {
    type: String,
    required: true,
    enum: ['frames', 'sunglasses', 'reading-glasses', 'accessories']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Update inStock based on stockCount
productSchema.pre('save', function(next) {
  this.inStock = this.stockCount > 0;
  next();
});

module.exports = mongoose.model('Product', productSchema);
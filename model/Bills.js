const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
  billNumber: {
    type: String,
    required: true,
    unique: true
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  tax: {
    type: Number,
    default: 0,
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'],
    default: 'PENDING'
  },
  dueDate: {
    type: Date,
    required: true
  },
  notes: {
    type: String,
    trim: true
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Generate bill number
billSchema.pre('save', async function(next) {
  if (!this.billNumber) {
    const count = await mongoose.model('Bill').countDocuments();
    this.billNumber = `BILL-${Date.now()}-${count + 1}`;
  }
  next();
});

module.exports = mongoose.model('Bill', billSchema);

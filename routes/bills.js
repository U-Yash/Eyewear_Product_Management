const express = require('express');
const { body, validationResult } = require('express-validator');
const Bill = require('../model/Bills');
const Product = require('../model/Products');
const User = require('../model/user');
const InventoryTransaction = require('../model/inventory');
const { auth, authorize, checkPermission } = require('../middleware/auth');

const router = express.Router();

// Get bills (superadmin sees all, admin sees only their bills)
router.get('/', auth, checkPermission('canViewBilling'), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status,
      startDate,
      endDate,
      adminId
    } = req.query;

    const query = {};

    // If not superadmin, only show bills for current user
    if (req.user.role !== 'superadmin') {
      query.adminId = req.user._id;
    } else if (adminId) {
      query.adminId = adminId;
    }

    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const bills = await Bill.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('adminId', 'firstName lastName username email')
      .populate('generatedBy', 'firstName lastName username')
      .populate('items.product', 'name sku');

    const total = await Bill.countDocuments(query);

    res.json({
      bills,
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

// Get single bill
router.get('/:id', auth, checkPermission('canViewBilling'), async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id)
      .populate('adminId', 'firstName lastName username email phone address')
      .populate('generatedBy', 'firstName lastName username')
      .populate('items.product', 'name sku description');

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    // Check if user can view this bill
    if (req.user.role !== 'superadmin' && bill.adminId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(bill);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Generate bill for admin stock usage
router.post('/generate', auth, authorize('superadmin'), [
  body('adminId').isMongoId(),
  body('items').isArray({ min: 1 }),
  body('items.*.product').isMongoId(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('dueDate').isISO8601().toDate(),
  body('tax').isFloat({ min: 0 }).optional(),
  body('discount').isFloat({ min: 0 }).optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { adminId, items, dueDate, tax = 0, discount = 0, notes } = req.body;

    // Verify admin exists
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Process items and calculate totals
    const processedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({ message: `Product not found: ${item.product}` });
      }

      // Check stock availability
      if (product.stockCount < item.quantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${product.name}. Available: ${product.stockCount}, Requested: ${item.quantity}` 
        });
      }

      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;

      processedItems.push({
        product: product._id,
        quantity: item.quantity,
        unitPrice: product.price,
        totalPrice: itemTotal
      });

      // Update product stock
      product.stockCount -= item.quantity;
      await product.save();

      // Create inventory transaction
      const transaction = new InventoryTransaction({
        product: product._id,
        type: 'OUT',
        quantity: item.quantity,
        previousStock: product.stockCount + item.quantity,
        newStock: product.stockCount,
        reason: 'Admin stock allocation',
        reference: `Admin: ${admin.firstName} ${admin.lastName}`,
        performedBy: req.user._id
      });
      await transaction.save();
    }

    const total = subtotal + tax - discount;

    // Create bill
    const bill = new Bill({
      adminId,
      items: processedItems,
      subtotal,
      tax,
      discount,
      total,
      dueDate,
      notes,
      generatedBy: req.user._id
    });

    await bill.save();
    await bill.populate('adminId', 'firstName lastName username email');
    await bill.populate('generatedBy', 'firstName lastName username');
    await bill.populate('items.product', 'name sku');

    res.status(201).json({
      message: 'Bill generated successfully',
      bill
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update bill status
router.patch('/:id/status', auth, authorize('superadmin'), [
  body('status').isIn(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { status } = req.body;

    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    bill.status = status;
    await bill.save();

    res.json({
      message: 'Bill status updated successfully',
      bill
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get billing summary
router.get('/summary/stats', auth, authorize('superadmin'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = {};
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const summary = await Bill.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalBills: { $sum: 1 },
          totalAmount: { $sum: '$total' },
          paidAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'PAID'] }, '$total', 0]
            }
          },
          pendingAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'PENDING'] }, '$total', 0]
            }
          },
          overdueAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'OVERDUE'] }, '$total', 0]
            }
          }
        }
      }
    ]);

    // Get bills by status
    const statusCounts = await Bill.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      summary: summary[0] || {
        totalBills: 0,
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        overdueAmount: 0
      },
      statusCounts
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
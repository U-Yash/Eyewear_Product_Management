const express = require('express');
const { body, validationResult } = require('express-validator');
const Product = require('../model/Products');
const InventoryTransaction = require('../model/inventory');
const { auth, checkPermission } = require('../middleware/auth');

const router = express.Router();

// Get inventory transactions
router.get('/transactions', auth, checkPermission('canManageInventory'), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      productId,
      type,
      startDate,
      endDate
    } = req.query;

    const query = {};

    if (productId) query.product = productId;
    if (type) query.type = type;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const transactions = await InventoryTransaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('product', 'name sku')
      .populate('performedBy', 'firstName lastName username');

    const total = await InventoryTransaction.countDocuments(query);

    res.json({
      transactions,
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

// Add stock
router.post('/add-stock', auth, checkPermission('canManageInventory'), [
  body('productId').isMongoId(),
  body('quantity').isInt({ min: 1 }),
  body('reason').notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId, quantity, reason, reference, notes } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const previousStock = product.stockCount;
    const newStock = previousStock + quantity;

    // Update product stock
    product.stockCount = newStock;
    await product.save();

    // Create transaction record
    const transaction = new InventoryTransaction({
      product: productId,
      type: 'IN',
      quantity,
      previousStock,
      newStock,
      reason,
      reference,
      notes,
      performedBy: req.user._id
    });

    await transaction.save();
    await transaction.populate('product', 'name sku');
    await transaction.populate('performedBy', 'firstName lastName username');

    res.json({
      message: 'Stock added successfully',
      transaction,
      newStock
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove stock
router.post('/remove-stock', auth, checkPermission('canManageInventory'), [
  body('productId').isMongoId(),
  body('quantity').isInt({ min: 1 }),
  body('reason').notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId, quantity, reason, reference, notes } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const previousStock = product.stockCount;
    const newStock = Math.max(0, previousStock - quantity);

    // Update product stock
    product.stockCount = newStock;
    await product.save();

    // Create transaction record
    const transaction = new InventoryTransaction({
      product: productId,
      type: 'OUT',
      quantity,
      previousStock,
      newStock,
      reason,
      reference,
      notes,
      performedBy: req.user._id
    });

    await transaction.save();
    await transaction.populate('product', 'name sku');
    await transaction.populate('performedBy', 'firstName lastName username');

    res.json({
      message: 'Stock removed successfully',
      transaction,
      newStock
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Adjust stock
router.post('/adjust-stock', auth, checkPermission('canManageInventory'), [
  body('productId').isMongoId(),
  body('newQuantity').isInt({ min: 0 }),
  body('reason').notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId, newQuantity, reason, reference, notes } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const previousStock = product.stockCount;
    const adjustmentQuantity = Math.abs(newQuantity - previousStock);

    // Update product stock
    product.stockCount = newQuantity;
    await product.save();

    // Create transaction record
    const transaction = new InventoryTransaction({
      product: productId,
      type: 'ADJUSTMENT',
      quantity: adjustmentQuantity,
      previousStock,
      newStock: newQuantity,
      reason,
      reference,
      notes,
      performedBy: req.user._id
    });

    await transaction.save();
    await transaction.populate('product', 'name sku');
    await transaction.populate('performedBy', 'firstName lastName username');

    res.json({
      message: 'Stock adjusted successfully',
      transaction,
      newStock: newQuantity
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get low stock products
router.get('/low-stock', auth, checkPermission('canManageInventory'), async (req, res) => {
  try {
    const { threshold = 10 } = req.query;

    const products = await Product.find({
      isActive: true,
      stockCount: { $lte: parseInt(threshold) }
    }).sort({ stockCount: 1 });

    res.json({
      products,
      count: products.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

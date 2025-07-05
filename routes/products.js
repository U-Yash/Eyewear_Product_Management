const express = require('express');
const { body, validationResult } = require('express-validator');
const Product = require('../model/Products');
const { auth, checkPermission } = require('../middleware/auth');

const router = express.Router();

// Get all products
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      category, 
      inStock,
      minPrice,
      maxPrice,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = { isActive: true };

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } }
      ];
    }

    // Category filter
    if (category) {
      query.category = category;
    }

    // Stock filter
    if (inStock !== undefined) {
      query.inStock = inStock === 'true';
    }

    // Price filter
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const products = await Product.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('createdBy', 'firstName lastName username');

    const total = await Product.countDocuments(query);

    res.json({
      products,
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

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('createdBy', 'firstName lastName username')
      .populate('updatedBy', 'firstName lastName username');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create product
router.post('/', auth, checkPermission('canManageProducts'), [
  body('name').notEmpty().trim(),
  body('price').isFloat({ min: 0 }),
  body('originalPrice').isFloat({ min: 0 }),
  body('stockCount').isInt({ min: 0 }),
  body('sku').notEmpty().trim(),
  body('description').notEmpty().trim(),
  body('category').isIn(['frames', 'sunglasses', 'reading-glasses', 'accessories'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if SKU already exists
    const existingProduct = await Product.findOne({ sku: req.body.sku });
    if (existingProduct) {
      return res.status(400).json({ message: 'SKU already exists' });
    }

    const product = new Product({
      ...req.body,
      createdBy: req.user._id
    });

    await product.save();
    await product.populate('createdBy', 'firstName lastName username');

    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update product
router.put('/:id', auth, checkPermission('canManageProducts'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check SKU uniqueness if being updated
    if (req.body.sku && req.body.sku !== product.sku) {
      const existingProduct = await Product.findOne({ sku: req.body.sku });
      if (existingProduct) {
        return res.status(400).json({ message: 'SKU already exists' });
      }
    }

    Object.assign(product, req.body);
    product.updatedBy = req.user._id;

    await product.save();
    await product.populate('createdBy', 'firstName lastName username');
    await product.populate('updatedBy', 'firstName lastName username');

    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete product (soft delete)
router.delete('/:id', auth, checkPermission('canManageProducts'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    product.isActive = false;
    product.updatedBy = req.user._id;
    await product.save();

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
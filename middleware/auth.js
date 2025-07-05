const jwt = require('jsonwebtoken');
const User = require('../model/user');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    next();
  };
};
const checkPermission = (permission) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
  
      if (!req.user.permissions[permission]) {
        return res.status(403).json({ message: 'Permission denied' });
      }
  
      next();
    };
  };
  
  module.exports = { auth, authorize, checkPermission };
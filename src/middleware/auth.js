// File: src/middleware/auth.js
const jwt = require('jsonwebtoken');
const config = require('../config/config');

module.exports = function(req, res, next){
    const token = req.header('x-auth-token');

    if(!token){
        return res.status(401).json({ msg: 'No token supplied, authorization denied'});
    }

    try {
        const decoded = jwt.verify(token, config.auth.jwtSecret);
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ msg: 'Token has expired' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ msg: 'Token is invalid' });
        }
        return res.status(401).json({ msg: 'Token verification failed' });
    }
}
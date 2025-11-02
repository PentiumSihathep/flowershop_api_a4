// File: src/middleware/admin.js
/** 
 * @module admin middleware
 */

function admin(req, res, next){
    const role = req.user?.role;

    if (role === 'admin') {
        return next();
    }
    
    return res.status(403).json({ msg: 'Access denied. Admin privileges required.' });
}

module.exports = admin;
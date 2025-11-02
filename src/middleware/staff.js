// File: src/middleware/staff.js
/** 
 * @module Staff middleware
 * Allows access to staff and admin roles only
 */

function staff(req, res, next){
    const role = req.user?.role;
    
    if (['staff', 'admin'].includes(role)) {
        return next();
    }
    
    return res.status(403).json({ 
        msg: 'Access denied. Staff or admin privileges required.' 
    });
}

module.exports = staff;
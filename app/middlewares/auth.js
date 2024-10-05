const expressJWT = require('express-jwt');
const Response = require('../controllers/Response');
const { adminCheck } = require('../helpers');
const User = require('../models/User');
require('dotenv').config();

exports.requireSignin = expressJWT({
    secret: process.env.JWT_SECRET,
    algorithms: ['HS256'],
    userProperty: 'auth',
    credentialsRequired: true,
    getToken: (req) => {
        if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
            const token = req.headers.authorization.split(' ')[1];
            console.log('Token found:', token);
            return token;
        }
        return null;
    }
});


exports.isAuth = (req, res, next) => {
   try {
        console.log('isAuth middleware: Request headers:', req.headers);
        if(adminCheck(req)) next();
        else if(!req.user || !req.auth || req.auth._id != req.user._id)
            return Response.sendError(res, 403, 'Access denied');
        else next();
   } catch (error) {
       console.log('isAuth error:', error);
   }
};

exports.isAdmin = (req, res, next) => {
    console.log('isAdmin middleware: Request headers:', req.headers);
    if(!adminCheck(req))
        return Response.sendError(res, 403, 'Access forbidden');
    next();
};

exports.isSuperAdmin = (req, res, next) => {
    console.log('isSuperAdmin middleware: Request headers:', req.headers);
    if(req.auth.role != 'SUPER ADMIN')
        return Response.sendError(res, 403, 'Access forbidden');
    next();
};

exports.withAuthUser = (req, res, next) => {
    console.log('withAuthUser middleware: Request headers:', req.headers);
    console.log('Authenticated user ID from token:', req.auth && req.auth._id);

    const userId = req.auth && req.auth._id;
    if (!userId) {
        return Response.sendError(res, 401, 'Unauthorized: No user ID found');
    }

    User.findById(userId, (err, user) => {
        if (err || !user) {
            console.log('withAuthUser error: User not found or error:', err);
            return Response.sendError(res, 401, 'You are not signed in');
        }

        req.authUser = user;
        console.log('withAuthUser: Authenticated user:', user);
        next();
    });
};

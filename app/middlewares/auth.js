const expressJWT = require('express-jwt');
const Response = require('../controllers/Response');
const { adminCheck } = require('../helpers');
const User = require('../models/User');
require('dotenv').config();

exports.requireSignin = (req, res, next) => {
    console.log('requireSignin middleware called');

    expressJWT({
        secret: process.env.JWT_SECRET,
        algorithms: ['HS256'],
        userProperty: 'auth',
        credentialsRequired: true,
        getToken: (req) => {
            console.log('requireSignin middleware called');
            console.log('Authorization Header:', req.headers.authorization); // Log authorization header
            
            if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
                return req.headers.authorization.split(' ')[1]; // Extract token
            }
            return null;
        }
    })(req, res, (err) => {
        if (err) {
            console.log('JWT error:', err);
            return Response.sendError(res, 401, 'Unauthorized: Invalid token');
        }
        console.log('Decoded token:', req.auth); // Check if the token is attached to req.auth
        next();
    });
};



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

exports.withAuthUser = async (req, res, next) => {
    try {
        console.log('withAuthUser middleware: Request headers:', req.headers);
        const userId = req.auth && req.auth._id;

        if (!userId) {
            return Response.sendError(res, 401, 'Unauthorized: No user ID found in token');
        }

        console.log('withAuthUser: User ID from token:', userId); // Log the user ID from the token

        // Fetch user by ID
        const user = await User.findById(userId);
        console.log('User status:', user.enabled); // Log enabled status

        if (!user) {
            console.log('withAuthUser error: User not found');
            return Response.sendError(res, 404, 'User not found');
        }

        req.authUser = user; // Attach the found user to req.authUser
        console.log('withAuthUser: Authenticated user:', user); // Log the found user
        next();
    } catch (err) {
        console.log('withAuthUser error:', err);
        return Response.sendError(res, 404, 'User not found');
    }
};


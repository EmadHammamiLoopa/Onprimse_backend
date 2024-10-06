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
    // Log the request headers to verify token is received
    console.log('withAuthUser middleware: Request headers:', req.headers);

    // Extract the Authorization header (Bearer token)
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return Response.sendError(res, 401, 'Unauthorized: No token provided');
    }

    // Split the 'Bearer' and the token
    const token = authHeader.split(' ')[1];

    try {
        // Decode the token and attach the user information to req.auth
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.auth = decoded; // This now contains the user's _id and other token info

        console.log('Authenticated user ID from token:', req.auth._id);

        // Find the user in the database using the decoded _id
        const userId = req.auth._id;
        User.findById(userId, (err, user) => {
            if (err || !user) {
                console.log('withAuthUser error: User not found or error:', err);
                return Response.sendError(res, 401, 'You are not signed in');
            }

            // Attach the found user to req.authUser and move to next middleware
            req.authUser = user;
            console.log('withAuthUser: Authenticated user:', user);
            next();
        });

    } catch (err) {
        console.error('Token verification failed:', err);
        return Response.sendError(res, 401, 'Unauthorized: Invalid token');
    }
};

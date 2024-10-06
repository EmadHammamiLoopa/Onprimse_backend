const Response = require("../controllers/Response");
const User = require("../models/User");

exports.userById = (req, res, next, id) => {
    console.log('--- userById Middleware ---');
    console.log('Initial received user ID:', id);  // Log the initial ID passed in
    console.log('Received req.auth:', req.auth);   // Log req.auth to see if it's populated

    // If the ID is 'me', we replace it with the authenticated user's ID
    if (id === 'me') {
        console.log("'me' detected, checking req.auth for the authenticated user...");
        console.log("'req.auth._id auth for the authenticated user...",req.auth._id);

        if (!req.auth || !req.auth._id) {
            console.error('No auth object found or user not authenticated!');
            return Response.sendError(res, 400, 'Authentication error: User not authenticated');
        }

        console.log(`Replacing 'me' with authenticated user's ID: ${req.auth._id}`);
        id = req.auth._id;
    }

    console.log(`Looking for user with ID: ${id}`);  // Log the final ID being used for user lookup

    // Find the user by ID
    User.findById(id, (err, user) => {
        if (err) {
            console.error(`Error finding user with ID ${id}:`, err);
            return Response.sendError(res, 400, 'User not found');
        }

        if (!user) {
            console.error(`User not found with ID: ${id}`);
            return Response.sendError(res, 400, 'User not found');
        }

        // Log the found user object before attaching it to req.user
        console.log(`User found: ${JSON.stringify(user, null, 2)}`);

        // Set default avatar if not available
        if (!user.mainAvatar) {
            user.mainAvatar = getDefaultAvatar(user.gender);
            console.log(`No mainAvatar found for user. Setting default: ${user.mainAvatar}`);
        }
        if (!user.avatar || user.avatar.length === 0) {
            user.avatar = [user.mainAvatar];
            console.log(`No avatar found for user. Setting avatar: ${user.avatar}`);
        }

        // Attach the found user to the request object
        req.user = user;
        console.log('User attached to req.user. Proceeding to next middleware...');

        // Proceed to the next middleware or controller
        next();
    });
};



function getDefaultAvatar(gender) {
    switch (gender) {
        case 'male':
            return '/public/images/avatars/male.webp';
        case 'female':
            return '/public/images/avatars/female.webp';
        default:
            return '/public/images/avatars/other.webp';
    }
}

exports.isNotFriend = (req, res, next) => {
    const user = req.user;
    if(user.friends.includes(req.auth._id))
        return Response.sendError(res, 400, 'user already friend');
    next();
}

exports.isNotBlocked = async (req, res, next) => {
    try {
        const user = req.user; // The user being checked
        if (!user) {
            return Response.sendError(res, 400, 'User not found in request');
        }

        const authUser = await User.findOne({ _id: req.auth._id }); // Fetch the authenticated user
        if (!authUser) {
            return Response.sendError(res, 404, 'Authenticated user not found');
        }

        // Check if either user has blocked the other
        if (authUser.blockedUsers && authUser.blockedUsers.includes(user._id) || user.blockedUsers && user.blockedUsers.includes(authUser._id)) {
            return Response.sendError(res, 404, 'You or the other user is blocked');
        }

        next(); // Proceed to the next middleware or controller
    } catch (err) {
        console.log('Error in isNotBlocked middleware:', err);
        return Response.sendError(res, 500, 'An error occurred while checking blocked status');
    }
};


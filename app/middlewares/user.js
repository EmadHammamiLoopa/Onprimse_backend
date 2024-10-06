const Response = require("../controllers/Response");
const User = require("../models/User");

exports.userById = (req, res, next, id) => {
    // Log the incoming request to `userById`
    console.log('--- userById Middleware ---');
    console.log(`Received user ID: ${id}`);

    // Check if the ID is 'me', and if so, use the authenticated user's ID from the token
    if (id === 'me') {
        console.log(`ID is 'me', replacing with authenticated user's ID: ${req.auth ? req.auth._id : 'No auth object found!'}`);
        id = req.auth._id; // Retrieve the authenticated user's ID from the token
    }

    // Log the ID being used to find the user
    console.log(`Looking for user with ID: ${id}`);

    User.findById(id, (err, user) => {
        // Check if there's an error in the database lookup
        if (err) {
            console.error(`Error finding user with ID ${id}:`, err); // Log any error during the lookup
            return Response.sendError(res, 400, 'User not found');
        }

        // Check if user was not found
        if (!user) {
            console.error(`User not found with ID: ${id}`); // Log if user is not found
            return Response.sendError(res, 400, 'User not found');
        }

        // Ensure mainAvatar and avatar are set, and log these actions
        if (!user.mainAvatar) {
            console.log(`User ${id} has no mainAvatar, setting default avatar`);
            user.mainAvatar = getDefaultAvatar(user.gender);
        }
        if (!user.avatar) {
            console.log(`User ${id} has no avatar, setting to mainAvatar`);
            user.avatar = [user.mainAvatar];
        }

        // Log the found user details
        console.log(`User found: ${JSON.stringify(user, null, 2)}`);

        // Attach the found user to the request object
        req.user = user;

        // Log that the middleware is moving to the next step
        console.log('Moving to next middleware or controller...');
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

exports.isNotBlocked = (req, res, next) => {
    try{
        const user = req.user;
        User.findOne({_id: req.auth._id}, (err, authUser) => {
            if(authUser.blockedUsers.includes(user._id) 
            || user.blockedUsers.includes(authUser._id)){
                return Response.sendError(res, 404, 'not found');
            }
            next();
        });
    }catch(err){
        console.log(err);
    }
}

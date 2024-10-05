const Response = require("../controllers/Response");
const User = require("../models/User");

exports.userById = (req, res, next, id) => {
    console.log(`userByIduserByIduserByIduserById`); // Log the incoming user ID
    console.log(`reqreqreqreq`,req); // Log the incoming user ID
    console.log(`resresresres`,res); // Log the incoming user ID
    console.log(`idididid`,id); // Log the incoming user ID

    if (id === 'me') {
        // Use the authenticated user's ID instead
        id = req.auth._id;
        console.log(`Looking for current user with ID: ${id}`);
    } else {
        console.log(`Looking for user with ID: ${id}`);
    }

    User.findById(id, (err, user) => {
        if (err) {
            console.error(`Error finding user with ID ${id}:`, err); // Log any error during the lookup
            return Response.sendError(res, 400, 'User not found');
        }
        if (!user) {
            console.error(`User not found with ID: ${id}`); // Log if user is not found
            return Response.sendError(res, 400, 'User not found');
        }

        // Ensure mainAvatar and avatar are set
        if (!user.mainAvatar) {
            user.mainAvatar = getDefaultAvatar(user.gender);
        }
        if (!user.avatar) {
            user.avatar = [user.mainAvatar];
        }

        console.log(`User found: ${user}`); // Log the found user
        req.user = user;
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

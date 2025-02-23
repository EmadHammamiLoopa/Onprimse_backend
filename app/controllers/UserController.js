const User = require("../models/User")
const mongoose = require('mongoose')

const Response = require("./Response")
const fs = require('fs')
const path = require('path')
const _ = require('lodash')
const Request = require("../models/Request")
const { manAvatarPath, womenAvatarPath, setOnlineUsers, extractDashParams, report, sendNotification } = require("../helpers")
const Report = require("../models/Report")
const Channel = require("../models/Channel")
const Product = require("../models/Product")
const Job = require("../models/Job")
const Service = require("../models/Service")
const Post = require("../models/Post")
const Comment = require("../models/Comment")
const Subscription = require("../models/Subscription")
const multer = require('multer');
const upload = multer().array('avatar', 10); // Adjust the field name and limit as necessary
const defaultMaleAvatarUrl = '/public/images/avatars/male.webp';
const defaultFemaleAvatarUrl = '/public/images/avatars/female.webp';
const defaultOtherAvatarUrl = '/public/images/avatars/other.webp';



exports.reportUser = async (req, res) => {
    try {
        const userId = req.params.userId; // Get the user ID from the request parameters

        console.log('Request body:', req.body); // Debugging log

        if (!req.body.message) {
            return Response.sendError(res, 400, 'Please enter a message');
        }

        // Hardcoding `reportType` for testing purposes
        if (!req.body.reportType) {
            req.body.reportType = 'Other'; // Temporary fixed report type for testing
            console.log('Report type fixed for testing:', req.body.reportType);
        }

        // Find the user being reported
        const reportedUser = await User.findById(userId);
        if (!reportedUser) {
            return Response.sendError(res, 404, 'User not found');
        }

        // Call the `report` function
        const reportInstance = await report(req, res, 'User', reportedUser._id);

        // Update the reported user with the new report
        await User.updateOne({ _id: reportedUser._id }, { $push: { reports: reportInstance } });

        // Fetch and return the updated user with full report details
        const updatedUser = await User.findOne({ _id: reportedUser._id })
            .populate({ path: 'reports', model: 'Report' });

        return Response.sendResponse(res, null, 'Thank you for reporting');
    } catch (error) {
        console.error('Error reporting user:', error);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};


exports.removeAvatar = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).send('User not found');

        let avatarUrl = req.params.avatarUrl;

        // Extract the relative path from the full URL
        const url = new URL(avatarUrl);
        avatarUrl = path.basename(url.pathname); // Gets the filename from the path

        const avatarPath = path.join(__dirname, '..', '..', 'public', 'uploads', avatarUrl); // Adjusted to include 'uploads' directory

        console.log(`Requested path to delete: ${avatarPath}`);

        // Check if the avatar is a default avatar
        const isDefaultAvatar = [
            path.basename(defaultMaleAvatarUrl),
            path.basename(defaultFemaleAvatarUrl),
            path.basename(defaultOtherAvatarUrl)
        ].includes(avatarUrl);

        if (isDefaultAvatar) {
            return res.status(400).send({ message: 'Cannot remove the default avatar' });
        }

        if (fs.existsSync(avatarPath)) {
            console.log(`File found: ${avatarPath}`);
            fs.unlinkSync(avatarPath);

            // Remove avatar URL from user's avatar array
            user.avatar = user.avatar.filter(url => path.basename(url) !== avatarUrl);

            // Ensure the mainAvatar is updated if necessary
            if (path.basename(user.mainAvatar) === avatarUrl) {
                user.mainAvatar = user.avatar.length > 0 ? user.avatar[0] : null; // Set to another avatar or null
            }

            // Log cleaned avatars for consistency
            const cleanedAvatars = user.avatar.filter(url => {
                const avatarPath = path.join(__dirname, '..', '..', 'public', 'uploads', path.basename(url));
                if (fs.existsSync(avatarPath)) {
                    return true;
                } else {
                    console.log(`File not found: ${avatarPath}`);
                    return false;
                }
            });

            user.avatar = cleanedAvatars;


            // Update mainAvatar if necessary
            if (user.mainAvatar === avatarUrl) {
                if (user.avatar.length > 0) {
                    user.mainAvatar = user.avatar[0];
                } else {
                    // Set to default avatar based on gender
                    user.mainAvatar = user.gender === 'male' ? defaultMaleAvatarUrl : (user.gender === 'female' ? defaultFemaleAvatarUrl : defaultOtherAvatarUrl);
                }
            }


            // Update mainAvatar if it no longer exists in the cleaned avatars
            if (!cleanedAvatars.includes(user.mainAvatar)) {
                user.mainAvatar = cleanedAvatars.length > 0 ? cleanedAvatars[0] : null;
            }

            // If there are no user avatars left, set the default avatar as mainAvatar
            if (cleanedAvatars.length === 0) {
                user.mainAvatar = user.gender === 'male' ? defaultMaleAvatarUrl : (user.gender === 'female' ? defaultFemaleAvatarUrl : defaultOtherAvatarUrl);
            }

            await user.save();

            // Return the updated user object to update the UI
            return res.status(200).send({ message: 'Avatar removed successfully', user });
        } else {
            console.log(`File not found: ${avatarPath}`);
            return res.status(404).send('Avatar file not found');
        }
    } catch (err) {
        console.error('Error removing avatar:', err);
        return res.status(500).send('Server error');
    }
};
exports.clearUserReports = (req, res) => {
    Report.remove({
        "entity._id": req.user._id,
        "entity.name": "user"
    }, (err, rmRes) => {
        if(err) return Response.sendError(res, 400, 'failed to clear reports')
        return Response.sendResponse(res, null, "reports cleaned")
    })

}


exports.banUser = async (req, res) => {
    try {
        const user = req.user;
        const message = req.body.message;
        console.log(message);

        // Update user properties
        user.banned = true;
        user.bannedReason = message;

        // Save user to the database
        await user.save();

        // Create log entry
        const logMessage = `User ID: ${user._id}\nBanned Reason: ${message}\nDate: ${new Date().toISOString()}\n\n`;

        // Define the log path for Blockingusers.txt
        const logPath = path.join('C:\\Users\\emadh\\Downloads\\packup\\packup_27.07\\31\\32\\isen-backend-master', 'Blockingusers.txt');
        
        // Write log to the Blockingusers.txt file
        fs.appendFile(logPath, logMessage, (err) => {
            if (err) {
                console.error('Failed to write to log file', err);
            }
        });

        return Response.sendResponse(res, user, 'User has been banned');
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.unbanUser = async (req, res) => {
    try {
        const user = req.user;

        // Update user's banned status
        user.banned = false;
        user.bannedReason = '';

        // Save the updated user object using async/await
        await user.save();

        return Response.sendResponse(res, user, 'User unbanned successfully');
    } catch (err) {
        console.error(err);
        return Response.sendError(res, 500, 'Server error, unable to unban the user');
    }
};


exports.allUsers = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['firstName', 'lastName', 'email', 'role']);
        
        // Execute the aggregation pipeline
        const users = await User.aggregate()
            .match(dashParams.filter)
            .project({
                firstName: 1,
                lastName: 1,
                email: 1,
                role: 1,
                avatar: "$avatar.path", // Assuming avatar is stored in avatar.path
                mainAvatar: 1, // Include mainAvatar in the projection
                enabled: 1,
                reports: {
                    $size: "$reports"
                },
                subscription: 1 // Include subscription field in projection
            })
            .sort(dashParams.sort)
            .skip(dashParams.skip)
            .limit(dashParams.limit)
            .exec();  // No callback here, now returns a promise

        // Populate subscription for each user
        const populatedUsers = await User.populate(users, {
            path: 'subscription._id',
            model: 'Subscription',
            select: 'dayPrice weekPrice monthPrice yearPrice currency offers',
        });

        // Count documents
        const count = await User.find(dashParams.filter).countDocuments();

        // Send response
        return Response.sendResponse(res, {
            docs: populatedUsers,
            totalPages: Math.ceil(count / dashParams.limit)
        });
        
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};




exports.storeUser = (req, res) => {
    try{
        User.findOne({email: req.fields.email}, async(err, user) => {
            if(err) return Response.sendError(res, 400, 'Server error')
            if(user) return Response.sendError(res, 400, 'email already used in another account')

            const fields = _.omit(req.fields, ['avatar'])

            user = new User(fields)

            if(req.files.avatar) this.storeAvatar(req.files.avatar, user)
            else{
                if(user.gender == 'male') user.avatar.path = manAvatarPath
                else user.avatar.path = womenAvatarPath
                user.avatar.type = "png";
            }

            await user.save();

            await addGlobalChannels(user)
         //   await addLocalChannels(user)
            await addFreeSubscription(user)
        }) 
    }catch(err){
        console.log(err);
    }
}

addFreeSubscription = async(user) => {
    //assign one month subscription free
    subscription = await Subscription.findOne({})
    const expireDate = new Date()
    expireDate.setMonth(expireDate.getMonth() + 1)

    user.subscription = {
        _id: subscription._id,
        expireDate
    }
}

addLocalChannels = async (user) => {
    try{
        let channel = await Channel.findOne({name: user.city})
        if(!channel){
            const admin = await User.findOne({role: 'SUPER ADMIN'})
            channel = new Channel({
                name: user.city,
                description: 'local channel',
                city: user.city,
                country: user.country,
                user: admin._id,
                followers: [],
                approved: true
            })
        }
        user.followedChannels.push(channel._id)
        channel.followers.push(user._id)
        await channel.save()
    } catch(err){
        console.log(err);
    }
}

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

exports.updateUserDash = async (req, res) => {
    try {
        let user = req.user;
        const fields = _.omit(req.fields, ['password', 'avatar']);

        // Convert interests from comma-separated string to an array
        if (fields.interests) {
            fields.interests = fields.interests.split(',');
        }

        // Update the user object
        Object.assign(user, fields);

        // If password is provided, update it
        if (req.fields.password && req.fields.password !== 'undefined') {
            user.password = req.fields.password;
        }

        // If avatar is provided, store it
        if (req.files && req.files.avatar) {
            await this.storeAvatar(req.files.avatar, user);
        }

        // ✅ Save using `await` (without a callback)
        await user.save();

        // Remove sensitive data before sending response
        const updatedUser = user.publicInfo();
        return Response.sendResponse(res, updatedUser, 'The user has been updated successfully');
    } catch (err) {
        console.error('Error updating user dashboard:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.showUserDash = async (req, res) => {
    try {
        // Using async/await for the query
        const user = await User.findOne(
            { _id: req.user._id },
            {
                firstName: 1,
                lastName: 1,
                email: 1,
                gender: 1,
                country: 1,
                city: 1,
                birthDate: 1,
                avatar: "$avatar.path",
                mainAvatar:1,
                role: 1,
                enabled: 1,
                interests: 1,
                phone: 1,
                school: 1,
                banned: 1,
                bannedReason: 1,
                education: 1,
                profession: 1,
                reports: 1  // Ensure this is included in projection
            }
        )
        .populate({
            path: 'reports',  // Ensure reports are populated
            select: 'reason description reportedBy createdAt status'  // Select only required fields
        })
        .exec();

        // Check if the user exists
        if (!user) {
            return Response.sendError(res, 400, 'User not found');
        }

        // Send response with user data
        return Response.sendResponse(res, user);

    } catch (error) {
        console.error(error);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.showUser = (req, res) => {
    try {
        return Response.sendResponse(res, req.user.publicInfo())
    } catch (error) {
        console.log(error);
    }
}

exports.updateUser = async (req, res) => {
    try {
        let user = await User.findById(req.params.userId);
        if (!user) {
            return Response.sendError(res, 404, 'User not found');
        }

        // Check for required fields, e.g., gender
        if (!req.body.gender) {
            return Response.sendError(res, 400, 'Gender is required');
        }

        user = Object.assign(user, req.body);

        await user.save();
        return Response.sendResponse(res, user.publicInfo(), 'Profile updated successfully');
    } catch (err) {
        console.error('Server error:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.updateEmail = async (req, res) => {
    try {
        const email = req.body.email;
        const authUser = req.authUser;

        console.log('Attempting to update email for user:', authUser._id);
        console.log('New email to be set:', email);

        // Find if the email is already being used
        User.findOne({ email }, (err, user) => {
            if (err) {
                console.error('Error during email lookup:', err);
                return Response.sendError(res, 400, 'failed');
            }

            if (user) {
                console.log('Email is already in use by another account:', email);
                return Response.sendError(res, 400, 'email already used in another account');
            }

            // Update the authenticated user's email
            authUser.email = email;

            // Save the updated user information
            authUser.save((err, updatedUser) => {
                if (err || !updatedUser) {
                    console.error('Error saving updated user:', err);
                    return Response.sendError(res, 400, 'failed');
                }

                console.log('Email updated successfully for user:', updatedUser._id);
                return Response.sendResponse(res, updatedUser.publicInfo(), 'email changed');
            });
        });
    } catch (err) {
        console.error('Unexpected error in updateEmail:', err);
        return Response.sendError(res, 500, 'Internal server error');
    }
};
exports.updatePassword = async (req, res) => {
    try {
        const { current_password, password } = req.body;
        const authUser = req.authUser;

        console.log('Comparing current password for user:', authUser._id);
        console.log('Provided current password:', current_password);
        console.log('Stored hashed password in the database:', authUser.hashed_password);

        // Compare provided current password with the stored hashed password
        const isMatch = await authUser.comparePassword(current_password);

        if (!isMatch) {
            console.log('Password comparison result: Password does not match');
            return Response.sendError(res, 400, 'Current password is incorrect');
        }

        console.log('Password comparison result: Password matches');

        // Update to the new password
        authUser.password = password; // This will trigger the setter to hash the new password
        await authUser.save();

        console.log('Password updated successfully for user:', authUser._id);
        return Response.sendResponse(res, authUser.publicInfo(), 'Password updated successfully');
    } catch (err) {
        console.error('Error updating password:', err);
        return Response.sendError(res, 500, 'Failed to update password');
    }
};



exports.storeAvatar = async (avatar, user) => {
    try {
        const avatarName = `${user._id}_${new Date().getTime()}.png`;
        const avatarDir = path.join(__dirname, '/public/uploads');
        const avatarPath = path.join(avatarDir, avatarName);

        console.log(`Avatar directory: ${avatarDir}`);
        console.log(`Avatar path: ${avatarPath}`);

        // Ensure the uploads directory exists
        if (!fs.existsSync(avatarDir)) {
            console.log(`Creating directory: ${avatarDir}`);
            fs.mkdirSync(avatarDir, { recursive: true });
        }

        // Write the new avatar file
        console.log(`Writing new avatar file: ${avatarPath}`);
        fs.writeFileSync(avatarPath, fs.readFileSync(avatar.path));

        // Remove the old avatar file if it exists and is not the default
        if (user.avatar.path && user.avatar.path !== manAvatarPath && user.avatar.path !== womenAvatarPath) {
            const lastAvatarPath = path.join(__dirname, `./../../public${user.avatar.path}`);
            if (fs.existsSync(lastAvatarPath)) {
                console.log(`Removing old avatar file: ${lastAvatarPath}`);
                fs.unlinkSync(lastAvatarPath);
            }
        }

        // Update the user object with the new avatar path
        user.avatar.path = `/public/uploads${avatarName}`;
        user.avatar.type = avatar.type;

        // Save the user object to the database
        console.log(`Saving user data with new avatar path: ${user.avatar.path}`);
        await user.save();
    } catch (error) {
        console.log('Error storing avatar:', error);
    }
};

exports.updateMainAvatar = async (req, res) => {
    try {
        const userId = req.params.userId; // Get userId from URL parameter
        const { avatarUrl } = req.body; // Get avatarUrl from request body

        console.log('Received request to update main avatar with userId:', userId, 'and avatarUrl:', avatarUrl);

        if (!userId || !avatarUrl) {
            console.log('Missing userId or avatarUrl.');
            return Response.sendError(res, 400, 'Missing userId or avatarUrl.');
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).send('User not found');

        // Convert the absolute URL to a relative path for comparison
        const relativeAvatarUrl = avatarUrl.replace(`${req.protocol}://${req.get('host')}`, '');

        // Ensure the avatarUrl exists in the user's avatar array
        if (!user.avatar.includes(relativeAvatarUrl)) {
            console.log('Avatar URL not found in user avatars:', relativeAvatarUrl);
            return res.status(400).send('Avatar URL not found in user avatars.');
        }

        // Update the mainAvatar
        user.mainAvatar = relativeAvatarUrl;

        await user.save();

        console.log('Main avatar updated successfully for userId:', userId);

        return res.status(200).send({
            message: 'Main avatar updated successfully',
            user: user.publicInfo()
        });
    } catch (err) {
        console.error('Error updating main avatar:', err);
        return res.status(500).send('Server error');
    }
};

  

  
exports.updateAvatar = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).send('User not found');

        if (req.file) {
            const avatarUrl = req.savedAvatarPath; // Adjust based on how you save the path

            // Add the new avatar to the user's avatar array
            user.avatar.push(avatarUrl);

            await user.save();

            return res.status(200).send({
                message: 'Avatar updated successfully',
                avatarUrl: avatarUrl,
                user: user.publicInfo()
            });
        } else {
            return res.status(400).send('No avatar file uploaded');
        }
    } catch (err) {
        console.error('Error updating avatar:', err);
        return res.status(500).send('Server error');
    }
};





exports.deleteAccount = async(req, res) => {
    const user = req.authUser
    user.deletedAt = new Date()
    await user.save()
    return Response.sendResponse(res, null, 'account deleted')
}

exports.deleteUser = (req, res) => {
    const user = req.user
    user.remove(async(err, usr) => {
        if(err) return Response.sendError(res, 400, 'could not delete the user')
        await Product.deleteMany({user: user._id})
        await Job.deleteMany({user: user._id})
        await Service.deleteMany({user: user._id})
        return Response.sendResponse(res, null, 'user deleted')
    })
}

exports.toggleUserStatus = (req, res) => {
    const user = req.user
    if(user.enabled) user.enabled = false;
    else user.enabled = true;
    user.save((err, use) => {
        if(err) return Response.sendError(res, 400, 'Server error, please try again later')
        return Response.sendResponse(res, user.enabled, 'the user account has been ' + user.enabled ? 'enabled' : 'disabled')
    })
}

exports.follow = async(req, res) => {
    const authUser = req.authUser
    const user = req.user
    let followed = false

    if(!authUser.following.includes(user._id)){
        authUser.following.push(user._id)
        if(!user.followers.includes(authUser._id))
            user.followers.push(authUser._id)
        followed = true
    }
    else{
        authUser.following.splice(authUser.following.indexOf(user._id), 1)
        if(user.followers.includes(authUser._id))
            user.followers.splice(user.following.indexOf(authUser._id), 1)
    }

    await user.save()
    await authUser.save()

    if(followed)
        sendNotification({en: req.authUser.firstName + ' ' + req.authUser.lastName}, {en: 'started following you'}, {
            type: 'follow-user',
            link: '/tabs/profile/display/' + user._id
        }, [], [user._id])

    return Response.sendResponse(res, followed, followed ? 'followed' : 'unfollowed')
}

exports.getUsers = async (req, res) => {
    try {
        let isGlobalSearch = false;
        const page = req.query.page ? +req.query.page : 0;
        let limit = 20;
        let skip = page * limit;

        // Build the base filter
        const filter = buildBaseFilter(req);

        // Check for city-specific search
        if (req.query.type === 'near') {
            let cityUsers = await findUsersInCity(req, filter, skip, limit);
            let allUsers = cityUsers;

            // If fewer than 10 users found in the city, extend the search to the country
            if (cityUsers.length < 10) {
                let countryUsers = await findUsersInCountry(req, filter, skip, limit);

                if (countryUsers.length === 0) {
                    // Fallback to global search if no users found in the country
                    countryUsers = await findUsersGlobally(req, filter, skip, limit);
                    isGlobalSearch = true;
                }

                // Combine city and country users, adding a divider if on the first page
                allUsers = page === 0 ? [...cityUsers, { isDivider: true }, ...countryUsers] : countryUsers;
            }

            // Check if no users were found
            if (allUsers.length === 0) {
                return Response.sendError(res, 404, `We couldn't find users in ${req.authUser.city}. You can explore the whole country or adjust your search criteria.`);
            }

            // Return response with users
            console.log("Final response:", { users: setOnlineUsers(allUsers), more: hasMoreUsers(allUsers, limit, page), isGlobalSearch });
            return Response.sendResponse(res, { users: setOnlineUsers(allUsers), more: hasMoreUsers(allUsers, limit, page) });

        } else {
            // Handle random user fetching logic for non-'near' type
            let randomUsers = await findRandomUsers(req, filter, limit);
            console.log("Final response:", { users: setOnlineUsers(randomUsers), more: hasMoreUsers(randomUsers, limit, page), isGlobalSearch });
            return Response.sendResponse(res, { users: setOnlineUsers(randomUsers), more: hasMoreUsers(randomUsers, limit, page) });
        }

    } catch (err) {
        console.log("Server error:", err);
        return Response.sendError(res, 500, 'Server error!');
    }
};

// Helper function to build the base filter
function buildBaseFilter(req) {
    // Ensure that req.auth._id and req.authUser._id are properly converted to ObjectId
    const authUserId = new mongoose.Types.ObjectId(req.auth._id);
    const authUserBlockedIds = req.authUser.blockedUsers.map(id => new mongoose.Types.ObjectId(id));
    
    const filter = {
        _id: { $ne: authUserId, $nin: authUserBlockedIds },  // Exclude the auth user and blocked users
        blockedUsers: { $ne: authUserId },  // Ensure the current user is not in blockedUsers
        friends: { $ne: authUserId },  // Ensure the current user is not in friends
        role: { $nin: ['ADMIN', 'SUPER ADMIN'] },  // Exclude admin roles
        deletedAt: { $eq: null }  // Only include non-deleted users
    };

    // Apply additional filters based on the query
    if (req.query.profession === '1') {
        filter['profession'] = req.authUser.profession;
    }
    if (req.query.education === '1') {
        filter['education'] = req.authUser.education;
    }
    if (req.query.interests === '1') {
        filter['interests'] = { $in: req.authUser.interests };
    }
    if (req.query.gender !== 'both') {
        filter['gender'] = req.query.gender;
    }

    return filter;
}


// Helper function to find users in a specific city
async function findUsersInCity(req, filter, skip, limit) {
    filter['city'] = req.authUser.city;
    console.log("Filter being used for city search:", filter);
    return await User.find(filter)
        .populate('requests', '', 'Request', getRequestPopulationQuery(req))
        .select(getUserSelectFields(req))
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();
}

// Helper function to find users in a specific country
async function findUsersInCountry(req, filter, skip, limit) {
    filter['country'] = req.authUser.country;
    delete filter['city'];  // Remove city filter to search the entire country
    console.log("Filter being used for country search:", filter);
    return await User.find(filter)
        .populate('requests', '', 'Request', getRequestPopulationQuery(req))
        .select(getUserSelectFields(req))
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();
}

// Helper function to find users globally (no city or country filter)
async function findUsersGlobally(req, filter, skip, limit) {
    delete filter['country'];  // Remove the country filter for global search
    console.log("Filter being used for global search:", filter);
    return await User.find(filter)
        .populate('requests', '', 'Request', getRequestPopulationQuery(req))
        .select(getUserSelectFields(req))
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();
}

// Helper function to find random users
async function findRandomUsers(req, filter, limit) {
    filter['randomVisible'] = true;
    const count = await User.find(filter).countDocuments();
    const skip = count > 5 ? Math.floor(Math.random() * (count - 5)) : 0;
    console.log("Filter being used for random search:", filter);
    return await User.find(filter)
        .populate('requests', '', 'Request', getRequestPopulationQuery(req))
        .select(getUserSelectFields(req))
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();
}

// Helper function to determine if more users exist for pagination
function hasMoreUsers(users, limit, page) {
    return (users.length - (limit * (page + 1))) > 0;
}

// Helper function to build the request population query
function getRequestPopulationQuery(req) {
    return {
        $or: [
            { from: new mongoose.Types.ObjectId(req.auth._id) },
            { to: new mongoose.Types.ObjectId(req.auth._id) }
        ]
    };
}

// Helper function to select fields for users
function getUserSelectFields(req) {
    return {
        firstName: 1,
        lastName: 1,
        email: 1,
        country: 1,
        city: 1,
        gender: 1,
        avatar: 1,
        mainAvatar: 1,
        birthDate: { $cond: [{ $eq: ["$ageVisible", true] }, "$birthDate", null] },
        followed: { $in: [new mongoose.Types.ObjectId(req.auth._id), "$followers"] },
        friend: { $in: [new mongoose.Types.ObjectId(req.auth._id), "$friends"] },
        requests: 1,
        profession: 1,
        interests: 1,
        education: 1,
        school: 1,
        enabled: 1,
        is2FAEnabled: 1,
        twoFAToken: 1,
        role: 1,
        banned: 1,
        reports: 1,
        followers: 1,
        following: 1,
        friends: 1,
        blockedUsers: 1,
        followedChannels: 1,
        messagedUsers: 1,
        randomVisible: 1,
        ageVisible: 1,
        loggedIn: 1,
        visitProfile: 1,
        salt: 1,
        hashed_password: 1,
        createdAt: 1,
        updatedAt: 1,
        aboutMe: 1,
        lastSeen:1,
    };
}



const isFriend = (authUser, user) => {
    if (!authUser || !user) {
        return {
            isLoggedInUser: false,
            isFriend: false,
        };
    }
    const isLoggedInUser = authUser._id.toString() === user._id.toString();
    const isFriend = user.friends.some(friendId => friendId.toString() === authUser._id.toString());
    return {
        isLoggedInUser,
        isFriend,
    };
};

exports.getUserProfile = async (req, res) => {
    console.log(`Fetching user profile for ID: ${req.params.userId}`);

    try {
        const userId = req.params.userId;
        const authUserId = req.auth._id;

        console.log(`Authenticated user ID: ${authUserId}`);

        // Find the user by ID and populate the subscription details
        const user = await User.findOne({ _id: userId })
            .select({
                firstName: 1,
                lastName: 1,
                email: 1,
                country: 1,
                city: 1,
                gender: 1,
                avatar: 1,
                mainAvatar: 1,
                birthDate: 1,
                profession: 1,
                interests: 1,
                education: 1,
                school: 1,
                enabled: 1,
                is2FAEnabled: 1,
                twoFAToken: 1,
                role: 1,
                banned: 1,
                followers: 1,
                following: 1,
                friends: 1,
                blockedUsers: 1,
                followedChannels: 1,
                messagedUsers: 1,
                randomVisible: 1,
                ageVisible: 1,
                loggedIn: 1,
                visitProfile: 1,
                lastSeen: 1,
                aboutMe: 1,
                subscription: 1, // Include subscription field
                createdAt: 1,
                updatedAt: 1
            })
            .populate({
                path: 'subscription._id',
                model: 'Subscription',
                select: 'dayPrice weekPrice monthPrice yearPrice currency offers', // Only include necessary fields
            });

        if (!user) return res.status(400).send('Failed to fetch user profile');
        if (user.deletedAt) return res.status(204).send();

        // Set default avatar based on gender if no avatar is set
        if (!user.mainAvatar) {
            user.mainAvatar = user.getDefaultAvatar(); // Set default avatar based on gender
        }

        const relationshipStatus = isFriend(req.auth, user);
        console.log('Relationship status:', relationshipStatus);

        const response = {
            ...user._doc, // Include user data
            subscription: user.subscription?._id ? {
                ...user.subscription._id._doc, // Unwrap the subscription object fields
                expireDate: user.subscription.expireDate
            } : null, // Handle case when user doesn't have a subscription
            ...relationshipStatus,
            loggedIn: req.auth && req.auth._id.toString() === user._id.toString(), // Ensure loggedIn is set correctly
            online: user.loggedIn // Set the user's online status
        };

        console.log('Sending user profile:', response);

        return res.status(200).send({ data: response });
    } catch (err) {
        console.error('Error fetching user profile:', err);
        return res.status(500).send('Server error');
    }
};



exports.getFriends = async (req, res) => {
    try {
        const limit = 20;
        const page = parseInt(req.query.page, 10);

        if (isNaN(page) || page < 0) {
            console.error('Invalid page parameter:', req.query.page);
            return res.status(400).json({ error: 'Invalid page parameter' });
        }

        console.log('Authenticated user:', req.authUser);

        if (!req.authUser || !req.authUser._id) {
            console.error('req.authUser is undefined or does not have _id');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = new mongoose.Types.ObjectId(req.authUser._id);

        const user = await User.findById(userId);
        if (!user) {
            console.error('User not found:', userId);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('User document:', user);

        const filter = {
            _id: { $in: user.friends }
        };

        console.log('Filter being used:', filter);

        const friends = await User.find(filter, {
            firstName: 1,
            lastName: 1,
            birthDate: { $cond: [{ $eq: ['$ageVisible', true] }, '$birthDate', null] },
            avatar: 1,
            mainAvatar: 1,
            city: 1,
        })
        .skip(limit * page)
        .limit(limit)
        .exec();

        if (!friends || friends.length === 0) {
            console.warn('No friends found for user:', userId);
            return res.status(200).json({ friends: [], more: false });
        }

        const count = await User.find(filter).countDocuments();

        const friendsWithOnlineStatus = friends.map(friend => ({
            ...friend._doc, // Spread the existing friend fields
            isFriend: true // Indicate this user is a friend
        }));

        return res.status(200).json({
            friends: friendsWithOnlineStatus,
            more: (count - (limit * (page + 1))) > 0
        });

    } catch (err) {
        console.error('Error in getFriends:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};



exports.removeFriendship = async(req, res) => {
    try{
        const authUser = req.authUser
        const user = req.user
        await User.updateOne({_id: user._id}, { $pull: { friends: authUser._id } })
        await User.updateOne({_id: authUser._id}, { $pull:{ friends:  user._id } })
        return Response.sendResponse(res, true, 'Friendship is removed')
    }catch(err){
        console.log(err);
        return Response.sendError(res, 400, 'failed')
    }
}

exports.blockUser = async (req, res) => {
    try {
      const user = req.user;
      const authUser = req.authUser;
  
      // Remove user from the lists of friends, followers, and following
      user.friends = user.friends.filter(friend => !friend.equals(authUser._id));
      user.followers = user.followers.filter(follower => !follower.equals(authUser._id));
      user.following = user.following.filter(following => !following.equals(authUser._id));
  
      // Block the user and update authUser's lists
      authUser.blockedUsers.push(user._id);
      authUser.friends = authUser.friends.filter(friend => !friend.equals(user._id));
      authUser.followers = authUser.followers.filter(follower => !follower.equals(user._id));
      authUser.following = authUser.following.filter(following => !following.equals(user._id));
  
      // Save both authUser and user (use async/await for both saves)
      await authUser.save();
      await user.save();
  
      // Remove any requests between the two users
      await Request.deleteMany({
        $or: [
          {
            $and: [
              { from: new mongoose.Types.ObjectId(req.auth._id) },
              { to: new mongoose.Types.ObjectId(req.user._id) }
            ]
          },
          {
            $and: [
              { to: new mongoose.Types.ObjectId(req.auth._id) },
              { from: new mongoose.Types.ObjectId(req.user._id) }
            ]
          }
        ]
      });
  
      // Send a successful response
      return Response.sendResponse(res, true, 'User blocked');
      
    } catch (err) {
      console.error(err);
      return Response.sendError(res, 500, 'Internal Server Error');
    }
  };
exports.unblockUser = (req, res) => {
    User.updateOne({_id: req.auth._id}, { $pull: { blockedUsers: req.user._id }}, (err, user) => {
        if(err || !user) return Response.sendError(res, 400, 'failed')
        return Response.sendResponse(res, true, 'user unblocked')
    })
}

exports.updateRandomVisibility = async (req, res) => {
    try {
        const { userId, visible } = req.body;
        console.log('Request body:', req.body);  // Log the request body

        // Use async/await to handle the promise returned by updateOne
        const result = await User.updateOne({ _id: userId }, { $set: { randomVisible: visible }});

        if (result.nModified === 0) {
            console.log('No modification occurred:', result);  // Log no modification
            return Response.sendError(res, 400, 'Failed, please try again later');
        }

        return Response.sendResponse(res, true, 'Updated');
    } catch (error) {
        console.log('Exception error:', error);  // Log exception error
        return Response.sendError(res, 500, 'Internal Server Error');
    }
};

  

exports.updateAgeVisibility = async (req, res) => {
    try {
        console.log(req.body.visible);
        
        // Update the user's age visibility using async/await
        const user = await User.updateOne({ _id: req.auth._id }, { $set: { ageVisible: req.body.visible } });

        if (!user || user.nModified === 0) {
            // If the user isn't found or no documents were modified
            return Response.sendError(res, 400, 'Failed to update, please try again later');
        }
        
        // Successfully updated
        return Response.sendResponse(res, true, 'Age visibility updated');
    } catch (error) {
        console.error(error);
        return Response.sendError(res, 500, 'Internal server error');
    }
};

fileExtension = (fileName) => {
    nameParts = fileName.split('.')
    return nameParts[nameParts.length - 1]
}

exports.profileVisited = async(req, res) => {
    try {
        const authUser = req.authUser;
        if (!authUser) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        console.log('AuthUser before update:', authUser); // Log authUser before update
        console.log('before Avatar URLs:', authUser.avatar);
        console.log('before Main Avatar URL:', authUser.mainAvatar);

        authUser.visitProfile = true;
        await authUser.save();
        console.log('AuthUser after update:', authUser); // Log updated authUser
        console.log('after  Avatar URLs:', authUser.avatar);
        console.log('after Main Avatar URL:', authUser.mainAvatar);

        // Add headers to prevent caching
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.set('Surrogate-Control', 'no-store');

        return res.status(200).json({ message: 'Profile visited' });
    } catch (error) {
        console.error('Error visiting profile:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}
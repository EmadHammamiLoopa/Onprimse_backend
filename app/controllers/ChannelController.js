const mongoose = require("mongoose")
const Channel = require("../models/Channel")
const Response = require("./Response")
const path = require('path')
const fs = require('fs')
const { extractDashParams, report, sendNotification } = require("../helpers")
const _ = require('lodash')
const Report = require("../models/Report")
const Post = require("../models/Post");
const { destroyPost } = require("./PostController")
const User = require("../models/User")
const Comment = require("../models/Comment")





exports.reportChannel = async (req, res) => {
    try {
        const channel = req.channel;
        if (!req.body.message) return Response.sendError(res, 400, 'please enter a message');

        const reportData = await report(req, res, 'channel', channel._id);
        await Channel.updateOne({ _id: channel._id }, { $push: { reports: reportData } });

        return Response.sendResponse(res, null, 'Thank you for reporting');
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.clearChannelReports = async (req, res) => {
    try {
        await Report.deleteMany({
            "entity._id": req.channel._id,
            "entity.name": "channel"
        });

        return Response.sendResponse(res, null, "reports cleaned");
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to clear reports');
    }
};


exports.toggleChannelStatus = async (req, res) => {
    try {
        const channel = req.channel;
        channel.enabled = !channel.enabled;
        await channel.save();

        return Response.sendResponse(res, channel);
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Failed to update channel status');
    }
};


exports.toggleChannelApprovement = async (req, res) => {
    try {
        const channel = req.channel;
        channel.approved = !channel.approved;
        await channel.save();

        return Response.sendResponse(res, channel);
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Failed to update channel approval');
    }
};

exports.showChannel = async (req, res) => {
    try {
        const channel = await Channel.findOne({ _id: req.channel._id }, {
            name: 1,
            description: 1,
            country: 1,
            city: 1,
            user: 1,
            approved: 1,
            photo: { $concat: ["http://127.0.0.1:3300", "$photo.path"] },
            enabled: 1,
            reports: 1
        }).populate('reports');

        return Response.sendResponse(res, channel);
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Failed to retrieve channel');
    }
};


exports.allPosts = async (req, res) => {
    try {
        // Extract parameters for filtering, sorting, and pagination
        const { filter, sort, skip, limit } = extractDashParams(req, ['text', 'channel', 'user', 'visibility']);

        // First, count the total number of posts matching the filter
        const totalPostsCount = await Post.countDocuments(filter);

        // Fetch all posts with full admin control, including anonymous information
        const posts = await Post.aggregate([
            { $match: filter },  // Apply filter from query params
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userDetails'
                }
            },
            {
                $unwind: '$userDetails'  // Unwind the userDetails array
            },
            {
                $project: {
                    text: 1,
                    media: 1,
                    visibility: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    anonymName: 1,
                    user: '$userDetails._id',
                    realName: {
                        $cond: {
                            if: { $eq: ['$anonymName', null] },
                            then: {
                                $concat: [
                                    { $ifNull: ['$userDetails.firstName', ''] }, 
                                    ' ', 
                                    { $ifNull: ['$userDetails.lastName', ''] }
                                ]
                            },
                            else: '$anonymName'
                        }
                    },  // Show real name if not anonymous, otherwise show anonymous name
                    comments: { $size: '$comments' },
                    reports: { $size: '$reports' },
                    channel: 1,
                }
            },
            { $sort: sort },  // Apply sorting based on query params
            { $skip: skip },  // Apply pagination
            { $limit: limit }  // Limit the number of posts returned
        ]);

        // Return the response to the admin with full control over the posts
        return Response.sendResponse(res, {
            docs: posts,
            totalPages: Math.ceil(totalPostsCount / limit),
            currentPage: skip / limit + 1
        });
    } catch (err) {
        console.error('Error fetching posts for admin:', err);
        return Response.sendError(res, 500, 'Server error, please try again later.');
    }
};



exports.allChannels = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['name', 'description', 'country', 'city']);

        const channels = await Channel.aggregate()
            .match(dashParams.filter)
            .project({
                name: 1,
                description: 1,
                approved: 1,
                city: 1,
                country: 1,
                photo: "$photo.path",
                enabled: 1,
                reports: { $size: "$reports" }
            })
            .sort(dashParams.sort)
            .skip(dashParams.skip)
            .limit(dashParams.limit);

        const count = await Channel.find(dashParams.filter).countDocuments();

        return Response.sendResponse(res, {
            docs: channels,
            totalPages: Math.ceil(count / dashParams.limit)
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};


exports.exploreChannels = async (req, res) => {
    try {
        const limit = 20;
        const userId = new mongoose.Types.ObjectId(req.auth._id);
        const { level = 'city', search = '', page = 0 } = req.query;

        let filter = {
            static: false,  // Exclude static channels
            followers: { $ne: userId },
            name: new RegExp('^' + search, 'i'),
            user: { $ne: userId },
            deletedAt: null,
            type: { $nin: ['static', 'static_events','static_dating'] } // Exclude both static and static_events types
        };
        let message = '';
        let promptFor = '';

        // Determine the filter based on the level
        if (level === 'city') {
            filter = {
                city: req.authUser.city,
                type: { $nin: ['static', 'static_events','static_dating'] } // Exclude both static and static_events types
            };
            message = "No channels found in your city. Would you like to explore channels in your country?";
            promptFor = 'country';
        } else if (level === 'country') {
            filter = {
                country: req.authUser.country,
                type: { $nin: ['static', 'static_events','static_dating'] } // Exclude both static and static_events types
            };
            message = "No channels found in your country. Would you like to explore channels around the world?";
            promptFor = 'global';
        } else {
            // Global level, no location filter but exclude static channels globally
            filter = {
                type: { $nin: ['static', 'static_events','static_dating'] } // Exclude both static and static_events types
            };
            message = "No channels found around the world.";
        }

        // Common filters for all levels
        filter = {
            ...filter,
            followers: { $ne: userId },
            name: new RegExp('^' + search, 'i'),
            user: { $ne: userId },
            deletedAt: null
        };

        // Fetch channels based on the filter
        let channels = await Channel.find(filter, {
            name: 1,
            description: 1,
            photo: "$photo.path",
            user: 1,
            followers: 1,
            type: 1,
        })
        .skip(limit * page)
        .limit(limit);

        // If channels are found, return them
        if (channels.length > 0) {
            const count = await Channel.find(filter).countDocuments();
            return Response.sendResponse(res, {
                channels,
                more: (count - (limit * (+page + 1))) > 0
            });
        } else {
            // No channels found at this level, prompt for the next level if applicable
            return Response.sendResponse(res, {
                channels: channels || [],
                message,
                promptFor
            });
        }
    } catch (err) {
        console.error("Error exploring channels:", err);
        return Response.sendError(res, 500, "Server error, please try again later");
    }
};



// Step 2: Explore Country Channels (triggered by user's confirmation)
exports.exploreCountryChannels = async (req, res) => {
    try {
        const limit = 20;
        const userId = new mongoose.Types.ObjectId(req.auth._id);

        // Fetch channels from the user's country
        const countryFilter = {
            country: req.authUser.country,
            followers: { $ne: userId },
            name: new RegExp('^' + req.query.search, 'i'),
            user: { $ne: userId },
            deletedAt: null,
            type: { $nin: ['static', 'static_events','static_dating'] } // Exclude both static and static_events types
        };

        let channels = await Channel.find(countryFilter, {
            name: 1,
            description: 1,
            photo: "$photo.path",
            user: 1,
            followers: 1,
            type: 1,
        })
        .skip(limit * req.query.page)
        .limit(limit);

        // If channels are found in the country, return them
        if (channels.length > 0) {
            const count = await Channel.find(countryFilter).countDocuments();
            return Response.sendResponse(res, {
                channels,
                more: (count - (limit * (+req.query.page + 1))) > 0
            });
        } else {
            // No channels found in the country, prompt user to explore global channels
            return Response.sendResponse(res, {
                channels: channels || [],
                message: "No channels found in your country. Would you like to explore channels around the world?",
                promptFor: 'global' // Prompt the client to confirm exploring global channels
            });
        }
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, "Server error, please try again later");
    }
};

// Step 3: Explore Global Channels (triggered by user's confirmation)
exports.exploreGlobalChannels = async (req, res) => {
    try {
        const limit = 20;
        const userId = new mongoose.Types.ObjectId(req.auth._id);

        // Fetch global channels
        const globalFilter = {
            followers: { $ne: userId },
            name: new RegExp('^' + req.query.search, 'i'),
            user: { $ne: userId },
            deletedAt: null,
            type: { $nin: ['static', 'static_events','static_dating'] } // Exclude both static and static_events types
        };

        let channels = await Channel.find(globalFilter, {
            name: 1,
            description: 1,
            photo: "$photo.path",
            user: 1,
            followers: 1,
            type: 1,
        })
        .skip(limit * req.query.page)
        .limit(limit);

        // If channels are found globally, return them
        if (channels.length > 0) {
            const count = await Channel.find(globalFilter).countDocuments();
            return Response.sendResponse(res, {
                channels,
                more: (count - (limit * (+req.query.page + 1))) > 0
            });
        } else {
            // No channels found globally, send final message
            return Response.sendResponse(res, {
                channels: channels || [],
                message: "No channels found around the world."
            });
        }
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, "Server error, please try again later");
    }
};



exports.followedChannels = async (req, res) => {
    console.log('Received request for followed channels:', req.query);
    console.log('Authenticated user ID:', req.auth ? req.auth._id : 'No user ID');
    try {
        const user = req.authUser;
        // Ensure the request contains valid user data
            if (!req.authUser) {
                return Response.sendError(res, 400, 'User not authenticated');
            }
            if (!req.authUser.city) {
                return Response.sendError(res, 400, 'User city information missing');
            }

        // Unfollow old city static channels if the user has changed their city
        await unfollowOldCityStaticChannels(req, user);

        // Ensure static channels for the user's current city exist
        await createStaticChannelsForCity(user.city, user.country, user);
        
        // Ensure the user is following the static channels

        // Define filter to get the channels the user is following
        const filter = {
            followers: {
                $elemMatch: {
                    $eq: new mongoose.Types.ObjectId(req.auth._id)
                }
            },
            name: new RegExp('^' + req.query.search, 'i'),
            enabled: true
        };

        const limit = 20;
        const channels = await Channel.find(filter, {
            name: 1,
            description: 1,
            photo: "$photo.path",
            user: 1,
            approved: 1,
            followers: 1,
            type: 1,       // Include type
            city: 1,       // Include city
            country: 1,    // Include country
        })
        .skip(limit * req.query.page)
        .limit(limit);

        if (!channels) return Response.sendError(res, 400, 'Cannot retrieve channels');

        const count = await Channel.find(filter).countDocuments();
        return Response.sendResponse(res, {
            channels,
            more: (count - (limit * (+req.query.page + 1))) > 0
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Internal Server Error');
    }
};





const createStaticChannelsForCity = async (city, country, user) => {
    const systemUserId = new mongoose.Types.ObjectId('66c7ba8cb077a84040bd9ee6');
    
    const staticChannels = [
        {
            name: `${city} Local News`,
            description: `Stay updated with the latest news in ${city}.`,
            city,
            country,
            user: systemUserId,  // Make sure user is provided
            category: 'news',  // Provide a valid category
            type: 'static',  // Use the correct enum value for `type`
            static: true,  // Mark this as a static channel
            photo: {
                path: '/public/images/avatars/channelsavtar/news.webp',  // Default image path for Local News
                type: 'webp'
            }
        },
        {
            name: `${city} Arts and Culture`,
            description: `Connect with ${city}'s arts scene: theater, music, galleries, and festivals.`,
            city,
            country,
            user: systemUserId,
            category: 'Arts',
            type: 'static',
            static: true,
            photo: {
                path: '/public/images/avatars/channelsavtar/arts.webp',
                type: 'webp'
            }
        },
        
        {
            name: `${city} Lost & Found`,
            description: `Find or report lost items in ${city}. Help reunite belongings with their owners.`,
            city,
            country,
            user: systemUserId,
            category: 'Found',
            type: 'static',
            static: true,
            photo: {
                path: '/public/images/avatars/channelsavtar/found.webp',
                type: 'webp'
            }
        },
        
        {
            name: `${city} Neighborhood Watch`,
            description: `Stay safe in ${city}. Share security tips, updates, and alerts with your neighbors.`,
            city,
            country,
            user: systemUserId,
            category: 'Watch',
            type: 'static',
            static: true,
            photo: {
                path: '/public/images/avatars/channelsavtar/watch.webp',
                type: 'webp'
            }
        },
        {
            name: `${city} Events`,
            description: `Stay informed about upcoming events in ${city}, including their location and schedule.`,
            city,
            country,
            user: systemUserId,
            category: 'Events',
            type: 'static_events',
            static: true,
            calendar: [],
            time: '',
            location: '',
            photo: {
                path: '/public/images/avatars/channelsavtar/Events.webp',
                type: 'webp'
            }
        },
        {
            name: `${city} Dating`,
            description: `Find your match in ${city}. Connect with people based on interests, age, and relationship goals.`,
            city,
            country,
            user: systemUserId,
            category: 'Dating',
            type: 'static_dating',
            static: true,
            photo: {
                path: '/public/images/avatars/channelsavtar/dating.webp', // Adjust the path as necessary
                type: 'webp'
            },
            relationshipGoals: [], // User will choose their relationship goals (e.g., casual, long-term, friendship)
            ageRange: { min: null, max: null }, // Leave min and max null, to be filled by user
            interests: [], // User will select their interests or hobbies as tags
            hintAboutMe: '' // A free-text field where users can write something about themselves
        }
        
        

    ];

    for (const channelData of staticChannels) {
        // Check if the static channel already exists in the database
        let channel = await Channel.findOne({ name: channelData.name, city });
        if (!channel) {
            // If the static channel doesn't exist, create it
            channel = new Channel(channelData);
            await channel.save();
        }
        // Ensure the user is following the static channel
        if (!channel.followers.includes(user._id)) {
            channel.followers.push(user._id);  // Add user to channel's followers
        }

        // Ensure the channel is in the user's followedChannels array
        if (user && !user.followedChannels.includes(channel._id)) {
            user.followedChannels.push(channel._id);  // Add channel to user's followed channels
        }

        // Save the updated channel
        await channel.save();
    }

    // Save the updated user with followed channels
    await user.save();
};

const unfollowOldCityStaticChannels = async (req, user) => {
    console.log(`Checking for static channels to unfollow for user: ${user._id} in city: ${user.city}`);

    // Find all static, static_events, and static_dating channels the user follows
    const filter = {
        followers: {
            $elemMatch: {
                $eq: new mongoose.Types.ObjectId(req.auth._id)
            }
        },
        type: { $in: ['static', 'static_events', 'static_dating'] }, // Check for these types of channels
        enabled: true
    };

    const allStaticChannels = await Channel.find(filter, {
        name: 1,
        description: 1,
        photo: "$photo.path",
        user: 1,
        followers: 1,
        city: 1,     // Include the city field
        type: 1      // Include the type field
    });

    console.log('All static channels for this user.', allStaticChannels);

    if (allStaticChannels.length === 0) {
        console.log('No static channels found for this user.');
    } else {
        console.log('Listing all static channels the user is following:');
        allStaticChannels.forEach(channel => {
            console.log(`Channel: ${channel.name}, City: ${channel.city}, Type: ${channel.type}, User City: ${user.city}`);
        });
    }

    // Unfollow static channels if the city doesn't match the user's city
    for (const channel of allStaticChannels) {
        if (channel.city !== user.city) {
            console.log(`Unfollowing static channel: ${channel.name} as the city does not match`);

            // Remove the user from the channel's followers
            const followerIndex = channel.followers.indexOf(user._id);
            if (followerIndex !== -1) {
                channel.followers.splice(followerIndex, 1);
                await channel.save();
                console.log(`User ${user._id} removed from followers of channel ${channel.name}`);
            } else {
                console.log(`User ${user._id} not found in followers of channel ${channel.name}`);
            }

            // Remove the channel from the user's followedChannels array
            const channelIndex = user.followedChannels.indexOf(channel._id);
            if (channelIndex !== -1) {
                user.followedChannels.splice(channelIndex, 1);
                console.log(`Channel ${channel.name} removed from user's followedChannels`);
            } else {
                console.log(`Channel ${channel.name} not found in user's followedChannels`);
            }
        }
    }

    // Save the updated user with the removed followed channels
    await user.save();
    console.log('Unfollowed channels saved for user:', user._id);
};



exports.myChannels = async (req, res) => {
    try {
        const filter = {
            user: new mongoose.Types.ObjectId(req.auth._id),
            name: new RegExp('^' + req.query.search, 'i'),
            enabled: true
        };
        const limit = 20;

        const channels = await Channel.find(filter, {
            name: 1,
            description: 1,
            photo: "$photo.path",
            user: 1,
            followers: 1,
            approved: 1
        })
            .skip(limit * req.query.page)
            .limit(limit);

        const count = await Channel.find(filter).countDocuments();

        return Response.sendResponse(res, {
            channels,
            more: (count - (limit * (+req.query.page + 1))) > 0
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.storeChannel = async (req, res) => {
    try {
        let channel = new Channel(req.fields);
        channel.user = req.auth._id;

        // Automatically add the creator as a follower
        channel.followers.push(req.auth._id);

        // Set country and city from authUser if not provided
        if (!channel.country || !channel.city) {
            channel.country = req.authUser.country;
            channel.city = req.authUser.city;
        }

        // Handle storing the channel photo
        if (req.files.photo) {
            storeChannelPhoto(req, channel);
        } else {
            return Response.sendError(res, 400, 'Photo is required');
        }

        // Save the channel
        await channel.save();

        // Update the photo path with the base URL
        channel.photo.path = process.env.BASEURL + channel.photo.path;

        return Response.sendResponse(res, channel, 'The channel has been created successfully');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};



storeChannelPhoto = (req, channel) => {
    try{
        let photoName = ""
        const photo = req.files.photo
        if(photo){
            photoName = `${ channel._id }.png`
            const photoPath = path.join(__dirname, `./../../public/channels/${ photoName }`)
            fs.writeFileSync(photoPath, fs.readFileSync(photo.path))
        }else{
            photoName = 'channel-default.png'
        }

        channel.photo.path = `/channels/${ photoName }`
        channel.photo.type = 'png'
    }catch(err){
        console.log(err);
    }
}

exports.updateChannel = (req, res) => {
    try {
        console.log('channel update')
        const fields = _.omit(req.fields, ['photo'])

        let channel = _.extend(req.channel, fields)

        if(req.files.photo)
            storeChannelPhoto(req, channel)
        
        channel.global = fields.global ? (fields.global == 'undefined' ? false : true) : false;
        channel.save((err, channel) => {
            console.log(err);
            if(err) return Response.sendError(res, 400, 'could not update channel')
            return Response.sendResponse(res, channel, 'the channel has been updated successfully')
        })
    } catch (error) {
        console.log(error);
    }
}

exports.disableChannel = (req, res) => {
    const channel = req.channel
    channel.enabled = false;
    channel.save((err, channel) => {
        if(err) Response.sendError(res, 400, 'could not remove channel');
        return Response.sendResponse(res, null, 'channel removed')
    })
}

exports.deleteChannel = async(req, res) => {
    try {
        const channel = req.channel
        this.destroyChannel(res, channel._id, (res) => Response.sendResponse(res, null, 'channel removed'))
    } catch (error) {
        console.log(err);
    }
}

exports.followChannel = async (req, res) => {
    try {
        const channel = req.channel;
        const user = req.authUser;

        // Prevent unfollowing of static channels
        if (channel.static) {
            return Response.sendError(res, 400, 'You cannot unfollow static channels');
        }

        let followed = false;

        // Handle following/unfollowing the channel
        if (user && !channel.followers.includes(user._id)) {
            channel.followers.push(user._id);
            followed = true;
        } else {
            const index = channel.followers.indexOf(user._id);
            if (index !== -1) {
                channel.followers.splice(index, 1);
            }
        }

        // Handle user's followed channels
        if (!user.followedChannels.includes(channel._id)) {
            user.followedChannels.push(channel._id);
            followed = true;
        } else {
            const index = user.followedChannels.indexOf(channel._id);
            if (index !== -1) {
                user.followedChannels.splice(index, 1);
            }
        }

        // Save the channel and user changes
        await channel.save();
        await user.save();

        // Send notification if followed
        if (followed) {
            sendNotification({
                en: channel.name
            }, {
                en: `${req.authUser.firstName} ${req.authUser.lastName} started following the channel`
            }, {
                type: 'follow-channel',
                link: `/tabs/channels/channel?channel=${channel._id}`
            }, [], [channel.user]);
        }

        return Response.sendResponse(res, followed, followed ? `followed` : `unfollowed`);
    } catch (err) {
        console.log('Error following/unfollowing channel:', err);
        return Response.sendError(res, 500, 'Failed to update followers');
    }
};


exports.destroyChannel = async (res, channelId, callback) => {
    try {
        await Channel.deleteMany({ _id: channelId });
        await Report.deleteMany({ "entity.id": channelId, "entity.name": 'channel' });

        const posts = await Post.find({ channel: channelId });
        posts.forEach(post => destroyPost(res, post._id, null));

        if (callback) return callback(res);
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Failed to delete channel');
    }
};


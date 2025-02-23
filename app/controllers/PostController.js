const e = require("express");
const mongoose = require("mongoose");
const { report, extractDashParams, sendNotification } = require("../helpers");
const Channel = require("../models/Channel");
const Comment = require("../models/Comment");
const Post = require("../models/Post");
const Report = require("../models/Report");
const { destroyComment } = require("./CommentController");
const Response = require("./Response");
const { generateAnonymName, withVotesInfo } = require(".././nameGenerator")


const multer = require('multer');

// Define storage for the uploaded files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Set your upload directory here
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname); // Set the file name dynamically
    }
});

// Create an upload instance with the storage settings
const upload = multer({ storage: storage });




exports.reportPost = async (req, res) => {
    try {
        const post = req.post;

        // Log the request body to verify `reportType`
        console.log('Request body:', req.body);

        if (!req.body.message) {
            return Response.sendError(res, 400, 'Please enter a message');
        }

        // Hardcoding `reportType` for testing purposes
        if (!req.body.reportType) {
            req.body.reportType = 'Other'; // Temporary fixed report type for testing
            console.log('Report type fixed for testing:', req.body.reportType);
        }

        // Call the `report` function
        const reportInstance = await report(req, res, 'Post', post._id);

        // Update the post with the new report
        await Post.updateOne({ _id: post._id }, { $push: { reports: reportInstance } });

        // Fetch and return the updated post with full report details
        const updatedPost = await Post.findOne({ _id: post._id })
            .populate({ path: 'reports', model: 'Report' });
        return Response.sendResponse(res, null, 'Thank you for reporting');
    } catch (error) {
        console.error('Error reporting post:', error);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};






exports.channelPosts = (req, res) => {
    try{
        const channel = req.channel
        const dashParams = extractDashParams(req, ['text'])
        Post.aggregate()
        .match({
            channel: channel._id,
            ...dashParams.filter
        })
        .project({
            text: 1,
            user: 1,
            channel: 1,
            reports: 1,
            comments: {
                $size: "$comments"
            }
        })
        .sort(dashParams.sort)
        .skip(dashParams.skip)
        .limit(dashParams.limit)
        .exec(async(err, posts) => {
            if(err || !posts) return Response.sendError(res, 500, 'Server error, please try again later');
            const count = await Post.find({
                channel: channel._id,
                ...dashParams.filter
            }).countDocuments();
            return Response.sendResponse(res, {
                docs: posts,
                totalPages: Math.ceil(count / dashParams.limit)
            });
        });
    }catch(err){
        console.log(err);
    }
}


exports.updateVisibility = (req, res) => {
    const { postId } = req.params;
    const { visibility } = req.body;

    if (!['public', 'private', 'friends-only'].includes(visibility)) {
        return res.status(400).json({ message: 'Invalid visibility option' });
    }

    Post.findByIdAndUpdate(postId, { visibility }, { new: true })
        .exec((err, updatedPost) => {
            if (err || !updatedPost) {
                return res.status(500).json({ message: 'Could not update visibility' });
            }
            res.json({ message: 'Visibility updated successfully', post: updatedPost });
        });
};

exports.showPost = async (req, res) => {
    try {
        const post = await Post.findOne({ _id: req.post._id })
            .populate({
                path: 'comments',
                populate: {
                    path: 'user',
                    select: 'firstName lastName'
                }
            })
            .populate('user', 'firstName lastName')
            .populate({ path: 'reports', model: 'Report' })
            .exec();

        if (!post) {
            return Response.sendError(res, 400, 'Post not found or unauthorized');
        }

        // ✅ Ensure the correct anonymous name is included in the response
        if (post.anonyme) {
            if (!post.anonymName) {
                post.anonymName = generateAnonymName(post.user, post._id);
                await post.save(); // Store it permanently
            }
        }

        const postWithVotes = withVotesInfo(post, req.auth._id, post._id);

        console.log("showPost response", postWithVotes);
        return Response.sendResponse(res, postWithVotes);

    } catch (err) {
        console.error('Error in showPost:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};





exports.showDashPost = async (req, res) => {
    try {
        // Fetch the post by its ID
        const post = await Post.findById(req.post._id)
        .populate({ path: 'reports', model: 'Report' }) // Ensure reports are correctly populated
        .exec();
        console.log("we hrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr");
        // If post is not found, return an error
        if (!post) {
            return Response.sendError(res, 400, 'Post not found');
        }
        
        // Add vote information to the post
        const postWithVotes = withVotesInfo(post, req.auth._id);
        
        // Return the post with the additional vote information
        return Response.sendResponse(res, postWithVotes);
        
    } catch (err) {
        // Log the error and return a server error response
        console.error(err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.storePost = async (req, res) => {

    console.log('we are in storepost');

    try {
        // Process media upload first (use multer's single file upload)
        upload.single('media')(req, res, async function (err) {
            if (err) {
                console.error('Multer Error:', err);  // Handle multer errors
                return Response.sendError(res, 400, 'Error uploading media');
            }

            console.log('Multer processed request successfully');
            console.log('Request Body:', req.body);  // Log the text and anonymity status
            console.log('Uploaded File:', req.file);  // Log the file info if any

            // Create a new post
            const post = new Post({
                ...req.body,
                channel: req.channel._id,
                user: req.auth._id,
                anonymName: req.body.anonyme ? generateAnonymName() : null  // Generate anonymName if anonyme is true
            });
            if (req.body.eventDate) {
                post.eventDate = req.body.eventDate;
            }
            if (req.body.eventLocation) {
                post.eventLocation = req.body.eventLocation;
            }
            if (req.body.eventTime) {
                post.eventTime = req.body.eventTime;
            }

            // Dating-specific fields
            if (req.body.relationshipGoals) {
                post.relationshipGoals = req.body.relationshipGoals;
            }
            if (req.body.ageRangeMin || req.body.ageRangeMax) {
                post.ageRange = {
                    min: req.body.ageRangeMin,
                    max: req.body.ageRangeMax
                };
            }
            if (req.body.interests) {
                post.interests = req.body.interests.split(',').map(interest => interest.trim());
            }
            if (req.body.hintAboutMe) {
                post.hintAboutMe = req.body.hintAboutMe;
            }
            
            // If media is uploaded, attach it to the post
            if (req.file) {
                post.media = {
                    url: req.file.path, // Store the file path
                    expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // Set a 24-hour expiry for the media
                };
                console.log('Media attached to post:', post.media);
            }

            console.log('Saving Post:', post);

            // Save the post to the database
            const savedPost = await post.save();
            console.log('Saved Post:', savedPost);

            // Populate the user details (firstName, lastName) immediately after saving
            const populatedPost = await Post.populate(savedPost, { path: 'user', select: 'firstName lastName' });
            console.log('Populated Post:', populatedPost);

            if (!populatedPost) {
                return Response.sendError(res, 400, 'Error populating post data');
            }

            // Add votes info to the post
            const processedPost = withVotesInfo(populatedPost, req.auth._id, savedPost._id);
            console.log('Post with Votes Info:', processedPost);

            // Send notification to channel followers and friends (excluding the author)
            const notificationTitle = populatedPost.anonymName || `${req.authUser.firstName} ${req.authUser.lastName}`;
         //   sendNotification(
           //     { en: req.channel.name },
           //     { en: `${notificationTitle} shared a new post` },
            //    {
            //        type: 'new-channel-post',
             //       link: `/tabs/channels/post/${populatedPost._id}`
            //    },
            //    [],
            //    [...req.channel.followers, req.channel.user].filter(id => id !== req.auth._id && req.authUser.friends.includes(id))
           // );
           // console.log('Notification sent for new post');

            // Return the populated post as the response
            console.log('Returning Populated Post:', processedPost);
            return Response.sendResponse(res, processedPost, 'Post created');
        });
    } catch (err) {
        console.log('Error in storePost:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.getPosts = async (req, res) => {
    try {
        const { channelId } = req.params;
        const { page = 0 } = req.query;
        const limit = 10;

        const visibilityQuery = {
            channel: channelId,
            $or: [
                { visibility: 'public' },
                { visibility: 'private', user: req.auth._id },
                { visibility: 'friends-only', user: { $in: req.authUser.friends } },
                { user: req.auth._id }
            ]
        };

        // Fetch posts based on visibility query
        const posts = await Post.find(visibilityQuery)
            .populate({
                path: 'comments',
                populate: {
                    path: 'user',
                    select: 'firstName lastName'
                }
            })
            .populate('user', 'firstName lastName')
            .populate({ path: 'reports', model: 'Report' })
            .sort({ createdAt: -1 })
            .skip(page * limit)
            .limit(limit)
            .exec();

        if (!posts) {
            return Response.sendError(res, 400, 'Could not get the posts');
        }

        // ✅ Ensure Anonymous Name is Always Stored and Used
        const postsWithVotes = posts.map(post => {
            if (post.anonyme) {
                // If anonymName is missing, generate and store it permanently
                if (!post.anonymName) {
                    post.anonymName = generateAnonymName(post.user, post._id);
                    post.save(); // Ensure it's stored in the database
                }
            }
            return withVotesInfo(post, req.auth._id, post._id);
        });

        console.log("getPosts hit, posts:", postsWithVotes);

        // Count total number of posts matching the query
        const count = await Post.countDocuments(visibilityQuery).exec();

        // Return posts with pagination info
        return Response.sendResponse(res, {
            posts: postsWithVotes,
            more: (count - (limit * (parseInt(page) + 1))) > 0
        });

    } catch (err) {
        console.error('Error in getPosts:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.voteOnPost = (req, res) => {
    try{
        const post = req.post

        const userVoteInd =  post.votes.findIndex(vote => vote.user == req.auth._id)
        console.log(userVoteInd);
        if(userVoteInd != -1){
            if(post.votes[userVoteInd].vote != req.body.vote)
                post.votes.splice(userVoteInd, 1)
        }else{
            post.votes.push({
                user: req.auth._id,
                vote: req.body.vote
            });
        }

        post.save((err, post) => {
            if(err || !post) return Response.sendError(res, 400, 'failed')
            post = withVotesInfo(post, req.auth._id, post._id);
            
            if(userVoteInd && post.user != req.auth._id)
                Channel.findOne({_id: post.channel}, (err, channel) => {
                    sendNotification(
                        {en: channel.name},
                        {en: (post.anonyme ? 'Anonym' : req.authUser.firstName + ' ' + req.authUser.lastName) + ' has voted on your post'}, 
                        {
                            type: 'vote-channel-post',
                            link: '/tabs/channels/post/' + post._id
                        }, 
                        [], 
                        [post.user]
                    )
                })
            return Response.sendResponse(res, {
                votes: post.votes,
                voted: userVoteInd != -1
            }, 'voted')
        })
    }catch(err){
        console.log(err);
    }
}

exports.deletePost = (req, res) => {
    try {
        const post = req.post
        this.destroyPost(res, post._id, (res) => Response.sendResponse(res, null, 'post removed'))
        
    } catch (error) {
        console.log(error);
    }
}

exports.destroyPost = async (res, postId, callback) => {
    try {
        // Delete the post
        await Post.deleteOne({ _id: postId });
        
        // Delete related reports
        await Report.deleteMany({ "entity.id": postId, "entity.name": 'post' });
        await Report.deleteMany({ "entity.id": { $in: comments.map(comment => comment._id) }, "entity.name": 'comment' }); // Delete reports for comments

        // Find and delete related comments
        const comments = await Comment.find({ post: postId });
        for (const comment of comments) {
            await exports.destroyComment(res, comment._id);  // Updated to await
        }

        // If a callback is provided, call it after everything is deleted
        if (callback) {
            return callback(res);
        }

        return Response.sendResponse(res, null, 'Post and related data deleted successfully');

    } catch (err) {
        console.error('Error deleting post and related data:', err);
        if (!res.headersSent) {
            return Response.sendError(res, 500, 'Error deleting post');
        }
    }
};


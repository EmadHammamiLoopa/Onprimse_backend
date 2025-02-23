const { report, extractDashParams, sendNotification } = require("../helpers")
const Channel = require("../models/Channel")
const Post = require("../models/Post")
const Comment = require("../models/Comment")
const Report = require("../models/Report")
const Response = require("./Response")
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


exports.showComment = async (req, res) => {
    try {
        // Find the comment by ID
        const comment = await Comment.findOne({ _id: req.comment._id }).populate('reports');;
        console.log('responseData in comment:', comment);

        if (!comment) {
            return Response.sendError(res, 400, 'Comment not found');
        }

        // Convert Mongoose document to plain object for modification
        let responseData = comment.toObject();
        console.log('responseData in responseData:', responseData);

        // Check if media is attached and format URL if present
        if (comment.media && comment.media.url) {
            responseData.mediaUrl = `http://127.0.0.1:3300/${comment.media.url.replace(/\\/g, '/')}`; // Set mediaUrl field with formatted URL
            responseData.mediaExpiryDate = comment.media.expiryDate; // Set mediaExpiryDate field with expiry date
        } else {
            // No media attached
            responseData.mediaUrl = null;
            responseData.mediaExpiryDate = null;
        }

        // Remove the original media field (optional)
        delete responseData.media;

        // Return the full comment with media details (mediaUrl and mediaExpiryDate)
        return Response.sendResponse(res, responseData);
    } catch (err) {
        console.error('Error in showComment:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};



exports.reportComment = async (req, res) => {
    try {
        const comment = req.comment;
        if (!req.body.message) return Response.sendError(res, 400, 'Please enter a message');

        // Report the comment and return the full report details
        const reportData = await report(req, res, 'comment', comment._id);
        await Comment.updateOne({ _id: comment._id }, { $push: { reports: reportData } });

        // Fetch and return the updated comment with report details
        const updatedComment = await Comment.findOne({ _id: comment._id })
            .populate({
                path: 'reports',
                model: 'Report'
            });

        return Response.sendResponse(res, updatedComment, 'Thank you for reporting');
    } catch (error) {
        console.error('Error in reportComment:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.postComments = async (req, res) => {
    try {
        const post = req.post;
        const dashParams = extractDashParams(req, ['text']);
        
        const comments = await Comment.aggregate()
            .match({ post: post._id, ...dashParams.filter })
            .project({
                text: 1,
                user: 1,
                post: 1,
                reports: 1 // Include full report details
            })
            .sort(dashParams.sort)
            .skip(dashParams.skip)
            .limit(dashParams.limit)
            .exec();

        if (!comments) return Response.sendError(res, 500, 'Server error, please try again later');

        const count = await Comment.find({ post: post._id, ...dashParams.filter }).countDocuments();

        return Response.sendResponse(res, {
            docs: comments,
            totalPages: Math.ceil(count / dashParams.limit)
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};




exports.storeComment = async (req, res) => {
    try {
        upload.single('media')(req, res, async function (err) {
            if (err) {
                console.error('Multer Error:', err);
                return Response.sendError(res, 400, 'Error uploading media');
            }

            console.log('Multer processed request successfully');
            console.log('Request Body:', req.body);
            console.log('Uploaded File:', req.file);

            const post = req.post;
            let anonymName = null;

            if (req.body.anonyme === 'true') {
                // Ensure that the user always gets the same anonymous name from the post
                if (!post.anonymName) {
                    post.anonymName = generateAnonymName(req.auth._id, post._id);
                    await post.save();  // Ensure consistency across all comments
                }
                anonymName = post.anonymName;
                console.log('Using post anonymName:', anonymName);
            }

            // Create a new comment
            const comment = new Comment({
                text: req.body.text.trim(),
                user: req.auth._id,
                post: post._id,
                anonymName: anonymName, // Use the same anonymous name as the post
                anonyme: req.body.anonyme === 'true'
            });

            // If media is uploaded, attach it to the comment
            if (req.file) {
                comment.media = {
                    url: req.file.path,
                    expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
                };
                console.log('Media attached to comment:', comment.media);
            }

            console.log('Saving Comment:', comment);
            const savedComment = await comment.save();
            console.log('Saved Comment:', savedComment);

            // Populate the user details (firstName, lastName) immediately after saving
            const populatedComment = await Comment.populate(savedComment, { path: 'user', select: 'firstName lastName' });
            console.log('Populated Comment:', populatedComment);

            if (!populatedComment) {
                return Response.sendError(res, 400, 'Error populating comment data');
            }

            // Add votes info to the comment
            const commentWithVotes = withVotesInfo(populatedComment, req.auth._id, post._id);
            console.log('Comment with Votes Info:', commentWithVotes);

            // Push the new comment into the post's comment list
            post.comments.push(commentWithVotes._id);
            await post.save();
            console.log('Updated Post with New Comment:', post);

            return Response.sendResponse(res, commentWithVotes, 'Comment created');
        });
    } catch (err) {
        console.log('Error in storeComment:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};




exports.voteOnComment = async (req, res) => {
    try {
        const comment = req.comment;
        const userVoteInd = comment.votes.findIndex(vote => vote.user == req.auth._id);

        if (userVoteInd != -1) {
            if (comment.votes[userVoteInd].vote != req.body.vote) {
                comment.votes.splice(userVoteInd, 1);
            }
        } else {
            comment.votes.push({ user: req.auth._id, vote: req.body.vote });
        }

        await comment.populate('post', 'channel', 'Post').execPopulate();
        await comment.save();

        const post = await Post.findOne({ _id: comment.post });

        if (userVoteInd && comment.user != req.auth._id) {
            const channel = await Channel.findOne({ _id: post.channel });
            sendNotification(
                { en: channel.name },
                { en: (comment.anonyme ? 'Anonym' : req.authUser.firstName + ' ' + req.authUser.lastName) + ' has voted on your post' },
                { type: 'vote-channel-post', link: '/tabs/channels/post' + post._id },
                [],
                [comment.user]
            );
        }

        comment = withVotesInfo(comment, req.auth._id, comment.post._id);
        return Response.sendResponse(res, {
            votes: comment.votes,
            voted: userVoteInd != -1
        }, 'voted');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.getComments = async (req, res) => {
    try {
        const limit = 8;
        const post = req.post;
        const page = parseInt(req.query.page) || 0;

        // Find comments for the post with pagination and population
        const comments = await Comment.find({ post: post._id })
            .populate('user', 'firstName lastName', 'User')
            .sort({ createdAt: -1 })
            .skip(page * limit)
            .limit(limit)
            .exec();

        if (!comments) {
            return Response.sendError(res, 400, 'Failed to retrieve comments');
        }

        // Count the total number of comments
        const count = await Comment.countDocuments({ post: post._id }).exec();

        // Ensure the correct anonymous name is used for comments
        const commentsWithVotes = comments.map(comment => {
            if (comment.anonyme) {
                // ✅ If the user is the post author, force them to use the post's anonymous name
                if (comment.user.toString() === post.user.toString()) {
                    comment.anonymName = post.anonymName;
                } else {
                    // ✅ Otherwise, reuse the stored anonymName
                    comment.anonymName = comment.anonymName || post.anonymName;
                }
            }
            return withVotesInfo(comment, req.auth._id, post._id);
        });

        return Response.sendResponse(res, {
            comments: commentsWithVotes,
            more: (count - (limit * (page + 1))) > 0
        });

    } catch (err) {
        console.error('Error in getComments:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.deleteComment = (req, res) => {
    try {
        const comment = req.comment
        this.destroyComment(res, comment._id, (res) => Response.sendResponse(res, null, 'comment removed'))
    } catch (error) {
        console.log(error);
    }
}

exports.destroyComment = async (res, commentId, callback) => {
    try {
        // Delete the comment
        await Comment.deleteOne({ _id: commentId });

        // Remove any associated reports for the comment
        await Report.deleteMany({ 'entity.id': commentId, 'entity.name': 'comment' });

        // If a callback exists, call it
        if (callback) return callback(res);
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.getAllCommentsForAdmin = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['text', 'user', 'post']);
        const limit = dashParams.limit || 20;
        const page = dashParams.page || 0;

        const comments = await Comment.aggregate()
            .match(dashParams.filter)
            .lookup({
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'user'
            })
            .lookup({
                from: 'posts',
                localField: 'post',
                foreignField: '_id',
                as: 'post'
            })
            .lookup({
                from: 'reports',
                localField: 'reports',
                foreignField: '_id',
                as: 'reports'
            }) // Add report details
            .unwind('$user')
            .unwind('$post')
            .project({
                _id: 1,
                text: 1,
                user: "$user._id",
                post: "$post._id",
                anonyme: 1,
                reportsCount: { $size: "$reports" },
                mediaUrl: {
                    $cond: { if: { $ne: ["$media.url", null] }, then: { $concat: ["http://127.0.0.1:3300/", { $replaceAll: { input: "$media.url", find: "\\", replacement: "/" } }] }, else: null }
                },
                mediaExpiryDate: "$media.expiryDate",
                reports: 1, // Include full reports
                votes: 1,
                moderationStatus: 1,
                reactionCounts: 1,
                createdAt: 1,
                updatedAt: 1,
                flagged: { $gt: [{ $size: "$reports" }, 0] }
            })
            .sort(dashParams.sort)
            .skip(page * limit)
            .limit(limit)
            .exec();

        const count = await Comment.find(dashParams.filter).countDocuments();

        return Response.sendResponse(res, {
            docs: comments,
            totalPages: Math.ceil(count / limit),
            currentPage: page
        });
    } catch (err) {
        console.error('Error in getAllCommentsForAdmin:', err);
        return Response.sendError(res, 500, 'Failed to retrieve comments for admin');
    }
};

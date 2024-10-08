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



exports.reportComment = async (req, res) => {
    try {
        const comment = req.comment;
        if (!req.body.message) return Response.sendError(res, 400, 'Please enter a message');

        const reportData = await report(req, res, 'comment', comment._id);
        await Comment.updateOne({ _id: comment._id }, { $push: { reports: reportData } });

        return Response.sendResponse(res, null, 'Thank you for reporting');
    } catch (error) {
        console.log(error);
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
                reports: { $size: "$reports" }
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


exports.showComment = async (req, res) => {
    try {
        const comment = await Comment.findOne({ _id: req.comment._id });
        if (!comment) return Response.sendError(res, 400, 'Server error');
        return Response.sendResponse(res, comment);
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.storeComment = async (req, res) => {
    try {
        // Process media upload first
        upload.single('media')(req, res, async function (err) {
            if (err) {
                console.error('Multer Error:', err);  // Handle multer errors
                return Response.sendError(res, 400, 'Error uploading media');
            }

            console.log('Multer processed request successfully');
            console.log('Request Body:', req.body);  // Log the text and anonymity status
            console.log('Uploaded File:', req.file);  // Log the file info if any

            const post = req.post;
            let anonymName = null;

            // Check if user has already commented on this post with an anonymous name
            const previousComment = await Comment.findOne({
                post: post._id,
                user: req.auth._id,
                anonyme: true
            });

            console.log('Previous Comment Found:', previousComment ? previousComment.anonymName : 'No previous anonymous comment found');

            if (previousComment && previousComment.anonymName) {
                // Reuse the anonymName if the user has already commented on this post
                anonymName = previousComment.anonymName;
                console.log('Reusing anonymName:', anonymName);
            } else if (req.body.anonyme === 'true') {
                // Generate a new anonymName if this is the first anonymous comment for the user on this post
                anonymName = generateAnonymName(req.auth._id, post._id);
                console.log('Generated anonymName:', anonymName);
            }

            // Create a new comment
            const comment = new Comment({
                text: req.body.text.trim(),
                user: req.auth._id,
                post: post._id,
                anonymName: anonymName, // Set the anonymName
                anonyme: req.body.anonyme === 'true'
            });

            // If media is uploaded, attach it to the comment
            if (req.file) {
                comment.media = {
                    url: req.file.path, // Store the file path
                    expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // Set a 24-hour expiry for the media
                };
                console.log('Media attached to comment:', comment.media);
            }

            console.log('Saving Comment:', comment);

            // Save the comment to the database
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

            // Send notification if the comment is on someone else's post
            if (post.user != req.auth._id) {
                const channel = await Channel.findOne({ _id: post.channel });
                console.log('Channel Found for Notification:', channel);

                if (channel) {
                    sendNotification(
                        { en: channel.name },
                        {
                            en: (commentWithVotes.anonyme ? 'Anonym' : req.authUser.firstName + ' ' + req.authUser.lastName) + ' commented on your post'
                        },
                        {
                            type: 'new-post-comment',
                            link: '/tabs/channels/post/' + post._id
                        },
                        [],
                        [post.user]
                    );
                    console.log('Notification sent for new comment');
                }
            }

            // Return the populated comment as the response
            console.log('Returning Populated Comment:', commentWithVotes);
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

        // Map the comments with vote information
        const commentsWithVotes = comments.map(comment =>
            withVotesInfo(comment, req.auth._id, comment.post._id)
        );

        // Send the response with comments and more pages info
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
        await Comment.remove({ _id: commentId });
        await Report.remove({ 'entity.id': commentId, 'entity.name': 'comment' });
        if (callback) return callback(res);
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};

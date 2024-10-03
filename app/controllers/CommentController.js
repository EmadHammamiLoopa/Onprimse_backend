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



exports.reportComment = (req, res) => {
    try {
        const comment = req.comment
        if(!req.body.message) return Response.sendError(res, 400, 'please enter a message')
        report(req, res, 'comment', comment._id, (report) => {
            Comment.updateOne({_id: comment._id}, {$push: {reports: report}}, (err, comment) => {
                if(err) return Response.sendError(res, 400, 'failed')
                return Response.sendResponse(res, null, 'Thank you for reporting')
            })
        })
    } catch (error) {
        console.log(error);
    }
}

exports.postComments = (req, res) => {
    try{
        const post = req.post;
        const dashParams = extractDashParams(req, ['text'])
        Comment.aggregate()
        .match({
            post: post._id,
            ...dashParams.filter
        })
        .project({
            text: 1,
            user: 1,
            post: 1,
            reports: {
                $size: "$reports"
            },
        })
        .sort(dashParams.sort)
        .skip(dashParams.skip)
        .limit(dashParams.limit)
        .exec(async(err, comments) => {
            if(err || !comments) return Response.sendError(res, 500, 'Server error, please try again later');
            const count = await Comment.find({
                post: post._id,
                ...dashParams.filter
            }).countDocuments();
            return Response.sendResponse(res, {
                docs: comments,
                totalPages: Math.ceil(count / dashParams.limit)
            });
        });
    }catch(err){
        console.log(err);
    }
}

exports.showComment = (req, res) => {
    Comment.findOne({_id: req.comment._id}, (err, comment) => {
        if(err || !comment) return Response.sendError(res, 400, 'Server error')
        return Response.sendResponse(res, comment)
    })
}

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



exports.voteOnComment = (req, res) => {
    try{
        const comment = req.comment

        const userVoteInd =  comment.votes.findIndex(vote => vote.user == req.auth._id)
        if(userVoteInd != -1){
            if(comment.votes[userVoteInd].vote != req.body.vote)
                comment.votes.splice(userVoteInd, 1)
        }else{
            comment.votes.push({
                user: req.auth._id,
                vote: req.body.vote
            })
        }
        comment.populate('post', 'channel', 'Post').save(async(err, comment) => {
            if(err || !comment) return Response.sendError(res, 400, 'failed')
            comment = withVotesInfo(comment, req.auth._id, comment.post._id);
            const post = await Post.findOne({_id: comment.post})
            if(userVoteInd && comment.user != req.auth._id)
                Channel.findOne({_id: post.channel}, (err, channel) => {
                    sendNotification(
                        {en: channel.name}, 
                        {en: (comment.anonyme ? 'Anonym' : req.authUser.firstName + ' ' + req.authUser.lastName) + ' has voted on your post'},
                        {
                            type: 'vote-channel-post',
                            link: '/tabs/channels/post' + post._id
                        }, 
                        [], 
                        [comment.user]
                    )
                })
            return Response.sendResponse(res, {
                votes: comment.votes,
                voted: userVoteInd != -1
            }, 'voted')
        })
    }catch(err){
        console.log(err);
    }
}

exports.getComments = (req, res) => {
    try {
        const limit = 8;
        const post = req.post;
        Comment.find({ post: post._id })
            .populate('user', 'firstName lastName', 'User')
            .sort({ createdAt: -1 })
            .skip(req.query.page * limit)
            .limit(limit)
            .exec((err, comments) => {
                if (err || !comments) return Response.sendError(res, 400, 'Failed to retrieve comments');
                Comment.find({ post: post._id }).count((err, count) => {
                    comments = comments.map(comment => withVotesInfo(comment, req.auth._id, comment.post._id));
                    return Response.sendResponse(res, {
                        comments,
                        more: (count - (limit * (+req.query.page + 1))) > 0
                    });
                });
            });
    } catch (err) {
        console.log(err);
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

exports.destroyComment = (res, commentId, callback) => {
    Comment.remove({_id: commentId}, (err, comments) => {
        Report.remove({'entity.id': commentId, "entity.name": 'comment'}, (err, reports) => {
            if(callback) return callback(res)
        })
    })
}
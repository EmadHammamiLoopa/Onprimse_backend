const Response = require("../controllers/Response")
const { adminCheck } = require("../helpers")
const Comment = require("../models/Comment")


exports.commentById = async (req, res, next, id) => {
    console.log("id:", id); // Log the comment ID being searched for

    try {
        const comment = await Comment.findOne({ _id: id }); // Use 'comment' instead of 'Comment'

        if (!comment) {
            return Response.sendError(res, 400, 'Comment not found');
        }

        req.comment = comment; // Store the comment in the request object
        next(); // Pass control to the next middleware or route handler
    } catch (err) {
        console.error('Error finding comment:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};



exports.commentOwner = (req, res, next) => {
    if(adminCheck(req)){
        return next()
    }
    if(req.auth._id != req.comment.user){
        return Response.sendError(res, 403, 'Access denied')
    }
    next();
}
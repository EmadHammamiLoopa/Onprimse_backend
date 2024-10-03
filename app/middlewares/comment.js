const Response = require("../controllers/Response")
const { adminCheck } = require("../helpers")
const Comment = require("../models/Comment")

exports.commentById = (req, res, next, id) => {
    Comment.findOne({_id: id}, (err, comment) => {
        if(err || !comment) return Response.sendError(res, 400, 'comment not found')
        req.comment = comment
        next()
    })
}

exports.commentOwner = (req, res, next) => {
    if(adminCheck(req)){
        return next()
    }
    if(req.auth._id != req.comment.user){
        return Response.sendError(res, 403, 'Access denied')
    }
    next();
}
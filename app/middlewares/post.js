const Response = require('../controllers/Response')
const { adminCheck } = require('../helpers')
const Post = require('../models/Post')

exports.postById = (req, res, next, id) => {
    Post.findOne({_id: id})
    .populate('channel')
    .exec((err, post) => {
        if(err || !post) return Response.sendError(res, 400, 'post not found')
        req.post = post
        next()
    })
}

exports.postOwner = (req, res, next) => {
    if(adminCheck(req)){
        return next()
    }
    if(req.auth._id != req.post.user){
        return Response.sendError(res, 403, 'Access denied')
    }
    next();
}

exports.isFollowedChannelPost = (req, res, next) => {
    try{
        const post = req.post
        const userId = req.auth._id
        if(!post.channel.followers.includes(userId) && channel.user != req.auth._id){
            return Response.sendError(res, 400, 'access denied on this channel')
        }
        next()
    }catch(err){
        console.log(err);
    }
}
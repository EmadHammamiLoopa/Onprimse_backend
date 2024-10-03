const Response = require('../controllers/Response')
const { adminCheck } = require('../helpers')
const Channel = require('./../models/Channel')

exports.channelById = (req, res, next, id) => {
    Channel.findOne({_id: id}, (err, channel) => {
        if(err || !channel) return Response.sendError(res, 400, 'channel not found')
        req.channel = channel
        next()
    })
}

exports.channelOwner = (req, res, next) => {
    if(adminCheck(req)){
        return next()
    }

    if(req.auth._id != req.channel.user){
        return Response.sendError(res, 403, 'Access denied')
    }

    next();
}

exports.isFollowedChannel = (req, res, next) => {
    try{
        const channel = req.channel
        const userId = req.auth._id
        if(!channel.followers.includes(userId) && channel.user != req.auth._id){
            return Response.sendError(res, 400, 'access denied on this channel')
        }
        next()
    }catch(err){
        console.log(err);
    }
}
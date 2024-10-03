const Response = require("../controllers/Response")
const Subscription = require("../models/Subscription")
const User = require("../models/User")

exports.subscriptionById = (req, res, next, id) => {
    Subscription.findOne({_id: id}, (err, subscription) => {
        if(err || !subscription) return Response.sendError(res, 400, 'subscription not found')
        req.subscription = subscription
        next()
    })
}

exports.userSubscribed = async(user) => {
    if(user.subscription && user.subscription._id){
        if(new Date(user.subscription.expireDate).getTime() > new Date().getTime()){
            return true
        }
        
        await User.updateOne({_id: user._id}, {$set: {subscription: null}}, (err, user) => console.log(user))
    }
    return false
}
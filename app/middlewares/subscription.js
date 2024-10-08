const Response = require("../controllers/Response")
const Subscription = require("../models/Subscription")
const User = require("../models/User")

exports.subscriptionById = async (req, res, next, id) => {
    try {
        const subscription = await Subscription.findById(id);

        if (!subscription) {
            return Response.sendError(res, 404, 'Subscription not found');
        }

        req.subscription = subscription;
        next();
    } catch (err) {
        console.log('Error finding subscription:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.userSubscribed = async(user) => {
    if(user.subscription && user.subscription._id){
        if(new Date(user.subscription.expireDate).getTime() > new Date().getTime()){
            return true
        }
        
        await User.updateOne({_id: user._id}, {$set: {subscription: null}}, (err, user) => console.log(user))
    }
    return false
}
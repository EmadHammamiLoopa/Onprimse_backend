const mongoose = require("mongoose")
const Response = require("../controllers/Response")
const { ERROR_CODES } = require("../helpers")
const Request = require("../models/Request")
const User = require("../models/User")
const { userSubscribed } = require("./subscription")

exports.requestById = (req, res, next, id) => {
    Request.findOne({_id: id}, (err, request) => {
        if(err || !request) return Response.sendError(res, 400, 'request not found')
        console.log(request)
        req.request = request
        next()
    })
}

exports.requestSender = (req, res, next) => {
    const request = req.request;
  
    // Use .equals() to compare ObjectIds safely
    if (!request.from.equals(req.auth._id)) {
      return Response.sendError(res, 403, 'Access forbidden');
    }
  
    User.findById(request.from, (err, user) => {
      if (err || !user) {
        return Response.sendError(res, 403, 'Failed to retrieve user');
      }
  
      req.user = user;
      next();
    });
  };
  

exports.requestReceiver = (req, res, next) => {
    const request = req.request
    if(request.to != req.auth._id)
        return Response.sendError(res, 403, 'access forbiden')
        
    User.findOne({_id: request.to}, (err, user) => {
        if(err || !user) return Response.sendError(res, 403, 'failed')
        req.user = user
        next()
    })
}

exports.isFriend = (req, res, next) => {
    Request.find({
        $or: [
            {
                $and: [
                    {from: new mongoose.Types.ObjectId(req.auth._id)},
                    {to: new mongoose.Types.ObjectId(req.user._id)}
                ]
            },
            {
                $and: [
                    {to:new mongoose.Types.ObjectId(req.auth._id)},
                    {from:new mongoose.Types.ObjectId(req.user._id)}
                ]
            }
        ],
        accepted: true
    }, (err, request) => {
        if(err || !request) return Response.sendError(res, 400, 'not a friend')
        // req.friendRequest = request;
        next()
    })
}

exports.requestNotExist = (req, res, next) => {
    try{
        const user = req.user;
        // check if the auth user already send request
        Request.findOne({
            from: req.auth._id,
            to: user._id
        }, async(err, request) => {
            if(err) return Response.sendError(res, 400, 'failed')
            else if(request){
                // in case the request aleady sent by the auth user
                return Response.sendResponse(res, {
                    request: 'requesting',
                })
            }else{
                // in case the request is not sent yet
                // we check if the auth has a request from the other user
                Request.findOne({
                    from: user._id,
                    to: req.auth._id
                }, async(err, request) => {
                    if(err) return Response.sendError(res, 400, 'failed')
                    else if(request){
                        // in case there is a request sent by the other user to the auth user
                        // we accept the request
                        return Response.sendResponse(res, {
                            request: 'requested',
                        })
                    }else{
                        // in case there is no request yet between the tow users
                        // we create the request
                        next()
                    }
                })
            }
        })
    }catch(err){
        console.log(err);
    }
}


exports.sendRequestPermission = (req, res, next) => {
    try {
        const now = new Date()
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        
        Request.countDocuments({
            from: req.auth._id,
            createdAt: {
                $lt: now.toISOString(),
                $gt: yesterday.toISOString()
            }
        })
        .exec(async(err, requests) => {
            console.log(requests);
            if(!await userSubscribed(req.authUser) && requests > 2)
                return Response.sendError(res, 403, {
                    code: ERROR_CODES.SUBSCRIPTION_ERROR,
                    message: 'you have only 3 requests per day'
                })
            else return next()
        })
    } catch (error) {
        console.log(error);
    }
}
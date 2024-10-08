const mongoose = require("mongoose");
const Response = require("../controllers/Response");
const { ERROR_CODES } = require("../helpers");
const Request = require("../models/Request");
const User = require("../models/User");
const { userSubscribed } = require("./subscription");

exports.requestById = async (req, res, next, id) => {
    try {
        const request = await Request.findOne({ _id: id });
        if (!request) return Response.sendError(res, 400, 'Request not found');
        console.log(request);
        req.request = request;
        next();
    } catch (err) {
        return Response.sendError(res, 500, 'Failed to retrieve request');
    }
};

exports.requestSender = async (req, res, next) => {
    try {
        const request = req.request;
        if (request.from != req.auth._id)
            return Response.sendError(res, 403, 'Access forbidden');

        const user = await User.findOne({ _id: request.from });
        if (!user) return Response.sendError(res, 403, 'User not found');
        
        req.user = user;
        next();
    } catch (err) {
        return Response.sendError(res, 500, 'Failed to retrieve user');
    }
};

exports.requestReceiver = async (req, res, next) => {
    try {
        const request = req.request;
        if (request.to != req.auth._id)
            return Response.sendError(res, 403, 'Access forbidden');

        const user = await User.findOne({ _id: request.to });
        if (!user) return Response.sendError(res, 403, 'User not found');
        
        req.user = user;
        next();
    } catch (err) {
        return Response.sendError(res, 500, 'Failed to retrieve user');
    }
};

exports.isFriend = async (req, res, next) => {
    try {
        const request = await Request.findOne({
            $or: [
                { from: new mongoose.Types.ObjectId(req.auth._id), to: new mongoose.Types.ObjectId(req.user._id) },
                { to: new mongoose.Types.ObjectId(req.auth._id), from: new mongoose.Types.ObjectId(req.user._id) }
            ],
            accepted: true
        });

        if (!request) return Response.sendError(res, 400, 'Not a friend');
        next();
    } catch (err) {
        return Response.sendError(res, 500, 'Failed to check friendship');
    }
};

exports.requestNotExist = async (req, res, next) => {
    try {
        const user = req.user;

        // Check if the auth user already sent a request
        const existingRequest = await Request.findOne({ from: req.auth._id, to: user._id });
        if (existingRequest) {
            return Response.sendResponse(res, { request: 'requesting' });
        }

        // Check if the auth user has received a request from the other user
        const incomingRequest = await Request.findOne({ from: user._id, to: req.auth._id });
        if (incomingRequest) {
            return Response.sendResponse(res, { request: 'requested' });
        }

        // If no request exists, move to the next middleware
        next();
    } catch (err) {
        return Response.sendError(res, 500, 'Failed to check request existence');
    }
};

exports.sendRequestPermission = async (req, res, next) => {
    try {
        const now = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const requests = await Request.countDocuments({
            from: req.auth._id,
            createdAt: { $lt: now.toISOString(), $gt: yesterday.toISOString() }
        });

        console.log(requests);

        // Restrict only the friend requests and not chat access
        if (!await userSubscribed(req.authUser) && requests > 2) {
            // This logic should only be triggered for sending friend requests
            if (req.path.includes('/request')) {
                return Response.sendError(res, 403, {
                    code: ERROR_CODES.SUBSCRIPTION_ERROR,
                    message: 'You have only 3 friend requests per day'
                });
            }
        }

        next();
    } catch (error) {
        return Response.sendError(res, 500, 'Failed to check request permission');
    }
};


const { request } = require("express");
const mongoose = require("mongoose");
const { sendNotification } = require("../helpers");
const Request = require("../models/Request");
const User = require("../models/User");
const Response = require("./Response");

exports.storeRequest = (req, res) => {
  try {
    console.log('store request');
    const request = new Request({
      from: req.auth._id,
      to: req.user._id,
    });
    request.save(async (err, request) => {
      if (err || !request) return Response.sendError(res, 400, 'failed');
      await User.updateOne({ _id: request.to }, { $push: { requests: request._id } });
      await User.updateOne({ _id: request.from }, { $push: { requests: request._id } });
      sendNotification(
        { en: req.authUser.firstName + ' ' + req.authUser.lastName },
        { en: 'send you a friendship request' },
        { type: 'request', link: '/tabs/friends/requests' },
        [],
        [req.user._id]
      );
      return Response.sendResponse(res, { request }, 'friendship request sent');
    });
  } catch (err) {
    console.log(err);
  }
};

exports.requests = async (req, res) => {
  try {
    const limit = 20;
    const requests = await Request.find({
      to: new mongoose.Types.ObjectId(req.auth._id),
      accepted: false,
    })
    .populate('from', {
      firstName: 1,
      lastName: 1,
      avatar: 1,
    }, 'User')
    .select({
      from: 1,
      createdAt: 1,
    })
    .skip(limit * req.query.page)
    .limit(limit)
    .exec();

    return Response.sendResponse(res, requests);
  } catch (err) {
    console.log(err);
    return Response.sendError(res, 400, err.message);
  }
};



exports.acceptRequest = async (req, res) => {
    try {
      const { requestId } = req.params; // Use requestId instead of id
      const request = await Request.findById(requestId);
  
      if (!request) {
        return Response.sendError(res, 400, 'Invalid request ID');
      }
  
      const { from, to } = request;
      const fromUser = await User.findById(from);
      const toUser = await User.findById(to);
  
      if (!fromUser || !toUser) {
        return Response.sendError(res, 400, 'User not found');
      }
  
      // Add each other to friends list
      fromUser.friends.push(to);
      toUser.friends.push(from);
  
      // Save changes
      await fromUser.save();
      await toUser.save();
  
      // Remove the request after acceptance
      await Request.findByIdAndDelete(requestId);
  
      sendNotification(
        { en: `${req.authUser.firstName} ${req.authUser.lastName}` },
        { en: 'accepted your friendship request' },
        { type: 'request', link: '/tabs/friends/list' },
        [],
        [from]
      );
  
      return Response.sendResponse(res, true, 'friendship request is accepted');
    } catch (err) {
      console.log(err);
      return Response.sendError(res, 500, 'Server error');
    }
  };
  
exports.rejectRequest = async (req, res) => {
  const { id } = req.params;
  try {
    const request = await Request.findById(id);
    if (!request) return Response.sendError(res, 400, 'Invalid request ID');

    await request.remove();
    await User.updateOne({ _id: req.auth._id }, { $pull: { requests: request._id } });

    return Response.sendResponse(res, true, 'request rejected');
  } catch (err) {
    console.log(err);
    return Response.sendError(res, 500, 'Server error');
  }
};

exports.cancelRequest = async (req, res) => {
  const { id } = req.params;
  try {
    const request = await Request.findById(id);
    if (!request) return Response.sendError(res, 400, 'Invalid request ID');

    const toUser = request.to;
    await request.remove();
    await User.updateOne({ _id: toUser }, { $pull: { requests: request._id } });
    await User.updateOne({ _id: req.auth._id }, { $pull: { requests: request._id } });

    return Response.sendResponse(res, true, 'request canceled');
  } catch (err) {
    console.log(err);
    return Response.sendError(res, 500, 'Server error');
  }
};

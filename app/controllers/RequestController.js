const { request } = require("express");
const mongoose = require("mongoose");
const { sendNotification } = require("../helpers");
const Request = require("../models/Request");
const User = require("../models/User");
const Response = require("./Response");

exports.storeRequest = async (req, res) => {
  try {
    console.log('store request');
    const request = new Request({
      from: req.auth._id,
      to: req.user._id,
    });

    await request.save();

    await User.updateOne({ _id: request.to }, { $push: { requests: request._id } });
    await User.updateOne({ _id: request.from }, { $push: { requests: request._id } });

    sendNotification(
      { en: req.authUser.firstName + ' ' + req.authUser.lastName },
      { en: 'sent you a friendship request' },
      { type: 'request', link: '/tabs/friends/requests' },
      [],
      [req.user._id]
    );

    return Response.sendResponse(res, { request }, 'Friendship request sent');
  } catch (err) {
    console.log(err);
    return Response.sendError(res, 500, 'Failed to store request');
  }
};


exports.requests = async (req, res) => {
  try {
    const limit = 20;
    const page = parseInt(req.query.page) || 0;

    // Find requests with pagination and population
    const requests = await Request.find({
      to: new mongoose.Types.ObjectId(req.auth._id),
      accepted: false,
    })
      .populate('from', {
        firstName: 1,
        lastName: 1,
        avatar: 1,
        mainAvatar: 1,

      }, 'User')
      .select({ from: 1, createdAt: 1 })
      .skip(limit * page)
      .limit(limit);

    return Response.sendResponse(res, requests);
  } catch (err) {
    console.error(`Error in requests: ${err.message}`, err);
    return Response.sendError(res, 400, 'Failed to fetch requests.');
  }
};



exports.acceptRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
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

    return Response.sendResponse(res, true, 'Friendship request accepted');
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

    return Response.sendResponse(res, true, 'Request rejected');
  } catch (err) {
    console.log(err);
    return Response.sendError(res, 500, 'Server error');
  }
};


exports.cancelRequest = async (req, res) => {
  console.log('req.params:', req.params);  // Log the entire params object

  const { requestId } = req.params;  // Extract requestId, not id
  console.log('requestId:', requestId);

  // Validate if the request ID is a valid MongoDB ObjectId
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    return Response.sendError(res, 400, 'Invalid request ID format');
  }

  try {
    // Log the ID to ensure it's being passed correctly
    console.log('Cancel request ID:', requestId);

    // Check if the request exists in the database
    const request = await Request.findById(requestId);
    if (!request) {
      return Response.sendError(res, 400, 'Request not found');
    }

    const toUser = request.to;
    
    // Remove the request and update both users
    await request.deleteOne();  // Use deleteOne instead of remove
    await User.updateOne({ _id: toUser }, { $pull: { requests: request._id } });
    await User.updateOne({ _id: req.auth._id }, { $pull: { requests: request._id } });

    return Response.sendResponse(res, true, 'Request canceled successfully');
  } catch (err) {
    // Log the error for further investigation
    console.error('Error in cancelRequest:', err);
    return Response.sendError(res, 500, 'Server error while canceling the request');
  }
};


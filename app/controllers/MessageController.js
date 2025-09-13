const { response } = require('express');
const mongoose = require('mongoose');
const { setOnlineUsers, connectedUsers } = require('../helpers');
const { userSubscribed } = require('../middlewares/subscription');
const Message = require('../models/Message');
const User = require('../models/User');
const Response = require('./Response');
const helpers = require('../helpers');          // path to helpers/index.js

exports.indexMessages = async (req, res) => {
    console.log("hereeeeeeeeeeeeeeeeeeeee");

    const limit = 20;
    const page = +req.query.page || 0;
    const authUserId = new mongoose.Types.ObjectId(req.auth._id);
    const userId = new mongoose.Types.ObjectId(req.params.userId);

    const filter = {
        $or: [
            { from: authUserId, to: userId },
            { from: userId, to: authUserId }
        ]
    };

    console.log('Message filter:', JSON.stringify(filter, null, 2)); // Log the filter

    try {
        const messages = await Message.find(filter)
            .sort({ createdAt: -1 })
            .skip(limit * page)
            .limit(limit);

        console.log('Messages found:', messages); // Log the messages

        const count = await Message.countDocuments(filter);
        const allowToChat =
        req.authUser?.friends?.map(id => id.toString()).includes(userId.toString()) ||
        (await Message.countDocuments({ from: userId, to: authUserId })) > 0;
    

            messages.forEach((msg, i) => {
              console.log(`📥 [${i}] Image path:`, msg.image?.path || null);
            });

            
        return Response.sendResponse(res, {
            messages,
            more: (count - (limit * (page + 1))) > 0,
            allowToChat
        });
    } catch (error) {
        console.error('Error fetching messages:', error); // Log the error
        return Response.sendError(res, 400, 'Failed to fetch messages');
    }
};

exports.getUsersMessages = async (req, res) => {
    const limit = 20;
    const page  = req.query.page ? +req.query.page : 0;
  
    console.log('Fetching users messages:', { limit, page, authUserId: req.authUser._id });
  
    /* ------------- Mongo filter ------------- */
    const filter = {
      _id: { $nin: req.authUser.blockedUsers, $ne: req.authUser._id },
      blockedUsers: { $ne: req.authUser._id },
      $or: [
        { messagedUsers: req.authUser._id },
        { friends:       req.authUser._id },
        { messages:      { $ne: [] } }
      ],
      deletedAt: null
    };
    console.log('Filter:', JSON.stringify(filter, null, 2));
  
    try {
      /* ------------- Fetch candidate users (no online calc yet) ------------- */
      const users = await User.find(filter)
        .select({ firstName:1, lastName:1, avatar:1, mainAvatar:1, messages:1 })
        .skip(limit * page)
        .limit(limit);
  
      console.log('Users found:', users.length);
  
      /* ------------- Pull full convo for each user ------------- */
      const usersWithMessages = await Promise.all(
        users.map(async (user) => {
          const messages = await Message.find({
            $or: [
              { from: user._id,        to: req.authUser._id },
              { from: req.authUser._id, to: user._id        }
            ]
          }).sort({ createdAt: -1 });
  
          return { ...user.toObject(), messages };
        })
      );
  
      if (usersWithMessages.length === 0) {
        return Response.sendError(res, 400, 'No users found');
      }
  
      /* ------------- Add online flag using live socket map ------------- */
      const ioInstance = req.app.get('io');                   // may be undefined in tests
      const liveMap = ioInstance
        ? helpers.connectedUsersMap(ioInstance.sockets)
        : {}; 
      
      const usersWithStatus = helpers.setOnlineUsers(usersWithMessages, liveMap);
  
      /* ------------- Pagination meta ------------- */
      const total = await User.countDocuments(filter);
      const more  = total - limit * (page + 1) > 0;
  
      return Response.sendResponse(res, { users: usersWithStatus, more });
    } catch (err) {
      console.error('Error fetching users messages:', err);
      return Response.sendError(res, 500, 'Internal server error');
    }
  };
  


exports.deleteMessage = async (req, res) => {
    const messageId = req.params.messageId;

    try {
        // Find the message by ID and ensure it belongs to the authenticated user or the recipient
        const message = await Message.findOne({
            _id: messageId,
            $or: [
                { from: req.auth._id },
                { to: req.auth._id }
            ]
        });

        if (!message) {
            return Response.sendError(res, 404, 'Message not found or you do not have permission to delete this message');
        }

        // Delete the message
        await Message.deleteOne({ _id: messageId });

        return Response.sendResponse(res, { success: true, message: 'Message deleted successfully' });
    } catch (error) {
        console.error('Error deleting message:', error);
        return Response.sendError(res, 500, 'Failed to delete message');
    }
};


exports.sendMessagePermission = async (req, res) => {
    try {
        const now = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const user = req.user;
        const authUser = req.authUser;

        if (authUser.friends && authUser.friends.includes(user._id)) {
            return Response.sendResponse(res, true);
        }

        const messages = await Message.find({
            from: req.auth._id,
            createdAt: {
                $lt: now.toISOString(),
                $gt: yesterday.toISOString()
            },
            to: {
                $nin: req.authUser.friends
            }
        }).distinct('to');

        console.log(messages);

        if (!await userSubscribed(req.authUser) && messages.length > 3) {
            return Response.sendResponse(res, false);
        } else {
            return Response.sendResponse(res, true);
        }
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Server error');
    }
};


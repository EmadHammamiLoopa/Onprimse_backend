const Message = require("../models/Message");
const path = require('path');
const fs = require('fs');
let { connectedUsers, sendNotification, userSocketId } = require('./../helpers');
const mongoose = require("mongoose");
const User = require("../models/User");

module.exports = (io, socket) => {
    socket.on('disconnect', function() {
        socket.disconnect();
        console.log('disconnect');
        console.log('---------------------');
        console.log(connectedUsers(io.sockets));
        console.log(`user disconnected (${Object.keys(connectedUsers(io.sockets)).length} connected)`);
    });

    socket.on('disconnect-user', function() {
        socket.disconnect();
        console.log('---------------------');
        console.log(connectedUsers(io.sockets));
        console.log(`user disconnected (${Object.keys(connectedUsers(io.sockets)).length} connected)`);
    });

    socket.on('connect-user', (user_id) => {
        socket.username = user_id;
        console.log('---------------------');
        console.log(connectedUsers(io.sockets));
        console.log(`user connected (${Object.keys(connectedUsers(io.sockets)).length} connected)`);
    });

    socket.on('send-message', async (msg, image, ind) => {
        try {
            socket.username = msg.from;
            if (!msg.text && !image) return;

            let photo = undefined;
            if (image) {
                const photoName = `${msg.from}_${msg.to}_${new Date().getTime()}.png`;
                const photoPath = path.join(__dirname, `./../../public/chats/${photoName}`);
                fs.writeFileSync(photoPath, image);
                photo = {
                    path: `/chats/${photoName}`,
                    type: 'png'
                };
            }

            // Create message with productId if type is 'product'
            const message = new Message({
                text: msg.text,
                from: new mongoose.Types.ObjectId(msg.from),
                to: new mongoose.Types.ObjectId(msg.to),
                image: photo,
                state: 'sent',
                type: msg.type,
                productId: msg.type === 'product' ? msg.productId : null // Include productId if type is 'product'
            });

            console.log('Saving message:', message);

            try {
                const savedMessage = await message.save();  // Save the message using async/await

                const fromSocketId = userSocketId(io.sockets, msg.from);
                const toSocketId = userSocketId(io.sockets, msg.to);

                if (savedMessage.image && savedMessage.image.path) {
                    savedMessage.image.path = process.env.BASEURL + savedMessage.image.path;
                }

                if (fromSocketId) {
                    io.to(fromSocketId).emit('message-sent', savedMessage, ind);
                }

                if (toSocketId) {
                    io.to(toSocketId).emit('new-message', savedMessage);
                }

                // Update users
                await User.findOneAndUpdate({ _id: msg.from }, { $push: { messagedUsers: msg.to, messages: savedMessage._id } });
                await User.findOneAndUpdate({ _id: msg.to }, { $push: { messagedUsers: msg.from, messages: savedMessage._id } });

                // Send notifications
                const user = await User.findOne({ _id: msg.from });
                sendNotification({ en: user.firstName + ' ' + user.lastName }, { en: msg.text }, {
                    type: 'message',
                    link: '/messages/chat/' + msg.from
                }, [], [msg.to]);

            } catch (saveError) {
                console.error('Error saving message:', saveError);
                if (userSocketId(io.sockets, msg.from)) {
                    io.to(userSocketId(io.sockets, msg.from)).emit('message-not-sent', ind);
                }
            }

        } catch (err) {
            console.log(err);
        }
    });
}

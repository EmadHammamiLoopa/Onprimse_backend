const Message = require("../models/Message");
const path = require('path');
const fs = require('fs');
const mongoose = require("mongoose");
const User = require("../models/User");

module.exports = (io, socket, connectedUsers) => {
    // Helper to log connected users count
    const logConnectedUsers = () => {
        console.log(`Currently ${Object.keys(connectedUsers).length} users connected`);
    };

    socket.on('disconnect', async function() {
        console.log(`❌ Disconnected: User ${socket.userId || 'Unknown'}, Socket ID: ${socket.id}`);
    
        if (socket.userId && connectedUsers[socket.userId]) {
            connectedUsers[socket.userId].delete(socket.id);
            if (connectedUsers[socket.userId].size === 0) {
                delete connectedUsers[socket.userId];
    
                // 🔥 Update DB and emit status-change event
                try {
                    await User.findByIdAndUpdate(socket.userId, { online: false, lastSeen: new Date() });
                    console.log(`💤 Marked user ${socket.userId} as offline`);
                    io.emit('user-status-changed', { userId: socket.userId, online: false });
                } catch (err) {
                    console.error("❌ Failed to update DB offline status:", err);
                }
            }
        }
    
        logConnectedUsers();
    });
    

    socket.on('disconnect-user', function() {
        if (socket.userId && connectedUsers[socket.userId]) {
            delete connectedUsers[socket.userId];
        }
        socket.disconnect();
        logConnectedUsers();
    });

    socket.on('connect-user', async (user_id) => {
        if (!user_id) {
            console.warn("⚠️ connect-user event received without user_id!");
            return;
        }
    
        if (!mongoose.Types.ObjectId.isValid(user_id)) {
            console.warn("⚠️ Invalid user_id format:", user_id);
            return;
        }
    
        socket.username = user_id;
        socket.userId = user_id;
    
        console.log(`✅ User connected: ${user_id}, Socket ID: ${socket.id}`);
    
        if (!connectedUsers[user_id]) {
            connectedUsers[user_id] = new Set();
        }
        connectedUsers[user_id].add(socket.id);
    
        logConnectedUsers();
    
        // 🔥 Update DB and emit status-change event
        try {
            await User.findByIdAndUpdate(user_id, { online: true, lastSeen: new Date() });
            console.log(`🔵 Marked user ${user_id} as online`);
    
            io.emit('user-status-changed', { userId: user_id, online: true });
        } catch (err) {
            console.error("❌ Failed to update DB online status:", err);
        }
    });
    
    
    socket.on('send-message', async (msg, image, ind) => {
        const tempId = msg.id;

        try {
            console.log(`📢 WebSocket Event Received: send-message`, msg);
    
            // Normalize message fields
            msg.from = msg.from || msg._from;
            msg.to = msg.to || msg._to;
            msg.text = msg.text || msg._text;
    
            // Validate required fields
            if (!msg.from || !msg.to || (typeof msg.text !== 'string' && typeof msg.image !== 'string')) {
                console.error("❌ Invalid message format! Must include text or image.", msg);
                return;
            }
    
            // Validate MongoDB IDs
            if (!mongoose.Types.ObjectId.isValid(msg.from) || 
                !mongoose.Types.ObjectId.isValid(msg.to)) {
                console.error("❌ Invalid user IDs in message");
                return;
            }
    
            console.log(`📩 Message from ${msg.from} to ${msg.to}`);
    
            // Check if users exist
            const [sender, receiver] = await Promise.all([
                User.findById(msg.from),
                User.findById(msg.to)
            ]);
            
            if (!sender || !receiver) {
                console.error(`❌ Sender or Receiver not found!`);
                return;
            }
    
            // Prepare message data
            const messageData = {
                text: msg.text,
                from: new mongoose.Types.ObjectId(msg.from),
                to: new mongoose.Types.ObjectId(msg.to),
                image: null,
                state: 'sent',
                type: msg.type || 'friend',
                productId: msg.productId || null
            };
    
            // Handle image if present
            if (typeof msg.image === 'string') {
                if (msg.image.startsWith('http')) {
                    // Determine MIME type from extension
                    const ext = path.extname(msg.image).toLowerCase(); // e.g., ".png"
                    const mimeType =
                        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                        ext === '.png' ? 'image/png' :
                        ext === '.gif' ? 'image/gif' :
                        'application/octet-stream';
            
                    messageData.image = {
                        path: msg.image,
                        type: mimeType
                    };
                } else if (msg.image.startsWith('data:image')) {
                    console.log("🖼️ Detected base64 image. Starting to save...");
                    const matches = msg.image.match(/^data:(image\/\w+);base64,/);
                    const mimeType = matches ? matches[1] : 'image/png';
            
                    const extension = mimeType.split('/')[1]; // e.g., 'png'
                    const photoName = `${msg.from}_${msg.to}_${Date.now()}.${extension}`;
                    const photoPath = path.join(__dirname, `../../public/chats/${photoName}`);
                    const base64Data = msg.image.replace(/^data:image\/\w+;base64,/, '');
            
                    try {
                        fs.writeFileSync(photoPath, Buffer.from(base64Data, 'base64'));
                        messageData.image = {
                            path: `/chats/${photoName}`,
                            type: mimeType
                        };
                        console.log("✅ Image saved at:", `/chats/${photoName}`);
                    } catch (err) {
                        console.error("❌ Failed to save image:", err);
                    }
                }
            }
            
    
            // Save message
            const message = new Message(messageData);
            const savedMessage = await message.save();
            console.log("✅ Message saved:", savedMessage._id);
    
            // Update user messages
            await Promise.all([
                User.findByIdAndUpdate(msg.from, { $push: { messages: savedMessage._id } }),
                User.findByIdAndUpdate(msg.to, { $push: { messages: savedMessage._id } })
            ]);
    
            console.log("✅ Message added to users' message arrays");
    
            // Deliver message
            const toSocketId = connectedUsers[msg.to];
            const fromSocketId = connectedUsers[msg.from];
    
            if (toSocketId) {
                io.to(toSocketId).emit('new-message', savedMessage);
                console.log(`📤 Delivered to receiver (${msg.to})`);
            } else {
                console.warn(`⚠️ User ${msg.to} offline - message saved but not delivered`);
            }
    
            if (fromSocketId) {
                io.to(fromSocketId).emit('message-sent', {
                ...savedMessage.toObject(), // make sure it's plain JS object
                tempId: tempId              // include the original temporary ID
                });

                console.log(`🔄 Sent confirmation to sender (${msg.from})`);
            }
    
        } catch (err) {
            console.error('❌ Error in send-message:', err);
            // Consider notifying sender of failure
        }
    });
};
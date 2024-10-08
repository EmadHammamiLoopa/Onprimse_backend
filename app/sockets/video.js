const User = require("../models/User");
const { userSocketId, sendNotification } = require('./../helpers');

module.exports = (io, socket) => {
    // Event for canceling a video call
    socket.on('cancel-video', (userId) => {
        try {
            console.log('cancel calling socket');
            const toSocketId = userSocketId(io.sockets, userId);

            if (toSocketId) {
                io.to(toSocketId).emit('video-canceled');
            } else {
                console.log(`User with ID ${userId} is not connected`);
            }
        } catch (err) {
            console.error(`Error during video call cancelation for user ${userId}:`, err);
        }
    });

    // Event for initiating a video call
    socket.on('calling', (userId, username, callerId) => {
        try {
            console.log('calling socket');
            sendNotification({ en: username }, { en: ' is calling you' }, {
                type: 'call',
                link: '/messages/video/' + callerId + '?answer=true'
            }, [], [userId], true);

            const toSocketId = userSocketId(io.sockets, userId);

            if (toSocketId) {
                io.to(toSocketId).emit('called');
            } else {
                console.log(`User with ID ${userId} is not connected`);
            }
        } catch (err) {
            console.error(`Error during calling process for user ${userId}:`, err);
        }
    });
};

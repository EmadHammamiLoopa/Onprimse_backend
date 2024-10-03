const User = require("../models/User");

const { userSocketId, sendNotification } = require('./../helpers');

module.exports = (io, socket) => {
    socket.on('cancel-video', (userId) => {
        console.log('cancel calling socket')
        const toSocketId = userSocketId(io.sockets, userId)
        if(toSocketId)
            io.to(toSocketId).emit('video-canceled')
    })
    socket.on('calling', (userId, username, callerId) => {
        console.log('calling socket')
        sendNotification({en: username}, {en: ' is calling you'}, {
            type: 'call',
            link: '/messages/video/' + callerId + '?answer=true'
        }, [], [userId], true)
        const toSocketId = userSocketId(io.sockets, userId)
        if(toSocketId)
            io.to(toSocketId).emit('called')
    })
}
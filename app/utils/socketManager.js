// app/utils/socketManager.js

const connectedUsers = {}; // userId -> Set of socket IDs
const socketUserMap = {};  // socket.id -> userId

module.exports = {
    connectedUsers,
    socketUserMap
};

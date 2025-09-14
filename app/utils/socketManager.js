// app/utils/socketManager.js

// userId -> Set of socket IDs (to support multi-device / multi-tab)
const connectedUsers = new Map();
// socketId -> userId (for quick lookup on disconnect)
const socketUserMap = new Map();

/**
 * Register a socket connection for a user
 */
function userConnected(userId, socketId) {
  if (!connectedUsers.has(userId)) {
    connectedUsers.set(userId, new Set());
  }
  connectedUsers.get(userId).add(socketId);
  socketUserMap.set(socketId, userId);
  console.log(`✅ User ${userId} connected. Active sockets: ${connectedUsers.get(userId).size}`);
}

/**
 * Remove a socket when disconnected
 */
function userDisconnected(socketId) {
    const userId = socketUserMap.get(socketId);
    if (!userId) return false;
  
    socketUserMap.delete(socketId);
  
    const userSockets = connectedUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        connectedUsers.delete(userId);
        console.log(`❌ User ${userId} is now offline`);
        return true; // went offline
      } else {
        console.log(`⚡ User ${userId} still has ${userSockets.size} active sockets`);
      }
    }
    return false; // still online somewhere
  }
  

/**
 * Check if a user is online
 */
function isUserOnline(userId) {
  return connectedUsers.has(userId) && connectedUsers.get(userId).size > 0;
}

module.exports = {
  connectedUsers,
  socketUserMap,
  userConnected,
  userDisconnected,
  isUserOnline
};

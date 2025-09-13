/*********************************************************************
 * helpers/index.js  – single source of truth for “generic” helpers
 *********************************************************************/

const Response = require('./controllers/Response');
const Report   = require('./models/Report');
const pushSvc  = require('.././app/utils/pushService');          // OneSignal / FCM wrapper
const socketManager = require('.././app/utils/socketManager');

/*────────────────────────── CONSTANTS ──────────────────────────*/
const manAvatarPath   = '/avatars/male.webp';
const womenAvatarPath = '/avatars/female.webp';
const othersAvatarPath = '/avatars/other.webp';

const ERROR_CODES     = { SUBSCRIPTION_ERROR: 1001 };

/*───────────────────── Socket-IO bootstrap & helpers ───────────*/

// Live Socket.IO reference (initialized in server bootstrap via initSocket)
let io = null;

/** Initialize this helper module with a live io instance (call once in index.js) */
function initSocket(ioRef) {
  io = ioRef;
}

/** Build <userId → Set<socketId>> map from live Socket.IO server */
function connectedUsersMap() {
  return socketManager.connectedUsers;
}

/** Get all socket ids for a user */
function userSocketIds(userId) {
  return socketManager.connectedUsers[userId]
    ? Array.from(socketManager.connectedUsers[userId])
    : [];
}

/** Is a user currently connected (has at least one socket)? */
function isUserConnected(userId) {
  return !!socketManager.connectedUsers[userId];
}

/** Mutate an array of users to include .online based on socket presence */
function setOnlineUsers(users) {
  users.forEach(u => {
    u.online = !!socketManager.connectedUsers[u._id?.toString()];
  });
  return users;
}

/** Emit an event to all sockets of a single user */
function emitToUser(userId, event, payload = {}) {
  if (!io) return;
  const sockets = userSocketIds(String(userId));
  sockets.forEach(sid => io.to(sid).emit(event, payload));
}

/** Emit an event to multiple users */
function emitToUsers(userIds = [], event, payload = {}) {
  (Array.isArray(userIds) ? userIds : [userIds])
    .filter(Boolean)
    .forEach(uid => emitToUser(String(uid), event, payload));
}

/** Friends-related convenience emits used by the client UI */
function emitNewFriendRequest(toUserId, fromUserId) {
  // Client will instantly increment the "friends" badge
  emitToUser(toUserId, 'new-friend-request', { from: String(fromUserId) });
}

function emitFriendRequestsUpdated(userAId, userBId) {
  // Client will re-count precisely (API fetch) for both sides
  emitToUsers([userAId, userBId], 'friend-requests-updated', {});
}

/** Wake the callee: emit on socket if online, else push */
function notifyPeerNeeded(calleeId) {
  if (!io) return console.warn('notifyPeerNeeded called before helpers.initSocket(io)');
  if (io.sockets?.adapter?.rooms?.has(calleeId)) {
    io.to(calleeId).emit('incoming-call');
  } else {
    pushSvc.sendPush(calleeId, { title: 'Incoming call', body: 'Tap to answer' });
  }
}

/*──────────────────── Misc dashboard / admin helpers ───────────*/
function extractDashParams(req, searchFields) {
  const page        = req.query.page     ? +req.query.page     : 1;
  const limit       = req.query.limit    ? +req.query.limit    : 10;
  const sortBy      = req.query.sortBy   || '_id';
  const sortDir     = req.query.sortDir  ? +req.query.sortDir  : 1;
  const searchQuery = req.query.searchQuery ? req.query.searchQuery.trim() : '';

  const sort = { [sortBy]: sortDir };

  // build $or search filter
  const or = [];
  if (searchQuery) {
    searchFields.forEach(field => {
      const obj = {};
      obj[field] =
        ['text','description','title'].includes(field)
          ? { $regex: searchQuery, $options: 'i' }
          : searchQuery;
      or.push(obj);
    });
  }

  return {
    filter : or.length ? { $or: or } : {},
    sort,
    skip   : limit * (page - 1),
    limit
  };
}

async function report(req, res, entityName, entityId) {
  try {
    const doc = await new Report({
      entity      : entityId,
      entityModel : entityName.charAt(0).toUpperCase() + entityName.slice(1),
      user        : req.auth._id,
      message     : req.body.message,
      reportType  : req.body.reportType
    }).save();
    return doc;
  } catch (err) {
    console.error('Error saving report:', err);
    return Response.sendError(res, 400, 'Failed to save report');
  }
}

const adminCheck = (req) =>
  req.auth.role === 'ADMIN' || req.auth.role === 'SUPER ADMIN';

/*────────────────────── Push / OneSignal helper ───────────────*/
async function sendNotification(userIds, message, senderName, fromUserId) {
  let recipientIds = Array.isArray(userIds) ? userIds : [userIds];
  recipientIds = recipientIds
    .filter(id => id && typeof id === 'string' && id.trim())
    .map(id => id.trim());

  if (recipientIds.length === 0) {
    return console.error('❌ No valid user IDs for notification.');
  }

  const chatId = [fromUserId, recipientIds[0]].sort().join('-');

  const payload = {
    app_id  : '3b993591-823b-4f45-94b0-c2d0f7d0f6d8',
    headings: { en: String(senderName) || 'New Message' },
    contents: { en: String(message)    || 'You have a new message' },
    include_external_user_ids: recipientIds,
    data    : { type: 'message', link: `/messages/chat/${chatId}` }
  };

  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': 'Basic os_v2_app_homtlemchnhulffqylippuhw3auw4vp7fmtu4xfrujbvrgzb536ngtne6z7hsyjy6r7yjvqpvx26bmpi42pvgguhvzdycwvca6ik3bi'
      },
      body: JSON.stringify(payload)
    });
    console.log('✅ Notification response:', await res.json());
  } catch (err) {
    console.error('❌ Error sending notification:', err);
  }
}

/*──────────────────────── Module exports ───────────────────────*/
module.exports = {
  /* constants */
  manAvatarPath,
  womenAvatarPath,
  othersAvatarPath,
  ERROR_CODES,

  /* Socket bootstrap + helpers */
  initSocket,                  // 👈 NEW
  notifyPeerNeeded,
  connectedUsersMap,
  userSocketIds,               // 👈 now exported too
  isUserConnected,
  setOnlineUsers,
  emitToUser,                  // 👈 NEW
  emitToUsers,                 // 👈 NEW
  emitNewFriendRequest,        // 👈 NEW
  emitFriendRequestsUpdated,   // 👈 NEW

  /* misc utilities */
  extractDashParams,
  report,
  adminCheck,

  /* push */
  sendNotification
};

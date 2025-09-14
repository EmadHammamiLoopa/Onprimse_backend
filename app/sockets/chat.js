const Message = require("../models/Message");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const User = require("../models/User");

// ✅ Import from socketManager
const { connectedUsers } = require("../utils/socketManager");

module.exports = (io, socket) => {
  /* ───────────── helpers ───────────── */

  const logConnectedUsers = () => {
    console.log(`Currently ${connectedUsers.size} users connected`);
  };

  function getUserSockets(userId) {
    const bucket = connectedUsers.get(userId);
    if (!bucket) return [];
    return Array.from(bucket);
  }

  function emitToUser(userId, event, payload) {
    const sids = getUserSockets(userId);
    if (!sids.length) return false;
    for (const sid of sids) io.to(sid).emit(event, payload);
    return true;
  }


  /* ───────── disconnect / connect-user ───────── */

  socket.on("disconnect", async function () {
    console.log(`❌ Disconnected: User ${socket.userId || "Unknown"}, Socket ID: ${socket.id}`);
  
    if (socket.userId && connectedUsers.has(socket.userId)) {
      const bucket = connectedUsers.get(socket.userId);
  
      // Remove this socket from the user's set
      bucket.delete(socket.id);
  
      // If no sockets left, clean bucket & mark offline
      if (bucket.size === 0) {
        connectedUsers.delete(socket.userId);
        try {
          await User.findByIdAndUpdate(socket.userId, {
            lastSeen: new Date(), // ✅ only update lastSeen
          });
          console.log(`💤 Marked user ${socket.userId} as offline`);
          io.emit("user-status-changed", { userId: socket.userId, online: false });
        } catch (err) {
          console.error("❌ Failed to update DB offline status:", err);
        }
      }
    }
  
    logConnectedUsers();
  });
  

  socket.on("disconnect-user", function () {
    if (socket.userId && connectedUsers.has(socket.userId)) {
      connectedUsers.delete(socket.userId);
    }
    socket.disconnect();
    logConnectedUsers();
  });
  
// Video call request
socket.on("video-call-request", async (data, ack) => {
  try {
    // Cancel any previous pending requests in this thread
    await Message.updateMany(
      { from: { $in: [data.from, data.to] }, to: { $in: [data.from, data.to] }, type: "video-call-request", status: "pending" },
      { $set: { status: "cancelled" } }
    );

    const payload = {
      from: data.from,
      to: data.to,
      text: data.text,
      type: "video-call-request",
      status: "pending",
      state: "sent",
      createdAt: new Date()
    };

    const message = new Message(payload);
    const saved = await message.save();

    await Promise.all([
      User.findByIdAndUpdate(data.from, { $push: { messages: saved._id } }),
      User.findByIdAndUpdate(data.to, { $push: { messages: saved._id } }),
    ]);

    emitToUser(data.to, "new-message", saved);
    emitToUser(data.from, "message-sent", { ...saved.toObject(), tempId: data.messageId });

    if (ack) ack({ success: true, messageId: saved._id });
  } catch (err) {
    console.error("❌ Error in video-call-request:", err);
    if (ack) ack({ success: false, error: err.message });
  }
});



// Video call accepted
// Video call accepted
// Video call accepted
socket.on("video-call-accepted", async (data) => {
  try {
    // 🛑 Ignore if client sent a temp id
    if (!mongoose.Types.ObjectId.isValid(data.messageId)) {
      console.warn("⚠️ Ignoring invalid messageId:", data.messageId);
      return;
    }

    const msg = await Message.findByIdAndUpdate(
      data.messageId,
      { status: "accepted" },
      { new: true }
    );

    if (!msg) return;

    emitToUser(data.to, "video-call-accepted", { messageId: msg.id, status: "accepted" });
    emitToUser(data.from, "video-call-accepted", { messageId: msg.id, status: "accepted" });
  } catch (err) {
    console.error("❌ Error in video-call-accepted:", err);
  }
});

// Video call cancelled
socket.on("video-call-cancelled", async (data) => {
  try {
    let msg = null;

    if (mongoose.Types.ObjectId.isValid(data.messageId)) {
      // normal path: real id
      msg = await Message.findByIdAndUpdate(
        data.messageId,
        { status: "cancelled" },
        { new: true }
      );
    }

    if (!msg) {
      // fallback: cancel the latest pending call between these two users
      msg = await Message.findOneAndUpdate(
        {
          from: { $in: [data.from, data.to] },
          to:   { $in: [data.from, data.to] },
          type: "video-call-request",
          status: "pending",
        },
        { $set: { status: "cancelled" } },
        { sort: { createdAt: -1 }, new: true }
      );
      if (!msg) return; // nothing to cancel
    }

    emitToUser(data.to,   "video-call-cancelled", { messageId: msg.id, status: "cancelled" });
    emitToUser(data.from, "video-call-cancelled", { messageId: msg.id, status: "cancelled" });
  } catch (err) {
    console.error("❌ Error in video-call-cancelled:", err);
  }
});


socket.on("leave-chat", async ({ withUser }) => {
  try {
    if (!socket.userId || !mongoose.Types.ObjectId.isValid(withUser)) return;

    await Message.updateMany(
      {
        from: { $in: [socket.userId, withUser] },
        to:   { $in: [socket.userId, withUser] },
        type: "video-call-request",
        status: "pending",
      },
      { $set: { status: "cancelled" } }
    );

    emitToUser(withUser,   "video-session-reset", { by: socket.userId });
    emitToUser(socket.userId, "video-session-reset", { by: socket.userId });
  } catch (e) {
    console.error("leave-chat failed", e);
  }
});


// connect-user
socket.on("connect-user", async (user_id) => {
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

  if (!connectedUsers.has(user_id)) {
    connectedUsers.set(user_id, new Set());
  }
  connectedUsers.get(user_id).add(socket.id);

  logConnectedUsers();

  try {
    await User.findByIdAndUpdate(user_id, { lastSeen: new Date() });
    console.log(`🔵 Marked user ${user_id} as online`);
    io.emit("user-status-changed", { userId: user_id, online: true });
  } catch (err) {
    console.error("❌ Failed to update DB online status:", err);
  }
});


  /* ─────────────── send-message ─────────────── */

  socket.on("send-message", async (msg, image, ind) => {
    const tempId = msg?.id;

    try {
      console.log(`📢 WebSocket Event Received: send-message`, msg);

      // Normalize fields
      msg.from = msg.from || msg._from;
      msg.to   = msg.to   || msg._to;
      msg.text = msg.text || msg._text;

      // Validate required fields
      if (!msg.from || !msg.to || (typeof msg.text !== "string" && typeof msg.image !== "string")) {
        console.error("❌ Invalid message format! Must include text or image.", msg);
        return;
      }

      // Validate ObjectIds
      if (!mongoose.Types.ObjectId.isValid(msg.from) || !mongoose.Types.ObjectId.isValid(msg.to)) {
        console.error("❌ Invalid user IDs in message");
        return;
      }

      console.log(`📩 Message from ${msg.from} to ${msg.to}`);

      // Ensure users exist
      const [sender, receiver] = await Promise.all([
        User.findById(msg.from),
        User.findById(msg.to),
      ]);
      if (!sender || !receiver) {
        console.error("❌ Sender or Receiver not found!");
        return;
      }

      // Prepare message doc
      const messageData = {
        text: msg.text,
        from: new mongoose.Types.ObjectId(msg.from),
        to  : new mongoose.Types.ObjectId(msg.to),
        image: null,
        state: "sent",
        type : msg.type || "friend",
        productId: msg.productId || null,
      };

      // Handle image if present
      if (typeof msg.image === "string") {
        if (msg.image.startsWith("http")) {
          const ext = path.extname(msg.image).toLowerCase();
          const mimeType =
            ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
            ext === ".png"                      ? "image/png"   :
            ext === ".gif"                      ? "image/gif"   :
                                                  "application/octet-stream";
          messageData.image = { path: msg.image, type: mimeType };
        } else if (msg.image.startsWith("data:image")) {
          console.log("🖼️ Detected base64 image. Starting to save...");
          const matches   = msg.image.match(/^data:(image\/\w+);base64,/);
          const mimeType  = matches ? matches[1] : "image/png";
          const extension = mimeType.split("/")[1];
          const photoName = `${msg.from}_${msg.to}_${Date.now()}.${extension}`;
          const photoPath = path.join(__dirname, `../../public/chats/${photoName}`);
          const base64    = msg.image.replace(/^data:image\/\w+;base64,/, "");

          try {
            fs.writeFileSync(photoPath, Buffer.from(base64, "base64"));
            messageData.image = { path: `/chats/${photoName}`, type: mimeType };
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

      // Update user docs
      await Promise.all([
        User.findByIdAndUpdate(msg.from, { $push: { messages: savedMessage._id } }),
        User.findByIdAndUpdate(msg.to,   { $push: { messages: savedMessage._id } }),
      ]);
      console.log("✅ Message added to users' message arrays");

      // Plain payload for socket
      const payload = savedMessage.toObject ? savedMessage.toObject() : savedMessage;

      // Deliver to receiver (ALL sockets)
      if (emitToUser(msg.to, "new-message", payload)) {
        console.log(`📤 Delivered to receiver (${msg.to}) on ${getUserSockets(msg.to).length} socket(s)`);
      } else {
        console.warn(`⚠️ User ${msg.to} offline - message saved but not delivered`);
      }

      // Confirm to sender (ALL sockets), include tempId to reconcile optimistic UI
      emitToUser(msg.from, "message-sent", { ...payload, tempId });

      // (Optional) Emit a counter update event if you maintain per-tab badges:
      // emitToUser(msg.to, 'messages-updated', { delta: 1 });

    } catch (err) {
      console.error("❌ Error in send-message:", err);
      // Optional: notify sender about failure for UI rollback
      // emitToUser(msg.from, 'message-send-failed', { tempId, error: 'save_failed' });
    }
  });
};

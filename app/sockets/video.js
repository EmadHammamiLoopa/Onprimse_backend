// app/sockets/video.js
const User = require("../models/User");
const Message = require("../models/Message");

// Track ongoing 1:1 calls: activeVideoCalls[userId] = otherUserId
const activeVideoCalls = Object.create(null);

// Track ring timers so we can cancel on accept/decline/etc.
const ringTimers = new Map(); // key: `${from}:${to}` -> timeoutId

const RING_TIMEOUT_MS = 30_000; // 30s ring window

module.exports = (io, socket, connectedUsers) => {
  // ───────────────────────────────── helpers ─────────────────────────────────
  function getUserSockets(userId) {
    const bucket = connectedUsers[userId];
    if (!bucket) return [];
    if (bucket instanceof Set) return Array.from(bucket);
    if (Array.isArray(bucket)) return bucket;
    return [];
  }

  function emitToUser(userId, event, payload) {
    const sids = getUserSockets(userId);
    if (!sids.length) return false;
    for (const sid of sids) io.to(sid).emit(event, payload);
    return true;
  }

  function emitToBoth(a, b, event, payload) {
    emitToUser(a, event, payload);
    emitToUser(b, event, payload);
  }

  function keyOf(from, to) {
    return `${from}:${to}`;
  }

  function clearRingTimer(from, to) {
    const k1 = keyOf(from, to);
    const k2 = keyOf(to, from); // guard both directions
    const t1 = ringTimers.get(k1);
    const t2 = ringTimers.get(k2);
    if (t1) { clearTimeout(t1); ringTimers.delete(k1); }
    if (t2) { clearTimeout(t2); ringTimers.delete(k2); }
  }

  function setActivePair(from, to) {
    activeVideoCalls[from] = to;
    activeVideoCalls[to] = from;
  }

  function clearActivePair(from, to) {
    if (from) delete activeVideoCalls[from];
    if (to)   delete activeVideoCalls[to];
  }

  function forceEndCall(from, to, reason = 'ended') {
    try {
      clearRingTimer(from, to);
      clearActivePair(from, to);
      emitToBoth(from, to, 'video-call-ended', { from, to, reason, at: Date.now() });
    } catch (err) {
      console.error('❌ forceEndCall error:', err);
    }
  }

  // ─────────────────────────────── cancel (caller) ───────────────────────────
  // Backward compatible: accepts either (userId) OR ({ to, callerName })
  socket.on('cancel-video', (payload) => {
    try {
      const callerId = socket.userId;
      const calleeId = typeof payload === 'string' ? payload : payload?.to;

      if (!callerId || !calleeId) return;

      // notify callee (missed)
      emitToUser(calleeId, 'video-call-cancelled', {
        callerId, calleeId, reason: 'cancel', at: Date.now(), callerName: payload?.callerName
      });
      // notify caller (for UI cleanup; client should ignore for missed list)
      emitToUser(callerId, 'video-call-cancelled', {
        callerId, calleeId, reason: 'cancel', at: Date.now(), notify: false
      });

      // end for both
      forceEndCall(callerId, calleeId, 'cancel');
    } catch (err) {
      console.error('❌ Error during video call cancellation:', err);
    }
  });

  // ───────────────────────────── accept / decline ────────────────────────────
  socket.on('video-call-accepted', ({ from, to }) => {
    if (!from || !to) return;
    clearRingTimer(from, to);
    // keep active pair to block duplicates while the call is ongoing
    setActivePair(from, to);
    // notify caller that callee accepted
    emitToUser(from, 'video-call-accepted', { from, to, at: Date.now() });
    // (optional) notify callee too if your client expects it:
    emitToUser(to, 'video-call-accepted', { from, to, at: Date.now() });
  });

  socket.on('video-call-declined', ({ from, to }) => {
    if (!from || !to) return;
    clearRingTimer(from, to);
    emitToBoth(from, to, 'video-call-declined', { from, to, at: Date.now() });
    // end for both
    forceEndCall(from, to, 'declined');
  });

  // ─────────────────────────────── call request ──────────────────────────────
  socket.on('video-call-request', async (data, callback) => {
    try {
      const { from, to, text, messageId } = data || {};
      if (!from || !to || !text || !messageId) {
        return callback?.({ success: false, error: 'Invalid request' });
      }

      if (activeVideoCalls[from] || activeVideoCalls[to]) {
        emitToUser(from, 'video-call-busy', { message: 'User is already in a call.' });
        return callback?.({ success: false, error: 'Call already active' });
      }

      const [sender, receiver] = await Promise.all([
        User.findById(from), User.findById(to)
      ]);
      if (!sender || !receiver) {
        return callback?.({ success: false, error: 'User not found' });
      }

      // mark pair active during ringing (prevents duplicates while ringing)
      setActivePair(from, to);

      // deliver ring
      const delivered = emitToUser(to, 'incoming-video-call', { from, to, text, messageId, at: Date.now() });
      if (!delivered) {
        console.warn(`⚠️ Receiver ${to} offline—cannot deliver call request.`);
      }

      // store a "request" message (optional)
      const newMessage = new Message({
        from, to, text,
        type: 'video-call-request',
        state: 'sent',
        createdAt: new Date()
      });
      await newMessage.save();

      // start ring timeout (missed call)
      clearRingTimer(from, to);
      const timerId = setTimeout(() => {
        // tell callee: you missed a call
        emitToUser(to, 'video-call-timeout', {
          callerId: from, calleeId: to, reason: 'timeout', at: Date.now()
        });
        // tell caller for cleanup (do not record as missed on caller side)
        emitToUser(from, 'video-call-timeout', {
          callerId: from, calleeId: to, reason: 'timeout', at: Date.now(), notify: false
        });
        // end for both
        forceEndCall(from, to, 'timeout');
      }, RING_TIMEOUT_MS);
      ringTimers.set(keyOf(from, to), timerId);

      callback?.({ success: true, messageId });
    } catch (err) {
      console.error('❌ Error in video-call-request:', err);
      callback?.({ success: false, error: 'Server error' });
    }
  });

  // ─────────────────────────────── started / ended / failed ─────────────────
  socket.on('video-call-started', ({ from, to }) => {
    if (!from || !to) return;
    // accepted: clear ring timer; keep active while ongoing
    clearRingTimer(from, to);
    setActivePair(from, to);
    emitToBoth(from, to, 'video-call-started', { from, to, at: Date.now() });
  });

  // Any side can emit this; we end it for both
  socket.on('video-call-ended', ({ from, to, reason }) => {
    if (!from || !to) return;
    forceEndCall(from, to, reason || 'ended');
  });

  socket.on('video-call-failed', ({ from, to, error }) => {
    if (!from || !to) return;
    clearRingTimer(from, to);
    emitToBoth(from, to, 'video-call-failed', { from, to, error, at: Date.now() });
    forceEndCall(from, to, 'failed');
  });

  // ───────────────────────────── disconnect safety ───────────────────────────
  socket.on('disconnect', () => {
    const me = socket.userId;
    if (!me) return;
    const other = activeVideoCalls[me];
    if (other) {
      // tell the other side this ended due to disconnect
      forceEndCall(me, other, 'disconnect');
    }
  });
};

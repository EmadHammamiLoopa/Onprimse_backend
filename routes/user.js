const express = require('express');
const User = require('../app/models/User');  // ✅ Import User model
const Request = require('../app/models/Request');  // ✅ Import Request model
const Report = require('../app/models/Report');  // ✅ Import Report model
const Post = require('../app/models/Post');  // ✅ Import Post model
const fs = require('fs');  
const path = require('path');
const { Parser } = require('json2csv');  // ✅ Import json2csv to handle CSV conversion
const Comment = require("../app/models/Comment");
const Channel = require("../app/models//Channel");
const Product = require("../app/models//Product");
const Job = require("../app/models//Job");
const Service = require("../app/models//Service");
const Subscription = require('../app/models/Subscription'); // Adjust the path to your Subscription model
const peerStore = require('.././app/utils/peerStorage');
const { notifyPeerNeeded } = require('../app/helpers');   // <-- import once

const {
    allUsers,
    updateUser,
    deleteUser,
    showUser,
    updateAvatar,
    getUsers,
    follow,
    getUserProfile,
    getFriends,
    removeFriendship,
    blockUser,
    unblockUser,
    updateEmail,
    updatePassword,
    storeUser,
    updateUserDash,
    showUserDash,
    toggleUserStatus,
    clearUserReports,
    reportUser,
    banUser,
    unbanUser,
    updateRandomVisibility,
    deleteAccount,
    updateAgeVisibility,
    profileVisited,
    updateMainAvatar,
    uploadChatMedia,
    removeAvatar
} = require('../app/controllers/UserController');
const { requireSignin, isAuth, withAuthUser, isAdmin, isSuperAdmin } = require('../app/middlewares/auth');
const form = require('../app/middlewares/form');
const { userById, isNotBlocked } = require('../app/middlewares/user');
const { userUpdateValidator, updateEmailValidator, updatePasswordValidator, userStoreValidator, userDashUpdateValidator } = require('../app/middlewares/validators/userValidator');
const router = express.Router();
const multer = require('multer');
const Peer = require('../app/models/Peer');   // ← add this
const { upload, chatUpload } = require('../middlewares/upload');


// Register routes
router.put('/randomVisibility', [requireSignin], updateRandomVisibility);
router.put('/ageVisibility', [requireSignin, withAuthUser], updateAgeVisibility);
router.get('/friends', [requireSignin, withAuthUser], getFriends);
router.get('/profile-visited', [requireSignin, withAuthUser], profileVisited);
router.post('/profile-visited', [requireSignin, withAuthUser], profileVisited);

router.get('/all', [requireSignin, isAdmin], allUsers);
router.post('/', [form, requireSignin, isSuperAdmin, userStoreValidator], storeUser);

// Add PeerJS routes

/**
 * ✅ Store Peer ID when a user connects
 */router.post('/:userId/peer', async (req, res) => {
  const { userId } = req.params;
  const { peerId }  = req.body;

  if (!peerId) {
    return res.status(400).json({ success:false, message:'peerId is required' });
  }

  try {
    await peerStore.set(userId, peerId);                // <-- upsert + ttl refresh
    console.log(`✅  stored peerId for ${userId}: ${peerId}`);

    return res.json({
      success : true,
      message : 'Peer ID stored',
      userId,
      peerId
    });
  } catch (err) {
    console.error('❌  peerStore.set failed:', err);
    return res.status(500).json({ success:false, message:'DB error', error:err.message });
  }
});


/* ───────────────────────── GET   /:userId/peer ──────────────────────────
 * The caller hits this to find out whether the callee is online.
 *  – If a fresh record exists      → return {peerId, expires}
 *  – If missing/expired            → nudge callee + return {peerId:null}
 */
router.get('/:userId/peer', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const record = await peerStore.get(userId); // { peerId, lastUpdated } | null

    if (!record) {
      notifyPeerNeeded(userId); // wake the callee via socket or other means
      return res.json({ success: true, peerId: null });
    }

    return res.json({
      success: true,
      peerId: record.peerId
    });

  } catch (err) {
    next(err); // pass to global error handler
  }
});


/**
 * ✅ Delete Peer ID
 */
router.delete('/:userId/peer', async (req, res) => {
    const userId = req.params.userId;

    try {
        const peer = await peerStore.get(userId);

        if (!peer) {
            return res.status(404).json({
                success: false,
                message: "Peer ID not found.",
                userId
            });
        }

        await peerStore.delete(userId);
        console.log(`❌ Removed peerId for userId: ${userId}`);
        return res.json({
            success: true,
            message: "Peer ID removed successfully.",
            userId
        });

    } catch (err) {
        console.error("❌ Error deleting peerId:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to delete peer ID.",
            error: err.message
        });
    }
});

router.patch('/:userId/peer/heartbeat', async (req, res) => {
  const { userId } = req.params;

  try {
    await Peer.updateOne(
      { userId },
      { $set: { lastUpdated: new Date() } }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('❌ heartbeat error:', err);
    return res.status(500).json({ success: false, message: 'DB error' });
  }
});

router.post('/:userId/upload', [requireSignin, withAuthUser, chatUpload.single('upload')], (req, res, next) => {
  console.log('✅ Reached /:userId/upload route');
  console.log('Request params userId:', req.params.userId);
  console.log('Authenticated user from middleware:', req.auth);
  console.log('Uploaded file info:', req.file);
  console.log('Saved Chat Path:', req.savedChatPath);

  // You can keep your original controller logic here
  uploadChatMedia(req, res, next);
});

router.get('/dash/:userId', [requireSignin, isAdmin], showUserDash);
router.put('/dash/:userId', [form, requireSignin, isSuperAdmin, userDashUpdateValidator], updateUserDash);

router.post('/follow/:userId', [requireSignin, isNotBlocked, withAuthUser], follow);
router.put('/profile/main-avatar/:userId', [requireSignin, withAuthUser], updateMainAvatar);
router.post('/friends/remove/:userId', [requireSignin, withAuthUser], removeFriendship);
router.put('/:userId', [requireSignin, withAuthUser, userUpdateValidator], updateUser);

router.get('/users', [requireSignin, withAuthUser], getUsers);
router.get('/profile/:userId', [requireSignin, withAuthUser, isNotBlocked], getUserProfile);

router.put('/', [requireSignin, withAuthUser, userUpdateValidator], updateUser);
router.put('/:userId/email', [requireSignin, updateEmailValidator, withAuthUser], updateEmail);
router.put('/:userId/password', [requireSignin, updatePasswordValidator, withAuthUser], updatePassword);

router.post('/status/:userId', [requireSignin, isAdmin], toggleUserStatus);
router.put('/:userId/avatar', [requireSignin, withAuthUser, upload.single('avatar')], updateAvatar);
router.delete('/remove-avatar/:userId/:avatarUrl', [requireSignin, withAuthUser], removeAvatar);
router.put('/update-main-avatar/:userId', [requireSignin, withAuthUser], updateMainAvatar);

router.delete('/user/:id/avatar', [requireSignin, withAuthUser], removeAvatar);
router.put('/user/:id/main-avatar', [requireSignin, withAuthUser], updateMainAvatar);

router.post('/:userId/block', [requireSignin, withAuthUser], blockUser);
router.post('/:userId/unblock', [requireSignin], unblockUser);

router.delete('/', [requireSignin, withAuthUser], deleteAccount);
router.delete('/:userId', [requireSignin, isSuperAdmin], deleteUser);

router.post('/:userId/clearReports', [requireSignin, isAdmin], clearUserReports);
router.get('/:userId', [requireSignin, isAuth], showUser);

router.post('/:userId/report', [requireSignin], reportUser);
router.post('/:userId/ban', [requireSignin, isAdmin], banUser);
router.post('/:userId/unban', [requireSignin, isAdmin], unbanUser);

router.get('/extract/:userId', requireSignin, isAdmin, async (req, res) => {
    try {
        const userId = req.params.userId;
        console.log(`🔍 Extracting data for user: ${userId}`);

        // ✅ Fetch user details
        const user = await User.findById(userId).lean();
        if (!user) {
            console.log(`❌ User ${userId} not found.`);
            return res.status(404).json({ error: 'User not found' });
        }
        console.log(`✅ User found: ${user.firstName} ${user.lastName} (${user.email})`);

        // ✅ Fetch related data
        const requests = await Request.find({ user: userId }).lean();
        const reports = await Report.find({ user: userId }).lean();
        const posts = await Post.find({ user: userId }).lean();
        const products = await Product.find({ user: userId }).lean();
        const jobs = await Job.find({ user: userId }).lean();
        const services = await Service.find({ user: userId }).lean();
        const channels = await Channel.find({ owner: userId }).lean();
        const comments = await Comment.find({ user: userId }).lean();

        console.log(`📊 Data Counts - Requests: ${requests.length}, Reports: ${reports.length}, Posts: ${posts.length}, Products: ${products.length}, Jobs: ${jobs.length}, Services: ${services.length}, Channels: ${channels.length}, Comments: ${comments.length}`);

        // ✅ Flatten user data into CSV-friendly format
        const flatData = {
            user_id: user._id,
            first_name: user.firstName,
            last_name: user.lastName,
            email: user.email,
            phone: user.phone || 'N/A',
            role: user.role,
            gender: user.gender,
            birth_date: user.birthDate || 'N/A',
            country: user.country,
            city: user.city,
            education: user.education || 'N/A',
            profession: user.profession || 'N/A',
            interests: user.interests ? user.interests.join(', ') : 'N/A',
            banned: user.banned ? 'Yes' : 'No',
            banned_reason: user.bannedReason || 'Not Banned',
            friends_count: user.friends ? user.friends.length : 0,
            reports_count: reports.length,
            requests_count: requests.length,
            posts_count: posts.length,
            products_count: products.length,
            jobs_count: jobs.length,
            services_count: services.length,
            channels_count: channels.length,
            comments_count: comments.length,
        };

        console.log("✅ Flattened user data ready for CSV:", flatData);

        // ✅ Ensure logs directory exists
        const logsDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(logsDir)) {
            console.log("📂 Logs directory not found. Creating...");
            fs.mkdirSync(logsDir, { recursive: true });
        }

        // ✅ Log extraction for GDPR compliance
        const logMessage = `${new Date().toISOString()} - Admin ${req.user.id} extracted data for user ${userId}\n`;
        fs.appendFileSync(path.join(logsDir, 'extraction.log'), logMessage);
        console.log(`📝 GDPR Log Updated: ${logMessage.trim()}`);

        // ✅ Convert user data to CSV
        const fields = Object.keys(flatData);
        const parser = new Parser({ fields });
        const csv = parser.parse([flatData]);

        console.log("✅ CSV Generated Successfully!");

        // ✅ Send CSV file with 200 response
        res.status(200)
            .header('Content-Type', 'text/csv')
            .header('Content-Disposition', `attachment; filename="user_${userId}.csv"`)
            .send(csv);

    } catch (error) {
        console.error('❌ Error extracting user data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
router.param('userId', userById);

module.exports = router;

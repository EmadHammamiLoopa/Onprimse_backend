const express = require('express');
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
    removeAvatar
} = require('../app/controllers/UserController');
const { requireSignin, isAuth, withAuthUser, isAdmin, isSuperAdmin } = require('../app/middlewares/auth');
const form = require('../app/middlewares/form');
const { userById, isNotBlocked } = require('../app/middlewares/user');
const { userUpdateValidator, updateEmailValidator, updatePasswordValidator, userStoreValidator, userDashUpdateValidator } = require('../app/middlewares/validators/userValidator');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const upload = require('../middlewares/upload'); // Adjust the path if necessary

// Register fixed routes first
router.put('/randomVisibility', [requireSignin], updateRandomVisibility);
router.put('/ageVisibility', [requireSignin, withAuthUser], updateAgeVisibility);
router.get('/friends', [requireSignin, withAuthUser], getFriends);
router.get('/profile-visited', [requireSignin, withAuthUser], profileVisited);
router.post('/profile-visited', [requireSignin, withAuthUser], profileVisited);

// Other routes
router.get('/all', [requireSignin, isAdmin], allUsers);
router.post('/', [form, requireSignin, isSuperAdmin, userStoreValidator], storeUser);
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
router.get('/profile/me', [requireSignin, withAuthUser], (req, res) => {
    // Log the authenticated user's information
    console.log('Authenticated user in /profile/me route:', req.auth);

    // Ensure we use the authenticated user's ID
    req.params.userId = req.auth._id;

    // Log the userId being set
    console.log('Setting req.params.userId to:', req.params.userId);

    // Call getUserProfile function and pass the modified request
    getUserProfile(req, res);
});

// Parameter middleware
router.param('userId', userById);  // Apply requireSignin first

module.exports = router;

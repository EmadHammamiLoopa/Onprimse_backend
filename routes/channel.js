const express = require('express');
const {
  myChannels,
  storeChannel,
  followedChannels,
  exploreChannels, // This handles all explore levels (city, country, global)
  followChannel,
  deleteChannel,
  allChannels,
  showChannel,
  //disableChannel,
  updateChannel,
  clearChannelReports,
  reportChannel,
  toggleChannelStatus,
  //getCityChannels,
  toggleChannelApprovement,
} = require('../app/controllers/ChannelController');

const { requireSignin, withAuthUser, isAdmin } = require('../app/middlewares/auth');
const { channelById, channelOwner } = require('../app/middlewares/channel');
const form = require('../app/middlewares/form');
const { storeChannelValidator } = require('../app/middlewares/validators/ChannelValidator');

const router = express.Router();

// Admin Routes
router.get('/all', [requireSignin, isAdmin], allChannels);
router.delete('/dash/:channelId', [requireSignin, isAdmin], deleteChannel);
router.post('/:channelId/status', [requireSignin, isAdmin], toggleChannelStatus);
router.post('/:channelId/approvement', [requireSignin, isAdmin], toggleChannelApprovement);
router.post('/:channelId/clearReports', [requireSignin, isAdmin], clearChannelReports);

// User Routes
router.get('/', [requireSignin], myChannels);
router.post('/', [form, requireSignin, storeChannelValidator, withAuthUser], storeChannel);
router.post('/follow/:channelId', [requireSignin, withAuthUser], followChannel);
router.get('/followed', [requireSignin, withAuthUser], followedChannels);

// Explore Channels Route (handles city, country, and global exploration)
router.get('/explore', [requireSignin, withAuthUser], exploreChannels); // Handles all exploration levels

// Channel Management Routes
router.delete('/:channelId', [requireSignin, channelOwner], deleteChannel);
router.get('/:channelId', [requireSignin, isAdmin], showChannel);
router.put('/:channelId', [form, requireSignin, isAdmin], updateChannel);
router.post('/:channelId/report', [requireSignin], reportChannel);

//router.post('/citychannels', getCityChannels);

// Param Middleware
router.param('channelId', channelById);

module.exports = router;

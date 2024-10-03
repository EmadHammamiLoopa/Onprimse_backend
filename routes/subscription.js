const express = require('express');
const { subscriptions, allSubscriptions, showSubscription, storeSubscription, updateSubscription, destroySubscription, getSubscription, clientSecret, subscribe } = require('../app/controllers/SubscriptionController');
const { requireSignin, isAdmin, isSuperAdmin, withAuthUser } = require('../app/middlewares/auth');
const form = require('../app/middlewares/form');
const { subscriptionById } = require('../app/middlewares/subscription');
const { updateServiceValidator } = require('../app/middlewares/validators/serviceValidator');
const { storeSubscriptionValidator } = require('../app/middlewares/validators/subscription');
const router = express.Router()

router.get('/all', [requireSignin, isSuperAdmin], allSubscriptions)
router.post('/', [form, requireSignin, storeSubscriptionValidator, isSuperAdmin], storeSubscription)

router.get('/prices', [requireSignin], getSubscription)

router.get('/', [requireSignin], subscriptions)

router.put('/:subscriptionId', [form, requireSignin, updateServiceValidator, isSuperAdmin], updateSubscription)
router.delete('/:subscriptionId', [requireSignin, isSuperAdmin], destroySubscription)
router.get('/:subscriptionId', [requireSignin, isSuperAdmin], showSubscription)

// router.post('/:subscriptionId/pay', [requireSignin, withAuthUser], payAndSubscribeV2)

router.post('/:subscriptionId/client-secret', [requireSignin, withAuthUser], clientSecret)
router.post('/:subscriptionId/subscribe', [requireSignin, withAuthUser], subscribe)

router.param('subscriptionId', subscriptionById)

module.exports = router
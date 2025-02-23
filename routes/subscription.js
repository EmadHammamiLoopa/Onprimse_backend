const express = require('express');
const { subscriptions, allSubscriptions, showSubscription, storeSubscription,updatePrices,manageOffers, updateSubscription, destroySubscription, getSubscription, clientSecret, subscribe } = require('../app/controllers/SubscriptionController');
const { requireSignin, isAdmin, isSuperAdmin, withAuthUser } = require('../app/middlewares/auth');
const form = require('../app/middlewares/form');
const { subscriptionById } = require('../app/middlewares/subscription');
const { updateServiceValidator } = require('../app/middlewares/validators/serviceValidator');
const { storeSubscriptionValidator } = require('../app/middlewares/validators/subscription');
const router = express.Router()

router.get('/all', [requireSignin, isAdmin], allSubscriptions)
router.post('/', [form, requireSignin, storeSubscriptionValidator, isAdmin], storeSubscription)

router.get('/prices', [requireSignin, withAuthUser], getSubscription)

router.get('/', [requireSignin], subscriptions)

router.put('/:subscriptionId', [form, requireSignin, updateServiceValidator, isAdmin], updateSubscription)
router.delete('/:subscriptionId', [requireSignin, isAdmin], destroySubscription)
router.get('/:subscriptionId', [requireSignin, isAdmin], showSubscription)


// New routes to update prices and manage offers
router.put('/:subscriptionId/prices', [requireSignin, isAdmin], updatePrices);  // Update prices
router.put('/:subscriptionId/offers', [requireSignin, isAdmin], manageOffers);  // Update offers


// router.post('/:subscriptionId/pay', [requireSignin, withAuthUser], payAndSubscribeV2)

router.post('/:subscriptionId/client-secret', [requireSignin, withAuthUser], clientSecret)
router.post('/:subscriptionId/subscribe', [requireSignin, withAuthUser], subscribe)

router.param('subscriptionId', subscriptionById)

module.exports = router
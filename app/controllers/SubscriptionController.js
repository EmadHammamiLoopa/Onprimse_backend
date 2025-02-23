const { extractDashParams } = require("../helpers");
const Subscription = require("../models/Subscription")
const Response = require("./Response")
const _ = require('lodash')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const User = require("../models/User");




// Existing controller methods...

// New method to update subscription prices from the dashboard
exports.updatePrices = async (req, res) => {
    try {
        const { dayPrice, weekPrice, monthPrice, yearPrice, currency, userId} = req.body;

        if (userId) {
            // Update prices only for this specific user
            let userSubscription = await Subscription.findOne({ _id: req.params.subscriptionId, userId });
            if (!userSubscription) {
                return Response.sendError(res, 404, 'User-specific subscription not found');
            }
            userSubscription.dayPrice = dayPrice;
            userSubscription.weekPrice = weekPrice;
            userSubscription.monthPrice = monthPrice;
            userSubscription.yearPrice = yearPrice;
            userSubscription.currency = currency;

            await userSubscription.save();
            return Response.sendResponse(res, userSubscription, 'Prices updated for the specific user');
        } else {
            // Update prices for the global subscription (applies to all users)
            let subscription = await Subscription.findOne({ _id: req.params.subscriptionId });
            if (!subscription) {
                return Response.sendError(res, 404, 'Subscription not found');
            }
            subscription.dayPrice = dayPrice;
            subscription.weekPrice = weekPrice;
            subscription.monthPrice = monthPrice;
            subscription.yearPrice = yearPrice;
            subscription.currency = currency;

            await subscription.save();
            return Response.sendResponse(res, subscription, 'Prices updated for all users');
        }
    } catch (error) {
        console.error('Error updating prices:', error);
        return Response.sendError(res, 500, 'Failed to update prices');
    }
};


// New method to manage offers for subscriptions from the dashboard
exports.manageOffers = async (req, res) => {
    try {
        const { offers } = req.body;
        let subscription = await Subscription.findOne({ _id: req.params.subscriptionId });
        
        if (!subscription) {
            return Response.sendError(res, 404, 'Subscription not found');
        }

        // Update the offers
        subscription.offers = offers;  // Expecting offers to be an array of strings

        await subscription.save();
        return Response.sendResponse(res, subscription, 'Offers updated successfully');
    } catch (error) {
        console.error('Error updating offers:', error);
        return Response.sendError(res, 500, 'Failed to update offers');
    }
};



exports.getSubscription = async (req, res) => {
    try {
        const subscription = await Subscription.findOne({});
        if (!subscription) {
            return Response.sendError(res, 400, 'Subscription not found');
        }
        return Response.sendResponse(res, subscription);
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.showSubscription = (req, res) => {
    return Response.sendResponse(res, req.subscription)
}

exports.storeSubscription = async (req, res) => {
    try {
        const { offers, dayPrice, weekPrice, monthPrice, yearPrice, currency, userId } = req.body;

        let newSubscription;
        if (userId) {
            // Create a user-specific subscription
            newSubscription = new Subscription({
                offers,
                dayPrice,
                weekPrice,
                monthPrice,
                yearPrice,
                currency,
                userId
            });
        } else {
            // Create a general subscription
            newSubscription = new Subscription({
                offers,
                dayPrice,
                weekPrice,
                monthPrice,
                yearPrice,
                currency
            });
        }

        await newSubscription.save();
        return Response.sendResponse(res, newSubscription, 'Subscription created successfully');
    } catch (error) {
        console.error('Error creating subscription:', error);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};


exports.updateSubscription = async (req, res) => {
    try {
        // Retrieve the subscription based on a specific identifier (e.g., `req.params.subscriptionId` or another filter)
        const subscription = await Subscription.findOne({ _id: req.params.subscriptionId });

        // If no subscription is found, return an error
        if (!subscription) {
            return Response.sendError(res, 400, 'Subscription not found');
        }

        // Merge the updated fields into the subscription object
        Object.assign(subscription, req.fields);

        // Parse the 'offers' field if it's provided as a JSON string
        if (typeof req.fields.offers === 'string') {
            subscription.offers = JSON.parse(req.fields.offers);
        }

        // Save the updated subscription using async/await
        await subscription.save();

        // Send a success response after saving
        return Response.sendResponse(res, subscription, 'The subscription has been updated successfully');
    } catch (error) {
        console.error('Error updating subscription:', error);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};

exports.allSubscriptions = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['currency', 'offers']);

        // Fetch all users
        const users = await User.find().lean();

        // Fetch all subscriptions
        const subscriptions = await Subscription.find(dashParams.filter).lean();

        // Create a map of subscriptions by userId
        const subscriptionMap = subscriptions.reduce((acc, subscription) => {
            acc[subscription.userId] = subscription; // Map subscriptions by userId
            return acc;
        }, {});

        // Combine users with their subscriptions
        const combinedData = users.map((user) => {
            const userSubscription = subscriptionMap[user._id] || null; // Get subscription or null

            return {
                userId: user._id,
                firstName: user.firstName || 'N/A',
                lastName: user.lastName || 'N/A',
                email: user.email || 'N/A',
                subscriptionId: userSubscription ? userSubscription._id : 'N/A',
                dayPrice: userSubscription ? userSubscription.dayPrice : 0,
                weekPrice: userSubscription ? userSubscription.weekPrice : 0,
                monthPrice: userSubscription ? userSubscription.monthPrice : 0,
                yearPrice: userSubscription ? userSubscription.yearPrice : 0,
                currency: userSubscription ? userSubscription.currency : 'N/A',
                subscribed: userSubscription && new Date(userSubscription.expireDate) > new Date(), // Valid subscription
            };
        });

        // Pagination logic
        const startIndex = dashParams.skip || 0;
        const endIndex = startIndex + (dashParams.limit || combinedData.length);
        const paginatedData = combinedData.slice(startIndex, endIndex);

        // Total count for pagination
        const totalCount = users.length;

        // Send response
        return res.status(200).json({
            success: true,
            data: {
                docs: paginatedData,
                totalPages: Math.ceil(totalCount / (dashParams.limit || totalCount)),
            },
            message: null,
        });
    } catch (error) {
        console.error('Error fetching subscriptions:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};






exports.subscriptions = (req, res) => {
    try{
        Subscription.find({}, (err, subscriptions) => {
            if(err || !subscriptions) return Response.sendError(res, 400)
            return Response.sendResponse(res, subscriptions)
        })
    }catch(err){
        console.log(err);
    }
}

exports.destroySubscription = async (req, res) => {
    try {
        const subscription = await Subscription.findByIdAndDelete(req.subscription._id);

        if (!subscription) {
            return Response.sendError(res, 400, 'Subscription not found or already removed');
        }

        return Response.sendResponse(res, subscription, 'Subscription removed successfully');
    } catch (err) {
        console.error('Error removing subscription:', err);
        return Response.sendError(res, 500, 'Server error, failed to remove the subscription');
    }
};


exports.clientSecret = async(req, res) => {
    console.log("Ssssssssssss")
    const subscription = req.subscription
    const duration = req.body.duration
    const { amount } = subExpireDateAndAmount(subscription, duration)
    const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: subscription.currency,
        metadata: {integration_check: 'accept_a_payment'},
    });
    Response.sendResponse(res, {
        client_secret: paymentIntent.client_secret
    })
}

const subExpireDateAndAmount = (subscription, duration) => {

    const expireDate = new Date()
    let amount;

    if(duration == 'day'){
        amount = subscription.dayPrice
        expireDate.setDate(expireDate.getDate() + 1)
    }
    if(duration == 'week'){
        amount = subscription.weekPrice
        expireDate.setDate(expireDate.getDate() + 7)

    }
    if(duration == 'month'){
        amount = subscription.monthPrice
        expireDate.setMonth(expireDate.getMonth() + 1)
    }
    if(duration == 'year'){
        amount = subscription.yearPrice
        expireDate.setFullYear(expireDate.getFullYear() + 1)
    }

    return {
        amount,
        expireDate
    }
}

exports.subscribe = (req, res) => {
    const subscription = req.subscription
    const duration = req.body.duration
    const authUser = req.authUser
    const { expireDate } = subExpireDateAndAmount(subscription, duration)
    
    authUser.subscription = {
        _id: subscription._id,
        expireDate
    }
    authUser.save(async(err, user) => {
        return Response.sendResponse(res, user.publicInfo(), 'Payment Successful')
    })
}

exports.payAndSubscribe = (req, res) => {
    const subscription = req.subscription
    const token = req.body.token
    const duration = req.body.duration
    let expireDate = new Date()
    const authUser = req.authUser

    let amount = subscription.yearPrice
    
    if(duration == 'day'){
        amount = subscription.dayPrice
        expireDate.setDate(expireDate.getDate() + 1)
    }
    if(duration == 'week'){
        amount = subscription.weekPrice
        expireDate.setDate(expireDate.getDate() + 7)

    }
    if(duration == 'month'){
        amount = subscription.monthPrice
        expireDate.setMonth(expireDate.getMonth() + 1)
    }
    if(duration == 'year'){
        amount = subscription.yearPrice
        expireDate.setFullYear(expireDate.getFullYear() + 1)
    }

    stripe.charges.create({
        amount: Math.round(amount * 100),
        source: token,
        currency: subscription.currency
    }).then(
        () => {
            authUser.subscription = {
                _id: subscription._id,
                expireDate
            }
            authUser.save((err, user) => {
                return Response.sendResponse(res, user.publicInfo(), 'Payment Successful')
            })
        },
        err => {
            console.log(err)
            return Response.sendError(res, 400, err);
        }
    )
}
const { extractDashParams } = require("../helpers");
const Subscription = require("../models/Subscription")
const Response = require("./Response")
const _ = require('lodash')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)


exports.getSubscription = (req, res) => {
    Subscription.findOne({}, (err, subscription) => {
        if(err || !subscription) return Response.sendError(res, 400, 'Server error')
        return Response.sendResponse(res, subscription)
    })
}

exports.showSubscription = (req, res) => {
    return Response.sendResponse(res, req.subscription)
}

exports.storeSubscription = (req, res) => {
    try {
        subscription = new Subscription(req.fields)
        subscription.offers = JSON.parse(req.fields.offers)
        subscription.save((err, subscription) => {
            if(err || !subscription) return Response.sendError(res, 400, 'Server error, please try again later')
            return Response.sendResponse(res, subscription, 'the subscription has been created successfully')
        }) 
    } catch (error) {
        console.log(error);
    }
}

exports.updateSubscription = (req, res) => {
    try {
        let subscription = req.subscription
        subscription = _.extend(subscription, req.fields)
        subscription.offers = JSON.parse(req.fields.offers)

        subscription.save((err, subscription) => {
            if(err || !subscription) return Response.sendError(res, 400, 'Server error, please try again later')
            return Response.sendResponse(res, subscription, 'the subscription has been updated successfully')
        })
    } catch (error) {
        console.log(error);
    }
}

exports.allSubscriptions = (req, res) => {
    try{
        dashParams = extractDashParams(req, ['currency', 'offers']);
        Subscription.find(dashParams.filter)
        .sort(dashParams.sort)
        .skip(dashParams.skip)
        .limit(dashParams.limit)
        .exec(async(err, subscriptions) => {
            console.log(err);
            if(err || !subscriptions) return Response.sendError(res, 400)
            const count = await Subscription.find({}).countDocuments();
            return Response.sendResponse(res, {
                docs: subscriptions,
                totalPages: Math.ceil(count / dashParams.limit)
            })
        })
    }catch(err){
        console.log(err);
    }
}

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

exports.destroySubscription = (req, res) => {
    let subscription = req.subscription
    subscription.remove((err, subscription) => {
        if(err) return Response.sendError(res, 400, 'failed to remove this subscription plan')
        return Response.sendResponse(res, subscription)
    })
}

exports.clientSecret = async(req, res) => {
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
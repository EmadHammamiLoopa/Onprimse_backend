const Response = require('../controllers/Response')
const { adminCheck } = require('../helpers')
const Service = require('./../models/Service')
const { userSubscribed } = require('./subscription')

exports.serviceById = (req, res, next, id) => {
    Service.findOne({_id: id}, {
        title: 1,
        company: 1,
        country: 1,
        city: 1,
        phone:1,
        description: 1,
        photo: "$photo.path",
        user: 1,
        deletedAt: 1,
        createdAt: 1
    }, (err, service) => {
        if(err || !service) return Response.sendError(res, 400, 'service not found')
        req.service = service
        next()
    })
}

exports.serviceOwner = (req, res, next) => {
    if(adminCheck(req)){
        return next()
    }

    if(req.auth._id != req.service.user){
        return Response.sendError(res, 403, 'Access denied')
    }

    next();
}
exports.serviceStorePermission = async (req, res, next) => {
    try {
        // Check if the user is subscribed
        if (await userSubscribed(req.authUser)) {
            return next();
        }

        // Use async/await for Service.find()
        const services = await Service.find(
            { user: req.auth._id },
            {},
            { sort: { createdAt: -1 }, limit: 1 }
        );

        const currDate = new Date();

        // Check if the last service was created less than 24 hours ago
        if (services[0] && currDate.getTime() - new Date(services[0].createdAt).getTime() < 24 * 60 * 60 * 1000) {
            return Response.sendResponse(res, { date: services[0].createdAt });
        } else {
            next();
        }
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 400, 'An error has occurred, please try again later');
    }
};

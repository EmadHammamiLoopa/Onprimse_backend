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
exports.serviceStorePermission = async(req, res, next) => {
    try {
        if(await userSubscribed(req.authUser)){
            return next()
        }
        Service.find(
            {user: req.auth._id},
            {}, 
            {sort: {'createdAt': -1}, limit: 1}, 
            (err, service) => {
                if(err) return Response.sendError(res, 400, 'an error has occured, please try again later')
                const currDate = new Date()
                /*
                * check if the difference between the current date and the date when the last product 
                was created is less than 24 hours
                */
                if(service[0] && currDate.getTime() - (new Date(service[0].createdAt)).getTime() < 24 * 60 * 60 * 1000){
                    return Response.sendResponse(res, {date: service[0].createdAt})
                }else{
                    next()
                }
            }
        )
    } catch (error) {
        console.log(error);
    }
}
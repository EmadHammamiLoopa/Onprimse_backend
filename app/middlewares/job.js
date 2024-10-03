const Response = require("../controllers/Response")
const { adminCheck } = require("../helpers")
const Job = require("../models/Job")
const { userSubscribed } = require("./subscription")

exports.jobById = (req, res, next, id) => {
    Job.findOne({_id: id}, {
        title: 1,
        company: 1,
        country: 1,
        city: 1,
        email: 1,
        description: 1,
        photo: "$photo.path",
        user: 1,
        deletedAt: 1,
        createdAt: 1
    }, (err, job) => {
        if(err || !job) return Response.sendError(res, 400, 'job not found')
        req.job = job
        next()
    })
}

exports.jobOwner = (req, res, next) => {
    if(adminCheck(req)){
        return next()
    }

    if(req.auth._id != req.job.user){
        return Response.sendError(res, 403, 'Access denied')
    }

    next();
}

exports.jobStorePermission = async(req, res, next) => {
    
    if(await userSubscribed(req.authUser)){
        return next()
    }
    Job.find(
        {user: req.auth._id},
        {}, 
        {sort: {'createdAt': -1}, limit: 1}, 
        (err, job) => {
            if(err) return Response.sendError(res, 'an error has occured, please try again later')
            
            const currDate = new Date()
            /*
            * check if the difference between the current date and the date when the last product 
            was created is less than 24 hours
            */
            if(job[0] && currDate.getTime() - (new Date(job[0].createdAt)).getTime() < 24 * 60 * 60 * 1000)
                return Response.sendResponse(res, {date: job[0].createdAt})
            else
                next()
        }
    )
}
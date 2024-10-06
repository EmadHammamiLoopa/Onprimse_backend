const Response = require('./Response')
const fs = require('fs')
const _ = require('lodash')
const path = require('path')
const Job = require('../models/Job')
const mongoose = require('mongoose')
const { extractDashParams, report } = require('../helpers')
const Report = require('../models/Report')

exports.reportJob = (req, res) => {
    try {
        const job = req.job
        if(!req.body.message) return Response.sendError(res, 400, 'please enter a message')
        report(req, res, 'job', job._id, (report) => {
            Job.updateOne({_id: job._id}, {$push: {reports: report}}, (err, job) => {
                if(err) return Response.sendError(res, 400, 'failed')
                return Response.sendResponse(res, null, 'Thank you for reporting')
            })
        })
    } catch (error) {
        console.log(error);
    }
}

exports.clearJobReports = (req, res) => {
    Report.remove({
        "entity._id": req.job._id,
        "entity.name": "job"
    }, (err, rmRes) => {
        if(err) return Response.sendError(res, 400, 'failed to clear reports')
        return Response.sendResponse(res, null, "reports cleaned")
    })
}

exports.toggleJobStatus = (req, res) => {
    const job = req.job
    job.deletedAt = job.deletedAt ? null : new Date().toJSON()
    job.save((err, job) => {
        if(err) return Response.sendError(res, 400, 'failed')
        return Response.sendResponse(res, job, 'job ' + (job.deletedAt ? 'disabled' : 'enabled'))
    })
}

exports.showJobDash = (req, res) => {
    try {
        Job.findOne({_id: req.job._id}, {
            title: 1,
            description: 1,
            company: 1,
            country: 1,
            city: 1,
            email: 1,
            photo: "$photo.path",
            user: 1,
            deletedAt: 1
        })
        .populate('reports')
        .exec((err, job) => {
            if(err || !job) return Response.sendError(res, 500, 'Server error, please try again later');
            return Response.sendResponse(res, job)
        })
    } catch (error) {
        console.log(error);
    }
}

exports.allJobs = (req, res) => {
    try{
        dashParams = extractDashParams(req, ['title', 'description', 'company', 'location']);
        Job.aggregate()
        .match(dashParams.filter)
        .project({
            title: 1,
            description: 1,
            company: 1,
            photo: "$photo.path",
            country: 1,
            city: 1,
            deletedAt: 1,
            reports: {
                $size: "$reports"
            }
        })
        .sort(dashParams.sort)
        .skip(dashParams.skip)
        .limit(dashParams.limit)
        .exec(async(err, jobs) => {
            if(err || !jobs) return Response.sendError(res, 500, 'Server error, please try again later');
            const count = await Job.find(dashParams.filter).countDocuments();
            return Response.sendResponse(res, {
                docs: jobs,
                totalPages: Math.ceil(count / dashParams.limit)
            });
        });
    }catch(err){
        console.log(err);
    }
}

exports.showJob = (req, res) => {
    return Response.sendResponse(res, req.job)
}

exports.postedJobs = (req, res) => {
    try{
        const filter = {
            user: new mongoose.Types.ObjectId(req.auth._id),
            title: new RegExp('^' + req.query.search, 'i'),
            deletedAt: null
        }
        const page = req.query.page
        const limit = 20
        Job.find(filter , {
            title: 1,
            photo: "$photo.path",
            country: 1,
            city: 1,
            company: 1,
            description: 1,
            createdAt: 1
        })
        .sort({createdAt: -1})
        .skip(limit * page)
        .limit(limit)
        .exec((err, jobs) => {
            if(err || !jobs) return Response.sendError(res, 400, 'cannot retreive jobs')
            Job.find(filter).countDocuments((err, count) => {
                return Response.sendResponse(res, {
                    jobs,
                    more: (count - (limit * (page + 1))) > 0
                })
            })
        })
    }catch(err){
        console.log(err);
    }
}

exports.availableJobs = (req, res) => {
    try{
        const filter = {
            title: new RegExp('^' + req.query.search, 'i'),
            deletedAt: null,
            city: req.authUser.city,
            country: req.authUser.country
        }
        limit = 20
        Job.find(filter , {
            title: 1,
            photo: "$photo.path",
            price: 1,
            country: 1,
            city: 1,
            company: 1,
            description: 1,
            createdAt: 1
        })
        .sort({createdAt: -1})
        .skip(limit * req.query.page)
        .limit(limit)
        .exec((err, jobs) => {
            if(err || !jobs) return Response.sendError(res, 400, 'cannot retreive jobs')
            Job.find(filter).countDocuments((err, count) => {
                return Response.sendResponse(res, {
                    jobs,
                    more: (count - (limit * (+req.query.page + 1))) > 0
                })
            })
        })
    }catch(err){
        console.log(err);
    }
}

exports.storeJob = (req, res) => {
    job = new Job(req.fields)
    job.user = req.auth._id

    if(req.files.photo)
        storeJobPhoto(req.files.photo, job)
    else
        return Response.sendError(res, 400, 'photo is required')

    job.save((err, job) => {
        if(err) return Response.sendError(res, 400, err);
        job.photo.path = process.env.BASEURL + job.photo.path
        return Response.sendResponse(res, job)
    })

}

storeJobPhoto = (photo, job) => {

    photoName = `${ job._id }.${ fileExtension(photo.name) }`
    const photoPath = path.join(__dirname, `./../../public/jobs/${ photoName }`)
    
    fs.writeFileSync(photoPath, fs.readFileSync(photo.path))
    job.photo.path = `/jobs/${ photoName }`
    job.photo.type = photo.type
}

exports.updateJob = (req, res) => {

    let job = req.job
    const fields = _.omit(req.fields, ['photo'])
    job = _.extend(job, fields)

    if(req.files.photo)
        storeJobPhoto(req.files.photo, job)
    
    console.log(job);
    job.save((err, job) => {
        if(err) return Response.sendError(res, 400, 'could not update job')
        return Response.sendResponse(res, job)
    })
}

exports.deleteJob = (req, res) => {
    Job.findOne({_id: req.job._id}, (err, job) => {
        job.deletedAt = new Date().toJSON();
        job.save((err, job) => {
            console.log(err);
            if(err) return Response.sendError(res, 400, 'could not remove job');
            return Response.sendResponse(res, null, 'job removed')
        })
    });
}

exports.destroyJob = (req, res) => {
    const job = req.job
    const photoPath = path.join(__dirname, `./../../public/${ job.photo.path }`)
    job.remove((err, job) => {
        if(err) Response.sendError(res, 400, 'could not remove job');
        console.log(photoPath);
        if(fs.existsSync(photoPath)){
            fs.unlinkSync(photoPath);
        }
        return Response.sendResponse(res, null, 'job removed')
    })
}
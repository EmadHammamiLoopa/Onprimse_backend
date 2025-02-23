const Response = require('./Response');
const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const Job = require('../models/Job');
const mongoose = require('mongoose');
const { extractDashParams, report } = require('../helpers');
const Report = require('../models/Report');

exports.reportJob = async (req, res) => {
    try {
        const job = req.job;
        if (!req.body.message) return Response.sendError(res, 400, 'Please enter a message');
        
        const newReport = await report(req, res, 'job', job._id);
        await Job.updateOne({ _id: job._id }, { $push: { reports: newReport } });
        return Response.sendResponse(res, null, 'Thank you for reporting');
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Failed to report job');
    }
};

exports.clearJobReports = async (req, res) => {
    try {
        await Report.deleteMany({
            "entity._id": req.job._id,
            "entity.name": "job"
        });
        return Response.sendResponse(res, null, "Reports cleaned");
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to clear reports');
    }
};

exports.toggleJobStatus = async (req, res) => {
    try {
        const job = req.job;
        job.deletedAt = job.deletedAt ? null : new Date().toISOString();
        await job.save();
        return Response.sendResponse(res, job, 'Job ' + (job.deletedAt ? 'disabled' : 'enabled'));
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to update job status');
    }
};

exports.showJobDash = async (req, res) => {
    try {
        const job = await Job.findOne({ _id: req.job._id }, {
            title: 1,
            description: 1,
            company: 1,
            country: 1,
            city: 1,
            email: 1,
            photo: "$photo.path",
            jobType: 1,
            minSalary: 1,
            maxSalary: 1,
            experienceLevel: 1,
            jobCategory: 1,
            address:1,
            remoteOption: 1,
            applicationDeadline: 1,
            jobRequirements: 1,
            jobBenefits: 1,
            educationLevel: 1,
            industry: 1,
            website: 1,
            jobLocationType: 1,
            user: 1,
            deletedAt: 1
        }).populate('reports');
        
        if (!job) return Response.sendError(res, 500, 'Job not found');
        return Response.sendResponse(res, job);
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};

exports.allJobs = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['title', 'description', 'company', 'location']);
        const jobs = await Job.aggregate()
            .match(dashParams.filter)
            .project({
                title: 1,
                description: 1,
                company: 1,
                photo: "$photo.path",
                country: 1,
                city: 1,
                jobType: 1,
                minSalary: 1,
                maxSalary: 1,
                experienceLevel: 1,
                jobCategory: 1,
                address:1,
                remoteOption: 1,
                applicationDeadline: 1,
                jobRequirements: 1,
                jobBenefits: 1,
                educationLevel: 1,
                industry: 1,
                website: 1,
                jobLocationType: 1,
                deletedAt: 1,
                reports: { $size: "$reports" }
            })
            .sort(dashParams.sort)
            .skip(dashParams.skip)
            .limit(dashParams.limit);

        const count = await Job.countDocuments(dashParams.filter);
        return Response.sendResponse(res, {
            docs: jobs,
            totalPages: Math.ceil(count / dashParams.limit)
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};

exports.showJob = (req, res) => {
    return Response.sendResponse(res, req.job);
};

exports.postedJobs = async (req, res) => {
    try {
        const filter = {
            user: new mongoose.Types.ObjectId(req.auth._id),
            title: new RegExp('^' + req.query.search, 'i'),
            deletedAt: null
        };
        const page = parseInt(req.query.page) || 0;
        const limit = 20;

        const jobs = await Job.find(filter, {
            title: 1,
            photo: "$photo.path",
            country: 1,
            city: 1,
            address:1,
            company: 1,
            jobType: 1,
            minSalary: 1,
            maxSalary: 1,
            industry: 1,
            description: 1,
            createdAt: 1
        }).sort({ createdAt: -1 }).skip(limit * page).limit(limit);

        const count = await Job.countDocuments(filter);
        return Response.sendResponse(res, {
            jobs,
            more: (count - (limit * (page + 1))) > 0
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to retrieve jobs');
    }
};

exports.availableJobs = async (req, res) => {
    try {
        const filter = {
            title: new RegExp('^' + req.query.search, 'i'),
            deletedAt: null,
            city: req.authUser.city,
            country: req.authUser.country
        };
        const limit = 20;
        const page = parseInt(req.query.page) || 0;

        const jobs = await Job.find(filter, {
            title: 1,
            photo: "$photo.path",
            country: 1,
            city: 1,
            address:1,
            jobType: 1,
            minSalary: 1,
            maxSalary: 1,
            company: 1,
            industry: 1,

            description: 1,
            createdAt: 1
        }).sort({ createdAt: -1 }).skip(limit * page).limit(limit);

        const count = await Job.countDocuments(filter);
        return Response.sendResponse(res, {
            jobs,
            more: (count - (limit * (page + 1))) > 0
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to retrieve jobs');
    }
};

exports.storeJob = async (req, res) => {
    try {
        const job = new Job(req.fields);
        job.user = req.auth._id;
console.log("userrrrrrrrrrrrrid",job.user);
        if (req.files.photo) {
            storeJobPhoto(req.files.photo, job);
        } else {
            return Response.sendError(res, 400, 'Photo is required');
        }

        await job.save();
        job.photo.path = process.env.BASEURL + job.photo.path;
        return Response.sendResponse(res, job);
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to create job');
    }
};

const storeJobPhoto = (photo, job) => {
    try {
        const photoName = `${job._id}.${fileExtension(photo.name)}`;
        const photoPath = path.join(__dirname, `./../../public/jobs/${photoName}`);
        
        fs.writeFileSync(photoPath, fs.readFileSync(photo.path));
        job.photo.path = `/jobs/${photoName}`;
        job.photo.type = photo.type;
    } catch (err) {
        console.log(err);
    }
};


exports.updateJob = async (req, res) => {
    try {
        let job = req.job;
        const fields = _.omit(req.fields, ['photo']);
        job = _.extend(job, fields);

        if (req.files.photo) {
            storeJobPhoto(req.files.photo, job);
        }

        await job.save();
        return Response.sendResponse(res, job, 'Job updated successfully');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to update job');
    }
};

exports.deleteJob = async (req, res) => {
    try {
        const job = req.job;
        job.deletedAt = new Date().toISOString();
        await job.save();
        return Response.sendResponse(res, null, 'Job removed');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to remove job');
    }
};

exports.destroyJob = async (req, res) => {
    try {
        const job = req.job;

        if (!job) {
            return Response.sendError(res, 404, 'Job not found');
        }

        const photoPath = path.join(__dirname, `./../../public/${job.photo.path}`);

        // Use deleteOne instead of remove()
        await Job.deleteOne({ _id: job._id });

        if (fs.existsSync(photoPath)) {
            fs.unlinkSync(photoPath);
        }

        return Response.sendResponse(res, null, 'Job successfully removed');
    } catch (err) {
        console.error(err);
        return Response.sendError(res, 400, 'Failed to remove job');
    }
};

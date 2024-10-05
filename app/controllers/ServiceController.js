const Response = require('./Response')
const fs = require('fs')
const _ = require('lodash')
const path = require('path')
const Service = require('../models/Service')
const mongoose = require('mongoose')
const { extractDashParams, report } = require('../helpers')
const Report = require('../models/Report')

exports.reportService = (req, res) => {
    try {
        const service = req.service
        if(!req.body.message) return Response.sendError(res, 400, 'please enter a message')
        report(req, res, 'service', service._id, (report) => {
            Service.updateOne({_id: service._id}, {$push: {reports: report}}, (err, service) => {
                if(err) return Response.sendError(res, 400, 'failed')
                return Response.sendResponse(res, null, 'Thank you for reporting')
            })
        })
    } catch (error) {
        console.log(error);
    }
}

exports.clearServiceReports = (req, res) => {
    Report.remove({
        "entity._id": req.service._id,
        "entity.name": "service"
    }, (err, rmRes) => {
        if(err) return Response.sendError(res, 400, 'failed to clear reports')
        return Response.sendResponse(res, null, "reports cleaned")
    })
}

exports.toggleServiceStatus = (req, res) => {
    const service = req.service
    service.deletedAt = service.deletedAt ? null : new Date().toJSON()
    service.save((err, service) => {
        if(err) return Response.sendError(res, 400, 'failed')
        return Response.sendResponse(res, service, 'service ' + (service.deletedAt ? 'disabled' : 'enabled'))
    })
}

exports.showServiceDash = (req, res) => {
    Service.findOne({_id: req.service._id}, {
        title: 1,
        description: 1,
        company: 1,
        country: 1,
        city: 1,
        phone: 1,
        photo: "$photo.path",
        user: 1,
        deletedAt: 1
    })
    .populate('reports')
    .exec((err, service) => {
        if(err || !service) return Response.sendError(res, 500, 'Server error, please try again later');
        return Response.sendResponse(res, service)
    })
}

exports.allServices = (req, res) => {
    try{
        dashParams = extractDashParams(req, ['title', 'description', 'company', 'location']);
        Service.aggregate()
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
        .exec(async(err, services) => {
            if(err || !services) return Response.sendError(res, 500, 'Server error, please try again later');
            const count = await Service.find(dashParams.filter).countDocuments();
            return Response.sendResponse(res, {
                docs: services,
                totalPages: Math.ceil(count / dashParams.limit)
            });
        });
    }catch(err){
        console.log(err);
    }
}

exports.showService = (req, res) => {
    return Response.sendResponse(res, req.service)
}

exports.postedServices = (req, res) => {
    try{
        const filter = {
            user: new mongoose.Types.ObjectId(req.auth._id),
            title: new RegExp('^' + req.query.search, 'i'),
            deletedAt: null,
        }
        limit = 20
        Service.find(filter , {
            title: 1,
            photo: "$photo.path",
            company: 1,
            country: 1,
            city: 1,
            createdAt: 1
        })
        .sort({createdAt: -1})
        .skip(limit * req.query.page)
        .limit(limit)
        .exec((err, services) => {
            if(err || !services) return Response.sendError(res, 400, 'cannot retreive services')
            Service.find(filter).countDocuments((err, count) => {
                return Response.sendResponse(res, {
                    services,
                    more: (count - (limit * (+req.query.page + 1))) > 0
                })
            })
        })
    }catch(err){
        console.log(err);
    }
}

exports.availableServices = (req, res) => {
    try{
        const filter = {
            title: new RegExp('^' + req.query.search, 'i'),
            deletedAt: null,
            city: req.authUser.city,
            country: req.authUser.country
        }
        limit = 20
        Service.find(filter , {
            title: 1,
            photo: "$photo.path",
            company: 1,
            country: 1,
            city: 1,
            createdAt: 1
        })
        .sort({createdAt: -1})
        .skip(limit * req.query.page)
        .limit(limit)
        .exec((err, services) => {
            if(err || !services) return Response.sendError(res, 400, 'cannot retreive services')
            Service.find(filter).countDocuments((err, count) => {
                return Response.sendResponse(res, {
                    services,
                    more: (count - (limit * (+req.query.page + 1))) > 0
                })
            })
        })
    }catch(err){
        console.log(err);
    }
}

exports.storeService = (req, res) => {
    service = new Service(req.fields)
    service.user = req.auth._id

    if(req.files.photo)
        storeServicePhoto(req.files.photo, service)
    else
        return Response.sendError(res, 400, 'photo is required')

    service.save((err, service) => {
        if(err) return Response.sendError(res, 400, err);
        service.photo.path = process.env.BASEURL + service.photo.path
        return Response.sendResponse(res, service, 'the service has been created successfully')
    })

}

storeServicePhoto = (photo, service) => {
    photoName = `${ service._id }.${ fileExtension(photo.name) }`
    const photoPath = path.join(__dirname, `./../../public/services/${ photoName }`)
    
    fs.writeFileSync(photoPath, fs.readFileSync(photo.path))
    service.photo.path = `/services/${ photoName }`
    service.photo.type = photo.type
}

exports.updateService = (req, res) => {

    let service = req.service
    const fields = _.omit(req.fields, ['photo'])
    service = _.extend(service, fields)

    if(req.files.photo)
        storeServicePhoto(req.files.photo, service)
    
    service.save((err, service) => {
        if(err) return Response.sendError(res, 400, 'could not update service')
        return Response.sendResponse(res, service, 'the service has been updated successfully')
    })
}

exports.deleteService = (req, res) => {
    const service = req.service
    service.deletedAt = new Date().toJSON();
    service.save((err, service) => {
        if(err) Response.sendError(res, 400, 'could not remove service');
        return Response.sendResponse(res, null, 'service removed')
    })
}

exports.destroyService = (req, res) => {
    Service.findOne({_id: req.service._id}, (err, service) => {
        const photoPath = path.join(__dirname, `./../../public/${ service.photo.path }`)
        service.remove((err, service) => {
            if(err) return Response.sendError(res, 400, 'could not remove service');
            if(fs.existsSync(photoPath)){
                fs.unlinkSync(photoPath);
            }
            return Response.sendResponse(res, null, 'service removed')
        })
    });
}
const Response = require('./Response');
const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const Service = require('../models/Service');
const mongoose = require('mongoose');
const { extractDashParams, report } = require('../helpers');
const Report = require('../models/Report');

exports.reportService = async (req, res) => {
    try {
        const service = req.service;
        if (!req.body.message) return Response.sendError(res, 400, 'Please enter a message');
        
        const newReport = await report(req, res, 'service', service._id);
        await Service.updateOne({ _id: service._id }, { $push: { reports: newReport } });
        return Response.sendResponse(res, null, 'Thank you for reporting');
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Failed to report service');
    }
};

exports.clearServiceReports = async (req, res) => {
    try {
        await Report.deleteMany({
            "entity._id": req.service._id,
            "entity.name": "service"
        });
        return Response.sendResponse(res, null, "Reports cleaned");
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to clear reports');
    }
};

exports.toggleServiceStatus = async (req, res) => {
    try {
        const service = req.service;
        service.deletedAt = service.deletedAt ? null : new Date().toISOString();
        await service.save();
        return Response.sendResponse(res, service, 'Service ' + (service.deletedAt ? 'disabled' : 'enabled'));
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to update service status');
    }
};

exports.showServiceDash = async (req, res) => {
    try {
        const service = await Service.findOne({ _id: req.service._id }, {
            title: 1,
            description: 1,
            company: 1,
            country: 1,
            city: 1,
            phone: 1,
            photo: "$photo.path",
            user: 1,
            deletedAt: 1,
            serviceCategory: 1,       // New field
            serviceRate: 1,           // New field
            availability: 1,          // New field
            Experience: 1,           // New field
            serviceDuration: 1,       // New field
            paymentMethods: 1,        // New field
            licenseCertification: 1,  // New field
            websitePortfolio: 1,      // New field
            address: 1                // New field
        }).populate('reports');
        if (!service) return Response.sendError(res, 500, 'Service not found');
        return Response.sendResponse(res, service);
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};

exports.showService = (req, res) => {
    return Response.sendResponse(res, req.service); // Includes all new fields if attached by serviceById
};


exports.allServices = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['title', 'description', 'company', 'location']);
        const services = await Service.aggregate()
            .match(dashParams.filter)
            .project({
                title: 1,
                description: 1,
                company: 1,
                photo: "$photo.path",
                country: 1,
                city: 1,
                deletedAt: 1,
                reports: { $size: "$reports" }
            })
            .sort(dashParams.sort)
            .skip(dashParams.skip)
            .limit(dashParams.limit);

        const count = await Service.countDocuments(dashParams.filter);
        return Response.sendResponse(res, {
            docs: services,
            totalPages: Math.ceil(count / dashParams.limit)
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};



exports.postedServices = async (req, res) => {
    try {
        const filter = {
            user: new mongoose.Types.ObjectId(req.auth._id),
            title: new RegExp('^' + req.query.search, 'i'),
            deletedAt: null
        };
        const limit = 20;
        const page = parseInt(req.query.page) || 0;

        const services = await Service.find(filter, {
            title: 1,
            photo: "$photo.path",
            company: 1,
            country: 1,
            city: 1,
            createdAt: 1
        }).sort({ createdAt: -1 }).skip(limit * page).limit(limit);

        const count = await Service.countDocuments(filter);
        return Response.sendResponse(res, {
            services,
            more: (count - (limit * (page + 1))) > 0
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to retrieve services');
    }
};

exports.availableServices = async (req, res) => {
    try {
        const filter = {
            title: new RegExp('^' + req.query.search, 'i'),
            deletedAt: null,
            city: req.authUser.city,
            country: req.authUser.country
        };
        const limit = 20;
        const page = parseInt(req.query.page) || 0;

        const services = await Service.find(filter, {
            title: 1,
            photo: "$photo.path",
            company: 1,
            country: 1,
            city: 1,
            createdAt: 1
        }).sort({ createdAt: -1 }).skip(limit * page).limit(limit);

        const count = await Service.countDocuments(filter);

        // Return an empty array if no services found instead of throwing an error
        return Response.sendResponse(res, {
            services: services || [],
            more: (count - (limit * (page + 1))) > 0
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to retrieve services');
    }
};

exports.storeService = async (req, res) => {
    try {
        // Parse paymentMethods field if it's a string
        if (typeof req.fields.paymentMethods === 'string') {
            req.fields.paymentMethods = JSON.parse(req.fields.paymentMethods);
        }

        // Create the service object with all fields
        const service = new Service({
            title: req.fields.title,
            company: req.fields.company,
            country: req.fields.country,
            city: req.fields.city,
            phone: req.fields.phone,
            description: req.fields.description,
            serviceCategory: req.fields.serviceCategory,
            serviceRate: req.fields.serviceRate,
            availability: req.fields.availability,
            Experience: req.fields.Experience,
            serviceDuration: req.fields.serviceDuration,
            paymentMethods: req.fields.paymentMethods, // Expecting an array
            licenseCertification: req.fields.licenseCertification,
            websitePortfolio: req.fields.websitePortfolio,
            address: req.fields.address,
            user: req.auth._id
        });

        // Store the photo
        if (req.files.photo) {
            storeServicePhoto(req.files.photo, service);
        } else {
            return Response.sendError(res, 400, 'Photo is required');
        }

        await service.save();
        service.photo.path = process.env.BASEURL + service.photo.path;
        return Response.sendResponse(res, service, 'The service has been created successfully');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to create service');
    }
};



const storeServicePhoto = (photo, service) => {
    try {
        const fileExt = path.extname(photo.name);
        const photoName = `${service._id}${fileExt}`;
        const photoPath = path.join(__dirname, `../../public/services/${photoName}`);

        fs.writeFileSync(photoPath, fs.readFileSync(photo.path));
        service.photo.path = `/services/${photoName}`;
        service.photo.type = photo.type;
    } catch (err) {
        console.log("Error storing service photo:", err);
    }
};


exports.updateService = async (req, res) => {
    try {
        let service = req.service;
        const fields = _.omit(req.fields, ['photo']);
        
        // Include the new fields to be updated
        service = _.extend(service, fields, {
            serviceCategory: req.fields.serviceCategory,  // New field
            serviceRate: req.fields.serviceRate,          // New field
            availability: req.fields.availability,        // New field
            Experience: req.fields.Experience,          // New field
            serviceDuration: req.fields.serviceDuration,  // New field
            paymentMethods: req.fields.paymentMethods,    // New field
            licenseCertification: req.fields.licenseCertification,  // New field
            websitePortfolio: req.fields.websitePortfolio,          // New field
            address: req.fields.address                  // New field
        });

        if (req.files.photo) {
            storeServicePhoto(req.files.photo, service);
        }

        await service.save();
        return Response.sendResponse(res, service, 'The service has been updated successfully');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to update service');
    }
};

exports.deleteService = async (req, res) => {
    try {
        const service = req.service;
        service.deletedAt = new Date().toISOString();
        await service.save();
        return Response.sendResponse(res, null, 'Service removed');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to remove service');
    }
};

exports.destroyService = async (req, res) => {
    try {
        const service = req.service;
        const photoPath = path.join(__dirname, `./../../public/${service.photo.path}`);

        // Use deleteOne() to delete the service
        await Service.deleteOne({ _id: service._id });

        // Check if the photo exists and delete it if necessary
        if (fs.existsSync(photoPath)) {
            fs.unlinkSync(photoPath);
        }

        return Response.sendResponse(res, null, 'Service removed');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to remove service');
    }
};

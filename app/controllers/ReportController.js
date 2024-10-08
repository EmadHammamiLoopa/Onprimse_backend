const { extractDashParams } = require("../helpers");
const Report = require("../models/Report");
const User = require("../models/User"); // Assuming a User model exists
const Content = require("../models/Content"); // Assuming a Content model for managing content
const Response = require("./Response");


exports.allReports = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['entity.name']);
        
        const reports = await Report.aggregate()
            .match(dashParams.filter)
            .project({
                message: 1,
                reference: "$entity.name",
                referenceId: "$entity._id",
                userId: "$user",
                solved: 1,
                createdAt: 1
            })
            .sort(dashParams.sort)
            .skip(dashParams.skip)
            .limit(dashParams.limit);

        if (!reports) return Response.sendError(res, 500, 'Server error, please try again later');

        const count = await Report.find(dashParams.filter).countDocuments();

        return Response.sendResponse(res, {
            docs: reports,
            totalPages: Math.ceil(count / dashParams.limit)
        });
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.showReport = async (req, res) => {
    try {
        const report = await Report.findOne({ _id: req.report._id }, {
            message: 1,
            reference: "$entity.name",
            referenceId: "$entity._id",
            user: 1,
            solved: 1,
            createdAt: 1
        });

        if (!report) return Response.sendError(res, 404, 'Report not found');

        return Response.sendResponse(res, report);
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.reportUser = async (req, res) => {
    try {
        const { reportedUserId, reason, details } = req.body;
        const reporterUserId = req.user.id; // Assuming req.user is populated from JWT token

        const report = new Report({
            type: 'user',
            entity: reportedUserId,
            user: reporterUserId,
            reason,
            details,
            solved: false,
            createdAt: new Date()
        });

        await report.save();
        return Response.sendResponse(res, { message: 'User reported successfully' });
    } catch (error) {
        return Response.sendError(res, 500, 'Internal server error');
    }
};

// New functionality to report content
exports.reportContent = async (req, res) => {
    try {
        const { contentId, contentType, reason, details } = req.body;
        const reporterUserId = req.user.id;

        const report = new Report({
            type: 'content',
            contentType,
            entity: contentId,
            user: reporterUserId,
            reason,
            details,
            solved: false,
            createdAt: new Date()
        });

        await report.save();
        return Response.sendResponse(res, { message: 'Content reported successfully' });
    } catch (error) {
        return Response.sendError(res, 500, 'Internal server error');
    }
};

// New functionality to block a user
exports.blockUser = async (req, res) => {
    try {
        const { blockedUserId } = req.body;
        const requesterId = req.user.id;

        // Assuming User model has a method to block users
        await User.blockUser(requesterId, blockedUserId);

        return Response.sendResponse(res, { message: 'User blocked successfully' });
    } catch (error) {
        return Response.sendError(res, 500, 'Internal server error');
    }
};

exports.reviewReports = async (req, res) => {
    try {
        const unresolvedReports = await Report.find({ solved: false })
            .populate('user', 'username') // Assuming you want to show user info
            .populate('entity', 'name') // Populate based on entity type if possible
            .sort({ createdAt: -1 }); // Most recent first

        return Response.sendResponse(res, unresolvedReports);
    } catch (error) {
        return Response.sendError(res, 500, 'Internal server error');
    }
};


exports.takeActionOnReport = async (req, res) => {
    const { reportId } = req.params;
    const { action, notes } = req.body; // 'action' could be 'ignore', 'removeContent', 'banUser'

    try {
        const report = await Report.findById(reportId);
        if (!report) return Response.sendError(res, 404, 'Report not found');

        // Implement action logic here
        switch (action) {
            case 'ignore':
                report.solved = true;
                report.notes = notes;
                break;
            case 'removeContent':
                await Content.deleteOne({ _id: report.entity });
                report.solved = true;
                report.notes = notes;
                break;
            case 'banUser':
                await User.findByIdAndUpdate(report.entity, { isActive: false });
                report.solved = true;
                report.notes = notes;
                break;
            default:
                return Response.sendError(res, 400, 'Invalid action');
        }

        await report.save();
        return Response.sendResponse(res, { message: 'Action taken successfully' });
    } catch (error) {
        return Response.sendError(res, 500, 'Internal server error');
    }
};




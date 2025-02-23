const { extractDashParams } = require("../helpers");
const Report = require("../models/Report");
const User = require("../models/User"); // Assuming a User model exists
const Content = require("../models/Content"); // Assuming a Content model for managing content
const Response = require("./Response");
const mongoose = require('mongoose'); // ✅ Add this import


const Post = require("../models/Post");
const Comment = require("../models/Comment");
const Channel = require("../models/Channel");
const Product = require("../models/Product");
const Job = require("../models/Job");
const Service = require("../models/Service");

exports.allReports = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['entityModel']);

        // Fetch all reports with pagination and sorting
        const reports = await Report.find(dashParams.filter)
            .sort(dashParams.sort)
            .skip(dashParams.skip)
            .limit(dashParams.limit);

        const reportDetails = await Promise.all(
            reports.map(async (report) => {
                let referenceDetails;
                let referenceName;

                // Perform different lookups based on the entityModel field
                switch (report.entityModel) {
                    case 'Post':
                        referenceDetails = await Post.findById(report.entity).select('title');
                        referenceName = referenceDetails?.title || 'Unknown Post';
                        break;
                    case 'Comment':
                        referenceDetails = await Comment.findById(report.entity).select('text');
                        referenceName = referenceDetails?.text || 'Unknown Comment';
                        break;
                    case 'Channel':
                        referenceDetails = await Channel.findById(report.entity).select('name');
                        referenceName = referenceDetails?.name || 'Unknown Channel';
                        break;
                    case 'User':
                        referenceDetails = await User.findById(report.entity).select('email');
                        referenceName = referenceDetails?.email || 'Unknown User';
                        break;
                    case 'Product':
                        referenceDetails = await Product.findById(report.entity).select('name');
                        referenceName = referenceDetails?.name || 'Unknown Product';
                        break;
                    case 'Job':
                        referenceDetails = await Job.findById(report.entity).select('title');
                        referenceName = referenceDetails?.title || 'Unknown Job';
                        break;
                    case 'Service':
                        referenceDetails = await Service.findById(report.entity).select('title');
                        referenceName = referenceDetails?.title || 'Unknown Service';
                        break;
                    default:
                        referenceName = 'Unknown Entity';
                }

                return {
                    _id: report._id,
                    message: report.message,
                    referenceId: report.entity,
                    referenceType: report.entityModel,
                    referenceName,
                    userId: report.user,
                    status: report.status,
                    category: report.reportType,
                    solved: report.solved,
                    createdAt: report.createdAt,
                    reportType:report.reportType,
                };
            })
        );

        // Count the total number of reports
        const count = await Report.find(dashParams.filter).countDocuments();

        // Send the result
        return Response.sendResponse(res, {
            docs: reportDetails,
            totalPages: Math.ceil(count / dashParams.limit)
        });
    } catch (error) {
        console.error("Error fetching reports:", error);
        return Response.sendError(res, 500, "Server error");
    }
};
exports.takeActionOnReport = async (req, res) => {
    console.log("Processing action:", req.body.action, "for report ID:", req.params.reportId);

    const { reportId } = req.params;
    const { action, notes } = req.body;

    try {
        let report = await Report.findById(reportId);
        if (!report) return Response.sendError(res, 404, 'Report not found');

        // Perform the action
        switch (action) {
            case 'ignore':
                report.solved = true;
                report.status = "Resolved";
                report.moderatorNotes = notes || 'No additional notes';
                break;

            case 'removeContent':
                if (report.entity && report.entityModel) {
                    try {
                        const model = mongoose.model(report.entityModel);

                        // Check if the content exists before deletion
                        const contentExists = await model.findById(report.entity);
                        if (!contentExists) {
                            console.warn(`Content with ID ${report.entity} not found. Marking report as resolved.`);
                            
                            // ✅ Ensure that orphaned reports are deleted
                            await Report.findByIdAndDelete(reportId);
                            return Response.sendResponse(res, { message: 'Report deleted: Content was already removed' });
                        }

                        // Delete the content
                        const deleted = await model.findByIdAndDelete(report.entity);
                        if (!deleted) {
                            console.error(`Failed to delete content: ${report.entity}`);
                            return Response.sendError(res, 400, 'Failed to delete content');
                        }

                        console.log(`Deleted content: ${report.entity}`);
                    } catch (error) {
                        console.error("Error deleting content:", error);
                        return Response.sendError(res, 500, 'Server error deleting content');
                    }
                }

                // ✅ Remove the report itself after content deletion
                await Report.findByIdAndDelete(reportId);
                console.log(`Deleted report with ID: ${reportId}`);

                return Response.sendResponse(res, { message: 'Content and associated report deleted successfully' });

            case 'banUser':
                if (report.entityModel === 'User') {
                    const user = await User.findByIdAndUpdate(report.entity, { isActive: false });
                    if (!user) {
                        return Response.sendError(res, 400, 'Failed to ban user');
                    }
                }
                report.solved = true;
                report.status = "Resolved";
                report.moderatorNotes = notes || 'User banned';
                break;

            default:
                return Response.sendError(res, 400, 'Invalid action');
        }

        await report.save();
        console.log("Updated report:", report);

        return Response.sendResponse(res, {
            message: 'Action taken successfully',
            report
        });

    } catch (error) {
        console.error('Error taking action on report:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};




exports.showReport = async (req, res) => {
    try {
        const report = await Report.findOne({ _id: req.report._id })
            .populate({
                path: 'entity',
                select: 'name email title', // Adjust for all possible fields in referenced models
            })
            .populate({
                path: 'user',
                select: 'email _id', // Include user details
            });

        if (!report) {
            return Response.sendError(res, 404, 'Report not found');
        }

        // Determine the reference name, ID, and type
        const referenceName = report.entity?.name || report.entity?.email || report.entity?.title || 'Unknown';
        const referenceId = report.entity?._id || null;
        const referenceType = report.entityModel || 'Unknown';

        // Prepare the final report object
        const finalReport = {
            _id: report._id,
            message: report.message,
            reference: `${referenceType}: ${referenceName}`, // Include type in the reference
            referenceId: referenceId,
            referenceType: referenceType, // Separate field for reference type
            userId: report.user?._id || null,
            userEmail: report.user?.email || 'Unknown',
            status: report.status,
            reportType: report.reportType,
            resolutionAction: report.resolutionAction,
            createdAt: report.createdAt,
            updatedAt: report.updatedAt,
            reportType:report.reportType
        };

        console.log('Final report object:', finalReport);

        return Response.sendResponse(res, finalReport);
    } catch (error) {
        console.error('Error in showReport:', error);
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






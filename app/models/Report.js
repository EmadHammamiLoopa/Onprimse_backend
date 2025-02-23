const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    message: {
        type: String,
        required: true
    },
    // Refactor entity to support dynamic referencing
    entity: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        // This allows the entity to reference different models
        refPath: 'entityModel'
    },
    entityModel: {
        type: String,
        required: true,
        enum: ['User', 'Post', 'Comment', 'Channel'] // Add or remove entity types as needed
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Add report type, status, and resolution fields
    reportType: {
        type: String,
        required: false,
        enum: [
            'Abuse', 
            'Spam', 
            'Inappropriate Content', 
            'Hate Speech', 
            'Misinformation', 
            'Harassment', 
            'Violence', 
            'Copyright Infringement', 
            'Scam', 
            'Illegal Activities', 
            'Other'
        ]
        },
    status: {
        type: String,
        required: true,
        enum: ['Pending', 'Reviewed', 'Resolved'],
        default: 'Pending'
    },
    resolutionAction: {
        type: String,
        enum: ['Content Removed', 'User Banned', 'No Action'],
        default: 'No Action'
    },
    moderatorNotes: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('Report', reportSchema);

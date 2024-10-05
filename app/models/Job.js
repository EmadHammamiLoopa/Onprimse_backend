const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
    title: {
        type: String,
        maxLength: 50,
        required: true
    },
    company: {
        type: String,
        maxLength: 50,
        required: true
    },
    country: {
        type: String,
        required: true
    },
    reports: [{
        type: mongoose.Schema.Types.ObjectId, // Correct ObjectId type
        ref: 'Report' // Reference to the 'Report' model
    }],
    city: {
        type: String,
        required: true
    },
    email: {
        type: String,
        maxLength: 50,
        required: true
    },
    description: {
        type: String,
        maxLength: 255,
        required: true
    },
    photo: {
        path: {
            type: String,
            required: true
        },
        type: {
            type: String,
            required: true
        }
    },
    user: {
        type: mongoose.Schema.Types.ObjectId, // Correct ObjectId type
        ref: 'User', // Reference to the 'User' model
        required: true
    },
    deletedAt: {
        type: Date,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);

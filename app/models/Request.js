const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
    from: {
        type: mongoose.Schema.Types.ObjectId,  // Correct way to define ObjectId reference
        ref: 'User',  // Reference to User model (if applicable)
        required: true
    },
    to: {
        type: mongoose.Schema.Types.ObjectId,  // Correct way to define ObjectId reference
        ref: 'User',  // Reference to User model (if applicable)
        required: true
    },
    accepted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('Request', requestSchema);

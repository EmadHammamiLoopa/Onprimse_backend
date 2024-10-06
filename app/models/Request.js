const mongoose = require('mongoose')

const requestSchema = new mongoose.Schema({
    from: {
        type: new mongoose.Types.ObjectId,
        required: true
    },
    to: {
        type: new mongoose.Types.ObjectId,
        required: true
    },
    accepted: {
        type: Boolean,
        default: false
    }
}, {timestamps: true})

module.exports = mongoose.model('Request', requestSchema)
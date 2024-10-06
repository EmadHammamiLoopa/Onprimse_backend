const mongoose = require('mongoose')

const followSchema = new mongoose.Schema({
    follower: {
        type:  mongoose.Types.ObjectId,
        required: true
    },
    followed: {
        type:  mongoose.Types.ObjectId,
        required: true
    },
}, {timestamps: true})

module.exports = mongoose.model('Follow', followSchema)

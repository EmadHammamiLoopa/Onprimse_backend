const Response = require("./controllers/Response");
const Report = require("./models/Report");
const request = require('request');

exports.manAvatarPath = '/avatars/male.webp'
exports.womenAvatarPath = '/avatars/female.webdp'
exports.ERROR_CODES = {
    SUBSCRIPTION_ERROR: 1001
}

exports.connectedUsers = {}

exports.connectedUsers = (sockets) => {
    const connectedUsers = {}
    sockets.sockets.forEach((socket, key) => {
        connectedUsers[socket.username] = key
    })
    return connectedUsers
}

exports.userSocketId = (sockets, user_id) => {
    let socket_id = null
    sockets.sockets.forEach((socket, key) => {
        if(socket.username == user_id){
            socket_id = key
            return
        }
    })
    return socket_id
}

exports.isUserConnected = (sockets, user_id) => {
    let res = false
    sockets.sockets.forEach((socket, key) => {
        if(socket.username == user_id){
            res = true
            return
        }
    })
    return res
}

exports.setOnlineUsers = (users) => {
    users.forEach(usr => {
        if(this.connectedUsers[usr._id]) usr.online = true
        else usr.online = false
    })
    return users
}

exports.extractDashParams = (req, searchFields) => {
    const page = req.query.page ? +req.query.page : 1
    const limit = req.query.limit ? +req.query.limit : 0
    const sortBy = req.query.sortBy ? req.query.sortBy : '_id'
    const sortDir = req.query.sortDir ? +req.query.sortDir : 1
    const searchQuery = req.query.searchQuery ? req.query.searchQuery : ""
    const searchRegex = { $regex: searchQuery };
    const searchfilter = []
    const sort = {}
    sort[sortBy] = sortDir;

    searchFields.forEach(schFld => {
        const obj = {};
        obj[schFld] = searchRegex
        searchfilter.push(obj)
    })

    const filter = {
        $or: searchfilter
    }

    return {
        filter,
        sort,
        skip: limit * (page - 1),
        limit
    }
}

exports.report = (req, res, entityName, entityId, callback) => {
   try {
        const report = new Report()
        report.entity = {
            name: entityName,
            _id: entityId
        }
        report.user = req.auth._id
        report.message = req.body.message
        report.save((err, report) => {
            if(err || !report) return Response.sendError(res, 400, 'failed')
            callback(report)
        })
   } catch (error) {
       console.log(error);
   }
}

exports.adminCheck = (req) => {
    return req.auth.role == 'ADMIN' || req.auth.role == 'SUPER ADMIN'
}

// ['Subscribed Users'],

exports.sendNotification = (title, message, data, segments = [], player_ids = [], voip = false) => {
    console.log('send notification ')
    console.log(player_ids)
    
    let body = {
        app_id: process.env.ONE_SIGNAL_APP_ID,
        headings: title,
        contents: message,
        included_segments: segments,
        include_external_user_ids: player_ids,
        data
    }

    console.log("--------------------------------------")
    console.log('send notification')
    console.log(body)

    request(
        {
            method:'POST',
            uri:'https://onesignal.com/api/v1/notifications',
            headers: {
                "authorization": "Basic "+ process.env.ONE_SIGNAL_REST_KEY,
                "content-type": "application/json"
            },
            json: true,
            body
        },
        (error, response, body) => {
            console.log(error)
            console.log(response)
            console.log(body)
        }
    );
}
const iplocate = require('node-iplocate')
const Response = require('../controllers/Response')
const User = require('../models/User')

exports.setUrlInfo = (req, res, next) => {
    process.env.BASEURL = req.protocol + '://' + req.headers.host
    next()
}


exports.checkVersion = (req, res, next) => {
    console.log('hello')

    const supportedVersions = process.env.MOBILE_VERSION.split(',')
    console.log(supportedVersions)
    console.log(req.headers.version)
    if(!req.headers.version || supportedVersions.includes(req.headers.version)) return next()
    return Response.sendError(res, 500, {
        code: 1001,
        urls: {
            AppStore: '',
            GooglePlay: ''
        },
        message: 'Your current version of GELOO is no more supported, update now to the new version',
    })

}

exports.updateUserInfo = async(req, res, next) => {
    // if(req.auth){
    //     iplocate(req.ip)
    //     .then(result => {
    //         User.findOne({_id: auth._id}, (req, user) => {
    //             user.country = result.country;
    //             user.save((err, user) => {
    //             })
    //         })
    //     })
    //     next()
    // }else{
    //     next()
    // }
    next()

}

exports.allowAccess = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', "*")
    res.header('Access-Control-Allow-Headers', "*")
    next()
}
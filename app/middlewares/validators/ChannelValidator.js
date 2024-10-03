const Response = require("../../controllers/Response")
const Validator = require('validatorjs')

exports.storeChannelValidator = (req, res, next) => {
    const validation = new Validator(req.fields, {
        'name': 'min:2|max:50|required',
        'description': 'max:255|min:5|required',
    })
    if(validation.fails()) return Response.sendError(res, 400, validation.errors)
    next()
}
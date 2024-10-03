const Validator = require('validatorjs')
const Response = require('../../controllers/Response')

exports.storeJobValidator = (req, res, next) => {
    const validation = new Validator(req.fields, {
        'title': 'min:2|max:50|required',
        'company': 'min:1|max:50|required',
        'city': 'min:2|max:50|required',
        'country': 'min:2|max:50|required',
        'email': 'email|max:50|required',
        'description': 'max:255|min:5|required',
    })
    if(validation.fails()) return Response.sendError(res, 400, validation.errors)
    next()
}

exports.updateJobValidator = (req, res, next) => {
    const validation = new Validator(req.fields, {
        'title': 'min:2|max:50',
        'company': 'min:5|max:50',
        'city': 'min:2|max:50|required',
        'country': 'min:2|max:50|required',
        'email': 'email|max:50',
        'description': 'max:255|min:5'
    })
    if(validation.fails()) return Response.sendError(res, 400, validation.errors)
    next()
}
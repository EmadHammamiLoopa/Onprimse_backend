const Validator = require('validatorjs');
const Response = require('../../controllers/Response');

exports.userStoreValidator = (req, res, next) => {
    try {
        console.log(req.body);
        const validation = new Validator(req.body, {
            'firstName': 'required|alpha|max:40|min:2',
            'lastName': 'required|alpha|max:40|min:2',
            'email': 'required|email|max:150|min:5',
            'password': 'required|confirmed|max:150|min:8',
            'gender': 'required|in:male,female',
            'phone': 'min:4',
            'country': 'alpha|max:30|min:3',
            'birthdate': 'date',
            'school': 'max:50|min:2',
            'education': 'max:30|min:2',
            'profession': 'max:30|min:2',
        });
        if(validation.fails()) return Response.sendError(res, 400, validation.errors);
        next();
    } catch (error) {
        console.log(error);
    }
};



exports.userDashUpdateValidator = (req, res, next) => {
    console.log('userDashUpdateValidator middleware called');

    try {
        const validation = new Validator(req.body, {
            'firstName': 'alpha|max:40|min:2',
            'lastName': 'alpha|max:40|min:2',
            'email': 'email|max:150|min:5',
            'gender': 'in:male,female',
            'phone': 'min:4',
            'country': 'alpha|max:30|min:3',
            'password': 'min:8|confirmed',
            'birthdate': 'date',
            'school': 'max:50|min:2',
            'education': 'max:30|min:2',
            'profession': 'max: 30|min:2',
        });
        if(validation.fails()) return Response.sendError(res, 400, validation.errors);
        next();
    } catch (error) {
        console.log(error);
    }
};

exports.userUpdateValidator = (req, res, next) => {
    const fieldsToValidate = {};

    if (req.body.firstName) fieldsToValidate.firstName = 'alpha|max:40|min:2';
    if (req.body.lastName) fieldsToValidate.lastName = 'alpha|max:40|min:2';
    if (req.body.email) fieldsToValidate.email = 'email|max:150|min:5';
    if (req.body.gender) fieldsToValidate.gender = 'in:male,female';
    if (req.body.phone) fieldsToValidate.phone = 'regex:\\+?[0-9]+|min:4';
    if (req.body.country) fieldsToValidate.country = 'alpha|max:30|min:3';
    if (req.body.birthdate) fieldsToValidate.birthdate = 'date';
    if (req.body.school) fieldsToValidate.school = 'max:50|min:2';
    if (req.body.education) fieldsToValidate.education = 'max:30|min:2';
    if (req.body.profession) fieldsToValidate.profession = 'max:30|min:2';
    if (req.body.interests) fieldsToValidate.interests = 'array|max:10';

    const validation = new Validator(req.body, fieldsToValidate);
    
    if(validation.fails()) {
        return Response.sendError(res, 400, validation.errors);
    }
    
    next();
};


exports.updatePasswordValidator = (req, res, next) => {
    const validation = new Validator(req.body, {
        'current_password': 'string|required',
        'password': 'min:8|max:40|confirmed|required',
    });
    if(validation.fails()) return Response.sendError(res, 400, validation.errors);
    next();
};

exports.updateEmailValidator = (req, res, next) => {
    console.log('Validating email for user:', req.body.email);

    const validation = new Validator(req.body, {
        'email': [
            'required', 
            'email',
            'max:50',
            {
                regex: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,  // Strict email regex pattern
            }
        ]
    });

    if (validation.fails()) {
        console.log('Email validation failed:', validation.errors);
        return Response.sendError(res, 400, validation.errors);
    }

    next();
};


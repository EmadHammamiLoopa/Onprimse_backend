const Validator = require('validatorjs')
const Response = require('../../controllers/Response')
const { check, validationResult } = require('express-validator');

exports.signupValidator = (req, res, next) => {
    const validation = new Validator(req.body, {
        'firstName': 'required|alpha_dash|max:50|min:2',
        'lastName': 'required|alpha_dash|max:50|min:2',
        'password': 'required|confirmed|min:8|max:50',
        'email': 'required|email|max:150|min:5',
        'gender': 'required|in:male,female,other',
        'birthDate': 'required|date',
        'school': 'string|max:100', // Ensure it's a string and optional
        'education': 'string|max:100', // Ensure it's a string and optional
        'profession': 'string|max:100', // Ensure it's a string and optional
        'interests': 'array|max:10', // Ensure it's an array and optional
        'aboutMe': 'string|max:500' // Ensure it's a string and optional
    });
    const birthDate = new Date(req.body.birthDate).getTime();
    const currDate = new Date().getTime();
    const diffDate = currDate - birthDate;

    if(validation.fails()) return Response.sendError(res, 400, validation.errors);
    else if(diffDate < 8 * 365 * 24 * 60 * 60 * 1000) {
        return Response.sendError(res, 400, {
            errors: {
                birthDate: ['invalid birth date']
            }
        });
    }
    next();
}

// Corrected typo for the signin validator
exports.signinValidator = [
    check('email').isEmail().withMessage('Must be a valid email address'),
    check('password').not().isEmpty().withMessage('Password is required'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];


exports.checkEmailValidator = (req, res, next) => {
    const validation = new Validator(req.body, {
        'email': 'required|email'
    })
    if(validation.fails()) return Response.sendError(res, 400, validation.errors)
    next()
}
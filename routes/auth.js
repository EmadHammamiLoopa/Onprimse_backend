const express = require('express');
const passport = require('passport');
const { signup, signin, signout, checkEmail, authUser, traitor } = require('../app/controllers/AuthController');
const { requireSignin, withAuthUser } = require('../app/middlewares/auth');
const { signupValidator, signinValidator, checkEmailValidator } = require('../app/middlewares/validators/authValidator');
const router = express.Router();

// Regular routes
router.post('/checkEmail', checkEmailValidator, checkEmail);
router.get('/user', [requireSignin, withAuthUser], authUser);
router.post('/signin', signinValidator, signin);
router.post('/signup', signupValidator, signup);
router.post('/signout', signout);
router.post('/traitor', traitor);

// Google OAuth routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Successful authentication, redirect home.
    res.redirect('/');
});

module.exports = router;

const mongoose = require('mongoose');
const crypto = require('crypto');
const _ = require('lodash');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    enabled: {
        type: Boolean,
        default: true
    },
    email: {
        type: String,
        unique: true,
        sparse: true  // This allows for the unique index to ignore documents without an email field or with a null value.
    },
    hashed_password: String,
    salt: String,
    gender: {
        type: String,
        enum: ['male', 'female', 'other']
    },
    lastSeen: { type: Date }, // Optional: Track when the user was last online
    is2FAEnabled: {
        type: Boolean,
        default: false
    },
    twoFAToken: {
        type: String,
        default: ''
    },
    phone: String,
    country: { type: String, default: '' },
    city: { type: String, default: '' },
    role: {
        type: String,
        enum: ['USER', 'ADMIN', 'SUPER ADMIN'],
        default: 'USER'
    },
    birthDate: String,
    aboutMe: {
        type: String,
        default: '',
    },
    mainAvatar: String,
    avatar: [{ type: String, default: [] }],
    school: String,
    education: String,
    profession: String,
    interests: [String],
    location: {
        type: [Number],
        index: '2d'
    },
    banned: { type: Boolean, default: false },
    bannedReason: String,
    reports: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Report' }],
    requests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Request' }],
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    followedChannels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Channel' }],
    messagedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
    subscription: {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
        expireDate: Date
    },
    randomVisible: { type: Boolean, default: true },
    ageVisible: { type: Boolean, default: true },
    loggedIn: { type: Boolean, default: false },
    visitProfile: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    googleId: { type: String, unique: true, sparse: true }
}, { timestamps: true,     toJSON: { virtuals: true }, 
toObject: { virtuals: true } 
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName}`;
});

// Virtual for password hashing using bcrypt
userSchema.virtual('password')
    .set(function(password) {
        this._password = password;
        this.hashed_password = bcrypt.hashSync(password, 10);  // bcrypt handles salt internally
        console.log(`Setting password for ${this.email}`);
        console.log(`Hashed password: ${this.hashed_password}`);
    })
    .get(function() {
        return this._password;
    });




// Password encryption method

// Authenticate method to compare passwords
userSchema.methods.authenticate = async function(plainText) {
    console.log(`Authenticating user with plain text password: ${plainText}`);

    if (this.isOldPasswordFormat()) {
        // Re-hash using bcrypt if the password is in an old format
        console.log('Old password format detected, re-hashing password...');
        this.hashed_password = await bcrypt.hash(plainText, 10);
        this.salt = undefined;  // Remove the old salt field if it was used
        await this.save();
        console.log('Password re-hashed and updated to new bcrypt format.');
    }

    const isMatch = await bcrypt.compare(plainText, this.hashed_password);

    if (!isMatch) {
        console.log('Password mismatch');
        return false;
    }

    return true;
};



userSchema.methods.isOldPasswordFormat = function() {
    return !this.salt || this.hashed_password.length !== 60; // bcrypt hash length is typically 60 characters
};


// Get default avatar based on gender
userSchema.methods.getDefaultAvatar = function() {
    switch (this.gender.toLowerCase()) {
        case 'male':
            return '/public/images/avatars/male.webp';
        case 'female':
            return '/public/images/avatars/female.webp';
        default:
            return '/public/images/avatars/other.webp';
    }
};

// Initialize main avatar
userSchema.methods.initializeMainAvatar = function() {
    if (!this.mainAvatar && this.avatar.length > 0) {
        this.mainAvatar = this.avatar[0];
    } else if (!this.mainAvatar) {
        this.mainAvatar = this.getDefaultAvatar();
    }
};

// Return public info about the user
userSchema.methods.publicInfo = function(isLoggedInUser = false) {
    return {
        _id: this._id,
        firstName: this.firstName,
        lastName: this.lastName,
        email: this.email,
        role: this.role,
        avatar: this.avatar,
        mainAvatar: this.mainAvatar,
        country: this.country,
        city: this.city,
        gender: this.gender,
        aboutMe: this.aboutMe,
        school: this.school,
        education: this.education,
        profession: this.profession,
        interests: this.interests,
        randomVisible: this.randomVisible,
        ageVisible: this.ageVisible,
        loggedIn: this.loggedIn,
        online: this.online,
        visitProfile: this.visitProfile,
        profileCreated: this.profileCreated,
        enabled: this.enabled,
        is2FAEnabled: this.is2FAEnabled,
        banned: this.banned,
        reports: this.reports,
        followers: this.followers,
        following: this.following,
        friends: this.friends,
        blockedUsers: this.blockedUsers,
        followedChannels: this.followedChannels,
        messagedUsers: this.messagedUsers,
        lastSeen: this.lastSeen,
        lastSeenText: this.lastSeenText,
       // Only include birthDate if ageVisible is true or the user is the one logged in
        birthDate: this.ageVisible || isLoggedInUser ? this.birthDate : null
    };
};

userSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.hashed_password);
};

// Add friend to user
userSchema.methods.addFriend = function(friendId) {
    if (!this.friends.includes(friendId)) {
        this.friends.push(friendId);
    }
};

// Remove friend from user
userSchema.methods.removeFriend = function(friendId) {
    this.friends = this.friends.filter(id => id.toString() !== friendId.toString());
};

// Add follower
userSchema.methods.addFollower = function(followerId) {
    if (!this.followers.includes(followerId)) {
        this.followers.push(followerId);
    }
};


userSchema.virtual('online').get(function () {
    const { isUserOnline } = require('../utils/socketManager');
    return isUserOnline(this._id.toString());
  });
  
  userSchema.virtual('lastSeenText').get(function () {
    const { isUserOnline } = require('../utils/socketManager');
    if (isUserOnline(this._id.toString())) return 'Online now';
    if (!this.lastSeen) return 'Never seen';
  
    const diffMs = Date.now() - this.lastSeen.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
  
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minute(s) ago`;
    if (diffHours < 24) return `${diffHours} hour(s) ago`;
    return `${diffDays} day(s) ago`;
  });

// Remove follower
userSchema.methods.removeFollower = function(followerId) {
    this.followers = this.followers.filter(id => id.toString() !== followerId.toString());
};

module.exports = mongoose.model('User', userSchema);

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
    online: { type: Boolean, default: false }, // Track online status
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
}, { timestamps: true });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName}`;
});

// Virtual for password hashing using bcrypt
userSchema.virtual('password')
    .set(function(password) {
        this._password = password;
        // Use bcrypt to generate salt and hash
        this.salt = bcrypt.genSaltSync(10);
        this.hashed_password = bcrypt.hashSync(password, this.salt);
        console.log(`Setting password for ${this.email}`);
        console.log(`Generated salt: ${this.salt}`);
        console.log(`Hashed password: ${this.hashed_password}`);
    })
    .get(function() {
        return this._password;
    });



// Password encryption method
userSchema.methods.encryptPassword = function(password) {
    if (!password) return '';
    try {
        const encryptedPassword = crypto.createHmac('sha256', this.salt).update(password).digest('hex');
        console.log(`Encrypting password: ${password} with salt: ${this.salt}`);
        console.log(`Encrypted password: ${encryptedPassword}`);
        return encryptedPassword;
    } catch (err) {
        console.error('Error encrypting password:', err);
        return '';
    }
};

// Authenticate method to compare passwords
userSchema.methods.authenticate = async function(plainText) {
    console.log(`Authenticating user with plain text password: ${plainText}`);

    // Use bcrypt to compare passwords, as bcrypt hashes are stored in the system now
    const isMatch = await bcrypt.compare(plainText, this.hashed_password);

    if (!isMatch) {
        console.log('Password mismatch');
        return false;
    }

    return true;
};


userSchema.methods.isOldPasswordFormat = function() {
    // Example logic: check if the salt is missing or the hash is shorter/longer than expected
    return !this.salt || this.hashed_password.length !== 64; // Adjust based on your old hash length
};



// Set user online
userSchema.methods.setOnline = function() {
    this.online = true;
    return this.save();
};

// Set user offline
userSchema.methods.setOffline = function() {
    this.online = false;
    this.lastSeen = new Date();
    return this.save();
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

// Remove follower
userSchema.methods.removeFollower = function(followerId) {
    this.followers = this.followers.filter(id => id.toString() !== followerId.toString());
};

module.exports = mongoose.model('User', userSchema);

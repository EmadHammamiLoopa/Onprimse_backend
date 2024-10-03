const Comment = require("./models/Comment");
const Follow = require("./models/Follow");
const Job = require("./models/Job");
const Message = require("./models/Message");
const Post = require("./models/Post");
const Product = require("./models/Product");
const Report = require("./models/Report");
const Request = require("./models/Request");
const Service = require("./models/Service");
const User = require("./models/User");

module.exports = (agenda) => {
    agenda.define("expired subscription", async (job) => {
        const date = new Date();
        date.setTime(date.getTime())
        User.UpdateMany({
            "subscription.expireDate": {
                $lt: date
            }
        }, {
            $set: {
                subscription: null
            }
        }, (err, users) => {
            console.log('done')
        })
    });

    agenda.define("delete users", async (job) => {
        const date = new Date();
        // 4 days
        date.setTime(date.getTime() - 4 * 24 * 60 * 60 * 1000)
        User.find({
            deletedAt: {
                $ne: null,
                $lt: date
            }
        }, (err, users) => {
            users.forEach(user => {
                deleteUser(user);
            })
        })
    });
    
    const deleteUser = async(user) => {
        await Post.deleteMany({user: user._id})
        await Comment.deleteMany({user: user._id})
        await Job.deleteMany({user: user._id})
        await Product.deleteMany({user: user._id})
        await Service.deleteMany({user: user._id})
        await Report.deleteMany({user: user._id})
        await Request.deleteMany({
            $or: [
                {from: user._id},
                {to: user._id}
            ]
            
        })
        await Follow.deleteMany({
            $or: [
                {from: user._id},
                {to: user._id}
            ]
        })
        await Message.deleteMany({
            $or: [
                {from: user._id},
                {to: user._id}
            ]
            
        })
        user.delete()
    }
    
    agenda.define("clean database", async (job) => {
        console.log('clean database')
        Post.find({}).exec((err, posts) => {
            posts.filter(p => p.user == null).forEach(async(p) => {
                await p.delete()
            })
        })
        Comment.find({}).populate('user', '_id').select('user').exec((err, comments) => {
            comments.filter(c => c.user == null).forEach(async(c) => {
                await c.delete()
            })
        })
        Product.find({}).populate('user', '_id').select('user').exec((err, products) => {
            products.filter(p => p.user == null).forEach(async(p) => {
                await p.delete()
            })
        })
        Job.find({}).populate('user', '_id').select('user').exec((err, jobs) => {
            jobs.filter(j => j.user == null).forEach(async(j) => {
                await j.delete()
            })
        })
        Service.find({}).populate('user', '_id').select('user').exec((err, services) => {
            services.filter(s => s.user == null).forEach(async(s) => {
                await s.delete()
            })
        })
    });

    (async () => {
        await agenda.start()
        await agenda.every("one minutes", "expired subscription")
        await agenda.every("one minutes", "delete users")
        await agenda.every("one minutes", "clean database")
    })();
}
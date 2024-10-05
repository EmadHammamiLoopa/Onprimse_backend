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
    // Define the "expired subscription" task
    agenda.define("expired subscription", async (job) => {
        const date = new Date();
        try {
            await User.updateMany({
                "subscription.expireDate": { $lt: date }
            }, {
                $set: { subscription: null }
            });
            console.log('Expired subscriptions updated.');
        } catch (err) {
            console.error('Error updating expired subscriptions:', err);
        }
    });

    // Define the "delete users" task
    agenda.define("delete users", async (job) => {
        const date = new Date();
        date.setTime(date.getTime() - 4 * 24 * 60 * 60 * 1000); // 4 days

        try {
            const users = await User.find({
                deletedAt: { $ne: null, $lt: date }
            });
            users.forEach(user => {
                deleteUser(user);
            });
        } catch (err) {
            console.error('Error finding users to delete:', err);
        }
    });

    // Function to delete a user and all related data
    const deleteUser = async (user) => {
        try {
            await Post.deleteMany({ user: user._id });
            await Comment.deleteMany({ user: user._id });
            await Job.deleteMany({ user: user._id });
            await Product.deleteMany({ user: user._id });
            await Service.deleteMany({ user: user._id });
            await Report.deleteMany({ user: user._id });
            await Request.deleteMany({
                $or: [{ from: user._id }, { to: user._id }]
            });
            await Follow.deleteMany({
                $or: [{ from: user._id }, { to: user._id }]
            });
            await Message.deleteMany({
                $or: [{ from: user._id }, { to: user._id }]
            });
            await user.deleteOne();
            console.log(`User ${user._id} and related data deleted.`);
        } catch (err) {
            console.error(`Error deleting user ${user._id}:`, err);
        }
    };

    // Define the "clean database" task
    agenda.define("clean database", async (job) => {
        console.log('Cleaning database...');
        
        try {
            const posts = await Post.find({});
            await Promise.all(posts.filter(p => !p.user).map(p => p.delete()));

            const comments = await Comment.find({}).populate('user', '_id').select('user');
            await Promise.all(comments.filter(c => !c.user).map(c => c.delete()));

            const products = await Product.find({}).populate('user', '_id').select('user');
            await Promise.all(products.filter(p => !p.user).map(p => p.delete()));

            const jobs = await Job.find({}).populate('user', '_id').select('user');
            await Promise.all(jobs.filter(j => !j.user).map(j => j.delete()));

            const services = await Service.find({}).populate('user', '_id').select('user');
            await Promise.all(services.filter(s => !s.user).map(s => s.delete()));

            console.log('Database cleaned successfully.');
        } catch (err) {
            console.error('Error cleaning database:', err);
        }
    });

    // Start the agenda and schedule jobs
    (async () => {
        await agenda.start();
        await agenda.every("one minute", "expired subscription");
        await agenda.every("one minute", "delete users");
        await agenda.every("one minute", "clean database");
    })();
};

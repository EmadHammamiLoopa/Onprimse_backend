const Response = require("../controllers/Response")
const { adminCheck } = require("../helpers")
const Product = require("../models/Product")
const { userSubscribed } = require("./subscription")

exports.productById = async (req, res, next, id) => {
    try {
        const product = await Product.findById(id, {
            label: 1,
            description: 1,
            price: 1,
            currency: 1,
            stock: 1,
            brand: 1,
            condition: 1,
            weight: 1,
            dimensions: 1,
            tags: 1,
            sold: 1,
            country: 1,
            city: 1,
            photos: 1,
            user: 1,
            deletedAt: 1,
            createdAt: 1,
            category: 1
        });

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        req.product = product;
        next();
    } catch (err) {
        return res.status(500).json({ error: 'Internal server error' });
    }
};



exports.productOwner = (req, res, next) => {
    console.log('Product Owner middleware triggered');
    if(adminCheck(req)){
        console.log('Admin check passed');
        return next()
    }

    if(req.auth._id != req.product.user){
        console.error('Product owner check failed');
        return Response.sendError(res, 403, 'Access denied')
    }

    console.log('Product owner check passed');
    next();
}

exports.productStorePermission = async(req, res, next) => {
    console.log('Product Store Permission middleware triggered');
    try {
        if (await userSubscribed(req.authUser)) {
            console.log('User subscription check passed');
            return next();
        }

        const products = await Product.find({ user: req.auth._id })
            .sort({ 'createdAt': -1 })
            .limit(1)
            .exec();  // No callback needed, returns a promise

        const currDate = new Date();
        if (products.length > 0 && currDate.getTime() - (new Date(products[0].createdAt)).getTime() < 24 * 60 * 60 * 1000) {
            console.log('Product store permission check failed');
            return Response.sendResponse(res, { date: products[0].createdAt });
        } else {
            console.log('Product store permission check passed');
            next();
        }
    } catch (err) {
        console.error('Product find error:', err);
        return Response.sendError(res, 'An error has occurred, please try again later');
    }
};



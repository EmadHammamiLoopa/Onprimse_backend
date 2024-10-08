const Response = require('./Response')
const fs = require('fs')
const Product = require('../models/Product')
const _ = require('lodash')
const path = require('path')
const { asset, extractDashParams, report } = require('../helpers')
const mongoose  = require('mongoose')
const Report = require('../models/Report')
const { authUser } = require('./AuthController')

exports.reportProduct = async (req, res) => {
    try {
        const product = req.product;
        if (!req.body.message) {
            return Response.sendError(res, 400, 'Please enter a message');
        }

        report(req, res, 'product', product._id, async (report) => {
            try {
                await Product.updateOne({ _id: product._id }, { $push: { reports: report } });
                return Response.sendResponse(res, null, 'Thank you for reporting');
            } catch (err) {
                return Response.sendError(res, 400, 'Failed to update report');
            }
        });
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.clearProductReports = async (req, res) => {
    try {
        const rmRes = await Report.deleteMany({
            "entity._id": req.product._id,
            "entity.name": "product"
        });
        return Response.sendResponse(res, null, "reports cleaned");
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'failed to clear reports');
    }
};


exports.toggleProductStatus = async (req, res) => {
    try {
        const product = req.product;
        product.deletedAt = product.deletedAt ? null : new Date().toJSON();
        await product.save();

        return Response.sendResponse(res, product, 'Product ' + (product.deletedAt ? 'disabled' : 'enabled'));
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to update product status');
    }
};


exports.showProductDash = async (req, res) => {
    try {
        const product = await Product.findOne(
            { _id: req.product._id },
            {
                label: 1,
                description: 1,
                price: 1,
                currency: 1,
                photos: 1,
                country: 1,
                city: 1,
                sold: 1,
                reports: 1,
                user: 1,
                deletedAt: 1
            }
        ).populate('reports');

        if (!product) return Response.sendError(res, 500, 'Server error, please try again later');

        return Response.sendResponse(res, product);
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.allProducts = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['name', 'description', 'country', 'city']);

        // Use aggregation pipeline
        const products = await Product.aggregate()
            .match(dashParams.filter)
            .project({
                label: 1,
                description: 1,
                price: 1,
                currency: 1,
                photos: 1,
                country: 1,
                city: 1,
                available: { $cond: ["$sold", false, true] },
                deletedAt: 1,
                reports: { $size: "$reports" }
            })
            .sort(dashParams.sort)
            .skip(dashParams.skip)
            .limit(dashParams.limit);

        if (!products) return Response.sendError(res, 500, 'Server error, please try again later');

        // Count total products
        const count = await Product.countDocuments(dashParams.filter);

        return Response.sendResponse(res, {
            docs: products,
            totalPages: Math.ceil(count / dashParams.limit)
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.showProduct = (req, res) => {
    return Response.sendResponse(res, req.product)
}

exports.postedProducts = async (req, res) => {
    try {
        const filter = {
            user: new mongoose.Types.ObjectId(req.auth._id),
            label: new RegExp('^' + req.query.search, 'i'),
            deletedAt: null
        };
        const limit = 20;
        const page = parseInt(req.query.page) || 0;

        const products = await Product.find(filter, {
            label: 1,
            photos: 1,
            price: 1,
            currency: 1,
            country: 1,
            city: 1,
            description: 1,
            createdAt: 1,
            sold: 1  // Include the "sold" status

        })
        .sort({ createdAt: -1 })
        .skip(limit * page)
        .limit(limit);

        if (!products) return Response.sendError(res, 400, 'Cannot retrieve products');

        const count = await Product.countDocuments(filter);

        return Response.sendResponse(res, {
            products,
            more: (count - limit * (page + 1)) > 0
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Internal server error');
    }
};


exports.availableProducts = async (req, res) => {
    try {
        const filter = {
            label: new RegExp('^' + req.query.search, 'i'),
            deletedAt: null,
            sold: false,
            country: req.authUser.country,
            city: req.authUser.city
        };

        if (req.query.category && req.query.category !== 'All') {
            filter.category = req.query.category;
        }

        const limit = 20;
        const page = parseInt(req.query.page) || 0;

        // Fetch the products
        const products = await Product.find(filter, {
            label: 1,
            photos: 1,
            price: 1,
            currency: 1,
            country: 1,
            city: 1,
            description: 1,
            createdAt: 1,
            category: 1  // Include category in the fields to be returned
        })
            .sort({ createdAt: -1 })
            .skip(limit * page)
            .limit(limit);

        if (!products) return Response.sendError(res, 400, 'Cannot retrieve products');

        // Count the total number of products matching the filter
        const count = await Product.countDocuments(filter);

        return Response.sendResponse(res, {
            products,
            more: (count - (limit * (page + 1))) > 0
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};



exports.storeProduct = async (req, res) => {
    try {
        console.log('Parsed fields:', req.fields);
        console.log('Parsed files:', req.files);

        const dimensions = req.fields.dimensions ? JSON.parse(req.fields.dimensions) : { length: '0', width: '0', height: '0' };

        const product = new Product({
            label: req.fields.label,
            price: req.fields.price,
            currency: req.fields.currency,
            description: req.fields.description,
            user: req.fields.userId,
            category: req.fields.category,
            stock: req.fields.stock,
            brand: req.fields.brand,
            condition: req.fields.condition,
            weight: req.fields.weight,
            dimensions: {
                length: dimensions.length || '0',
                width: dimensions.width || '0',
                height: dimensions.height || '0',
            },
            country: req.fields.country,
            city: req.fields.city,
            tags: req.fields.tags,
        });

        if (req.files) {
            const photos = Object.keys(req.files).filter(key => key.startsWith('photos[')).map(key => req.files[key]);

            if (photos.length === 0) {
                console.error('No photos found in the request');
                return Response.sendError(res, 400, 'At least one photo is required');
            }

            await storeProductPhotos(photos, product);
        } else {
            console.error('Files object is undefined');
            return Response.sendError(res, 400, 'At least one photo is required');
        }

        console.log('Product before saving:', product);
        await product.save();
        console.log('Product saved successfully:', product);
        return Response.sendResponse(res, product, 'The product has been created successfully');
    } catch (error) {
        console.log('Server error:', error);
        return Response.sendError(res, 500, 'Internal server error');
    }
};


const storeProductPhotos = async (photos, product) => {
    if (!Array.isArray(photos)) {
        photos = [photos];
    }

    product.photos = [];

    for (let i = 0; i < photos.length; i++) {
        try {
            const photoName = `${product._id}_${i}${path.extname(photos[i].name)}`;
            const photoPath = path.join(__dirname, `../../public/products/${photoName}`);
            
            // Ensure the public/products directory exists
            const dir = path.dirname(photoPath);
            await fs.promises.mkdir(dir, { recursive: true });

            // Write the photo file
            await fs.promises.writeFile(photoPath, await fs.promises.readFile(photos[i].path));
            
            // Add the relative path and type to the product photos array
            product.photos.push({ path: `/products/${photoName}`, type: photos[i].type });
        } catch (error) {
            console.error(`Failed to store photo ${photos[i].name}:`, error);
            throw new Error('Failed to store product photos');
        }
    }

    console.log('Product photos stored:', product.photos);
};




exports.updateProduct = async (req, res) => {
    try {
        let product = req.product;

        // Omit 'photos' from the incoming fields to avoid overwriting them directly
        const fieldsToUpdate = _.omit(req.fields, ['photos']);
        product = _.extend(product, fieldsToUpdate);  // Extend the product with new fields

        // If new photos are uploaded, process them and add to the product
        if (req.files && req.files.photos) {
            const photos = Array.isArray(req.files.photos) ? req.files.photos : [req.files.photos];
            await storeProductPhotos(photos, product);
        }

        // Save the updated product
        await product.save();

        return Response.sendResponse(res, product, 'Product updated successfully');
    } catch (error) {
        console.error('Error updating product:', error);
        return Response.sendError(res, 500, 'Could not update product');
    }
};


exports.deleteProduct = async (req, res) => {
    try {
        await Product.deleteOne({ _id: req.product._id });
        return Response.sendResponse(res, null, 'Product removed');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Could not remove product');
    }
};


exports.soldProduct = async (req, res) => {
    try {
        const product = await Product.findOne({ _id: req.product._id });
        
        if (!product) {
            return Response.sendError(res, 400, 'Product not found');
        }

        product.sold = true;

        await product.save();
        return Response.sendResponse(res, true, 'Product is marked as sold');
        
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Cannot mark this product as sold now, try again later');
    }
};


exports.destroyProduct = async (req, res) => {
    const product = req.product;
    const photoPaths = product.photos.map(photo => path.join(__dirname, `../../public${photo.path}`));

    try {
        await Product.deleteOne({ _id: product._id });

        // Remove the photos associated with the product
        photoPaths.forEach(photoPath => {
            if (fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
            }
        });

        return Response.sendResponse(res, null, 'Product removed');
        
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Could not remove product');
    }
};


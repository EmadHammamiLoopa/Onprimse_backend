const Response = require('./Response')
const fs = require('fs')
const Product = require('../models/Product')
const _ = require('lodash')
const path = require('path')
const { asset, extractDashParams, report } = require('../helpers')
const mongoose  = require('mongoose')
const Report = require('../models/Report')
const { authUser } = require('./AuthController')

exports.reportProduct = (req, res) => {
    try {
        const product = req.product
        if(!req.body.message) return Response.sendError(res, 400, 'please enter a message')
        report(req, res, 'product', product._id, (report) => {
            Product.updateOne({_id: product._id}, {$push: {reports: report}}, (err, product) => {
                if(err) return Response.sendError(res, 400, 'failed')
                return Response.sendResponse(res, null, 'Thank you for reporting')
            })
        })
    } catch (error) {
        console.log(error);
    }
}

exports.clearProductReports = (req, res) => {
    Report.remove({
        "entity._id": req.product._id,
        "entity.name": "product"
    }, (err, rmRes) => {
        if(err) return Response.sendError(res, 400, 'failed to clear reports')
        return Response.sendResponse(res, null, "reports cleaned")
    })
}

exports.toggleProductStatus = (req, res) => {
    const product = req.product
    product.deletedAt = product.deletedAt ? null : new Date().toJSON()
    product.save((err, product) => {
        if(err) return Response.sendError(res, 400, 'failed')
        console.log(product);
        return Response.sendResponse(res, product, 'product ' + (product.deletedAt ? 'disabled' : 'enabled'))
    })
}

exports.showProductDash = (req, res) => {
    Product.findOne({_id: req.product._id}, {
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
    })
    .populate('reports')
    .exec((err, product) => {
        if(err || !product) return Response.sendError(res, 500, 'Server error, please try again later');
        return Response.sendResponse(res, product)
    })
}

exports.allProducts = (req, res) => {
    try{
        dashParams = extractDashParams(req, ['name', 'description', 'country', 'city']);
        Product.aggregate()
        .match(dashParams.filter)
        .project({
            label: 1,
            description: 1,
            price: 1,
            currency: 1,
            photos: 1,
            country: 1,
            city: 1,
            available: {$cond: ["$sold", false, true]},
            deletedAt: 1,
            reports: {
                $size: "$reports"
            }
        })
        .sort(dashParams.sort)
        .skip(dashParams.skip)
        .limit(dashParams.limit)
        .exec(async(err, products) => {
            console.log(err)
            if(err || !products) return Response.sendError(res, 500, 'Server error, please try again later');
            const count = await Product.find(dashParams.filter).countDocuments();
            return Response.sendResponse(res, {
                docs: products,
                totalPages: Math.ceil(count / dashParams.limit)
            });
        });
    }catch(err){
        console.log(err);
    }
}

exports.showProduct = (req, res) => {
    return Response.sendResponse(res, req.product)
}

exports.postedProducts = (req, res) => {
    try{
        const filter = {
            user: mongoose.Types.ObjectId(req.auth._id),
            label: new RegExp('^' + req.query.search, 'i'),
            deletedAt: null
        }
        limit = 20
        Product.find(filter , {
            label: 1,
            photos: 1,
            price: 1,
            currency: 1,
            country: 1,
            city: 1,
            description: 1,
            createdAt: 1
        })
        .sort({createdAt: -1})
        .skip(limit * req.query.page)
        .limit(limit)
        .exec((err, products) => {
            if(err || !products) return Response.sendError(res, 400, 'cannot retrieve products')
            Product.find(filter).countDocuments((err, count) => {
                return Response.sendResponse(res, {
                    products,
                    more: (count - (limit * (+req.query.page + 1))) > 0
                })
            })
        })
    }catch(err){
        console.log(err);
    }
}

exports.availableProducts = (req, res) => {
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
        Product.find(filter, {
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
        .skip(limit * req.query.page)
        .limit(limit)
        .exec((err, products) => {
            if (err || !products) return Response.sendError(res, 400, 'cannot retrieve products');
            Product.find(filter).countDocuments((err, count) => {
                return Response.sendResponse(res, {
                    products,
                    more: (count - (limit * (+req.query.page + 1))) > 0
                });
            });
        });
    } catch (err) {
        console.log(err);
        Response.sendError(res, 500, 'Server error');
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
        const fields = _.omit(req.fields, ['photos']);
        product = _.extend(product, fields);

        if (req.files && req.files.photos) {
            await storeProductPhotos(req.files.photos, product);
        }

        await product.save();
        return Response.sendResponse(res, product, 'Product updated successfully');
    } catch (error) {
        console.error(error);
        return Response.sendError(res, 400, 'Could not update product');
    }
};

exports.deleteProduct = (req, res) => {
    const product = req.product
    product.deletedAt = new Date().toJSON()
    product.remove((err, product) => {
        if(err) Response.sendError(res, 400, 'could not remove product');
        return Response.sendResponse(res, null, 'product removed')
    })
}

exports.soldProduct = (req, res) => {
    Product.findOne({_id: req.product._id}, (err, product) => {
        if(err || !product) return Response.sendError(res, 400, 'product not found')
        product.sold = true;
        product.save((err, product) => {
            if(err) return Response.sendError(res, 400, 'Cannot mark this product as sold now, try again later')
            return Response.sendResponse(res, true, 'product is marked as sold')
        })
    })
}

exports.destroyProduct = (req, res) => {
    const product = req.product;
    const photoPaths = product.photos.map(photo => path.join(__dirname, `../../public${photo.path}`));
    
    product.remove((err, product) => {
        if (err) return Response.sendError(res, 400, 'could not remove product');
        
        photoPaths.forEach(photoPath => {
            if (fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
            }
        });

        return Response.sendResponse(res, null, 'product removed');
    });
};

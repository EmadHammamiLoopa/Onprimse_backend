exports.invalidTokenError = (err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
        return res.status(401).send('invalid token');
    }
    next()
}

exports.notFoundError = (req, res, next) => {
    res.status(404).send("Cannot find this url")
}
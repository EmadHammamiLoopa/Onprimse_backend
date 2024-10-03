module.exports = {
    sendResponse: (res, data, message = null) => {
        return res.json({
            data,
            message
        })
    },
    sendError: (res, status, errors) => {
        return res.status(status).json(errors)
    }
}
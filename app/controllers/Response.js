module.exports = {
    sendResponse: (res, data = null, message = null, additionalInfo = {}) => {
        return res.json({
            success: true,
            data,
            message,
            ...additionalInfo // Allow passing additional metadata if necessary
        });
    },

    sendError: (res, status, errors = null, errorCode = null) => {
        return res.status(status).json({
            success: false,
            errors,
            errorCode // Optionally include an error code for better debugging
        });
    }
};

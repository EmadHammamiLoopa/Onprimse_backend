const Response = require("../controllers/Response")
const Report = require("../models/Report")

exports.reportById = (req, res, next, id) => {
    Report.findOne({_id: id}, (err, report) => {
        if(err || !report) return Response.sendError(res, 400, 'report not found')
        req.report = report
        next()
    })
}
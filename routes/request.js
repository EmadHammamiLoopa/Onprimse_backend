const express = require('express')
const { storeRequest, requests, acceptRequest, rejectRequest, cancelRequest} = require('../app/controllers/RequestController')
const { requireSignin, withAuthUser } = require('../app/middlewares/auth')
const { userById, isNotFriend, isNotBlocked } = require('../app/middlewares/user')
const { requestById, requestSender, requestReceiver, requestNotExist, sendRequestPermission } = require('../app/middlewares/request')
const router = express.Router()

// router.get('/', indexRequests)

router.post('/accept/:requestId', [requireSignin, requestReceiver, isNotBlocked, withAuthUser], acceptRequest)
router.post('/reject/:requestId', [requireSignin, requestReceiver, isNotBlocked], rejectRequest)
router.post('/cancel/:requestId', [requireSignin, requestSender, isNotBlocked], cancelRequest)

router.post('/:userId', [requireSignin, isNotFriend, requestNotExist, withAuthUser, sendRequestPermission], storeRequest)
router.get('/', [requireSignin], requests)

router.param('requestId', requestById)
router.param('userId', userById)
module.exports = router
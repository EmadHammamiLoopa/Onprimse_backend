const express = require('express')

const { 
    storeComment, 
    getComments, 
    deleteComment, 
    voteOnComment, 
    reportComment,
    getDashComments,
    showComment,
    postComments,
    
} = require('../app/controllers/CommentController');

const { requireSignin, withAuthUser, isAdmin } = require('../app/middlewares/auth');
const { commentById, commentOwner } = require('../app/middlewares/comment');
const { postById } = require('../app/middlewares/post');
const { storeCommentValidator } = require('../app/middlewares/validators/CommentValidator');

const router = express.Router()
router.param('commentId', commentById)
router.param('postId', postById)
router.get('/post/:postId/comments', [requireSignin, isAdmin], postComments)

router.get('/comment/:commentId', [requireSignin], showComment)

router.post('/post/:postId/comment', [requireSignin, withAuthUser], storeComment)
router.get('/post/:postId/comment', [requireSignin], getComments)
router.delete('/comment/:commentId', [requireSignin, commentOwner], deleteComment)
router.post('/comment/:commentId/vote', [requireSignin, withAuthUser], voteOnComment)
router.post('/comment/:commentId/report', [requireSignin], reportComment)



module.exports = router
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', 'public', 'uploads');
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const fileName = 'avatar-' + Date.now() + path.extname(file.originalname);
        cb(null, fileName);
        req.savedAvatarPath = '/uploads/' + fileName;
    }
});

const upload = multer({ storage: storage });

module.exports = upload;

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const isVercel = process.env.VERCEL === '1';
const baseDir = isVercel ? '/tmp/uploads' : path.join(__dirname, '../public/uploads');

// Ensure upload directories exist
const uploadDirs = [
    path.join(baseDir, 'avatars'),
    path.join(baseDir, 'materials'),
    path.join(baseDir, 'covers')
];

uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'avatar') {
            cb(null, path.join(baseDir, 'avatars'));
        } else if (file.fieldname === 'material_file') {
            cb(null, path.join(baseDir, 'materials'));
        } else if (file.fieldname === 'cover_image') {
            cb(null, path.join(baseDir, 'covers'));
        } else {
            cb(null, baseDir);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

module.exports = upload;

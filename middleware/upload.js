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

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MATERIAL_EXTENSIONS = new Set([
    '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
    '.txt', '.zip', '.rar', '.mp4', '.webm', '.jpg', '.jpeg', '.png', '.webp'
]);

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
        const safeExt = path.extname(file.originalname || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
        cb(null, uniqueSuffix + safeExt);
    }
});

/**
 * Enforce allowlisted file extensions per field to block SVG/HTML/JS XSS uploads.
 */
function fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (file.fieldname === 'avatar' || file.fieldname === 'cover_image') {
        if (!IMAGE_EXTENSIONS.has(ext) || !file.mimetype.startsWith('image/') || ext === '.svg') {
            return cb(new Error('Only JPG, PNG, GIF, or WebP images are allowed.'));
        }
        return cb(null, true);
    }
    if (file.fieldname === 'material_file') {
        if (!MATERIAL_EXTENSIONS.has(ext)) {
            return cb(new Error('Unsupported material file format.'));
        }
        return cb(null, true);
    }
    return cb(new Error('Unexpected upload field.'));
}

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 15 * 1024 * 1024 // 15 MB max per file
    }
});

module.exports = upload;

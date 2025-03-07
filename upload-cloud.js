// This file is for cloud storage configuration (Cloudinary)
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');

// Add debug logging
console.log('Cloudinary Config:', {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET ? '***' : 'undefined' // Don't log the actual secret
});

// Configure Cloudinary with error handling
try {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
    console.log('Cloudinary configured successfully');
} catch (error) {
    console.error('Error configuring Cloudinary:', error);
}

// Configure storage for 3D models
let modelStorage;
try {
    modelStorage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: '3d-models',
            resource_type: 'raw',
            allowed_formats: ['glb', 'gltf', 'usdz'],
            format: 'raw'
        }
    });
    console.log('Model storage configured successfully');
} catch (error) {
    console.error('Error configuring model storage:', error);
    // Fallback to local storage if Cloudinary fails
    modelStorage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, 'uploads');
        },
        filename: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            cb(null, file.fieldname + '-' + uniqueSuffix + ext);
        }
    });
}

// Configure storage for images (thumbnails, posters)
let imageStorage;
try {
    imageStorage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: 'model-images',
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
            transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
        }
    });
    console.log('Image storage configured successfully');
} catch (error) {
    console.error('Error configuring image storage:', error);
    // Fallback to local storage if Cloudinary fails
    imageStorage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, 'uploads');
        },
        filename: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            cb(null, file.fieldname + '-' + uniqueSuffix + ext);
        }
    });
}

// Configure multer for 3D model uploads
const uploadModel = multer({
    storage: modelStorage,
    fileFilter: function (req, file, cb) {
        // Accept only 3D model files
        const allowedExtensions = ['.glb', '.gltf', '.usdz'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only .glb, .gltf, and .usdz files are allowed'));
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB max file size
    }
});

// Configure multer for image uploads
const uploadImage = multer({
    storage: imageStorage,
    fileFilter: function (req, file, cb) {
        // Accept only image files
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only .jpg, .jpeg, .png, and .webp files are allowed'));
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max file size
    }
});

module.exports = {
    uploadModel,
    uploadImage,
    cloudinary
}; 
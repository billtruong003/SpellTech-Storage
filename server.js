require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { connectDB } = require('./db-mongo');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
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

// Set MongoDB connection start time
global.mongoConnectStartTime = Date.now();

// Connect to MongoDB
connectDB().then(() => {
    console.log('MongoDB connected successfully');
    // Start the server
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to connect to MongoDB:', err);
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(`/${uploadDir}`, express.static(uploadDir));

// Session configuration with MongoDB
app.use(session({
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/3d-model-manager',
        ttl: 60 * 60 * 24 // 1 day
    }),
    secret: process.env.SESSION_SECRET || 'your_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
}));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/models', require('./routes/models'));

// Add a debug route for MongoDB connection
app.get('/db-test', async (req, res) => {
    try {
        // Import testConnection function
        const { testConnection } = require('./db-mongo');

        // Test direct connection
        const directConnectionResult = await testConnection();

        // Try to ping MongoDB through mongoose
        let mongooseResult = null;
        if (mongoose.connection.readyState === 1) {
            mongooseResult = await mongoose.connection.db.admin().ping();
        }

        res.json({
            status: directConnectionResult ? 'success' : 'error',
            message: directConnectionResult ? 'Connected to MongoDB' : 'Failed to connect to MongoDB',
            directConnection: directConnectionResult,
            mongooseConnection: {
                readyState: mongoose.connection.readyState,
                result: mongooseResult
            },
            mongodbUri: process.env.MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@') // Hide credentials
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to connect to MongoDB',
            error: error.message
        });
    }
});

// Add a health check endpoint for Render
app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

// Add fallback to SQLite if MongoDB connection fails
app.use(async (req, res, next) => {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
        // If not connected and we've been trying for more than 10 seconds
        if (Date.now() - global.mongoConnectStartTime > 10000) {
            console.log('MongoDB connection unavailable, falling back to SQLite');

            // Only initialize SQLite once
            if (!global.sqliteInitialized) {
                try {
                    // Initialize SQLite
                    const sqlite3 = require('sqlite3').verbose();
                    const db = new sqlite3.Database(process.env.DB_PATH || 'database.sqlite');

                    // Make db available globally
                    global.sqliteDb = db;
                    global.sqliteInitialized = true;

                    console.log('SQLite fallback initialized successfully');
                } catch (error) {
                    console.error('Failed to initialize SQLite fallback:', error);
                }
            }
        }
    }
    next();
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {
        title: 'Error',
        message: err.message || 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', {
        title: 'Page Not Found',
        message: 'The page you are looking for does not exist.',
        error: {}
    });
}); 
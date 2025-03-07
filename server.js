require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const { connectDB } = require('./db-mongo');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure CORS
app.use(cors({
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Add CORS headers for Cloudinary resources
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
});

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
            console.log('MongoDB connection unavailable, using SQLite fallback');

            // Only initialize SQLite once
            if (!global.sqliteInitialized) {
                try {
                    // Initialize SQLite
                    const sqlite3 = require('sqlite3').verbose();
                    const db = new sqlite3.Database(process.env.DB_PATH || 'database.sqlite');

                    // Make db available globally
                    global.sqliteDb = db;
                    global.sqliteInitialized = true;

                    // Create tables if they don't exist
                    db.serialize(() => {
                        // Users table
                        db.run(`CREATE TABLE IF NOT EXISTS users (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            username TEXT UNIQUE,
                            email TEXT UNIQUE,
                            password TEXT,
                            role TEXT DEFAULT 'user',
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )`);

                        // Models table
                        db.run(`CREATE TABLE IF NOT EXISTS models (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            title TEXT,
                            description TEXT,
                            filename TEXT,
                            filepath TEXT,
                            user_id INTEGER,
                            is_public INTEGER DEFAULT 1,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (user_id) REFERENCES users (id)
                        )`);

                        // Check if admin user exists
                        db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
                            if (err) {
                                console.error('Error checking admin user:', err);
                                return;
                            }

                            // Create admin user if not exists
                            if (!row) {
                                const bcrypt = require('bcrypt');
                                const hashedPassword = bcrypt.hashSync('admin123', 10);

                                db.run(
                                    "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
                                    ['admin', 'admin@example.com', hashedPassword, 'admin'],
                                    function (err) {
                                        if (err) {
                                            console.error('Error creating admin user:', err);
                                        } else {
                                            console.log('Admin user created in SQLite');
                                        }
                                    }
                                );
                            }
                        });
                    });

                    console.log('SQLite fallback initialized successfully');
                } catch (error) {
                    console.error('Failed to initialize SQLite fallback:', error);
                }
            }

            // Attach SQLite db to request
            req.sqliteDb = global.sqliteDb;
        }
    }
    next();
});

// Add middleware to handle Cloudinary URLs
app.use((req, res, next) => {
    const originalUrl = req.url;

    // Check if the URL is a Cloudinary URL that was incorrectly prefixed with the domain
    if (originalUrl.includes('https://res.cloudinary.com/')) {
        // Extract the Cloudinary URL
        const cloudinaryUrl = originalUrl.substring(originalUrl.indexOf('https://'));

        // Redirect to the correct Cloudinary URL
        return res.redirect(cloudinaryUrl);
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
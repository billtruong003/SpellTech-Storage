const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { User } = require('./models');
const { MongoClient, ServerApiVersion } = require('mongodb');

// Connect to MongoDB
const connectDB = async () => {
    try {
        // Set TLS options for Node.js
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';

        // Connect with simplified options
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            },
            connectTimeoutMS: 30000,
            socketTimeoutMS: 45000
        });

        console.log(`MongoDB Connected: ${conn.connection.host}`);

        // Initialize database with admin user if not exists
        await initDb();

        return conn;
    } catch (error) {
        console.error(`Error connecting to MongoDB: ${error.message}`);

        // Fallback to in-memory MongoDB for development/testing
        if (process.env.NODE_ENV !== 'production') {
            console.log('Attempting to connect to in-memory MongoDB...');

            try {
                const { MongoMemoryServer } = require('mongodb-memory-server');
                const mongod = await MongoMemoryServer.create();
                const uri = mongod.getUri();

                const conn = await mongoose.connect(uri);

                console.log('Connected to in-memory MongoDB');

                // Initialize database with admin user
                await initDb();

                return conn;
            } catch (fallbackError) {
                console.error(`Failed to connect to in-memory MongoDB: ${fallbackError.message}`);
                process.exit(1);
            }
        } else {
            process.exit(1);
        }
    }
};

// Initialize database with admin user
const initDb = async () => {
    try {
        // Check if admin user exists
        const adminExists = await User.findOne({ username: 'admin' });

        if (!adminExists) {
            console.log('Creating admin user...');

            // Create admin user
            await User.create({
                username: 'admin',
                email: 'admin@example.com',
                password: 'admin123',
                role: 'admin'
            });

            console.log('Admin user created successfully');
        }
    } catch (error) {
        console.error(`Error initializing database: ${error.message}`);
    }
};

// Test MongoDB connection
const testConnection = async () => {
    try {
        // Try direct connection with MongoClient
        const client = new MongoClient(process.env.MONGODB_URI, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            },
            connectTimeoutMS: 30000,
            socketTimeoutMS: 45000
        });

        await client.connect();
        await client.db("admin").command({ ping: 1 });
        console.log("MongoDB connection test successful!");
        await client.close();
        return true;
    } catch (error) {
        console.error("MongoDB connection test failed:", error);
        return false;
    }
};

module.exports = { connectDB, testConnection }; 
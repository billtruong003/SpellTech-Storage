const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = process.env.DB_PATH || 'database.sqlite';
const db = new sqlite3.Database(dbPath);

function initDb() {
    db.serialize(() => {
        // Create users table
        db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // Create models table
        db.run(`
      CREATE TABLE IF NOT EXISTS models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        file_path TEXT NOT NULL,
        thumbnail_path TEXT,
        file_size INTEGER,
        file_type TEXT,
        user_id INTEGER,
        is_public BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

        // Create model_settings table for storing model viewer settings
        db.run(`
      CREATE TABLE IF NOT EXISTS model_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id INTEGER NOT NULL,
        camera_orbit TEXT,
        camera_target TEXT,
        field_of_view TEXT,
        exposure TEXT,
        shadow_intensity TEXT,
        shadow_softness TEXT,
        environment_image TEXT,
        skybox_image TEXT,
        animation_name TEXT,
        autoplay BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (model_id) REFERENCES models (id)
      )
    `);

        // Create hotspots table
        db.run(`
      CREATE TABLE IF NOT EXISTS hotspots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        position TEXT NOT NULL,
        normal TEXT,
        surface TEXT,
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (model_id) REFERENCES models (id)
      )
    `);

        // Create admin user if not exists
        db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
            if (err) {
                console.error('Error checking for admin user:', err);
                return;
            }

            if (!row) {
                bcrypt.hash('admin123', 10, (err, hash) => {
                    if (err) {
                        console.error('Error hashing password:', err);
                        return;
                    }

                    db.run(
                        "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
                        ['admin', 'admin@example.com', hash, 'admin'],
                        function (err) {
                            if (err) {
                                console.error('Error creating admin user:', err);
                                return;
                            }
                            console.log('Admin user created successfully');
                        }
                    );
                });
            }
        });
    });
}

module.exports = {
    db,
    initDb
}; 
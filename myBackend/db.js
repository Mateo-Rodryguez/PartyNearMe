require('dotenv').config({ path: '../.env'}); // Environment variables
const mysql = require('mysql2')

// Creating a connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

function setupDatabase() {
    return new Promise((resolve, reject) => {
        pool.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME};`, function(err, results) {
            if (err) {
                reject(err);
                return;
            }
            pool.query(`USE ${process.env.DB_NAME};`, function(err, results) {
                if (err) {
                    reject(err);
                    return;
                }
            
                pool.config.connectionConfig.database = process.env.DB_NAME;
                resolve(pool);
             });
        });
    });
}
// Exporting the pool to the app
module.exports = setupDatabase;
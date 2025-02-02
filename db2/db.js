require('dotenv').config();
const { Pool } = require('pg');

// Pool to manage connections
const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
});

const getUserByEmail = async (email) => {
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error fetching user by email:', err.message);
        throw err;
    }
};
module.exports = {
    getUserByEmail,
    pool,
};
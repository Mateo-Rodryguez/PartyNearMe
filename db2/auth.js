const jwt = require('jsonwebtoken');
require('dotenv').config();

function generateAuthToken(user) {
    const payload = {
        userId: user.id,
        email: user.email
    };
    const secretKey = process.env.JWT_SECRET;
    const options = {
        expiresIn: '1h' // Token expiration time
    };

    return jwt.sign(payload, secretKey, options);
}

module.exports = generateAuthToken;
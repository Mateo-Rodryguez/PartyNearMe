const express = require('express');
const pool = require('./db'); // importing db.js configuration
const helmet = require('helmet');

const app = express();
const port = 3000;

// Using helmet to comply with browser security policies
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        },
    },
}));

// Route to testdatabase connection
app.get('/test-db', (req, res) =>{
    pool.query('SELECT 1 + 1 AS solution', (error, results) => {
        if (error) throw error;
        res.send(`The solution is: ${results[0].solutionn}`);
    });
});

//Route to get all users
app.get('/users', (req, res) => {
    pool.query('SELECT * FROM users', (err, results) =>{
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).send('Error executing query');
            return;
        }
        res.json(results);
    });
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
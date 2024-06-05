const setupDatabase = require('./db');

setupDatabase().then(pool => {
    createUsersTable(pool);
    createPostTable(pool);
}).catch(err => {
    console.error('Error setting up database', err);
});
//Creating users table
function createUsersTable(pool) {
    const createTableQuery = `
    CREATE TABLE IF NOT EXISTS users(
        id INT  AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE
    );
    `;

    pool.query(createTableQuery, (err, results) =>{
        if(err){
            console.error('Error creating users table', err);
            return;
        }
        console.log('Users table created or existent');
    });
}

// Function to create a posts table
function createPostTable(pool) {
    const createTableQuery = `
    CREATE TABLE IF NOT EXISTS posts(
        id INT AUTO_INCREMENT PRIMARY KEY,
        users_id INT,
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (users_id) REFERENCES users(id)
    );
`;

pool.query(createTableQuery, (err, results) => {
    if(err) {
     console.error('Error creating posts table', err);    
     return;
    }
    console.log('Posts table created or existent');
});
}
// This file will hold all othe config options for our server

require('dotenv').config();
// Create our export.
// This will let us import our config and use it elsewhere in our application.
module.exports = {
  // Set the port variable
  port: process.env.PORT,
  // set up our database configs.
  db: {
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    options: {
      host: process.env.HOST,
      dialect: process.env.DIALECT,
      storage: './flowershop.sqlite',
    }
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET
  }
}

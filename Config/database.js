const mongoose = require('mongoose');
const { ServerApiVersion } = require('mongodb');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            }
        });
        console.log("Database connected successfully");
    } catch (error) {
        console.log(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;

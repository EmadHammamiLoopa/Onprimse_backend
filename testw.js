const mongoose = require('mongoose');
const User = require("./app/models/User");
require('dotenv').config(); // Load environment variables from .env file, if available

// Use the MONGODB_URL from your environment variables or replace it with your MongoDB connection string directly
const db = process.env.MONGODB_URL || 'mongodb+srv://isenappnorway:S3WlOS8nf8EwWMmN@cluster0.gwb9wev.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';

// Function to update mainAvatar and avatar URLs for all users
const updateAvatarsForAllUsers = async () => {
  try {
    // Find and update users who have avatars starting with "http://127.0.0.1:3300/"
    const result = await User.updateMany(
      {
        $or: [
          { mainAvatar: { $regex: '^http://127.0.0.1:3300/' } }, // Check for mainAvatar field
          { 'avatar.0': { $exists: true, $regex: '^http://127.0.0.1:3300/' } } // Check if avatar array exists and matches
        ]
      },
      [
        {
          $set: {
            mainAvatar: {
              $replaceOne: {
                input: "$mainAvatar",
                find: "http://127.0.0.1:3300/",
                replacement: "https://project-9aw8.onrender.com/"
              }
            },
            avatar: {
              $map: {
                input: "$avatar",
                as: "item",
                in: {
                  $replaceOne: {
                    input: "$$item",
                    find: "http://127.0.0.1:3300/",
                    replacement: "https://project-9aw8.onrender.com/"
                  }
                }
              }
            }
          }
        }
      ]
    );

    console.log(`Updated avatars for ${result.modifiedCount} users.`);
  } catch (err) {
    console.error('Error updating avatars:', err.message);
  } finally {
    mongoose.connection.close();
  }
};

// Connect to MongoDB and run the update function
mongoose.connect(db, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to MongoDB');
    updateAvatarsForAllUsers();
  })
  .catch(err => console.error('Error connecting to MongoDB:', err.message));

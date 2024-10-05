const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://isenappnorway:S3WlOS8nf8EwWMmN@cluster0.gwb9wev.mongodb.net/mydatabase?retryWrites=true&w=majority&appName=Cluster0', {
})
.then(() => {
    console.log('Connected to MongoDB successfully.');
})
.catch(err => {
    console.error('Failed to connect to MongoDB:', err.message);
});

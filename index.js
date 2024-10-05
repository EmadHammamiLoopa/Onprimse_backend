const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const Agenda = require("agenda");
const path = require('path');
const session = require('express-session');
const passport = require('./routes/passport');  // Adjust the path to your passport configuration
const schedule = require('node-schedule');
const Comment = require("./app/models/Comment")

// import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const productRoutes = require('./routes/product');
const jobRoutes = require('./routes/job');
const serviceRoutes = require('./routes/service');
const requestRoutes = require('./routes/request');
const messageRoutes = require('./routes/message');
const channelRoutes = require('./routes/channel');
const postRoutes = require('./routes/post');
const commentRoutes = require('./routes/comment');
const subscriptionRoutes = require('./routes/subscription');
const reportRoutes = require('./routes/report');


// import middlewares
const { notFoundError, invalidTokenError } = require('./app/middlewares/errors');
const { setUrlInfo, updateUserInfo, allowAccess, checkVersion } = require('./app/middlewares/others');
const Subscription = require('./app/models/Subscription');
const Product = require('./app/models/Product');
const Report = require('./app/models/Report');
const User = require('./app/models/User');
const Follow = require('./app/models/Follow');
const Channel = require('./app/models/Channel');
const Service = require('./app/models/Service');
const Job = require('./app/models/Job');
const { sendNotification } = require('./app/helpers');
const Message = require('./app/models/Message');
const Post = require('./app/models/Post');
const { deleteUser } = require('./app/controllers/UserController');
const connectedUsers = {};  // To store userId and socket references

require('dotenv').config();
const app = express();
app.use(cors());
app.use(allowAccess);


const removeExpiredMedia = () => {
  const now = new Date();
  Comment.updateMany(
      { 'media.expiryDate': { $lte: now } },  // Find media that has expired
      { $unset: { 'media.url': '' } },  // Remove the media URL but keep the comment/post intact
      (err, result) => {
          if (err) {
              console.error('Error removing expired media:', err);
          } else {
              console.log('Expired media removed:', result);
          }
      }
  );
};


const http = require('http').Server(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'], // Prefer WebSocket
});

const { ExpressPeerServer } = require('peer');
const peerServer = ExpressPeerServer(http, {
    debug: true
});

schedule.scheduleJob('0 * * * *', removeExpiredMedia);  // Runs every hour

const port = process.env.PORT || 3300;
http.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`));


app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use(helmet({
    crossOriginResourcePolicy: false,
  }));
app.use(morgan('tiny'));
app.use(cookieParser());
app.use('/peerjs', peerServer);


mongoose.connect('mongodb+srv://isenappnorway:S3WlOS8nf8EwWMmN@cluster0.gwb9wev.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0', {
  socketTimeoutMS: 600000,    // 60 seconds for socket timeout
  connectTimeoutMS: 600000,   // 60 seconds for connection timeout
  serverSelectionTimeoutMS: 600000, // Increase server selection timeout
  maxPoolSize: 10,           // Set max pool size for better connection handling (updated option for poolSize)
  retryWrites: true          // Enable retrying writes
})
.then(() => console.log("Database connected successfully..."))
.catch((err) => console.log("Could not connect to database...", err));





const agenda = new Agenda({ db: { address: 'mongodb+srv://isenappnorway:S3WlOS8nf8EwWMmN@cluster0.gwb9wev.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0' } });
require('./app/jobs')(agenda);

const routePrefix = '/api/v1';

app.use(checkVersion);
app.use(setUrlInfo);
app.use(updateUserInfo);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/message', messageRoutes);

app.use(session({
  secret: process.env.SESSION_SECRET || 'e65b134003955ffbbc7965801577255841adbf17c47bb7f69cef9d875e1705b02a650a0917b6660b4e4b059539b20ec2ce90ac82fb5c4bf71c2498e95f23e477',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: true, // Ensures cookies are only sent over HTTPS
    sameSite: 'none' // Ensures cross-site cookies work
  }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use((req, res, next) => {
  req.io = io; // Attach the Socket.io instance to the req object
  next();
});

app.get(`${routePrefix}/`, (req, res) => res.send('api is working'));
app.use(`${routePrefix}/auth`, authRoutes);
app.use(`${routePrefix}/user`, userRoutes);
app.use(`${routePrefix}/request`, requestRoutes);
app.use(`${routePrefix}/product`, productRoutes);
app.use(`${routePrefix}/job`, jobRoutes);
app.use(`${routePrefix}/service`, serviceRoutes);
app.use(`${routePrefix}/message`, messageRoutes);
app.use(`${routePrefix}/channel`, channelRoutes);
app.use(`${routePrefix}/channel`, postRoutes);  // corrected this line
app.use(`${routePrefix}/channel`, commentRoutes);
app.use(`${routePrefix}/subscription`, subscriptionRoutes);
app.use(`${routePrefix}/report`, reportRoutes);

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use('/public/images/avatars', express.static(path.join(__dirname, 'public/images/avatars')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));



function listRoutes(app) {
    app._router.stack.forEach(middleware => {
      if (middleware.name === 'router') {
        middleware.handle.stack.forEach(handler => {
          if (handler.route) {
            console.log(`Method: ${handler.route.stack[0].method.toUpperCase()}, Path: ${routePrefix}${handler.route.path}`);
          }
        });
      }
    });
  }
  

// Log routes
listRoutes(app);
app.use(invalidTokenError);
app.use(notFoundError);

app.use((req, res, next) => {
  console.error(`404 Error: ${req.method} ${req.url}`);
  res.status(404).send('Endpoint not found.');
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(`Error: ${err.message}`);
  res.status(err.status || 500).send({
    error: {
      message: err.message || 'Internal Server Error',
      details: err.stack || ''
    }
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  // Log the error message and stack trace to the console
  console.error(`Error: ${err.message}`);
  
  // Check if it's a 502 error
  if (err.status === 502) {
    console.error('502 Bad Gateway Error:', err.message);
    res.status(502).send({
      error: {
        message: '502 Bad Gateway',
        details: err.message || 'Bad Gateway Error'
      }
    });
  } else {
    // For all other errors, send a 500 status by default
    res.status(err.status || 500).send({
      error: {
        message: err.message || 'Internal Server Error',
        details: err.stack || ''
      }
    });
  }
});


io.sockets.on('connection', (socket) => {
  console.log('New connection');
  console.log('socket.handshake.query', socket.handshake.query); // Log handshake query parameters

  const userId = socket.handshake.query.userId; // Extract userId from the handshake query
  if (userId) {
    socket.userId = userId;  // Store userId with socket for easy access
    connectedUsers[userId] = socket;  // Store userId and corresponding socket

    console.log(`User connected with ID: ${userId}`);
    console.log('Currently connected users:', Object.keys(connectedUsers));

    // Set the user as online when they connect
    User.findById(userId)
      .then(user => {
        if (user) {
          user.setOnline(); // Assuming setOnline updates the user's status
          console.log(`User ${userId} is now online`);
        }
      })
      .catch(err => {
        console.error(`Error finding user with ID ${userId}:`, err);
      });

    // Listen for the 'connect-user' event to track user connections
    socket.on('connect-user', (newUserId) => {
      socket.userId = newUserId; // Attach new user ID to the socket object
      connectedUsers[newUserId] = socket; // Store in the connectedUsers map
      console.log(`User ${newUserId} connected to the socket.`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      const userId = socket.userId;

      if (userId) {
        console.log(`User ${userId} disconnected.`);

        // Remove user from connectedUsers map
        delete connectedUsers[userId];

        // Set user as offline and update last seen when they disconnect
        User.findByIdAndUpdate(
          userId,
          {
            $set: {
              online: false,         // Set the user as offline
              lastSeen: new Date()   // Update the lastSeen field with the current timestamp
            }
          },
          { new: true } // Return the updated document
        )
        .then(user => {
          if (user) {
            console.log(`User ${userId} is now offline and last seen updated.`);
          }
        })
        .catch(err => {
          console.error(`Error updating user status for ${userId}:`, err);
        });
      } else {
        console.log('No userId found for the disconnected socket.');
      }
    });

  } else {
    console.error('No userId found in handshake query');
  }

  // Handle live stream, video, and chat event listeners here
  require('./app/sockets/chat')(io, socket, connectedUsers);  // Pass connectedUsers
  require('./app/sockets/video')(io, socket, connectedUsers); // Pass connectedUsers
});


// Serve the Cordova application for the browser platform
app.use(express.static(path.join(__dirname, 'platforms/browser/www')));

// Handle all other routes and return the index file
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'platforms/browser/www', 'index.html'));
});

(async () => {
    const subscription = new Subscription();
    subscription.offers = [];
    subscription.dayPrice = 0.5;
    subscription.weekPrice = 6;
    subscription.monthPrice = 20;
    subscription.yearPrice = 120;
    subscription.currency = 'usd';
    await subscription.save();
    console.log('done');
})();

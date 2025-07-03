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
const peerStore = require('./app/utils/peerStorage'); // ✅ Use shared storage
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
const jwt = require('jsonwebtoken');

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
// Bootstrap helpers with a live Socket.IO reference



const helpers = require('./app/helpers');

const Message = require('./app/models/Message');
const Post = require('./app/models/Post');
const { deleteUser } = require('./app/controllers/UserController');

require('dotenv').config();
const app = express();
app.use(cors());
app.use(allowAccess);


const removeExpiredMedia = async () => {
  const now = new Date();
  try {
      const result = await Comment.updateMany(
          { 'media.expiryDate': { $lte: now } },  // Find media that has expired
          { $unset: { 'media.url': '' } }  // Remove the media URL but keep the comment/post intact
      );
      console.log('Expired media removed:', result);
  } catch (err) {
      console.error('Error removing expired media:', err);
  }
};



const http = require('http').Server(app);
const io = require('socket.io')(http, {
  cors: {
    origin: ["http://localhost:4200", "http://localhost:4202"], 
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], //  ← add PATCH
    allowedHeaders: ['Content-Type', 'Authorization'],

    credentials: true
  }
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    console.log("❌ No token provided in socket connection");
    return next(new Error("Authentication error: missing token"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded._id;
    console.log(`✅ WebSocket authenticated for userId: ${socket.userId}`);
    next();
  } catch (err) {
    console.error("❌ Invalid token", err);
    return next(new Error("Authentication error: invalid token"));
  }
});


app.set('io', io);
module.exports.io = io;   
const { sendNotification, notifyPeerNeeded } = helpers;   // now both are defined

const { ExpressPeerServer } = require('peer');
const peerServer = ExpressPeerServer(http, {
    debug: true
});


peerServer.on("connection", (client) => {
  console.log(`✅ New peer connected with ID: ${client.getId()}`);

  const userId = client.getId().split('-')[0]; // Extract userId from PeerJS ID
// Push peerId + refresh ttl (expiresAt = now + 5 min)
  peerStore.set(userId, client.getId());
  console.log(`📝 Stored peerId: ${client.getId()} for userId: ${userId}`);
});




schedule.scheduleJob('0 * * * *', removeExpiredMedia);  // Runs every hour

const port = process.env.PORT || 3300;
http.listen(port, () => console.log("server connected at 127.0.0.1:" + port + " ..."));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/products', express.static(path.join(__dirname, 'products')));

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
.then(async () => {
  console.log("Database connected successfully...");
})
.catch((err) => console.log("Could not connect to database...", err));



const agenda = new Agenda({ db: { address: process.env.MONGODB_URL } });
require('./app/jobs')(agenda);

const routePrefix = '/api/v1';

app.use(checkVersion);
app.use(setUrlInfo);
app.use(updateUserInfo);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/message', messageRoutes);
app.use('/api/v1', reportRoutes);

app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());


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
app.use('/upload_chat', express.static(path.join(__dirname, 'public/upload_chat')));



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
const { connectedUsers, socketUserMap } = require('./app/utils/socketManager');

app.set('connectedUsers', connectedUsers);

io.sockets.on('connection', async (socket) => {
  console.log('⚡ New WebSocket connection:', socket.id);
  
  // ✅ Immediately get userId from the JWT middleware (already injected earlier)
  const userId = socket.userId;
  console.log(`✅ User ${userId} connected with socket ID ${socket.id}`);

  // Store the connection in memory
  if (!connectedUsers[userId]) {
    connectedUsers[userId] = new Set();
  }
  connectedUsers[userId].add(socket.id);
  socketUserMap[socket.id] = userId;

  // Update DB to mark user online
  try {
    await User.findByIdAndUpdate(userId, { 
      online: true, 
      lastSeen: new Date() 
    });
    io.emit('user-status-changed', { userId, online: true });
  } catch (err) {
    console.error('Error updating online status:', err);
  }

  // 📡 Presence tracking after PeerJS.init()
  socket.on('online', async ({ userId: u, peerId }) => {
    if (!u || !peerId) return;
    if (!connectedUsers[u]) {
      connectedUsers[u] = new Set();
    }
    connectedUsers[u].add(socket.id);
    socketUserMap[socket.id] = u;

    await peerStore.set(u, peerId);
    io.to(socket.id).emit('online-confirmed', { peerId });

    console.log(`✅ Presence updated for ${u}, peerId: ${peerId}`);
  });

  // 📢 Debug all events
  socket.onAny((event, ...args) => {
    console.log(`📢 WebSocket Event Received: ${event}`, args);
  });

  // Heartbeat mechanism
  let isAlive = true;
  const heartbeatInterval = setInterval(() => {
    if (!isAlive) {
      console.log(`💔 No heartbeat from ${socket.id}, terminating`);
      socket.disconnect(true);
      return;
    }
    isAlive = false;
    socket.emit('ping');
  }, 30000); // every 30 seconds

  socket.on('pong', () => {
    isAlive = true;
  });

  // 🔌 Disconnect handler
  socket.on('disconnect', async () => {
    clearInterval(heartbeatInterval);

    console.log(`❌ Disconnected: User ${userId}, Socket ID: ${socket.id}`);

    if (connectedUsers[userId]) {
      connectedUsers[userId].delete(socket.id);
      if (connectedUsers[userId].size === 0) {
        delete connectedUsers[userId];
        try {
          await User.findByIdAndUpdate(userId, { 
            online: false, 
            lastSeen: new Date() 
          });
          console.log(`💤 User ${userId} marked as offline.`);
          io.emit('user-status-changed', { userId, online: false });
        } catch (err) {
          console.error('❌ Error during user disconnect cleanup:', err);
        }
      }
    }

    delete socketUserMap[socket.id];
  });

  // 🔗 Attach chat & video handlers
  require('./app/sockets/chat')(io, socket, connectedUsers);
  require('./app/sockets/video')(io, socket, connectedUsers);
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
    subscription.dayPrice = 120;
    subscription.weekPrice = 6;
    subscription.monthPrice = 20;
    subscription.yearPrice = 120;
    subscription.currency = 'usd';
    await subscription.save();
    console.log('done');
})();

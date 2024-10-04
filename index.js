const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const Agenda = require('agenda');
const path = require('path');
const session = require('express-session');
const passport = require('./routes/passport'); // Adjust the path to your passport configuration
const schedule = require('node-schedule');
const Comment = require('./app/models/Comment');
const fs = require('fs');
const http = require('http'); // Fallback to HTTP if not using HTTPS
const https = require('https');

// SSL setup only for local development
let server;
const app = express();

// Import routes
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

// Middlewares
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

require('dotenv').config();
app.use(cors());
app.use(allowAccess);

// Clean up expired media
const removeExpiredMedia = () => {
  const now = new Date();
  Comment.updateMany(
    { 'media.expiryDate': { $lte: now } }, // Find expired media
    { $unset: { 'media.url': '' } }, // Remove the media URL but keep the comment/post intact
    (err, result) => {
      if (err) {
        console.error('Error removing expired media:', err);
      } else {
        console.log('Expired media removed:', result);
      }
    }
  );
};

// Redirect HTTP requests to HTTPS in local environment
if (process.env.NODE_ENV !== 'production') {
  const privateKey = fs.readFileSync('path/to/your/local/key.pem', 'utf8');
  const certificate = fs.readFileSync('path/to/your/local/cert.pem', 'utf8');
  const credentials = { key: privateKey, cert: certificate };

  server = https.createServer(credentials, app);

  const httpApp = express();
  httpApp.use((req, res) => {
    res.redirect(`https://${req.hostname}${req.url}`);
  });
  const httpServer = http.createServer(httpApp);
  httpServer.listen(80, () => {
    console.log('HTTP Server running on port 80 and redirecting to HTTPS...');
  });
} else {
  server = http.createServer(app);  // For production use HTTP
}

// Schedule job to remove expired media every hour
schedule.scheduleJob('0 * * * *', removeExpiredMedia);

// Set up Socket.io for HTTPS or HTTP
const io = require('socket.io')(server, {
  cors: {
    origin: '*', // Adjust CORS settings as needed
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Set up PeerJS server with HTTPS or HTTP
const { ExpressPeerServer } = require('peer');
const peerServer = ExpressPeerServer(server, {
  debug: true,
});
app.use('/peerjs', peerServer);

const port = process.env.PORT || 3300;
server.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});

// Express app configurations
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(morgan('tiny'));
app.use(cookieParser());

mongoose
  .connect(process.env.MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    tlsInsecure: true,
    useFindAndModify: false, // Add this line to address the deprecation warning
  })
  .then(() => console.log('Database connected successfully...'))
  .catch((err) => console.log('Could not connect to database...', err));

const agenda = new Agenda({ db: { address: process.env.MONGODB_URL } });
require('./app/jobs')(agenda);

const routePrefix = '/api/v1';

app.use(checkVersion);
app.use(setUrlInfo);
app.use(updateUserInfo);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/message', messageRoutes);

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your_secret_key',
    resave: false,
    saveUninitialized: true,
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.get(`${routePrefix}/`, (req, res) => res.send('API is working'));
app.use(`${routePrefix}/auth`, authRoutes);
app.use(`${routePrefix}/user`, userRoutes);
app.use(`${routePrefix}/request`, requestRoutes);
app.use(`${routePrefix}/product`, productRoutes);
app.use(`${routePrefix}/job`, jobRoutes);
app.use(`${routePrefix}/service`, serviceRoutes);
app.use(`${routePrefix}/message`, messageRoutes);
app.use(`${routePrefix}/channel`, channelRoutes);
app.use(`${routePrefix}/channel`, postRoutes);
app.use(`${routePrefix}/channel`, commentRoutes);
app.use(`${routePrefix}/subscription`, subscriptionRoutes);
app.use(`${routePrefix}/report`, reportRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use('/public/images/avatars', express.static(path.join(__dirname, 'public/images/avatars')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

function listRoutes(app) {
  app._router.stack.forEach((middleware) => {
    if (middleware.name === 'router') {
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          console.log(`Method: ${handler.route.stack[0].method.toUpperCase()}, Path: ${routePrefix}${handler.route.path}`);
        }
      });
    }
  });
}

listRoutes(app);
app.use(invalidTokenError);
app.use(notFoundError);

io.sockets.on('connection', (socket) => {
  console.log('Connection established');
  const userId = socket.handshake.query.userId;

  User.findById(userId).then((user) => {
    if (user) {
      user.setOnline();
    }
  });

  socket.on('disconnect', () => {
    User.findById(userId).then((user) => {
      if (user) {
        user.setOffline();
        user.lastSeen = new Date(); // Update lastSeen with the current timestamp
        user.save();
      }
    });
  });

  require('./app/sockets/chat')(io, socket);
  require('./app/sockets/video')(io, socket);
});

// Serve the Cordova application for the browser platform
app.use(express.static(path.join(__dirname, 'platforms/browser/www')));

app.get('/', (req, res) => {
  res.status(200).send('Backend is running and ready to accept requests.');
});

// Handle all other routes and return the index file
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'platforms/browser/www', 'index.html'));
});

// Initialize subscription example
(async () => {
  const subscription = new Subscription();
  subscription.offers = [];
  subscription.dayPrice = 0.5;
  subscription.weekPrice = 6;
  subscription.monthPrice = 20;
  subscription.yearPrice = 120;
  subscription.currency = 'usd';
  await subscription.save();
  console.log('Subscription initialized.');
})();

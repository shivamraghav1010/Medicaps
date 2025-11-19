// require('dotenv').config();
// const express = require('express');
// const cloudinary = require('cloudinary').v2;
// const multer = require('multer');
// const nodemailer = require('nodemailer');
// const bcrypt = require('bcrypt');
// const path = require('path');

// const app = express();
// const upload = multer({ dest: 'uploads/' });

// app.use(express.json());
// app.use(express.static('public'));

// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS
//   }
// });

// // In-memory DB
// const users = {};        // email → {name, email, passwordHash}
// const otpStore = {};     // email → {otp, expires}
// let videos = [];

// // === SIGNUP: Send OTP to email ===
// app.post('/api/signup/send-otp', async (req, res) => {
//   const { email, name } = req.body;
//   if (users[email]) return res.status(400).json({ error: "Email already registered" });

//   const otp = Math.floor(100000 + Math.random() * 900000).toString();
//   otpStore[email] = { otp, expires: Date.now() + 10 * 60 * 1000, name };

//   await transporter.sendMail({
//     from: `"PlayReel India" <${process.env.EMAIL_USER}>`,
//     to: email,
//     subject: "Your Signup OTP - PlayReel India",
//     text: `Hello ${name},\n\nYour OTP is: ${otp}\nValid for 10 minutes.\n\nWelcome to PlayReel!`
//   });

//   res.json({ success: true, message: "OTP sent to your email" });
// });

// // === SIGNUP: Verify OTP & Create Account ===
// app.post('/api/signup/verify-otp', async (req, res) => {
//   const { email, otp, password } = req.body;
//   const record = otpStore[email];

//   if (!record || record.otp !== otp || Date.now() > record.expires) {
//     return res.status(400).json({ error: "Invalid or expired OTP" });
//   }

//   const passwordHash = await bcrypt.hash(password, 10);
//   users[email] = {
//     name: record.name,
//     email,
//     passwordHash
//   };

//   delete otpStore[email];
//   res.json({ success: true, user: { name: record.name, email } });
// });

// // === LOGIN: Email + Password ===
// app.post('/api/login', async (req, res) => {
//   const { email, password } = req.body;
//   const user = users[email];

//   if (!user) return res.status(400).json({ error: "Email not found" });

//   const match = await bcrypt.compare(password, user.passwordHash);
//   if (!match) return res.status(400).json({ error: "Wrong password" });

//   res.json({ success: true, user: { name: user.name, email } });
// });

// // === Upload Video (after login) ===
// app.post('/api/upload', upload.single('video'), async (req, res) => {
//   const { name, email } = req.body;
//   try {
//     const result = await cloudinary.uploader.upload(req.file.path, {
//       resource_type: "video",
//       folder: "playreel"
//     });

//     const video = {
//       id: Date.now(),
//       url: result.secure_url,
//       name, email,
//       timestamp: new Date().toISOString(),
//       likes: 0
//     };
//     videos.unshift(video);
//     res.json(video);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// app.get('/api/videos', (req, res) => res.json(videos));

// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//   console.log(`PlayReel India running at http://localhost:${PORT}`);
// });



// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const nodemailer = require('nodemailer');
// const bcrypt = require('bcrypt');
const bcrypt = require("bcryptjs");

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' }); // temp storage

// ---------- ENV CHECK ----------
const {
  MONGODB_URI,
  JWT_SECRET,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  EMAIL_USER,
  EMAIL_PASS,
  PORT
} = process.env;

if (!MONGODB_URI || !JWT_SECRET || !CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET || !EMAIL_USER || !EMAIL_PASS) {
  console.warn('One or more required environment variables are missing. Check .env (MONGODB_URI, JWT_SECRET, CLOUDINARY_*, EMAIL_*).');
}

// ---------- MONGOOSE MODELS ----------
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected.'))
  .catch(err => { console.error('MongoDB connection error:', err); process.exit(1); });

const { Schema } = mongoose;

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  sport: { type: String, default: null },
  age: { type: String, default: null },
  followers: { type: [String], default: [] }, // store follower emails
  following: { type: [String], default: [] },
}, { timestamps: true });

const VideoSchema = new Schema({
  url: { type: String, required: true },
  name: String,
  email: String,
  sport: { type: String, default: 'General' },
  age: { type: String, default: null },
  timestamp: { type: Date, default: Date.now },
  likes: { type: Number, default: 0 },
  comments: [{ email: String, comment: String, timestamp: Date }]
});

const User = mongoose.model('User', UserSchema);
const Video = mongoose.model('Video', VideoSchema);

// ---------- Cloudinary ----------
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET
});

// ---------- Nodemailer ----------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

// ---------- In-memory OTP store ----------
const otpStore = {}; // email -> { otp, expires, name }
setInterval(() => {
  const now = Date.now();
  for (const e of Object.keys(otpStore)) {
    if (otpStore[e].expires < now) delete otpStore[e];
  }
}, 60 * 1000);

// ---------- Express middleware ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ---------- Helpers ----------
function isValidEmail(email) {
  return typeof email === 'string' && /\S+@\S+\.\S+/.test(email);
}
function generateJWT(user) {
  // small payload: email + name
  return jwt.sign({ email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ success: false, message: 'No token' });
  const token = header.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Malformed token' });

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(401).json({ success: false, message: 'Invalid token' });
    req.user = payload; // {email, name}
    next();
  });
}

// ---------- ROUTES ----------

// 1) Send signup OTP (email)
app.post('/api/signup/send-otp', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!isValidEmail(email) || !name || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Invalid name or email' });
    }
    const exists = await User.findOne({ email }).lean();
    if (exists) return res.status(400).json({ success: false, message: 'Email already registered' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, expires: Date.now() + 10 * 60 * 1000, name: name.trim() };

    try {
      await transporter.sendMail({
        from: `"PlayReel India" <${EMAIL_USER}>`,
        to: email,
        subject: 'Your Signup OTP - PlayReel India',
        text: `Hello ${name},\n\nYour OTP is: ${otp}\nValid for 10 minutes.\n\nWelcome to PlayReel!`
      });
    } catch (mailErr) {
      console.error('Mail error:', mailErr.message);
      return res.status(500).json({ success: false, message: 'Failed to send OTP email (server).' });
    }

    return res.json({ success: true, message: 'OTP sent to your email' });
  } catch (err) {
    console.error('send-otp error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 2) Verify OTP & create account (email + password)
app.post('/api/signup/verify-otp', async (req, res) => {
  try {
    const { email, otp, password } = req.body;
    if (!isValidEmail(email) || !otp || !password) return res.status(400).json({ success: false, message: 'Missing fields' });

    const rec = otpStore[email];
    if (!rec || rec.otp !== otp || Date.now() > rec.expires) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      name: rec.name,
      email,
      passwordHash
    });
    await user.save();
    delete otpStore[email];

    // return JWT + public user
    const token = generateJWT(user);
    return res.json({ success: true, token, user: { name: user.name, email: user.email, sport: user.sport, age: user.age } });
  } catch (err) {
    console.error('verify-otp error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 3) Login (email + password) -> returns JWT
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!isValidEmail(email) || !password) return res.status(400).json({ success: false, message: 'Missing credentials' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ success: false, message: 'Email not found' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(400).json({ success: false, message: 'Wrong password' });

    const token = generateJWT(user);
    return res.json({ success: true, token, user: { name: user.name, email: user.email, sport: user.sport, age: user.age } });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 4) Upload (protected) -- expects form-data: video file + name + sport + age
app.post('/api/upload', authMiddleware, upload.single('video'), async (req, res) => {
  try {
    const { name, sport, age } = req.body;
    const email = req.user.email; // from JWT

    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'video',
      folder: 'playreel'
    });

    // remove temp file
    fs.unlink(req.file.path, () => {});

    const video = new Video({
      url: result.secure_url,
      name: name || req.user.name || 'Unknown',
      email,
      sport: sport || 'General',
      age: age || null,
      timestamp: new Date(),
      likes: 0,
      comments: []
    });

    await video.save();

    return res.json({ success: true, video });
  } catch (err) {
    console.error('upload error', err);
    if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
    return res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

// 5) Get videos (public) with optional ?q= and ?sport=
app.get('/api/videos', async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    const sport = (req.query.sport || '').toLowerCase();

    let query = {};
    if (q) {
      // search name, sport, email
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { sport: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ];
    }
    if (sport) {
      query.sport = new RegExp(`^${sport}$`, 'i'); // exact match case-insensitive
    }

    const list = await Video.find(query).sort({ timestamp: -1 }).lean();
    return res.json(list);
  } catch (err) {
    console.error('videos error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 6) Like video (protected)
app.post('/api/like/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const v = await Video.findById(id);
    if (!v) return res.status(404).json({ success: false, message: 'Video not found' });
    v.likes = (v.likes || 0) + 1;
    await v.save();
    return res.json({ success: true, likes: v.likes });
  } catch (err) {
    console.error('like error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 7) Comment on video (protected)
app.post('/api/comment/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { comment } = req.body;
    const email = req.user.email;
    if (!comment || comment.trim().length === 0) return res.status(400).json({ success: false, message: 'Empty comment' });

    const v = await Video.findById(id);
    if (!v) return res.status(404).json({ success: false, message: 'Video not found' });

    v.comments.push({ email, comment, timestamp: new Date() });
    await v.save();

    return res.json({ success: true, comments: v.comments });
  } catch (err) {
    console.error('comment error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 8) Get profile (by email) - public, returns user info + videos
app.get('/api/profile/:email', async (req, res) => {
  try {
    const email = req.params.email;
    if (!isValidEmail(email)) return res.status(400).json({ success: false, message: 'Invalid email' });

    const user = await User.findOne({ email }).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const userVideos = await Video.find({ email }).sort({ timestamp: -1 }).lean();
    return res.json({ success: true, user: { name: user.name, email: user.email, sport: user.sport, age: user.age, followers: user.followers?.length || 0 }, videos: userVideos });
  } catch (err) {
    console.error('profile error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 9) Update profile (protected)
app.post('/api/update-profile', authMiddleware, async (req, res) => {
  try {
    const { name, age, sport } = req.body;
    const email = req.user.email;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (name) user.name = name;
    if (age) user.age = age;
    if (sport) user.sport = sport;
    await user.save();

    return res.json({ success: true, user: { name: user.name, email: user.email, sport: user.sport, age: user.age } });
  } catch (err) {
    console.error('update-profile error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 10) Follow a user (protected)
app.post('/api/follow/:email', authMiddleware, async (req, res) => {
  try {
    const targetEmail = req.params.email;
    const followerEmail = req.user.email;

    if (!isValidEmail(targetEmail) || !isValidEmail(followerEmail)) return res.status(400).json({ success: false, message: 'Invalid email' });
    if (targetEmail === followerEmail) return res.status(400).json({ success: false, message: 'Cannot follow yourself' });

    const target = await User.findOne({ email: targetEmail });
    const follower = await User.findOne({ email: followerEmail });
    if (!target || !follower) return res.status(404).json({ success: false, message: 'User not found' });

    if (!target.followers.includes(followerEmail)) target.followers.push(followerEmail);
    if (!follower.following.includes(targetEmail)) follower.following.push(targetEmail);

    await target.save();
    await follower.save();

    return res.json({ success: true, message: 'Followed' });
  } catch (err) {
    console.error('follow error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => res.json({ success: true }));

// Start server
const port = PORT || 5000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));

// Get logged-in user profile
app.get("/api/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


// ====== PROFILE PHOTO UPLOAD ROUTE (ADD THIS IN server.js) ======
// ──────────────────────────────────────────────────────────────
// PROFILE PHOTO UPLOAD (this is the route you were missing)
// ──────────────────────────────────────────────────────────────
app.post('/api/upload-profile-photo', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No photo uploaded' });
    }

    // Upload to Cloudinary (auto-cropped square)
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'playreel/profile-photos',
      width: 500,
      height: 500,
      crop: 'fill',
      gravity: 'face',        // focuses on face if present
      quality: 'auto:best'
    });

    // Delete the temporary file
    fs.unlink(req.file.path, () => {});

    // Save photo URL to the user in MongoDB
    const user = await User.findOne({ email: req.user.email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.photo = result.secure_url;
    await user.save();

    // Send back the new photo URL
    res.json({ success: true, photoUrl: result.secure_url });

  } catch (err) {
    console.error('Profile photo upload error:', err);
    if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

// app.post('/api/like', authMiddleware, async (req, res) => {
//   try {
//     const { postId } = req.body;
//     const post = await Video.findById(postId);
//     if (!post) return res.json({ success: false });

//     const userEmail = req.user.email;
//     const index = post.likes.indexOf(userEmail);
//     if (index === -1) {
//       post.likes.push(userEmail);
//     } else {
//       post.likes.splice(index, 1);
//     }
//     await post.save();
//     res.json({ success: true });
//   } catch (err) {
//     res.json({ success: false });
//   }
// });

// Upload Reel Video
// CHANGE THIS (old route)
app.post('/api/upload', authMiddleware, upload.single('video'), async (req, res) => {
  // ... your existing code ...
});

// TO THIS (new route - just change the path)
app.post('/api/upload-video', authMiddleware, upload.single('video'), async (req, res) => {
  try {
    const { name, sport, age, caption } = req.body;  // Add caption if needed
    const email = req.user.email; // from JWT
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'video',
      folder: 'playreel'
    });
    
    // remove temp file
    fs.unlink(req.file.path, () => {});
    
    const video = new Video({
      url: result.secure_url,
      name: name || req.user.name || 'Unknown',
      email,
      sport: sport || 'General',
      age: age || null,
      caption: caption || '',  // Add this if you want captions
      timestamp: new Date(),
      likes: 0,
      comments: []
    });
    await video.save();
    return res.json({ success: true, video });
  } catch (err) {
    console.error('upload error', err);
    if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
    return res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

// NEW ROUTE: Get all videos with user info
app.get('/api/all-videos', async (req, res) => {
  try {
    const videos = await Video.find().sort({ timestamp: -1 });
    const populated = await Promise.all(videos.map(async v => {
      const user = await User.findOne({ email: v.userEmail || v.email });
      const likedByMe = req.headers.authorization 
        ? v.likes.includes(JSON.parse(atob(req.headers.authorization.split('.')[1])).email)
        : false;

      return {
        ...v.toObject(),
        user: {
          name: user?.name || 'User',
          email: user?.email,
          photo: user?.photo,
          sport: user?.sport,
          age: user?.age
        },
        likedByMe   // ← THIS IS THE KEY
      };
    }));
    res.json({ success: true, videos: populated });
  } catch (err) {
    console.error(err);
    res.json({ success: false, videos: [] });
  }
});

// This route MUST exist — most common name
app.get('/api/videos', async (req, res) => {
  try {
    const videos = await Video.find().sort({ timestamp: -1 });
    res.json(videos);
  } catch (err) {
    res.status(500).json([]);
  }
});

// Like route (already exists usually)
// LIKE ROUTE (you probably already have this – keep it)
app.post('/api/like', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.body;
    const post = await Video.findById(postId);
    if (!post) return res.status(404).json({ success: false });

    const userEmail = req.user.email;
    const index = post.likes.indexOf(userEmail);

    if (index === -1) {
      post.likes.push(userEmail);           // Like
    } else {
      post.likes.splice(index, 1);          // Unlike
    }
    await post.save();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// COMMENT ROUTE – FIXED & SAFE
app.post('/api/comment', authMiddleware, async (req, res) => {
  try {
    const { postId, text } = req.body;

    if (!postId || !text?.trim()) {
      return res.status(400).json({ success: false, message: "Missing postId or text" });
    }

    const post = await Video.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    post.comments.push({
      name: req.user.name || "User",
      email: req.user.email,
      text: text.trim(),
      timestamp: new Date()
    });

    await post.save();
    res.json({ success: true });
  } catch (err) {
    console.error("Comment error:", err);
    res.status(500).json({ success: false });
  }
});

// GET COMMENTS – FIXED & SAFE
app.get('/api/comments/:postId', async (req, res) => {
  try {
    const post = await Video.findById(req.params.postId);
    if (!post) return res.json({ comments: [] });

    res.json({ 
      success:  true,
      comments: post.comments || [] 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, comments: [] });
  }
});
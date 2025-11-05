// ================================
// ✅ server.js (Final Auto-Switching Version: Local + Docker Compatible)
// ================================

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// --- 1️⃣ Load environment file dynamically ---
const dockerEnvPath = path.resolve(__dirname, '.env.docker');
const localEnvPath = path.resolve(__dirname, '.env');
const isDocker = fs.existsSync('/.dockerenv');

const envPath = isDocker && fs.existsSync(dockerEnvPath)
  ? dockerEnvPath
  : localEnvPath;

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`🧾 Loaded environment from ${envPath}`);
} else {
  console.warn(`⚠️ No .env file found, using defaults`);
}

// --- 2️⃣ App Config ---
const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGO_URI || 'mongodb://localhost:27017/RecommendationSystem';
const PYTHON_API_URL =
  process.env.PYTHON_API_URL || 'http://127.0.0.1:8000/api/recommend';
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN ||
  'http://localhost:5173,http://frontend:80';
const COLD_START_THRESHOLD =
  parseInt(process.env.COLD_START_THRESHOLD) || 5;

// --- 3️⃣ Middleware ---
app.use(
  cors({
    origin: FRONTEND_ORIGIN.split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
);
app.use(express.json());

// --- 4️⃣ Safe Model Registration Helper ---
const safeSchema = (name, schema, collection) => {
  if (mongoose.models[name]) return mongoose.models[name];
  return mongoose.model(name, schema, collection);
};

// --- 5️⃣ MongoDB Schemas ---
const UserSchema = new mongoose.Schema(
  {
    userId: { type: String, unique: true, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
  },
  { collection: 'users' }
);
const User = safeSchema('User', UserSchema, 'users');

const MobileSchema = new mongoose.Schema(
  {
    Brand: { type: String, index: true },
    Model: String,
    url: { type: String, unique: true, index: true },
    'Picture URL': String,
    'Battery capacity (mAh)': Number,
    'Operating system': String,
    '5 Stars': Number,
    '4 Stars': Number,
    '3 Stars': Number,
    '2 Stars': Number,
    '1 Stars': Number,
  },
  { strict: false, collection: 'mobiles' }
);
const Mobile = safeSchema('Mobile', MobileSchema, 'mobiles');

const InteractionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    itemId: { type: String, required: true },
    interactionType: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { collection: 'interactions' }
);
const Interaction = safeSchema('Interaction', InteractionSchema, 'interactions');

// --- 6️⃣ Auth Middleware ---
const authMiddleware = (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (!req.headers.authorization)
    return res.status(401).json({ message: 'No token provided.' });
  try {
    const token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userData = { userId: decoded.userId, username: decoded.username };
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token.' });
  }
};

// --- 7️⃣ Helper Functions ---
const hydrateItems = async (itemIds, page = 1, limit = 10, brandFilter = null) => {
  let query = { url: { $in: itemIds } };
  if (brandFilter) query.Brand = brandFilter;

  const items = await Mobile.find(query).lean();
  const map = new Map(items.map(i => [i.url, i]));
  const ordered = itemIds.filter(id => map.has(id)).map(id => map.get(id));
  const start = (page - 1) * limit;
  return ordered.slice(start, start + limit);
};

const getPopularityFallback = async (limit = 10, brandFilter = null, page = 1) => {
  const matchStage = brandFilter ? { Brand: brandFilter } : {};
  const skip = (page - 1) * limit;

  return Mobile.aggregate([
    { $match: matchStage },
    {
      $addFields: {
        popularityScore: {
          $add: [
            { $multiply: [{ $ifNull: ['$5 Stars', 0] }, 5] },
            { $multiply: [{ $ifNull: ['$4 Stars', 0] }, 4] },
            { $multiply: [{ $ifNull: ['$3 Stars', 0] }, 3] },
            { $multiply: [{ $ifNull: ['$2 Stars', 0] }, 2] },
            { $multiply: [{ $ifNull: ['$1 Stars', 0] }, 1] },
          ],
        },
      },
    },
    { $sort: { popularityScore: -1 } },
    { $skip: skip },
    { $limit: limit },
  ]);
};

const getPythonRecos = async (endpoint, param) => {
  try {
    const response = await axios.get(
      `${PYTHON_API_URL}${endpoint}/${encodeURIComponent(param)}?k=50`,
      { timeout: 10000 }
    );
    if (response.data && response.data.recommendations)
      return response.data.recommendations;
    return null;
  } catch (e) {
    console.error(`❌ Python API error (${endpoint}):`, e.message);
    return null;
  }
};

// --- 8️⃣ AUTH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: 'Missing credentials.' });
  try {
    if (await User.findOne({ username }))
      return res.status(400).json({ message: 'Username exists.' });
    const hashed = await bcrypt.hash(password, 12);
    const newUser = new User({
      userId: `user_${Date.now()}`,
      username,
      password: hashed,
    });
    await newUser.save();
    const token = jwt.sign({ userId: newUser.userId, username }, JWT_SECRET, {
      expiresIn: '1h',
    });
    res
      .status(201)
      .json({ message: 'Registered!', token, user: { id: newUser.userId, username } });
  } catch {
    res.status(500).json({ message: 'Registration error.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ message: 'Invalid credentials.' });
    const token = jwt.sign({ userId: user.userId, username }, JWT_SECRET, {
      expiresIn: '1h',
    });
    res.status(200).json({
      message: 'Logged in!',
      token,
      user: { id: user.userId, username },
    });
  } catch {
    res.status(500).json({ message: 'Login error.' });
  }
});

// --- 9️⃣ INTERACTIONS ---
app.post('/api/interactions', authMiddleware, async (req, res) => {
  const userId = req.userData?.userId;
  const { itemId, interactionType } = req.body;
  if (!itemId) return res.status(400).json({ message: 'itemId required.' });
  try {
    new Interaction({ userId, itemId, interactionType })
      .save()
      .then(() => console.log(`✅ Interaction saved for ${userId}`))
      .catch(err => console.error('❌ Failed to save interaction:', err));
    res.status(202).json({ message: 'Interaction logged.' });
  } catch {
    res.status(500).json({ message: 'Server error logging interaction.' });
  }
});

// --- 🔟 SEARCH ---
app.get('/api/mobiles/search', authMiddleware, async (req, res) => {
  const q = req.query.q || '';
  if (q.length < 2) return res.json([]);
  try {
    const mobiles = await Mobile.find(
      {
        $or: [
          { Brand: { $regex: q, $options: 'i' } },
          { Model: { $regex: q, $options: 'i' } },
        ],
      },
      'Brand Model url'
    ).limit(10);
    res.json(mobiles);
  } catch {
    res.status(500).json({ message: 'Error searching mobiles.' });
  }
});

// --- 11️⃣ SIMILAR (CBF) ---
app.get('/api/mobiles/similar', authMiddleware, async (req, res) => {
  const { itemId } = req.query;
  if (!itemId) return res.status(400).json({ message: 'itemId required.' });
  try {
    const cbfRecs = await getPythonRecos('/cbf', itemId);
    if (!cbfRecs) return res.status(200).json([]);
    const recommendations = await hydrateItems(cbfRecs);
    res.json(recommendations);
  } catch {
    res.status(500).json({ message: 'Error getting similar items.' });
  }
});

// --- 12️⃣ MAIN RECOMMENDATION LOGIC ---
app.get('/api/recommendations', authMiddleware, async (req, res) => {
  const userId = req.userData?.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 10, 25);
  const brandFilter = req.query.brand || null;

  try {
    const interactions = await Interaction.find({ userId }).sort({ timestamp: -1 });
    const count = interactions.length;

    // 🧊 Cold Start
    if (count < COLD_START_THRESHOLD) {
      let recs = [];
      let type = 'cold_start_popular';

      if (count > 0) {
        const cbf = await getPythonRecos('/cbf', interactions[0].itemId);
        if (cbf) {
          recs = await hydrateItems([...new Set(cbf)], page, limit, brandFilter);
          type = 'cold_start_cbf';
        }
      }

      if (recs.length === 0)
        recs = await getPopularityFallback(limit, brandFilter, page);
      return res.status(200).json({ type, recommendations: recs });
    }

    // 🔥 Warm Start (Hybrid)
    const cf = await getPythonRecos('/cf', userId);
    if (!cf) {
      return res.status(200).json({
        type: 'error_fallback_popular',
        recommendations: await getPopularityFallback(limit, brandFilter, page),
      });
    }

    const recent = [...new Set(interactions.slice(0, 3).map(i => i.itemId))];
    const cbfSet = new Set();
    const cbfRes = await Promise.all(recent.map(id => getPythonRecos('/cbf', id)));
    cbfRes.forEach(list => list && list.forEach(id => cbfSet.add(id)));

    const blended = cf
      .map(id => ({
        itemId: id,
        score: cbfSet.has(id) ? 1 : 0,
      }))
      .sort((a, b) => b.score - a.score)
      .map(r => r.itemId);

    const uniqueBlended = [...new Set(blended)];
    const recommendations = await hydrateItems(uniqueBlended, page, limit, brandFilter);

    if (recommendations.length === 0)
      return res.status(200).json({
        type: 'hybrid_fallback_popular',
        recommendations: await getPopularityFallback(limit, brandFilter, page),
      });

    res.status(200).json({ type: 'hybrid_warm_start', recommendations });
  } catch (err) {
    console.error('🔥 Critical /recommendations error:', err);
    res.status(500).json({
      type: 'error_fallback_popular',
      recommendations: await getPopularityFallback(limit, brandFilter, page),
    });
  }
});

// --- 13️⃣ Connect DB + Start Server ---
mongoose
  .connect(MONGO_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Node.js backend running at http://localhost:${PORT}`);
      console.log(`🗄️  Connected to MongoDB at: ${MONGO_URI}`);
      console.log(`🤖 Python API: ${PYTHON_API_URL}`);
    });
  })
  .catch(err => console.error('❌ MongoDB connection failed:', err));

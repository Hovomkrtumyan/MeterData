const express = require('express');
// v2.0 - THD support, auth, admin panel
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000", "http://192.168.10.12:3000"],
    credentials: true
}));

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/power_monitor';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// MongoDB Schema
const powerDataSchema = new mongoose.Schema({
    Device_ID: String,
    powerData: {
        voltages: {
            Ua: Number, Ub: Number, Uc: Number,
            Uab: Number, Ubc: Number, Uca: Number
        },
        currents: { Ia: Number, Ib: Number, Ic: Number, In: Number },
        activePower: { Pa: Number, Pb: Number, Pc: Number, Total: Number },
        reactivePower: { Qa: Number, Qb: Number, Qc: Number, Total: Number },
        apparentPower: { Sa: Number, Sb: Number, Sc: Number, Total: Number },
        powerFactor: { PFa: Number, PFb: Number, PFc: Number, Total: Number },
        frequency: Number,
        energy: {
            ActiveImport: Number, ActiveExport: Number,
            ReactiveImport: Number, ReactiveExport: Number,
            Apparent: Number
        },
        thd: {
            Ua: Number, Ub: Number, Uc: Number,
            Ia: Number, Ib: Number, Ic: Number
        }
    },
    timestamp: { type: Date, default: Date.now }
});

const PowerData = mongoose.model('PowerData', powerDataSchema);

// User Schema for Authentication
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session && req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
};

// Admin middleware
const requireAdmin = (req, res, next) => {
    if (req.session && req.session.userId && req.session.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Admin access required' });
    }
};

// Enhanced logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Routes
app.post('/api/data', async (req, res) => {
    try {
        console.log('Data received from:', req.body.Device_ID);
        
        const newData = new PowerData(req.body);
        await newData.save();
        
        res.status(201).json({ 
            message: 'Data stored successfully',
            id: newData._id 
        });
    } catch (error) {
        console.error('Error storing data:', error);
        res.status(500).json({ error: 'Failed to store data' });
    }
});

app.get('/api/data/latest', requireAuth, async (req, res) => {
    try {
        const deviceId = req.query.device || "ESP32_01";
        
        const latestData = await PowerData.findOne({ Device_ID: deviceId }).sort({ timestamp: -1 });
        
        if (!latestData) {
            return res.json({
                Device_ID: deviceId,
                powerData: {
                    voltages: { Ua: 0, Ub: 0, Uc: 0, Uab: 0, Ubc: 0, Uca: 0 },
                    currents: { Ia: 0, Ib: 0, Ic: 0, In: 0 },
                    activePower: { Pa: 0, Pb: 0, Pc: 0, Total: 0 },
                    reactivePower: { Qa: 0, Qb: 0, Qc: 0, Total: 0 },
                    apparentPower: { Sa: 0, Sb: 0, Sc: 0, Total: 0 },
                    powerFactor: { PFa: 0, PFb: 0, PFc: 0, Total: 0 },
                    frequency: 0,
                    energy: { ActiveImport: 0, ActiveExport: 0, ReactiveImport: 0, ReactiveExport: 0, Apparent: 0 },
                    thd: { Ua: 0, Ub: 0, Uc: 0, Ia: 0, Ib: 0, Ic: 0 }
                }
            });
        }
        
        res.json(latestData);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

app.get('/api/data/history', requireAuth, async (req, res) => {
    try {
        const deviceId = req.query.device || "ESP32_01";
        const limit = parseInt(req.query.limit) || 100;
        
        const history = await PowerData.find({ Device_ID: deviceId })
            .sort({ timestamp: -1 })
            .limit(limit);
        
        res.json(history);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Check auth status endpoint
app.get('/api/auth/status', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ authenticated: true, username: req.session.username, role: req.session.role });
    } else {
        res.json({ authenticated: false });
    }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        req.session.userId = user._id;
        req.session.username = user.username;
        req.session.role = user.role;
        
        res.json({ message: 'Login successful', username: user.username, role: user.role });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Register endpoint (for admin use)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ message: 'Logout successful' });
    });
});

// NEW: Get all users (admin only)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = await User.find({}, { password: 0 }); // Exclude passwords
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get data for a specific user (admin only)
app.get('/api/admin/user-data/:userId', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get user's devices data
        const devices = await PowerData.distinct('Device_ID', { User_ID: userId });
        const userData = {
            user: { id: user._id, username: user.username, role: user.role, createdAt: user.createdAt },
            devices: devices
        };
        
        res.json(userData);
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});

// Register admin user (only existing admins can create admins)
app.post('/api/auth/register-admin', requireAdmin, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword, role: 'admin' });
        await newUser.save();
        
        res.status(201).json({ message: 'Admin user registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Get all available devices
app.get('/api/devices', requireAuth, async (req, res) => {
    try {
        const devices = await PowerData.distinct('Device_ID');
        res.json(devices);
    } catch (error) {
        console.error('Error fetching devices:', error);
        res.status(500).json({ error: 'Failed to fetch devices' });
    }
});

// One-time setup endpoint - creates admin user
app.get('/setup-admin', async (req, res) => {
    try {
        const existingAdmin = await User.findOne({ username: 'Tigran@gamil.com' });
        if (existingAdmin) {
            return res.send('Admin user already exists. You can login now.');
        }
        
        const hashedPassword = await bcrypt.hash('Tik123', 10);
        const adminUser = new User({
            username: 'Tigran@gamil.com',
            password: hashedPassword,
            role: 'admin'
        });
        await adminUser.save();
        res.send('Admin user created successfully! You can now login with:<br>Username: Tigran@gamil.com<br>Password: Tik123');
    } catch (error) {
        console.error('Setup error:', error);
        res.status(500).send('Error creating admin user');
    }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// MongoDB connection events
mongoose.connection.on('connected', () => {
    console.log('Connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Web interface: http://localhost:${PORT}`);
    console.log(`Also accessible via: http://192.168.10.12:${PORT}`);
    console.log('Using MongoDB for storage');
});
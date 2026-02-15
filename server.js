const express = require('express');
// v3.0 - City/Branch/Client/Device hierarchy
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
// Load API key from env var, or from secret file on Render
let DEVICE_API_KEY = process.env.DEVICE_API_KEY;
if (!DEVICE_API_KEY) {
    try {
        const fs = require('fs');
        const envPaths = ['/etc/secrets/.env', path.join(__dirname, '.env')];
        for (const p of envPaths) {
            if (fs.existsSync(p)) {
                const content = fs.readFileSync(p, 'utf8');
                const match = content.match(/DEVICE_API_KEY=(.+)/);
                if (match) { DEVICE_API_KEY = match[1].trim(); break; }
            }
        }
    } catch (e) { /* ignore */ }
}
if (!DEVICE_API_KEY) DEVICE_API_KEY = 'change-this-secret-key';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/power_monitor';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// ===== SCHEMAS =====

const powerDataSchema = new mongoose.Schema({
    Device_ID: String,
    powerData: {
        voltages: { Ua: Number, Ub: Number, Uc: Number, Uab: Number, Ubc: Number, Uca: Number },
        currents: { Ia: Number, Ib: Number, Ic: Number, In: Number },
        activePower: { Pa: Number, Pb: Number, Pc: Number, Total: Number },
        reactivePower: { Qa: Number, Qb: Number, Qc: Number, Total: Number },
        apparentPower: { Sa: Number, Sb: Number, Sc: Number, Total: Number },
        powerFactor: { PFa: Number, PFb: Number, PFc: Number, Total: Number },
        frequency: Number,
        energy: { ActiveImport: Number, ActiveExport: Number, ReactiveImport: Number, ReactiveExport: Number, Apparent: Number },
        thd: { Ua: Number, Ub: Number, Uc: Number, Ia: Number, Ib: Number, Ic: Number }
    },
    timestamp: { type: Date, default: Date.now }
});
const PowerData = mongoose.model('PowerData', powerDataSchema);

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user', enum: ['user', 'admin'] },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const citySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now }
});
const City = mongoose.model('City', citySchema);

const branchSchema = new mongoose.Schema({
    name: { type: String, required: true },
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
    createdAt: { type: Date, default: Date.now }
});
const Branch = mongoose.model('Branch', branchSchema);

const clientSchema = new mongoose.Schema({
    name: { type: String, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});
const Client = mongoose.model('Client', clientSchema);

const deviceSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, unique: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String },
    createdAt: { type: Date, default: Date.now }
});
const Device = mongoose.model('Device', deviceSchema);

// ===== AUTH MIDDLEWARE =====

const requireAuth = (req, res, next) => {
    if (req.session && req.session.userId) return next();
    res.status(401).json({ error: 'Authentication required' });
};

const requireAdmin = (req, res, next) => {
    if (req.session && req.session.userId && req.session.role === 'admin') return next();
    res.status(403).json({ error: 'Admin access required' });
};

// Logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// ===== DEVICE DATA ROUTES =====

app.post('/api/data', async (req, res) => {
    try {
        // Validate API key
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;
        if (!apiKey || apiKey !== DEVICE_API_KEY) {
            return res.status(401).json({ error: 'Invalid or missing API key' });
        }
        console.log('Data received from:', req.body.Device_ID);
        const newData = new PowerData(req.body);
        await newData.save();
        res.status(201).json({ message: 'Data stored successfully', id: newData._id });
    } catch (error) {
        console.error('Error storing data:', error);
        res.status(500).json({ error: 'Failed to store data' });
    }
});

const emptyPowerData = {
    voltages: { Ua: 0, Ub: 0, Uc: 0, Uab: 0, Ubc: 0, Uca: 0 },
    currents: { Ia: 0, Ib: 0, Ic: 0, In: 0 },
    activePower: { Pa: 0, Pb: 0, Pc: 0, Total: 0 },
    reactivePower: { Qa: 0, Qb: 0, Qc: 0, Total: 0 },
    apparentPower: { Sa: 0, Sb: 0, Sc: 0, Total: 0 },
    powerFactor: { PFa: 0, PFb: 0, PFc: 0, Total: 0 },
    frequency: 0,
    energy: { ActiveImport: 0, ActiveExport: 0, ReactiveImport: 0, ReactiveExport: 0, Apparent: 0 },
    thd: { Ua: 0, Ub: 0, Uc: 0, Ia: 0, Ib: 0, Ic: 0 }
};

app.get('/api/data/latest', requireAuth, async (req, res) => {
    try {
        const deviceId = req.query.device || "EKF_01";
        const latestData = await PowerData.findOne({ Device_ID: deviceId }).sort({ timestamp: -1 });
        if (!latestData) return res.json({ Device_ID: deviceId, powerData: emptyPowerData });
        res.json(latestData);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

app.get('/api/data/history', requireAuth, async (req, res) => {
    try {
        const deviceId = req.query.device || "EKF_01";
        const limit = parseInt(req.query.limit) || 100;
        const history = await PowerData.find({ Device_ID: deviceId }).sort({ timestamp: -1 }).limit(limit);
        res.json(history);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// ===== AUTH ROUTES =====

app.get('/api/auth/status', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ authenticated: true, username: req.session.username, role: req.session.role, userId: req.session.userId });
    } else {
        res.json({ authenticated: false });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
        const user = await User.findOne({ username });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
        req.session.userId = user._id;
        req.session.username = user.username;
        req.session.role = user.role;
        res.json({ message: 'Login successful', username: user.username, role: user.role });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        res.json({ message: 'Logout successful' });
    });
});

// ===== USER: Get my devices =====

app.get('/api/my/devices', requireAuth, async (req, res) => {
    try {
        const clients = await Client.find({ userId: req.session.userId });
        const clientIds = clients.map(c => c._id);
        const devices = await Device.find({ clientId: { $in: clientIds } }).populate({ path: 'clientId', populate: { path: 'branchId', populate: { path: 'cityId' } } });
        res.json(devices);
    } catch (error) {
        console.error('Error fetching user devices:', error);
        res.status(500).json({ error: 'Failed to fetch devices' });
    }
});

// ===== ADMIN: CITY CRUD =====

app.get('/api/admin/cities', requireAdmin, async (req, res) => {
    try { res.json(await City.find().sort({ name: 1 })); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/cities', requireAdmin, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'City name required' });
        const city = new City({ name });
        await city.save();
        res.status(201).json(city);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/cities/:id', requireAdmin, async (req, res) => {
    try {
        const city = await City.findByIdAndUpdate(req.params.id, { name: req.body.name }, { new: true });
        if (!city) return res.status(404).json({ error: 'City not found' });
        res.json(city);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/cities/:id', requireAdmin, async (req, res) => {
    try {
        const branches = await Branch.countDocuments({ cityId: req.params.id });
        if (branches > 0) return res.status(400).json({ error: `Cannot delete: city has ${branches} branch(es). Remove them first.` });
        const city = await City.findByIdAndDelete(req.params.id);
        if (!city) return res.status(404).json({ error: 'City not found' });
        res.json({ message: 'City deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== ADMIN: BRANCH CRUD =====

app.get('/api/admin/branches', requireAdmin, async (req, res) => {
    try {
        const filter = req.query.cityId ? { cityId: req.query.cityId } : {};
        res.json(await Branch.find(filter).populate('cityId').sort({ name: 1 }));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/branches', requireAdmin, async (req, res) => {
    try {
        const { name, cityId } = req.body;
        if (!name || !cityId) return res.status(400).json({ error: 'Branch name and city required' });
        const branch = new Branch({ name, cityId });
        await branch.save();
        res.status(201).json(await branch.populate('cityId'));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/branches/:id', requireAdmin, async (req, res) => {
    try {
        const update = {};
        if (req.body.name) update.name = req.body.name;
        if (req.body.cityId) update.cityId = req.body.cityId;
        const branch = await Branch.findByIdAndUpdate(req.params.id, update, { new: true }).populate('cityId');
        if (!branch) return res.status(404).json({ error: 'Branch not found' });
        res.json(branch);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/branches/:id', requireAdmin, async (req, res) => {
    try {
        const clients = await Client.countDocuments({ branchId: req.params.id });
        if (clients > 0) return res.status(400).json({ error: `Cannot delete: branch has ${clients} client(s). Remove them first.` });
        const branch = await Branch.findByIdAndDelete(req.params.id);
        if (!branch) return res.status(404).json({ error: 'Branch not found' });
        res.json({ message: 'Branch deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== ADMIN: CLIENT CRUD =====

app.get('/api/admin/clients', requireAdmin, async (req, res) => {
    try {
        const filter = req.query.branchId ? { branchId: req.query.branchId } : {};
        res.json(await Client.find(filter).populate('userId', '-password').populate({ path: 'branchId', populate: 'cityId' }).sort({ name: 1 }));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/clients', requireAdmin, async (req, res) => {
    try {
        const { name, branchId, username, password } = req.body;
        if (!name || !branchId) return res.status(400).json({ error: 'Client name and branch required' });
        let userId = null;
        if (username && password) {
            if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
            const existing = await User.findOne({ username });
            if (existing) return res.status(400).json({ error: 'Username already exists' });
            const hashed = await bcrypt.hash(password, 10);
            const user = new User({ username, password: hashed, role: 'user' });
            await user.save();
            userId = user._id;
        }
        const client = new Client({ name, branchId, userId });
        await client.save();
        res.status(201).json(await client.populate([{ path: 'userId', select: '-password' }, { path: 'branchId', populate: 'cityId' }]));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/clients/:id', requireAdmin, async (req, res) => {
    try {
        const update = {};
        if (req.body.name) update.name = req.body.name;
        if (req.body.branchId) update.branchId = req.body.branchId;
        const client = await Client.findByIdAndUpdate(req.params.id, update, { new: true }).populate('userId', '-password');
        if (!client) return res.status(404).json({ error: 'Client not found' });
        res.json(client);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/clients/:id', requireAdmin, async (req, res) => {
    try {
        const devices = await Device.countDocuments({ clientId: req.params.id });
        if (devices > 0) return res.status(400).json({ error: `Cannot delete: client has ${devices} device(s). Remove them first.` });
        const client = await Client.findByIdAndDelete(req.params.id);
        if (!client) return res.status(404).json({ error: 'Client not found' });
        res.json({ message: 'Client deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== ADMIN: DEVICE CRUD =====

app.get('/api/admin/devices', requireAdmin, async (req, res) => {
    try {
        const filter = req.query.clientId ? { clientId: req.query.clientId } : {};
        const devices = await Device.find(filter).populate({ path: 'clientId', populate: { path: 'branchId', populate: 'cityId' } }).sort({ deviceId: 1 });
        // Attach last seen info
        const result = [];
        for (const dev of devices) {
            const lastRecord = await PowerData.findOne({ Device_ID: dev.deviceId }).sort({ timestamp: -1 }).select('timestamp');
            result.push({ ...dev.toObject(), lastSeen: lastRecord ? lastRecord.timestamp : null });
        }
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/devices', requireAdmin, async (req, res) => {
    try {
        const { deviceId, clientId, name } = req.body;
        if (!deviceId || !clientId) return res.status(400).json({ error: 'Device ID and client required' });
        // Check device exists in PowerData
        const exists = await PowerData.findOne({ Device_ID: deviceId });
        if (!exists) return res.status(400).json({ error: `Device "${deviceId}" not found in system. Device must send data first before it can be added.` });
        const existing = await Device.findOne({ deviceId });
        if (existing) return res.status(400).json({ error: 'Device already registered' });
        const device = new Device({ deviceId, clientId, name: name || deviceId });
        await device.save();
        res.status(201).json(device);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/devices/:id', requireAdmin, async (req, res) => {
    try {
        const update = {};
        if (req.body.name) update.name = req.body.name;
        if (req.body.clientId) update.clientId = req.body.clientId;
        const device = await Device.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        res.json(device);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/devices/:id', requireAdmin, async (req, res) => {
    try {
        const device = await Device.findByIdAndDelete(req.params.id);
        if (!device) return res.status(404).json({ error: 'Device not found' });
        res.json({ message: 'Device unregistered (data preserved)' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== ADMIN: FULL TREE =====

app.get('/api/admin/tree', requireAdmin, async (req, res) => {
    try {
        const cities = await City.find().sort({ name: 1 });
        const branches = await Branch.find().sort({ name: 1 });
        const clients = await Client.find().populate('userId', '-password').sort({ name: 1 });
        const devices = await Device.find().sort({ deviceId: 1 });
        const tree = cities.map(city => ({
            ...city.toObject(),
            branches: branches.filter(b => b.cityId.toString() === city._id.toString()).map(branch => ({
                ...branch.toObject(),
                clients: clients.filter(c => c.branchId.toString() === branch._id.toString()).map(client => ({
                    ...client.toObject(),
                    devices: devices.filter(d => d.clientId.toString() === client._id.toString())
                }))
            }))
        }));
        res.json(tree);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== ADMIN: Get available (unregistered) device IDs =====

app.get('/api/admin/unregistered-devices', requireAdmin, async (req, res) => {
    try {
        const allDeviceIds = await PowerData.distinct('Device_ID');
        const registeredDevices = await Device.find().select('deviceId');
        const registeredIds = registeredDevices.map(d => d.deviceId);
        const unregistered = allDeviceIds.filter(id => !registeredIds.includes(id));
        res.json(unregistered);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== ADMIN: Users =====

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try { res.json(await User.find({}, { password: 0 })); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== SETUP =====

app.get('/setup-admin', async (req, res) => {
    try {
        const existingAdmin = await User.findOne({ username: 'Tigran@gamil.com' });
        if (existingAdmin) return res.send('Admin user already exists.');
        const hashed = await bcrypt.hash('Tik123', 10);
        await new User({ username: 'Tigran@gamil.com', password: hashed, role: 'admin' }).save();
        res.send('Admin created! Login: Tigran@gamil.com / Tik123');
    } catch (e) { res.status(500).send('Error: ' + e.message); }
});

// Serve frontend
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

mongoose.connection.on('connected', () => console.log('Connected to MongoDB'));
mongoose.connection.on('error', (err) => console.error('MongoDB error:', err));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Web interface: http://localhost:${PORT}`);
    console.log(`Also accessible via: http://192.168.10.12:${PORT}`);
});

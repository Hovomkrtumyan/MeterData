const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ["http://localhost:3000", "http://192.168.10.12:3000"],
    credentials: true
}));

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
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
        }
    },
    timestamp: { type: Date, default: Date.now }
});

const PowerData = mongoose.model('PowerData', powerDataSchema);

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

app.get('/api/data/latest', async (req, res) => {
    try {
        const latestData = await PowerData.findOne().sort({ timestamp: -1 });
        
        if (!latestData) {
            return res.json({
                Device_ID: "ESP32_01",
                powerData: {
                    voltages: { Ua: 0, Ub: 0, Uc: 0, Uab: 0, Ubc: 0, Uca: 0 },
                    currents: { Ia: 0, Ib: 0, Ic: 0, In: 0 },
                    activePower: { Pa: 0, Pb: 0, Pc: 0, Total: 0 },
                    reactivePower: { Qa: 0, Qb: 0, Qc: 0, Total: 0 },
                    apparentPower: { Sa: 0, Sb: 0, Sc: 0, Total: 0 },
                    powerFactor: { PFa: 0, PFb: 0, PFc: 0, Total: 0 },
                    frequency: 0,
                    energy: { ActiveImport: 0, ActiveExport: 0, ReactiveImport: 0, ReactiveExport: 0, Apparent: 0 }
                }
            });
        }
        
        res.json(latestData);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

app.get('/api/data/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const history = await PowerData.find()
            .sort({ timestamp: -1 })
            .limit(limit);
        
        res.json(history);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

app.get('/api/devices', async (req, res) => {
    try {
        const devices = await PowerData.distinct('Device_ID');
        res.json(devices);
    } catch (error) {
        console.error('Error fetching devices:', error);
        res.status(500).json({ error: 'Failed to fetch devices' });
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
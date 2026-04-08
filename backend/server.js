// ============================================================
// QUICKPRINT - BACKEND SERVER
// Fixes:
// 1. fileUrl ab sirf filename store hoga
// 2. /api/files/:filename — token verify karke file dega
// 3. /uploads static serve HATA DIYA — direct access band
// ============================================================

require('dotenv').config();

const jwt      = require('jsonwebtoken');
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const cron     = require('node-cron');

const app       = express();
const PORT      = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

// ============================================================
// ADMIN WHITELIST — Apna number yahan daalo
// ============================================================
const APPROVED_ADMINS = [
    '9876543210',
];

const otpStore = {};

app.use(cors());
app.use(express.json());

// NOTE: app.use('/uploads', express.static(...)) HATA DIYA
// Direct file access band — sirf /api/files/ se milegi
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename:    (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
});
const upload = multer({ storage });

const Order = require('./models/orders');

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected!'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// ============================================================
// MIDDLEWARES
// ============================================================
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Login required.' });
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ success: false, error: 'Session expire ho gayi.' });
        req.user = decoded;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin access only.' });
    next();
};

// ============================================================
// AUTH ROUTES
// ============================================================

app.post('/api/auth/send-otp', (req, res) => {
    const { phone, role } = req.body;
    if (!phone || !/^[0-9]{10}$/.test(phone))
        return res.status(400).json({ success: false, error: 'Valid 10-digit number daalo.' });
    if (role === 'admin' && !APPROVED_ADMINS.includes(phone))
        return res.status(403).json({ success: false, error: 'Yeh number admin ke liye registered nahi hai.' });

    // const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otp = "1234";
    otpStore[phone] = { otp, role, expiresAt: Date.now() + 5 * 60 * 1000 };
    console.log(`📱 OTP for ${phone}: ${otp}`);
    res.json({ success: true, otp }); // Production mein otp hata dena
});

app.post('/api/auth/verify-otp', (req, res) => {
    // 1. 'name' ki jagah 'fullName' receive karein
    const { phone, otp, fullName, role } = req.body; 
    
    const stored = otpStore[phone];
    if (!stored) return res.status(400).json({ success: false, error: 'OTP expired ya nahi bheja.' });
    if (Date.now() > stored.expiresAt) { delete otpStore[phone]; return res.status(400).json({ success: false, error: 'OTP expire ho gaya.' }); }
    if (stored.otp !== otp) return res.status(400).json({ success: false, error: 'OTP galat hai.' });
    delete otpStore[phone];

    const expiresIn = role === 'admin' ? '30d' : '12h';
    
    // 2. Token me bhi 'fullName' save karein
    const token = jwt.sign({ fullName, phone, role }, process.env.JWT_SECRET, { expiresIn });
    
    // 3. User object me sirf 'fullName' bhejein
    res.json({ success: true, token, user: { fullName, phone, role } }); 
});

// ============================================================
// ORDER ROUTES
// ============================================================

app.post('/api/orders', authenticateToken, upload.array('actualFiles'), async (req, res) => {
    try {
        const { totalAmount, filesConfig } = JSON.parse(req.body.orderData);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const count       = await Order.countDocuments({ createdAt: { $gte: todayStart } });
        const orderSerial = String(count + 1).padStart(4, '0');

        const newOrder = new Order({
            studentName:  req.user.fullName,
            studentPhone: req.user.phone,
            orderSerial,
            files: filesConfig.map((f, i) => ({
                fileName:         f.fileName,
                totalPages:       f.totalPages,
                copies:           f.copies,
                colorType:        f.colorType,
                printSide:        f.printSide,
                priceForThisFile: f.priceForThisFile,
                fileUrl:          req.files[i].filename  // Sirf filename — URL nahi
            })),
            totalAmount,
            orderStatus: 'In Queue'
        });
        await newOrder.save();
        res.status(201).json({ success: true, orderSerial });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/orders/queue', authenticateToken, isAdmin, async (req, res) => {
    try {
        const orders = await Order.find({ orderStatus: 'In Queue' }).sort({ createdAt: 1 });
        res.json({ success: true, count: orders.length, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/orders/queue-count', authenticateToken, async (req, res) => {
    try {
        const orders = await Order.find({ orderStatus: 'In Queue' }).select('files').sort({ createdAt: 1 });
        res.json({ success: true, count: orders.length, waitData: orders.map(o => ({ files: o.files })) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// FILE SERVING — Yeh sabse important fix hai
// Browser <a href="..."> se file open nahi kar sakta
// Kyunki Authorization header nahi bhejna hota
// Admin.js mein hum fetch() se Blob banate hain — neeche explain hai
// ============================================================
app.get('/api/files/:filename', authenticateToken, isAdmin, (req, res) => {
    const filename = path.basename(req.params.filename); // Path traversal se bachao
    const filePath = path.join(__dirname, 'uploads', filename);

    if (!fs.existsSync(filePath))
        return res.status(404).json({ success: false, error: 'File not found.' });

    const ext = path.extname(filename).toLowerCase();
    if (ext === '.pdf')                    res.setHeader('Content-Type', 'application/pdf');
    else if (['.jpg','.jpeg'].includes(ext)) res.setHeader('Content-Type', 'image/jpeg');
    else if (ext === '.png')               res.setHeader('Content-Type', 'image/png');

    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.sendFile(filePath);
});

app.put('/api/orders/:id/complete', authenticateToken, isAdmin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

        for (const file of order.files) {
            const fp = path.join(__dirname, 'uploads', path.basename(file.fileUrl));
            if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch (e) {}
        }

        order.orderStatus = 'Ready';
        order.readyAt     = Date.now();
        await order.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/orders/clear', authenticateToken, isAdmin, async (req, res) => {
    try {
        await Order.deleteMany({});
        const dir = path.join(__dirname, 'uploads');
        fs.readdirSync(dir).forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

cron.schedule('0 0 * * *', async () => {
    try {
        await Order.deleteMany({});
        const dir = path.join(__dirname, 'uploads');
        fs.readdirSync(dir).forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
        console.log('✅ Midnight cleanup done!');
    } catch (err) { console.error('❌ Cleanup failed:', err); }
});

app.listen(PORT, () => console.log(`🚀 Server: http://localhost:${PORT}`));
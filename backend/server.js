// ============================================================
// QUICKPRINT - BACKEND SERVER
// Model: Koi user database nahi
// Har baar naam + number maango → OTP verify → JWT do
// JWT localStorage mein — cache clear = logout, khatam
// Admin ke liye number whitelist
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

const app = express();
const PORT      = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;


// ============================================================
// ⭐ ADMIN WHITELIST — Sirf yahi numbers admin ban sakte hain
// Apna number yahan daalo (10 digits, +91 ke bina)
// ============================================================
const APPROVED_ADMINS = [
    '9876543210',   // ← Apna admin number yahan daalo
    // '8765432109' // ← Dusra admin add karna ho toh yahan
];


// ============================================================
// OTP STORE — Memory mein temporarily (5 minute valid)
// { '9876543210': { otp: '1234', name: 'Rahul', role: 'user', expiresAt: timestamp } }
// ============================================================
const otpStore = {};


// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json());


// ============================================================
// UPLOADS FOLDER — Files yahan save hongi
// Direct access nahi — sirf authenticated route se milegi
// ============================================================
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');


// ============================================================
// MULTER SETUP
// ============================================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename:    (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
});
const upload = multer({ storage });


// ============================================================
// DATABASE MODEL — Sirf Orders (User model ki zaroorat nahi)
// ============================================================
const Order = require('./models/orders');

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected!'))
    .catch(err => console.error('❌ MongoDB Error:', err));


// ============================================================
// SECURITY MIDDLEWARES
// ============================================================

// Token verify karo
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Login required.' });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ success: false, error: 'Session expire ho gayi. Dobara login karo.' });
        req.user = decoded;
        next();
    });
};

// Admin check
const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin access only.' });
    next();
};


// ============================================================
// AUTH ROUTES
// ============================================================


// ------------------------------------------------------------
// 1. OTP BHEJO
// POST /api/auth/send-otp
// Body: { phone, role }
// Admin ke liye: whitelist check
// ------------------------------------------------------------
app.post('/api/auth/send-otp', (req, res) => {
    const { phone, role } = req.body;

    // Validation
    if (!phone || !/^[0-9]{10}$/.test(phone)) {
        return res.status(400).json({ success: false, error: 'Valid 10-digit number daalo.' });
    }

    // Admin whitelist check
    if (role === 'admin' && !APPROVED_ADMINS.includes(phone)) {
        return res.status(403).json({
            success: false,
            error:   'Yeh number admin ke liye registered nahi hai.'
        });
    }

    // 6-digit OTP generate karo
    // const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otp = "1234";

    // Store karo — 5 minute valid
    otpStore[phone] = {
        otp,
        role,
        expiresAt: Date.now() + 5 * 60 * 1000
    };

    // TODO: Yahan Fast2SMS/Twilio API lagao real SMS ke liye
    console.log(`📱 OTP for ${phone}: ${otp}`);

    res.json({
        success: true,
        message: 'OTP sent!',
        otp      // ⚠️ PRODUCTION MEIN YEH LINE HATA DENA
    });
});


// ------------------------------------------------------------
// 2. OTP VERIFY KARO + JWT DO
// POST /api/auth/verify-otp
// Body: { phone, otp, name, role }
// OTP sahi → JWT token do → frontend localStorage mein save karega
// Koi database mein user save nahi hoga
// ------------------------------------------------------------
app.post('/api/auth/verify-otp', (req, res) => {
    const { phone, otp, name, role } = req.body;

    const stored = otpStore[phone];

    // OTP exist karta hai?
    if (!stored) {
        return res.status(400).json({ success: false, error: 'OTP expired ya nahi bheja. Dobara send karo.' });
    }

    // Expire ho gaya?
    if (Date.now() > stored.expiresAt) {
        delete otpStore[phone];
        return res.status(400).json({ success: false, error: 'OTP expire ho gaya. Dobara send karo.' });
    }

    // OTP match nahi?
    if (stored.otp !== otp) {
        return res.status(400).json({ success: false, error: 'OTP galat hai.' });
    }

    // OTP sahi — ek baar use karo aur delete karo
    delete otpStore[phone];

    // JWT token banao
    // Isme naam, phone, role save hoga — koi DB nahi
    // Admin: 30 din valid (baar baar login nahi), Student: 12 ghante
    const expiresIn = role === 'admin' ? '30d' : '12h';

    const token = jwt.sign(
        { name, phone, role },
        process.env.JWT_SECRET,
        { expiresIn }
    );

    // User object banao — ye localStorage mein save hoga
    const user = { name, phone, role, fullName: name };

    res.json({ success: true, token, user });
});


// ============================================================
// ORDER ROUTES
// ============================================================


// ------------------------------------------------------------
// 3. NAYA ORDER — Student files upload karta hai
// POST /api/orders
// Token zaroori
// ------------------------------------------------------------
app.post('/api/orders', authenticateToken, upload.array('actualFiles'), async (req, res) => {
    try {
        const orderDetails                           = JSON.parse(req.body.orderData);
        const { totalAmount, filesConfig }           = orderDetails;

        // Aaj ke orders count karo — serial number ke liye
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const count       = await Order.countDocuments({ createdAt: { $gte: todayStart } });
        const orderSerial = String(count + 1).padStart(4, '0');

        const finalFilesArray = filesConfig.map((fileData, index) => ({
            fileName:         fileData.fileName,
            totalPages:       fileData.totalPages,
            copies:           fileData.copies,
            colorType:        fileData.colorType,
            printSide:        fileData.printSide,
            priceForThisFile: fileData.priceForThisFile,
            fileUrl:          req.files[index].filename  // Sirf filename — URL nahi
        }));

        const newOrder = new Order({
            // User ka naam + phone JWT se nikalo — DB mein user nahi
            studentName:  req.user.name,
            studentPhone: req.user.phone,
            orderSerial,
            files:        finalFilesArray,
            totalAmount,
            orderStatus:  'In Queue'
        });

        await newOrder.save();
        res.status(201).json({ success: true, orderSerial });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// ------------------------------------------------------------
// 4. QUEUE — Admin ko saare orders dikhao
// GET /api/orders/queue
// Token + Admin role zaroori
// ------------------------------------------------------------
app.get('/api/orders/queue', authenticateToken, isAdmin, async (req, res) => {
    try {
        const orders = await Order.find({ orderStatus: 'In Queue' }).sort({ createdAt: 1 });
        res.json({ success: true, count: orders.length, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ------------------------------------------------------------
// 5. QUEUE COUNT — Student ke liye sirf count + wait time
// GET /api/orders/queue-count
// Token zaroori — lekin student bhi dekh sakta hai (sirf numbers)
// ------------------------------------------------------------
app.get('/api/orders/queue-count', authenticateToken, async (req, res) => {
    try {
        const orders = await Order.find({ orderStatus: 'In Queue' })
                                  .select('files createdAt')
                                  .sort({ createdAt: 1 });

        res.json({
            success:  true,
            count:    orders.length,
            waitData: orders.map(o => ({ files: o.files }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ------------------------------------------------------------
// 6. FILE DOWNLOAD — Sirf admin dekh sakta hai
// GET /api/files/:filename
// ------------------------------------------------------------
app.get('/api/files/:filename', authenticateToken, isAdmin, (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'File not found' });
    res.sendFile(filePath);
});


// ------------------------------------------------------------
// 7. ORDER COMPLETE — Admin print kar chuka
// PUT /api/orders/:id/complete
// Token + Admin zaroori
// Jaise hi complete — woh order ka file bhi delete ho jaata hai
// ------------------------------------------------------------
app.put('/api/orders/:id/complete', authenticateToken, isAdmin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

        // Order ki files delete karo (disk se)
        for (const file of order.files) {
            const filePath = path.join(__dirname, 'uploads', file.fileUrl);
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch (e) { console.error('File delete error:', e); }
            }
        }

        // Order status update karo
        order.orderStatus = 'Ready';
        order.readyAt     = Date.now();
        await order.save();

        res.json({ success: true, message: 'Order complete. Files deleted.' });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ------------------------------------------------------------
// 8. CLEAR ALL — Admin din ke end pe sab saaf karta hai
// DELETE /api/orders/clear
// Token + Admin zaroori
// ------------------------------------------------------------
app.delete('/api/orders/clear', authenticateToken, isAdmin, async (req, res) => {
    try {
        await Order.deleteMany({});

        // Uploads folder bhi saaf karo
        const dir   = path.join(__dirname, 'uploads');
        const files = fs.readdirSync(dir);
        for (const file of files) {
            try { fs.unlinkSync(path.join(dir, file)); } catch (e) {}
        }

        res.json({ success: true, message: 'Sab saaf!' });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ============================================================
// AUTO CLEANUP — Roz raat 12 baje
// ============================================================
cron.schedule('0 0 * * *', async () => {
    console.log('🕛 Midnight auto-cleanup...');
    try {
        await Order.deleteMany({});
        const dir = path.join(__dirname, 'uploads');
        fs.readdirSync(dir).forEach(file => {
            try { fs.unlinkSync(path.join(dir, file)); } catch (e) {}
        });
        console.log('✅ Auto-cleanup done!');
    } catch (err) {
        console.error('❌ Auto-cleanup failed:', err);
    }
});


// ============================================================
// SERVER START
// ============================================================
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
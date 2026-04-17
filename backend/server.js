// ============================================================
// QUICKPRINT - MAIN SERVER FILE
// Kya karta hai:
//   - Student aur Admin ka login (OTP se)
//   - Print orders lena aur dikhana
//   - Files securely serve karna (sirf admin ko)
//   - Raat 12 baje sab data clean karna
// ============================================================

require('dotenv').config(); // .env file se secrets load karo (JWT_SECRET, MONGO_URI)

const jwt      = require('jsonwebtoken');
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const cron     = require('node-cron');
const rateLimit = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// ADMIN KE APPROVED NUMBERS — Sirf ye log admin login kar sakte hain
// Apna number yahan daalo
// ============================================================

const APPROVED_ADMINS = process.env.ADMIN_PHONES 
? process.env.ADMIN_PHONES.split(',').map(n => n.trim()) : [];

// console.log('✅ Approved admins:', APPROVED_ADMINS);

// OTP temporary yahan store hoga (memory mein, database mein nahi)
// Server restart = sab OTPs delete
const otpStore = {};

// Basic middlewares
app.use(cors({ origin: 'https://quick-print-hub.vercel.app' }));          // Kisi bhi domain se request allow karo
app.use(express.json());  // JSON body parse karo

// Uploads folder nahi hai toh banao
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// ============================================================
// FILE UPLOAD SETUP (Multer)
// Files './uploads/' folder mein save hongi
// Naam: timestamp + original filename (spaces hatake)
// ============================================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename:    (req, file, cb) => {
        const safeName = file.originalname.replace(/\s/g, '_');
        cb(null, Date.now() + '-' + safeName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 30 * 1024 * 1024 }, // 30MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /pdf|jpg|jpeg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) return cb(null, true);
        cb(new Error("Sirf PDF aur Images allow hain!"));
    }
});

// Database models
const Order = require('./models/orders');

// MongoDB se connect karo
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected!'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// ============================================================
// MIDDLEWARE: TOKEN CHECK
// Har protected route pe pehle ye chalega
// Authorization header mein "Bearer <token>" chahiye
// ============================================================
function authenticateToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1]; // "Bearer abc123" → "abc123"

    if (!token) {
        return res.status(401).json({ success: false, error: 'Login required.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ success: false, error: 'Session expire ho gayi.' });
        }
        req.user = decoded; // Token ka data (fullName, phone, role) request mein save karo
        next();
    });
}


// Rate limiter - ek IP se 5 OTP requests per 15 min
const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 5,  // Max 5 requests
    message: { 
        success: false, 
        error: 'Too many attempts. Try after 15 minutes.' 
    }
});


// ============================================================
// MIDDLEWARE: ADMIN CHECK
// authenticateToken ke baad ye chalega
// Sirf admin role wale aage ja sakte hain
// ============================================================
function isAdmin(req, res, next) {
    // Check 1: JWT mein role check
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin access only.' });
    }
    
    // ✅ Check 2: Phone number whitelist mein hai?
    if (!APPROVED_ADMINS.includes(req.user.phone)) {
        console.warn(`⚠️ Blocked unauthorized admin: ${req.user.phone}`);
        return res.status(403).json({ 
            success: false, 
            error: 'Phone number not authorized.' 
        });
    }
    
    next();
}

// ============================================================
// AUTH ROUTES — Login system
// ============================================================

// Route 1: OTP bhejo
// POST /api/auth/send-otp
// Body: { phone: "9876543210", role: "user" ya "admin" }
app.post('/api/auth/send-otp', otpLimiter, (req, res) => {
    const { phone, role } = req.body;

    // Phone valid hai?
    if (!phone || !/^[0-9]{10}$/.test(phone)) {
        return res.status(400).json({ success: false, error: 'Valid 10-digit number daalo.' });
    }

    // Admin ka number approved list mein hai?
    if (role === 'admin' && !APPROVED_ADMINS.includes(phone)) {
        return res.status(403).json({ success: false, error: 'Yeh number admin ke liye registered nahi hai.' });
    }

    // OTP banao aur store karo (5 minute ke liye valid)
    // TODO: Production mein real OTP use karo, "1234" hata dena
    const otp = "1234";
    otpStore[phone] = {
        otp,
        role,
        expiresAt: Date.now() + 5 * 60 * 1000 // 5 minute
    };

    console.log(`📱 OTP for ${phone}: ${otp}`);
    res.json({ success: true}); // Production mein 'otp' response se hata dena!
});

// Route 2: OTP verify karo aur token do
// POST /api/auth/verify-otp
// Body: { phone, otp, fullName, role }
app.post('/api/auth/verify-otp', (req, res) => {
    const { phone, otp, fullName } = req.body;  // ❌ role NAHI lenge client se

    const stored = otpStore[phone];

    // OTP exist karta hai?
    if (!stored) {
        return res.status(400).json({ success: false, error: 'OTP expired ya nahi bheja.' });
    }

    // OTP expire hua?
    if (Date.now() > stored.expiresAt) {
        delete otpStore[phone];
        return res.status(400).json({ success: false, error: 'OTP expire ho gaya.' });
    }

    // OTP sahi hai?
    if (stored.otp !== otp) {
        return res.status(400).json({ success: false, error: 'OTP galat hai.' });
    }

    // ✅✅✅ MAIN FIX: Client ka role IGNORE karo, server ka use karo ✅✅✅
    const actualRole = stored.role;  // Ye send-otp step pe save hua tha
    
    // ✅ Extra security: Agar admin hai toh double-check karo
    if (actualRole === 'admin' && !APPROVED_ADMINS.includes(phone)) {
        delete otpStore[phone];
        console.warn(`⚠️ Unauthorized admin attempt by ${phone}`);
        return res.status(403).json({ 
            success: false, 
            error: 'Unauthorized access attempt.' 
        });
    }

    // Sab theek — OTP delete karo
    delete otpStore[phone];

    // JWT token banao - actualRole use karo (NOT req.body.role)
    const expiresIn = '30d';
    const token = jwt.sign(
        { fullName, phone, role: actualRole },  // ✅ Server-validated role
        process.env.JWT_SECRET, 
        { expiresIn }
    );

    console.log(`✅ Login successful: ${phone} as ${actualRole}`);

    res.json({
        success: true,
        token,
        user: { fullName, phone, role: actualRole }  // ✅ Correct role
    });
});

// ============================================================
// ORDER ROUTES
// ============================================================

// Route 3: Naya order submit karo
// POST /api/orders
// Files + orderData bhejo (multipart/form-data)
app.post('/api/orders', authenticateToken, upload.array('actualFiles'), async (req, res) => {
    try {
        const { totalAmount, filesConfig } = JSON.parse(req.body.orderData);

        // Aaj ka order count karo (serial number ke liye)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayOrderCount = await Order.countDocuments({ createdAt: { $gte: todayStart } });

        // Serial number: 0001, 0002, 0003 ...
        const orderSerial = String(todayOrderCount + 1).padStart(4, '0');

        // Order database mein save karo
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
                fileUrl:          req.files[i].filename  // Sirf filename store (puri URL nahi)
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

// Route 4: Admin ke liye — queue ke saare orders
// GET /api/orders/queue
app.get('/api/orders/queue', authenticateToken, isAdmin, async (req, res) => {
    try {
        // Sirf "In Queue" wale orders, purane pehle
        const orders = await Order.find({ orderStatus: 'In Queue' }).sort({ createdAt: 1 });
        res.json({ success: true, count: orders.length, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Route 5: Student ke liye — kitne orders queue mein hain (wait time calculate karne ke liye)
// GET /api/orders/queue-count
app.get('/api/orders/queue-count', authenticateToken, async (req, res) => {
    try {
        // Sirf files ka data chahiye (wait time calculate ke liye)
        const orders = await Order.find({ orderStatus: 'In Queue' })
            .select('files')
            .sort({ createdAt: 1 });

        res.json({
            success: true,
            count: orders.length,
            waitData: orders.map(o => ({ files: o.files }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// FILE SERVING — Sirf admin ko milegi file
// Direct URL se access nahi hogi (static serve band hai)
// fetch() + Authorization header se milegi
// GET /api/files/:filename
// ============================================================
app.get('/api/files/:filename', authenticateToken, isAdmin, (req, res) => {
    // Path traversal attack se bachao (../../../etc/passwd jaisi cheez)
    const filename = path.basename(req.params.filename);
    const filePath = path.join(__dirname, 'uploads', filename);

    // File exist karti hai?
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'File not found.' });
    }

    // File type ke hisaab se Content-Type set karo
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.pdf')                       res.setHeader('Content-Type', 'application/pdf');
    else if (['.jpg', '.jpeg'].includes(ext)) res.setHeader('Content-Type', 'image/jpeg');
    else if (ext === '.png')                  res.setHeader('Content-Type', 'image/png');

    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.sendFile(filePath); // File bhejo
});

// Route 6: Order complete karo (admin)
// PUT /api/orders/:id/complete
app.put('/api/orders/:id/complete', authenticateToken, isAdmin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        // Order ki files delete karo (storage bachao)
        for (const file of order.files) {
            const filePath = path.join(__dirname, 'uploads', path.basename(file.fileUrl));
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch (e) {}
            }
        }

        // Status update karo
        order.orderStatus = 'Ready';
        order.readyAt     = Date.now();
        await order.save();

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Route 7: Saara history delete karo (admin)
// DELETE /api/orders/clear
app.delete('/api/orders/clear', authenticateToken, isAdmin, async (req, res) => {
    try {
        // Database se sab orders delete
        await Order.deleteMany({});

        // Uploads folder ki saari files delete
        const uploadsDir = path.join(__dirname, 'uploads');
        fs.readdirSync(uploadsDir).forEach(file => {
            try { fs.unlinkSync(path.join(uploadsDir, file)); } catch (e) {}
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// AUTO CLEANUP — Raat 12 baje automatically sab delete hoga
// Cron format: 'second minute hour day month weekday'
// '0 0 * * *' = har raat 12:00 AM
// ============================================================
cron.schedule('0 0 * * *', async () => {
    try {
        await Order.deleteMany({});

        const uploadsDir = path.join(__dirname, 'uploads');
        fs.readdirSync(uploadsDir).forEach(file => {
            try { fs.unlinkSync(path.join(uploadsDir, file)); } catch (e) {}
        });

        console.log('✅ Midnight cleanup done!');
    } catch (err) {
        console.error('❌ Cleanup failed:', err);
    }
});

// Server start karo
app.listen(PORT, () => console.log(`🚀 Server chal raha hai: http://localhost:${PORT}`));
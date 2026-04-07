// ============================================================
// QUICKPRINT - BACKEND SERVER (server.js)
// Changes:
// 1. OTP routes add kiye (send-otp, verify-otp, register)
// 2. APPROVED_ADMINS list — sirf yahi numbers admin ban sakte hain
// 3. isAdmin middleware — admin-only routes protect kiye
// 4. Queue route ab token required hai
// 5. Student ke liye alag /queue-count route — sirf count milta hai
// 6. Nuke/clear-users routes HATA DIYE (security risk the)
// ============================================================


// ------------------------------------------------------------
// STEP 0: .env FILE LOAD KARO
// ------------------------------------------------------------
require('dotenv').config();


// ------------------------------------------------------------
// STEP 1: PACKAGES IMPORT KARO
// ------------------------------------------------------------
const jwt      = require('jsonwebtoken');
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const cron     = require('node-cron');


// ------------------------------------------------------------
// STEP 2: APP SETUP
// ------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;


// ------------------------------------------------------------
// ⭐ APPROVED ADMINS LIST — Sirf yahi numbers admin ban sakte hain
// Apne admin ka number yahan daalo (+91 ke bina, sirf 10 digits)
// ------------------------------------------------------------
const APPROVED_ADMINS = [
    '9876543210',  // ← Apna admin number yahan daalo
    // '8765432109', // ← Dusra admin chahiye toh yahan add karo
];


// ------------------------------------------------------------
// STEP 3: MIDDLEWARE
// ------------------------------------------------------------
app.use(cors());
app.use(express.json());


// ------------------------------------------------------------
// STEP 4: UPLOADS FOLDER SETUP
// ------------------------------------------------------------
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// IMPORTANT: /uploads directly accessible nahi hoga ab
// Files sirf authenticated route se milegi
// (neeche /api/files/:filename route hai)


// ------------------------------------------------------------
// STEP 5: MULTER SETUP
// ------------------------------------------------------------
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'));
    }
});

const upload = multer({ storage: storage });


// ------------------------------------------------------------
// STEP 6: DATABASE MODELS
// ------------------------------------------------------------
const User  = require('./models/user');
const Order = require('./models/orders');


// ------------------------------------------------------------
// STEP 7: OTP STORE — Memory mein temporarily store karo
// Production mein Redis ya MongoDB use karo
// ------------------------------------------------------------
const otpStore = {};
// Format: { '9876543210': { otp: '1234', expiresAt: Date } }


// ============================================================
// STEP 8: MONGODB CONNECT
// ============================================================
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully!'))
    .catch((err) => console.error('❌ MongoDB Connection Error:', err));


// ============================================================
// STEP 9: MIDDLEWARES — Security ke liye
// ============================================================

// --- Token verify karo ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token      = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: "Access Denied. Login required." });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decodedData) => {
        if (err) {
            return res.status(403).json({ success: false, error: "Invalid or Expired Token. Please login again." });
        }
        req.user = decodedData;
        next();
    });
};

// --- Admin hai ya nahi check karo ---
const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: "Admin access only." });
    }
    next();
};


// ============================================================
// AUTH ROUTES — Login, OTP, Register
// ============================================================


// ------------------------------------------------------------
// AUTH 1: OTP BHEJO
// POST /api/auth/send-otp
// Student aur Admin dono ke liye — Admin ke liye extra check
// ------------------------------------------------------------
app.post('/api/auth/send-otp', async (req, res) => {
    try {
        const { phone, role } = req.body;

        // Phone validation
        if (!phone || !/^[0-9]{10}$/.test(phone)) {
            return res.status(400).json({ success: false, error: 'Valid 10-digit number daalo' });
        }

        // ⭐ Admin check — approved list mein hai ya nahi
        if (role === 'admin' && !APPROVED_ADMINS.includes(phone)) {
            return res.status(403).json({
                success: false,
                error: 'This number is not authorized as admin.'
                // Note: Koi details mat do ki list mein kya hai
            });
        }

        // 4-digit OTP generate karo
        // const otp = Math.floor(1000 + Math.random() * 9000).toString();
        const otp = "1234";

        // OTP store karo — 5 minute ke liye valid
        otpStore[phone] = {
            otp:       otp,
            role:      role,
            expiresAt: Date.now() + 5 * 60 * 1000  // 5 minutes
        };

        // TODO: Yahan Fast2SMS API lagao real OTP bhejne ke liye
        // Abhi console mein print ho raha hai testing ke liye
        console.log(`📱 OTP for ${phone}: ${otp}`);

        // ⚠️ Production mein OTP response mein mat bhejo
        // Abhi testing ke liye bhej rahe hain
        res.json({
            success: true,
            message: 'OTP sent successfully',
            otp: otp  // ← PRODUCTION MEIN YEH LINE HATA DENA
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ------------------------------------------------------------
// AUTH 2: OTP VERIFY KARO
// POST /api/auth/verify-otp
// OTP sahi hai toh — purana user: token do, naya user: batao
// ------------------------------------------------------------
app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        const { phone, otp, role } = req.body;

        // OTP store mein check karo
        const stored = otpStore[phone];

        if (!stored) {
            return res.status(400).json({ success: false, error: 'OTP expired ya nahi bheja. Dobara try karo.' });
        }

        // Expire ho gaya?
        if (Date.now() > stored.expiresAt) {
            delete otpStore[phone];
            return res.status(400).json({ success: false, error: 'OTP expire ho gaya. Dobara send karo.' });
        }

        // OTP match nahi kiya?
        if (stored.otp !== otp) {
            return res.status(400).json({ success: false, error: 'OTP galat hai.' });
        }

        // OTP sahi — use karne ke baad delete karo (one-time use)
        delete otpStore[phone];

        // Kya user pehle se exists karta hai?
        let user = await User.findOne({ phone, role });

        if (!user) {
            // Admin ka naya account — seedha bana do (naam ki zaroorat nahi)
            if (role === 'admin') {
                user = new User({ fullName: 'Admin', phone, role: 'admin' });
                await user.save();
            } else {
                // Student naya hai — naam maangna padega (frontend handle karega)
                return res.json({
                    success: true,
                    isNewUser: true,
                    message: 'OTP verified. Please enter your name.'
                });
            }
        }

        // Token banao
        // Admin: 30 din, Student: 12 ghante
        const expiresIn = role === 'admin' ? '30d' : '12h';
        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn }
        );

        res.json({
            success:   true,
            isNewUser: false,
            token,
            user
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ------------------------------------------------------------
// AUTH 3: NAYE STUDENT KA NAAM SAVE KARO
// POST /api/auth/register
// Sirf student ke liye — naam + phone se account banaao
// ------------------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
    try {
        const { phone, fullName, role } = req.body;

        // Admin yeh route use nahi kar sakta
        if (role === 'admin') {
            return res.status(403).json({ success: false, error: 'Not allowed' });
        }

        if (!fullName || fullName.trim().length < 2) {
            return res.status(400).json({ success: false, error: 'Valid naam daalo' });
        }

        // Check — pehle se registered toh nahi?
        let user = await User.findOne({ phone });
        if (user) {
            // Already exists — seedha login
        } else {
            user = new User({ fullName: fullName.trim(), phone, role: 'user' });
            await user.save();
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        res.json({ success: true, token, user });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ============================================================
// ORDER ROUTES — Saare protected hain
// ============================================================


// ------------------------------------------------------------
// ORDER 1: NAYA ORDER BANAO
// POST /api/orders
// authenticateToken: Login zaroori
// ------------------------------------------------------------
app.post('/api/orders', authenticateToken, upload.array('actualFiles'), async (req, res) => {
    try {
        const orderDetails           = JSON.parse(req.body.orderData);
        const { userId, totalAmount, filesConfig } = orderDetails;

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
            // File ka naam save karo — URL nahi (protected route se milegi)
            fileUrl: req.files[index].filename
        }));

        const newOrder = new Order({
            userId,
            orderSerial,
            files: finalFilesArray,
            totalAmount,
            orderStatus: 'In Queue'
        });

        await newOrder.save();
        res.status(201).json({ success: true, orderSerial });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// ------------------------------------------------------------
// ORDER 2: ADMIN KE LIYE FULL QUEUE — Token + Admin role zaroori
// GET /api/orders/queue
// Sirf admin dekh sakta hai — student ko puri list nahi milegi
// ------------------------------------------------------------
app.get('/api/orders/queue', authenticateToken, isAdmin, async (req, res) => {
    try {
        const activeOrders = await Order.find({ orderStatus: 'In Queue' })
                                        .populate('userId', 'fullName phone')
                                        .sort({ createdAt: 1 });

        res.status(200).json({ success: true, count: activeOrders.length, data: activeOrders });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ------------------------------------------------------------
// ORDER 3: STUDENT KE LIYE SIRF COUNT — Token zaroori, data nahi
// GET /api/orders/queue-count
// Student ko sirf apna wait time pata chalega — kisi ka naam/file nahi
// ------------------------------------------------------------
app.get('/api/orders/queue-count', authenticateToken, async (req, res) => {
    try {
        const activeOrders = await Order.find({ orderStatus: 'In Queue' })
                                        .select('files createdAt')  // Sirf files aur time — naam/phone nahi
                                        .sort({ createdAt: 1 });

        res.status(200).json({
            success:  true,
            count:    activeOrders.length,
            // Wait time calculate karne ke liye sirf pages/copies chahiye
            waitData: activeOrders.map(o => ({ files: o.files }))
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ------------------------------------------------------------
// ORDER 4: FILE DOWNLOAD — Token zaroori, sirf admin dekh sake
// GET /api/files/:filename
// Direct /uploads/ URL accessible nahi — yahan se milegi file
// ------------------------------------------------------------
app.get('/api/files/:filename', authenticateToken, isAdmin, (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);

    // File exist karti hai?
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'File not found' });
    }

    res.sendFile(filePath);
});


// ------------------------------------------------------------
// ORDER 5: ORDER COMPLETE KARO — Token + Admin zaroori
// PUT /api/orders/:id/complete
// ------------------------------------------------------------
app.put('/api/orders/:id/complete', authenticateToken, isAdmin, async (req, res) => {
    try {
        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id,
            { orderStatus: 'Ready', readyAt: Date.now() },
            { returnDocument: 'after' }
        );

        res.status(200).json({ success: true, message: 'Order marked as ready', data: updatedOrder });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ------------------------------------------------------------
// ORDER 6: CLEAR HISTORY — Token + Admin zaroori
// DELETE /api/orders/clear
// ------------------------------------------------------------
app.delete('/api/orders/clear', authenticateToken, isAdmin, async (req, res) => {
    try {
        await Order.deleteMany({});

        const directory = path.join(__dirname, 'uploads');
        const files     = fs.readdirSync(directory);

        for (const file of files) {
            try {
                fs.unlinkSync(path.join(directory, file));
            } catch (fileErr) {
                console.error("File delete nahi ho payi:", fileErr);
            }
        }

        res.status(200).json({ success: true, message: 'Database and Uploads cleared!' });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ============================================================
// AUTO CLEANUP — Roz raat 12 baje
// ============================================================
cron.schedule('0 0 * * *', async () => {
    console.log("🕛 Midnight Auto-reset starting...");
    try {
        await Order.deleteMany({});

        const directory = path.join(__dirname, 'uploads');
        const files     = fs.readdirSync(directory);
        for (const file of files) {
            fs.unlinkSync(path.join(directory, file));
        }

        console.log("✅ Auto-reset successful. Ready for a new day!");
    } catch (err) {
        console.error("❌ Auto-reset failed:", err);
    }
});


// ============================================================
// SERVER START
// ============================================================
app.listen(PORT, () => {
    console.log(`🚀 QuickPrint Server running on http://localhost:${PORT}`);
});
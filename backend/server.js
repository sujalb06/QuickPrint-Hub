// ============================================================
// QUICKPRINT - BACKEND SERVER (server.js)
// Ye file poora backend hai — database, login, orders sab yahan
// Node.js + Express + MongoDB use ho raha hai
// ============================================================


// ------------------------------------------------------------
// STEP 0: .env FILE LOAD KARO (SABSE PEHLE — koi bhi line upar mat daalna)
// .env me secret cheezein hoti hain jaise password, API keys
// ------------------------------------------------------------
require('dotenv').config();


// ------------------------------------------------------------
// STEP 1: ZAROORI PACKAGES IMPORT KARO
// Ye sab pehle: npm install karke install hote hain
// ------------------------------------------------------------
const jwt      = require('jsonwebtoken'); // Token banana aur verify karna (login security)
const express  = require('express');      // Server banane ka framework
const mongoose = require('mongoose');     // MongoDB se baat karne ke liye
const cors     = require('cors');         // Frontend ko server se connect hone dena

const multer   = require('multer');       // Files (PDF) upload receive karne ke liye
const path     = require('path');         // File/folder ke paths ke saath kaam karna
const fs       = require('fs');           // Computer ki files read/delete karna
const cron     = require('node-cron');    // Roz raat 12 baje auto-cleanup schedule karna


// ------------------------------------------------------------
// STEP 2: APP SETUP — Server start karo, port aur DB URI lo
// ------------------------------------------------------------
const app = express();

// Port aur MongoDB ka address .env file se lo (safer hota hai)
const PORT     = process.env.PORT || 5000; // Agar .env me nahi hai toh 5000 use karo
const MONGO_URI = process.env.MONGO_URI;


// ------------------------------------------------------------
// STEP 3: MIDDLEWARE — Har request aane se pehle ye chalta hai
// ------------------------------------------------------------
app.use(cors());           // Kisi bhi frontend ko server se baat karne do
app.use(express.json());   // Incoming JSON data ko samajhne ke liye


// ------------------------------------------------------------
// STEP 4: UPLOADS FOLDER SETUP
// ------------------------------------------------------------

// Agar 'uploads' folder pehle se nahi hai toh banao
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// Uploads folder ko public karo — taaki admin file ka link khol sake
// Ab koi bhi http://localhost:5000/uploads/filename.pdf access kar sakta hai
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// ------------------------------------------------------------
// STEP 5: MULTER SETUP — File upload ka system
// Multer decide karta hai: file kahan save ho aur naam kya ho
// ------------------------------------------------------------
const storage = multer.diskStorage({

    // File kahan save hogi
    destination: function (req, file, cb) {
        cb(null, './uploads/'); // './uploads/' folder me daalo
    },

    // File ka naam kya hoga
    filename: function (req, file, cb) {
        // Naam me current time jod do — taaki same naam ki 2 files clash na karein
        // \s matlab spaces — inhe underscore se replace karo
        cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'));
    }
});

// Multer ready karo upar wali settings ke saath
const upload = multer({ storage: storage });


// ------------------------------------------------------------
// STEP 6: DATABASE MODELS IMPORT KARO
// Ye files batati hain ki MongoDB me data ka shape kaisa hoga
// ------------------------------------------------------------
const User  = require('./models/user');
const Order = require('./models/orders');


// ============================================================
// STEP 7: MONGODB SE CONNECT KARO
// ============================================================
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully!'))
    .catch((err) => console.error('❌ MongoDB Connection Error:', err));


// ============================================================
// STEP 8: TOKEN VERIFY KARNE WALA MIDDLEWARE (Security Guard)
// Ye function har secured API se pehle chalta hai
// Agar valid token nahi hai toh aage nahi jane deta
// ============================================================
const authenticateToken = (req, res, next) => {

    // Frontend "Authorization" header me token bhejta hai
    // Format hota hai: "Bearer eyJhbGci..."
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Sirf token wala hissa nikalo

    // Token hai hi nahi — access band karo
    if (!token) {
        return res.status(401).json({ success: false, error: "Access Denied. No Token!" });
    }

    // Token ko .env ki secret key se verify karo
    jwt.verify(token, process.env.JWT_SECRET, (err, decodedData) => {

        // Token galat ya expired hai
        if (err) {
            return res.status(403).json({ success: false, error: "Invalid or Expired Token!" });
        }

        // Token sahi hai — user ka data request me save karo aur aage bhejo
        req.user = decodedData;
        next(); // Agle middleware ya API pe jaane do
    });
};


// ============================================================
// API ROUTES — Ye sab "endpoints" hain jahan frontend request karta hai
// ============================================================


// ------------------------------------------------------------
// DANGER ZONE: DATABASE NUKE API
// SIRF TESTING KE LIYE — Production me delete kar dena
// Browser me jaao: http://localhost:5000/api/nuke-database
// ------------------------------------------------------------
app.get('/api/nuke-database', async (req, res) => {
    try {
        await User.deleteMany({});   // Saare users delete
        await Order.deleteMany({});  // Saare orders delete
        res.send("<h1>💥 KABOOM! Database poori tarah saaf ho chuki hai! 💥</h1><p>Ab aap naye number se login kar sakte hain.</p>");
    } catch (err) {
        res.send("Error: " + err.message);
    }
});


// ------------------------------------------------------------
// API 1: LOGIN — Student aur Admin dono ke liye
// POST /api/login
// ------------------------------------------------------------
app.post('/api/login', async (req, res) => {
    try {
        const { fullName, phone, role } = req.body; // Frontend se naam, phone, role aaya

        // Pehle check karo: kya ye phone number DB me pehle se hai?
        let user = await User.findOne({ phone, role });

        if (user) {
            // Phone mila — lekin kya wo same role me hai?
            if (user.role !== role) {
                return res.status(400).json({
                    success: false,
                    error: `This phone number is already registered as a ${user.role.toUpperCase()}. Please use a different number.`
                });
            }
            // Same role wala user mila — theek hai, login karne do
        } else {
            // Naya user hai — account bana lo database me
            user = new User({ fullName, phone, role });
            await user.save();
        }

        // JWT Token banao — ye ek digital "ID card" hai
        // Isme user ki ID aur role chhupa dete hain
        const token = jwt.sign(
            { id: user._id, role: user.role }, // Token ke andar kya data ho
            process.env.JWT_SECRET,            // Taala lagane ki secret key (.env se)
            { expiresIn: '24h' }               // Token 24 ghante baad khud expire ho jaayega
        );

        // Token aur user data dono frontend ko bhejo
        res.status(200).json({ success: true, token: token, user: user });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ------------------------------------------------------------
// API 2: NEW ORDER BANAO — Student file upload karke order karta hai
// POST /api/orders
// Note: authenticateToken pehle chalega (security check)
//       upload.array baad me chalega (files receive karna)
// ------------------------------------------------------------
app.post('/api/orders', authenticateToken, upload.array('actualFiles'), async (req, res) => {
    try {
        // Frontend ne FormData bheja hai (JSON nahi)
        // Isliye order ki details string me hain — JSON.parse se object banaao
        const orderDetails = JSON.parse(req.body.orderData);
        const { userId, totalAmount, filesConfig } = orderDetails;

        // Aaj ke total orders count karo — serial number ke liye
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0); // Aaj ka din 12:00 AM se start
        const count = await Order.countDocuments({ createdAt: { $gte: todayStart } });

        // Serial number: 1 → "0001", 12 → "0012" (padStart = aage zeros lagao)
        const orderSerial = String(count + 1).padStart(4, '0');

        // Har file ke liye DB ke format me data taiyaar karo
        // filesConfig = settings (color, pages etc.)
        // req.files = multer ne jo files save ki hain unka info
        const finalFilesArray = filesConfig.map((fileData, index) => {
            return {
                fileName:        fileData.fileName,
                totalPages:      fileData.totalPages,
                copies:          fileData.copies,
                colorType:       fileData.colorType,
                printSide:       fileData.printSide,
                priceForThisFile: fileData.priceForThisFile,
                // Multer ne file uploads/ folder me save ki — uska download link banao
                fileUrl: `http://localhost:5000/uploads/${req.files[index].filename}`
            };
        });

        // Naya order object banao
        const newOrder = new Order({
            userId,
            orderSerial,
            files: finalFilesArray,
            totalAmount,
            orderStatus: 'In Queue' // Shuru me "In Queue" status
        });

        // Database me save karo
        await newOrder.save();

        // Frontend ko order serial number bhejo (success modal me dikhega)
        res.status(201).json({ success: true, orderSerial: orderSerial });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// ------------------------------------------------------------
// API 3: LIVE QUEUE — Abhi ke pending orders dikhao
// GET /api/orders/queue
// Admin dashboard aur student queue dono yahi use karte hain
// ------------------------------------------------------------
app.get('/api/orders/queue', async (req, res) => {
    try {
        // Sirf "In Queue" wale orders nikalo
        // .populate = userId ki jagah asli user ka naam aur phone lao
        // .sort = purane orders pehle (FIFO — pehle aao pehle pao)
        const activeOrders = await Order.find({ orderStatus: 'In Queue' })
                                        .populate('userId', 'fullName phone')
                                        .sort({ createdAt: 1 });

        res.status(200).json({ success: true, count: activeOrders.length, data: activeOrders });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ------------------------------------------------------------
// API 4: ORDER COMPLETE KARO — Admin "Print & Complete" dabata hai
// PUT /api/orders/:id/complete
// :id = us order ka MongoDB ID jo complete ho gaya
// ------------------------------------------------------------
app.put('/api/orders/:id/complete', async (req, res) => {
    try {
        const orderId = req.params.id; // URL se order ID nikalo

        // Us order ko dhundo aur status update karo
        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            { orderStatus: 'Ready', readyAt: Date.now() }, // Status badlo, time note karo
            { returnDocument: 'after' }                    // Updated order wapas bhejo
        );

        // TODO: Future me yahan WhatsApp API chalegi — student ko message jaayega

        res.status(200).json({ success: true, message: 'Order marked as ready', data: updatedOrder });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ------------------------------------------------------------
// API 5: CLEAR HISTORY — Admin din ke end me sab saaf karta hai
// DELETE /api/orders/clear
// Do kaam: 1) Database ke orders delete, 2) Uploads folder saaf
// ------------------------------------------------------------
app.delete('/api/orders/clear', async (req, res) => {
    try {
        // 1. Database se saare orders delete karo
        await Order.deleteMany({});

        // 2. Uploads folder se saari PDF files delete karo (storage free karo)
        const directory = path.join(__dirname, 'uploads');

        // Folder me ki saari files ki list nikalo
        const files = fs.readdirSync(directory);

        // Har file ko ek ek karke delete karo
        for (const file of files) {
            try {
                fs.unlinkSync(path.join(directory, file)); // Ek file delete karo
            } catch (fileErr) {
                console.error("File delete nahi ho payi:", fileErr); // Error aaye toh skip karo
            }
        }

        res.status(200).json({ success: true, message: 'Database and Uploads folder cleared!' });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ============================================================
// AUTO CLEANUP — Roz raat 12 baje apne aap sab saaf hoga
// Cron format: 'minute hour day month weekday'
// '0 0 * * *' matlab: minute=0, hour=0 (12 AM), baaki roz
// ============================================================
cron.schedule('0 0 * * *', async () => {
    console.log("🕛 Midnight Alert: Automatically resetting orders and clearing storage...");
    try {
        // 1. Database ke saare orders delete karo
        await Order.deleteMany({});

        // 2. Uploads folder ki saari files delete karo
        const directory = path.join(__dirname, 'uploads');
        const files = fs.readdirSync(directory);
        for (const file of files) {
            fs.unlinkSync(path.join(directory, file));
        }

        console.log("✅ Auto-reset successful. Ready for a new day!");
    } catch (err) {
        console.error("❌ Auto-reset failed:", err);
    }
});


// ============================================================
// SERVER START KARO
// ============================================================
app.listen(PORT, () => {
    console.log(`🚀 QuickPrint Server running on http://localhost:${PORT}`);
});
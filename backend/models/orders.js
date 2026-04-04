// ============================================================
// ORDER MODEL — models/orders.js
// Ye file batati hai ki MongoDB me ek "Order" ka data
// kaisa dikhega — student ka reference, files, amount, status
// ============================================================

const mongoose = require('mongoose');


// ------------------------------------------------------------
// ORDER SCHEMA — Ek order ke data ka "blueprint"
// ------------------------------------------------------------
const orderSchema = new mongoose.Schema({

    // Kaunse student ne ye order diya — User model se link
    // ObjectId = MongoDB ka unique ID, ref = kaunse model se link hai
    userId: {
        type: mongoose.Schema.Types.ObjectId, // User ka MongoDB ID store hoga
        ref: 'User',                          // User model se connected hai
        required: true
    },

    // Order ka dikhne wala number — jaise "0001", "0042"
    // Ye auto-increment nahi hai, server.js me manually calculate hota hai
    orderSerial: {
        type: String,
        required: true
    },

    // Files ka array — ek student ek saath kai files de sakta hai
    // Isliye array use kiya, ek order me multiple files ho sakti hain
    files: [{

        fileName:  { type: String, required: true },  // File ka naam
        totalPages:{ type: Number, required: true },  // Kitne pages hain
        copies:    { type: Number, default: 1 },      // Kitni copies chahiye (default: 1)

        // Printing type — sirf ye 2 values allowed
        colorType: {
            type: String,
            enum: ['bw', 'color'], // BW ya Color
            default: 'bw'
        },

        // Printing side — sirf ye 2 values allowed
        printSide: {
            type: String,
            enum: ['single', 'double'], // Single side ya Double side
            default: 'single'
        },

        priceForThisFile: { type: Number, required: true }, // Is file ka price

        // File ka download link (multer ne jahan save ki woh URL)
        fileUrl: { type: String, required: true }
    }],

    // Poore order ka total bill
    totalAmount: {
        type: Number,
        required: true
    },

    // Payment ka status — abhi seedha "Completed" maante hain
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Completed', 'Failed'], // Sirf ye 3 values allowed
        default: 'Completed'
    },

    // Order ka current status — queue me hai, ready hai, le gaya, ya reject hua
    orderStatus: {
        type: String,
        enum: ['In Queue', 'Ready', 'Collected', 'Rejected'], // Sirf ye 4 values allowed
        default: 'In Queue' // Naya order hamesha queue me jaata hai
    },

    // Ye time tab set hoga jab order "Ready" mark hoga
    // Isse pata chalega: 24 ghante baad bhi nahi aaya toh "Rejected" kar do
    readyAt: {
        type: Date // Khali rehta hai jab tak order complete na ho
    }

}, {
    // Automatically 2 extra fields add honge:
    // createdAt = order kab place hua, updatedAt = kab koi change hua
    timestamps: true
});


// ------------------------------------------------------------
// MODEL EXPORT — server.js import karke use kar sake isliye
// 'Order' = MongoDB me collection ka naam "orders" ban jaayega
// ------------------------------------------------------------
module.exports = mongoose.model('Order', orderSchema);
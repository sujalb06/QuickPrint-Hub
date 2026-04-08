// ============================================================
// ORDER MODEL — models/orders.js
// Ye file MongoDB ko batati hai ki ek Order ka structure
// kaisa hoga — kaunse fields, kaunsi values allowed hain
// ============================================================

const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({

    // Student ka naam (JWT token se aata hai login ke waqt)
    studentName: {
        type: String,
        required: true,
        trim: true // Aage peeche ke spaces hatao
    },

    // Student ka phone number
    studentPhone: {
        type: String,
        required: true
    },

    // Dikhne wala order number — jaise "0042"
    orderSerial: {
        type: String,
        required: true
    },

    // Is order mein kitni files hain (ek ya zyada)
    files: [{
        fileName:         { type: String, required: true },   // File ka naam
        totalPages:       { type: Number, required: true },   // Kitne pages hain
        copies:           { type: Number, default: 1 },       // Kitni copies chahiye
        colorType:        { type: String, enum: ['bw', 'color'],     default: 'bw' },     // B/W ya Color
        printSide:        { type: String, enum: ['single', 'double'], default: 'single' }, // Single ya Double side
        priceForThisFile: { type: Number, required: true },   // Is file ka price
        fileUrl:          { type: String, required: true }    // Saved filename (puri URL nahi, sirf naam)
    }],

    // Poora order ka total
    totalAmount: { type: Number, required: true },

    // Payment ka status
    paymentStatus: {
        type: String,
        enum:    ['Pending', 'Completed', 'Failed'],
        default: 'Completed' // Default: ho gayi maan lo (cash counter pe hota hai)
    },

    // Order abhi kahan hai?
    orderStatus: {
        type: String,
        enum:    ['In Queue', 'Ready', 'Collected', 'Rejected'],
        default: 'In Queue'
    },

    // Kab ready hua
    readyAt: { type: Date }

}, {
    // timestamps: true = MongoDB automatically ye 2 fields add karta hai:
    // createdAt = order kab aaya, updatedAt = kab update hua
    timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);
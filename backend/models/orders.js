// ============================================================
// ORDER MODEL — models/orders.js
// Change: userId reference hata diya
// Ab studentName aur studentPhone directly store hota hai
// Kyunki koi User collection nahi hai
// ============================================================

const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({

    // Student ka naam aur phone directly (JWT se aata hai)
    // User database nahi hai — isliye ref nahi
    studentName: {
        type: String,
        required: true,
        trim: true
    },

    studentPhone: {
        type: String,
        required: true
    },

    // Order ka dikhne wala serial number — jaise "0001"
    orderSerial: {
        type: String,
        required: true
    },

    // Files ka array
    files: [{
        fileName:         { type: String, required: true },
        totalPages:       { type: Number, required: true },
        copies:           { type: Number, default: 1 },
        colorType:        { type: String, enum: ['bw', 'color'],     default: 'bw' },
        printSide:        { type: String, enum: ['single', 'double'], default: 'single' },
        priceForThisFile: { type: Number, required: true },
        fileUrl:          { type: String, required: true }  // Sirf filename store hoga
    }],

    totalAmount: { type: Number, required: true },

    paymentStatus: {
        type: String,
        enum:    ['Pending', 'Completed', 'Failed'],
        default: 'Completed'
    },

    orderStatus: {
        type: String,
        enum:    ['In Queue', 'Ready', 'Collected', 'Rejected'],
        default: 'In Queue'
    },

    readyAt: { type: Date }

}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
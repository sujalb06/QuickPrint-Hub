// ============================================================
// USER MODEL — models/user.js
// NOTE: Is project mein User database actually use nahi hoti
// Kyunki login sirf OTP + JWT se hota hai, koi signup nahi
// Ye file future ke liye rakhi hai
// ============================================================

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({

    // User ka poora naam
    fullName: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true // Aage peeche ke spaces hatao
    },

    // Phone number — unique hona chahiye (ek number = ek account)
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        unique: true,
        match: [/^[0-9]{10}$/, '10-digit number daalo'] // Regex: sirf 10 digits
    },

    // Student hai ya Shopkeeper (admin)
    role: {
        type: String,
        enum: ['user', 'admin'], // Sirf ye 2 values allowed
        default: 'user'
    }

}, {
    // Auto fields: createdAt, updatedAt
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
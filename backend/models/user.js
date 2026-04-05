// ============================================================
// USER MODEL — models/user.js
// Ye file batati hai ki MongoDB me ek "User" ka data
// kaisa dikhega — kaunse fields honge, kaise validate honge
// ============================================================

const mongoose = require('mongoose');


// ------------------------------------------------------------
// USER SCHEMA — Ek user ke data ka "blueprint" / "form"
// Jaise ID card ka format hota hai, waise hi ye schema hai
// ------------------------------------------------------------
const userSchema = new mongoose.Schema({

    // User ka poora naam
    fullName: {
        type: String,
        required: [true, 'Full name is required'], // Khali nahi hona chahiye
        trim: true                                  // Aage/peeche ke spaces hatao
    },

    // User ka phone number
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        unique: true, // Ek number se sirf ek hi account ban sakta hai
        match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
        // match = regex validation: sirf 10 digit ka number allow hai
    },

    // User ka role — student hai ya shopkeeper
    role: {
        type: String,
        enum: ['user', 'admin'], // Sirf ye 2 values allowed hain, kuch aur nahi
        default: 'user'          // Agar role nahi diya toh default 'user' hoga
    },

    // OTP se verify hua ya nahi (future me SMS API lagegi tab kaam aayega)
    // isVerified: {
    //     type: Boolean,
    //     default: false // Default: verify nahi hua
    // }

}, {
    // Ye option automatically 2 extra fields add karta hai:
    // createdAt = account kab bana, updatedAt = kab update hua
    timestamps: true
});


// ------------------------------------------------------------
// MODEL EXPORT — server.js import karke use kar sake isliye
// 'User' = MongoDB me collection ka naam "users" ban jaayega
// ------------------------------------------------------------
module.exports = mongoose.model('User', userSchema);
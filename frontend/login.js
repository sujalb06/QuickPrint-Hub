// ============================================================
// QUICKPRINT - LOGIN PAGE SCRIPT
// Ye file login page ka pura kaam karti hai:
// Role switch, OTP request, Login API call, aur Form reset
// ============================================================


// --- GLOBAL VARIABLE ---

let currentRole = 'user'; // Default role: Student (user)
// Jab admin tab click hoga toh ye 'admin' ho jaayega


// ============================================================
// 1. ROLE SWITCH — Student ya Shopkeeper tab click karna
// ============================================================

function switchRole(role) {

    // Jo role select hua usse global variable me save karo
    currentRole = role;

    // Pehle dono tabs se 'active' class hatao
    document.getElementById('userTab').classList.remove('active');
    document.getElementById('adminTab').classList.remove('active');

    // Jo tab select hua sirf usse 'active' karo (highlight)
    if (role === 'user') {
        document.getElementById('userTab').classList.add('active');
    } else {
        document.getElementById('adminTab').classList.add('active');
    }

    // Tab switch hone pe form khali kar do — purana data nahi rehna chahiye
    resetForm();
}


// ============================================================
// 2. OTP REQUEST — "Send OTP" button dabane pe
// ============================================================

function requestOTP() {

    // Form se naam aur phone number lo (trim = aage/peeche ke spaces hatao)
    const name = document.getElementById('fullName').value.trim();
    const phone = document.getElementById('phone').value.trim();

    // Validation: Naam khali nahi hona chahiye
    if (!name) {
        alert("Please enter your Full Name.");
        return;
    }

    // Validation: Phone exactly 10 digits ka hona chahiye aur sirf number hona chahiye
    if (phone.length !== 10 || isNaN(phone)) {
        alert("Please enter a valid 10-digit phone number.");
        return;
    }

    // Abhi ke liye fake OTP (baad me real SMS API lagegi)
    alert(`Verification code sent to +91 ${phone}! \n\n(Hint: Use 1234 for testing)`);

    // OTP bhejne ke baad UI change karo:
    document.getElementById('reqOtpBtn').classList.add('hidden');    // "Send OTP" button chhupao
    document.getElementById('otpSection').classList.remove('hidden'); // OTP input box dikhao
    document.getElementById('loginBtn').classList.remove('hidden');   // "Login" button dikhao
}


// ============================================================
// 3. LOGIN — OTP verify karo aur server se connect karo
// ============================================================

async function handleLogin(event) {

    // Form submit hone pe page reload rokna
    event.preventDefault();

    // Form ke saare fields se data lo
    const name = document.getElementById('fullName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const otp = document.getElementById('otp').value.trim();
    const loginBtn = document.getElementById('loginBtn');

    // OTP check karo — filhaal sirf "1234" valid hai (testing ke liye)
    if (otp !== "1234") {
        alert("Invalid Verification Code! Please enter '1234'.");
        return;
    }

    // Server se response aane tak button ko "loading" mode me karo
    const originalBtnText = loginBtn.innerHTML; // Pehle wala text save karo
    loginBtn.innerHTML = "Verifying & Connecting... ⏳";
    loginBtn.disabled = true;

    try {
        // Backend server ko login request bhejo (POST)
        const response = await fetch('https://quickprint-hub.onrender.com/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json' // Server ko batao ki JSON aa raha hai
            },
            body: JSON.stringify({
                fullName: name,
                phone: phone,
                role: currentRole  // 'user' ya 'admin'
            })
        });

        const data = await response.json(); // Server ka jawab JSON me lo

        if (data.success) {

            // Login successful! Token aur user data browser me save karo
            // (Ye dono baad me user.html aur admin.html me kaam aayenge)
            localStorage.setItem('quickprint_token', data.token);           // JWT token save karo
            localStorage.setItem('quickprint_user', JSON.stringify(data.user)); // User info save karo

            // Role ke hisaab se sahi page pe bhejo
            if (currentRole === 'user') {
                window.location.href = "user.html";   // Student ka page
            } else {
                window.location.href = "admin.html";  // Shopkeeper ka page
            }

        } else {
            // Server ne login refuse kiya
            alert("Login failed: " + data.error);

            // Button wapas normal karo
            loginBtn.innerHTML = originalBtnText;
            loginBtn.disabled = false;
        }

    } catch (error) {
        // Server se connection hi nahi hua (Node.js band hai kya?)
        console.error("Server connection error:", error);
        alert("Server se connect nahi ho paya. Please check if your Node.js backend is running (localhost:5000).");

        // Button wapas normal karo
        loginBtn.innerHTML = originalBtnText;
        loginBtn.disabled = false;
    }
}


// ============================================================
// 4. FORM RESET — Form saaf karo aur OTP wale buttons chhupao
// ============================================================

function resetForm() {
    document.getElementById('loginForm').reset();                      // Saare inputs khali karo

    document.getElementById('reqOtpBtn').classList.remove('hidden');   // "Send OTP" button wapas dikhao
    document.getElementById('otpSection').classList.add('hidden');     // OTP input chhupao
    document.getElementById('loginBtn').classList.add('hidden');       // Login button chhupao
}


// ============================================================
// 5. PAGE LOAD PE AUTO-CHECK — Kya user pehle se logged in hai?
// ============================================================

window.onload = function() {
    const savedUser = localStorage.getItem('quickprint_user');

    if (savedUser) {
        // Agar pehle se login hai toh seedha redirect kar sakte hain
        // Abhi ye feature off hai (comment me hai), zaroorat pade toh on karo:
        // const user = JSON.parse(savedUser);
        // window.location.href = user.role === 'admin' ? 'admin.html' : 'user.html';
    }
}
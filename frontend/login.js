// ============================================================
// QUICKPRINT - LOGIN PAGE SCRIPT (login.js)
// Flow: Naam + Number daalo → OTP aayega → OTP verify karo → Dashboard
// Student = user.html, Admin = admin.html
// ============================================================

let currentRole = 'user'; // Default: Student selected
let resendTimer = null;   // OTP resend countdown timer ka reference

// ============================================================
// PAGE LOAD — Agar pehle se logged in hai toh seedha bhejo
// ============================================================
window.onload = function () {
    const token = localStorage.getItem('quickprint_token');
    const user  = localStorage.getItem('quickprint_user');

    if (token && user) {
        const userData = JSON.parse(user);
        // Admin → admin.html, Student → user.html
        window.location.href = userData.role === 'admin' ? 'admin.html' : 'user.html';
    }
};

// ============================================================
// ROLE SWITCH — "Student" ya "Shopkeeper" tab click hone pe
// ============================================================
function switchRole(role) {
    currentRole = role;

    // Active tab highlight karo
    document.getElementById('userTab').classList.toggle('active', role === 'user');
    document.getElementById('adminTab').classList.toggle('active', role === 'admin');

    resetForm(); // Form saaf karo
}

// ============================================================
// STEP 1 — "Send OTP" button click
// Server pe number bhejo, OTP mangao
// ============================================================
async function sendOTP() {
    const name  = document.getElementById('fullName').value.trim();
    const phone = document.getElementById('phone').value.trim();

    // Validation
    if (!name || name.length < 2) {
        alert('Enter your name');
        return;
    }
    if (phone.length !== 10 || isNaN(phone)) {
        alert('Valid 10-digit number daalo');
        return;
    }

    // Button disable karo taaki double click na ho
    const btn = document.getElementById('sendOtpBtn');
    btn.innerHTML = 'Sending OTP... ⏳';
    btn.disabled  = true;

    try {
        const res = await fetch('https://quickprint-hub.onrender.com/api/auth/send-otp', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ phone, role: currentRole })
            // Admin ke liye: server check karega ki number whitelist mein hai ya nahi
        });
        const data = await res.json();

        if (data.success) {
            // Step 1 chhupao, Step 2 dikhao
            document.getElementById('step1').classList.add('hidden');
            document.getElementById('step2').classList.remove('hidden');
            document.getElementById('otpSentMsg').innerText =
                `OTP sent on +91 ${phone}
                // (Testing OTP: ${data.otp})`;
            startResendTimer(); // 30 second countdown shuru karo
        } else {
            alert(data.error || 'Cant send OTP');
            btn.innerHTML = 'Send OTP';
            btn.disabled  = false;
        }

    } catch (e) {
        alert('Server se connect nahi ho paya.');
        btn.innerHTML = 'Send OTP';
        btn.disabled  = false;
    }
}

// ============================================================
// STEP 2 — "Verify & Login" button click
// OTP verify karo, token lo, dashboard pe jao
// ============================================================
async function verifyOTP() {
    const phone    = document.getElementById('phone').value.trim();
    const fullName = document.getElementById('fullName').value.trim();
    const otp      = document.getElementById('otpInput').value.trim();

    if (!otp) {
        alert('Enter OTP');
        return;
    }

    try {
        const res = await fetch('https://quickprint-hub.onrender.com/api/auth/verify-otp', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ phone, otp, fullName, role: currentRole })
        });
        const data = await res.json();

        if (data.success) {
            clearInterval(resendTimer);

            // Token aur user info localStorage mein save karo
            // Ye hi "session" hai — browser close = logout nahi, cache clear = logout
            localStorage.setItem('quickprint_token', data.token);
            localStorage.setItem('quickprint_user',  JSON.stringify(data.user));

            // Sahi page pe bhejo
            window.location.href = currentRole === 'admin' ? 'admin.html' : 'user.html';

        } else {
            alert(data.error || 'Incorrect OTP');
        }

    } catch (e) {
        alert('Server error');
    }
}

// ============================================================
// BACK BUTTON — Step 2 se Step 1 pe wapas
// ============================================================
function goBack() {
    document.getElementById('step2').classList.add('hidden');
    document.getElementById('step1').classList.remove('hidden');
    document.getElementById('otpInput').value = '';
    clearInterval(resendTimer);

    const btn = document.getElementById('sendOtpBtn');
    btn.innerHTML = 'Send OTP';
    btn.disabled  = false;
}

// ============================================================
// RESEND TIMER — 30 second countdown
// Timer khatam hone pe "Resend OTP" link dikhega
// ============================================================
function startResendTimer() {
    let seconds = 30;
    const timerEl = document.getElementById('resendTimer');
    timerEl.innerText = `Resend in ${seconds}s`;

    resendTimer = setInterval(() => {
        seconds--;
        timerEl.innerText = `Resend in ${seconds}s`;

        if (seconds <= 0) {
            clearInterval(resendTimer);
            timerEl.innerHTML = `<a href="#" onclick="resendOTP(); return false;">Resend OTP</a>`;
        }
    }, 1000);
}

// Resend button click — form reset karke phir se OTP bhejo
async function resendOTP() {
    document.getElementById('otpInput').value = '';
    goBack();
    setTimeout(() => sendOTP(), 300); // Thodi der baad automatically OTP bhejo
}

// ============================================================
// FORM RESET — Tab switch pe saaf karo
// ============================================================
function resetForm() {
    document.getElementById('step1').classList.remove('hidden');
    document.getElementById('step2').classList.add('hidden');
    document.getElementById('fullName').value = '';
    document.getElementById('phone').value    = '';
    document.getElementById('otpInput').value = '';

    const btn = document.getElementById('sendOtpBtn');
    btn.innerHTML = 'Send OTP';
    btn.disabled  = false;

    clearInterval(resendTimer);
}
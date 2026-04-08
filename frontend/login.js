// ============================================================
// QUICKPRINT - LOGIN SCRIPT
// Model: Naam + Number → OTP → LocalStorage mein save
// Koi user database nahi — cache clear = sab saaf
// Admin ke liye number whitelist check (server side)
// ============================================================

let currentRole = 'user';
let resendTimer = null;


// ============================================================
// PAGE LOAD — Agar localStorage mein session hai toh seedha bhejo
// ============================================================
window.onload = function () {
    const token = localStorage.getItem('quickprint_token');
    const user  = localStorage.getItem('quickprint_user');

    if (token && user) {
        const u = JSON.parse(user);
        // Session valid hai — seedha dashboard pe bhejo
        window.location.href = u.role === 'admin' ? 'admin.html' : 'user.html';
    }
};


// ============================================================
// ROLE SWITCH — Student ya Shopkeeper tab
// ============================================================
function switchRole(role) {
    currentRole = role;
    document.getElementById('userTab').classList.toggle('active', role === 'user');
    document.getElementById('adminTab').classList.toggle('active', role === 'admin');
    resetForm();
}


// ============================================================
// STEP 1 — OTP bhejo
// ============================================================
async function sendOTP() {
    const name  = document.getElementById('fullName').value.trim();
    const phone = document.getElementById('phone').value.trim();

    // Validation
    if (!name || name.length < 2) {
        alert('Apna naam daalo');
        return;
    }
    if (phone.length !== 10 || isNaN(phone)) {
        alert('Valid 10-digit number daalo');
        return;
    }

    const btn = document.getElementById('sendOtpBtn');
    btn.innerHTML = 'Sending OTP... ⏳';
    btn.disabled  = true;

    try {
        const res  = await fetch('https://quickprint-hub.onrender.com/api/auth/send-otp', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ phone, role: currentRole })
            // Note: Admin ke liye backend whitelist check karega
            // Agar number approved nahi — error aayega
        });
        const data = await res.json();

        if (data.success) {
            // Step 1 chhupao, Step 2 dikhao
            document.getElementById('step1').classList.add('hidden');
            document.getElementById('step2').classList.remove('hidden');
            document.getElementById('otpSentMsg').innerText =
                `OTP bheja +91 ${phone} pe. (Testing OTP: ${data.otp})`;
            startResendTimer();
        } else {
            // Admin ke liye: "Number not authorized" aayega
            alert(data.error || 'OTP nahi bheja ja saka');
            btn.innerHTML = 'Send OTP';
            btn.disabled  = false;
        }

    } catch (e) {
        alert('Server se connect nahi ho paya. Check karo ki server chal raha hai.');
        btn.innerHTML = 'Send OTP';
        btn.disabled  = false;
    }
}


// ============================================================
// STEP 2 — OTP verify karo
// ============================================================
async function verifyOTP() {
    const phone = document.getElementById('phone').value.trim();
    const fullnamevalue  = document.getElementById('fullName').value.trim();
    const otp   = document.getElementById('otpInput').value.trim();

    if (!otp) {
        alert('OTP daalo');
        return;
    }

    try {
        const res  = await fetch('https://quickprint-hub.onrender.com/api/auth/verify-otp', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ phone, otp, fullName: fullnamevalue, role: currentRole })
        });
        const data = await res.json();

        if (data.success) {
            clearInterval(resendTimer);

            // LocalStorage mein save karo — yahi "session" hai
            // Cache clear = ye sab chala jaayega = logout
            localStorage.setItem('quickprint_token', data.token);
            localStorage.setItem('quickprint_user',  JSON.stringify(data.user));

            // Sahi page pe bhejo
            window.location.href = currentRole === 'admin' ? 'admin.html' : 'user.html';

        } else {
            alert(data.error || 'OTP galat hai');
        }

    } catch (e) {
        alert('Server error');
    }
}


// ============================================================
// BACK BUTTON — Step 1 pe wapas jao
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
// ============================================================
function startResendTimer() {
    let seconds = 30;
    const el    = document.getElementById('resendTimer');
    el.innerText = `Resend in ${seconds}s`;

    resendTimer = setInterval(() => {
        seconds--;
        el.innerText = `Resend in ${seconds}s`;
        if (seconds <= 0) {
            clearInterval(resendTimer);
            el.innerHTML = `<a href="#" onclick="resendOTP(); return false;">Resend OTP</a>`;
        }
    }, 1000);
}

async function resendOTP() {
    document.getElementById('otpInput').value = '';
    goBack();
    // Thodi der baad automatically sendOTP call karo
    setTimeout(() => sendOTP(), 300);
}


// ============================================================
// FORM RESET — Tab switch pe
// ============================================================
function resetForm() {
    document.getElementById('step1').classList.remove('hidden');
    document.getElementById('step2').classList.add('hidden');
    document.getElementById('fullName').value  = '';
    document.getElementById('phone').value     = '';
    document.getElementById('otpInput').value  = '';

    const btn = document.getElementById('sendOtpBtn');
    btn.innerHTML = 'Send OTP';
    btn.disabled  = false;

    clearInterval(resendTimer);
}
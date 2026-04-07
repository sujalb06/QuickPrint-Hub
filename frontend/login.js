// ============================================================
// QUICKPRINT - LOGIN PAGE SCRIPT
// OTP based login — Student aur Admin dono ke liye
// Student: Phone → OTP → (Naam agar naya hai) → Dashboard
// Admin: Phone → OTP (sirf approved numbers) → Admin Panel
// ============================================================


// --- GLOBAL VARIABLE ---
let currentRole = 'user';
let otpTimer = null;
let adminOtpTimer = null;


// ============================================================
// 1. PAGE LOAD — Agar pehle se login hai toh seedha bhejo
// ============================================================
window.onload = function () {
    const token = localStorage.getItem('quickprint_token');
    const savedUser = localStorage.getItem('quickprint_user');

    if (token && savedUser) {
        const user = JSON.parse(savedUser);
        // Token hai toh seedha sahi page pe bhejo
        window.location.href = user.role === 'admin' ? 'admin.html' : 'user.html';
    }
};


// ============================================================
// 2. ROLE SWITCH — Student ya Shopkeeper tab click karna
// ============================================================
function switchRole(role) {
    currentRole = role;

    // Tabs highlight karo
    document.getElementById('userTab').classList.toggle('active', role === 'user');
    document.getElementById('adminTab').classList.toggle('active', role === 'admin');

    // Sahi form dikhao
    document.getElementById('studentLoginForm').classList.toggle('hidden', role === 'admin');
    document.getElementById('adminLoginForm').classList.toggle('hidden', role === 'user');

    // Form reset karo
    resetAllForms();
}


// ============================================================
// 3. STUDENT FLOW — Step 1: OTP bhejo
// ============================================================
async function sendOTP() {
    const phone = document.getElementById('phone').value.trim();

    if (phone.length !== 10 || isNaN(phone)) {
        alert('Valid 10-digit number daalo');
        return;
    }

    const btn = document.getElementById('sendOtpBtn');
    btn.innerHTML = 'Sending... ⏳';
    btn.disabled = true;

    try {
        const res = await fetch('https://quickprint-hub.onrender.com/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, role: 'user' })
        });
        const data = await res.json();

        if (data.success) {
            // Phone step chhupao, OTP step dikhao
            document.getElementById('phoneStep').classList.add('hidden');
            document.getElementById('otpStep').classList.remove('hidden');
            startResendTimer('resendTimer', 'sendOTP');
        } else {
            alert(data.error || 'OTP bhejne mein problem hui');
            btn.innerHTML = 'Send OTP';
            btn.disabled = false;
        }
    } catch (e) {
        alert('Server se connect nahi ho paya');
        btn.innerHTML = 'Send OTP';
        btn.disabled = false;
    }
}


// ============================================================
// 4. STUDENT FLOW — Step 2: OTP verify karo
// ============================================================
async function verifyOTP() {
    const phone = document.getElementById('phone').value.trim();
    const otp = document.getElementById('otpInput').value.trim();

    if (otp.length !== 4) {
        alert('4 digit OTP daalo');
        return;
    }

    try {
        const res = await fetch('https://quickprint-hub.onrender.com/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, otp, role: 'user' })
        });
        const data = await res.json();

        if (data.success) {
            clearInterval(otpTimer);

            if (data.isNewUser) {
                // Naya user — naam maango
                document.getElementById('otpStep').classList.add('hidden');
                document.getElementById('nameStep').classList.remove('hidden');
            } else {
                // Purana user — seedha login
                saveAndRedirect(data.token, data.user);
            }
        } else {
            alert('OTP galat hai, dobara try karo');
        }
    } catch (e) {
        alert('Server error, try again');
    }
}


// ============================================================
// 5. STUDENT FLOW — Step 3: Naam save karo (sirf naye user ke liye)
// ============================================================
async function completeLogin() {
    const phone = document.getElementById('phone').value.trim();
    const name = document.getElementById('fullName').value.trim();

    if (!name) {
        alert('Naam daalo');
        return;
    }

    try {
        const res = await fetch('https://quickprint-hub.onrender.com/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, fullName: name, role: 'user' })
        });
        const data = await res.json();

        if (data.success) {
            saveAndRedirect(data.token, data.user);
        } else {
            alert(data.error || 'Registration mein problem');
        }
    } catch (e) {
        alert('Server error');
    }
}


// ============================================================
// 6. ADMIN FLOW — Step 1: OTP bhejo (sirf approved numbers ko)
// ============================================================
async function sendAdminOTP() {
    const phone = document.getElementById('adminPhone').value.trim();

    if (phone.length !== 10 || isNaN(phone)) {
        alert('Valid 10-digit number daalo');
        return;
    }

    try {
        const res = await fetch('https://quickprint-hub.onrender.com/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, role: 'admin' })
            // Backend check karega — approved admin list mein hai ya nahi
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('adminPhoneStep').classList.add('hidden');
            document.getElementById('adminOtpStep').classList.remove('hidden');
            startResendTimer('adminResendTimer', 'sendAdminOTP');
        } else {
            // "Not authorized" message aayega agar number list mein nahi
            alert(data.error || 'Access denied');
        }
    } catch (e) {
        alert('Server se connect nahi ho paya');
    }
}


// ============================================================
// 7. ADMIN FLOW — Step 2: OTP verify karo
// ============================================================
async function verifyAdminOTP() {
    const phone = document.getElementById('adminPhone').value.trim();
    const otp = document.getElementById('adminOtpInput').value.trim();

    if (otp.length !== 4) {
        alert('4 digit OTP daalo');
        return;
    }

    try {
        const res = await fetch('https://quickprint-hub.onrender.com/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, otp, role: 'admin' })
        });
        const data = await res.json();

        if (data.success) {
            clearInterval(adminOtpTimer);
            saveAndRedirect(data.token, data.user);
        } else {
            alert('OTP galat hai');
        }
    } catch (e) {
        alert('Server error');
    }
}


// ============================================================
// 8. HELPER: Token + User save karo, sahi page pe bhejo
// ============================================================
function saveAndRedirect(token, user) {
    localStorage.setItem('quickprint_token', token);
    localStorage.setItem('quickprint_user', JSON.stringify(user));
    window.location.href = user.role === 'admin' ? 'admin.html' : 'user.html';
}


// ============================================================
// 9. HELPER: Resend timer — 30 second countdown
// ============================================================
function startResendTimer(elementId, resendFn) {
    let seconds = 30;
    const el = document.getElementById(elementId);

    const timer = setInterval(() => {
        seconds--;
        el.innerText = `Resend in ${seconds}s`;

        if (seconds <= 0) {
            clearInterval(timer);
            el.innerHTML = `<a href="#" onclick="${resendFn}(); return false;" style="color: var(--primary);">Resend OTP</a>`;
        }
    }, 1000);

    // Timer variable save karo cancel ke liye
    if (elementId === 'resendTimer') otpTimer = timer;
    else adminOtpTimer = timer;
}


// ============================================================
// 10. HELPER: Saare forms reset karo
// ============================================================
function resetAllForms() {
    // Student form reset
    document.getElementById('phoneStep').classList.remove('hidden');
    document.getElementById('otpStep').classList.add('hidden');
    document.getElementById('nameStep').classList.add('hidden');
    document.getElementById('phone').value = '';
    document.getElementById('otpInput').value = '';
    if (document.getElementById('fullName')) document.getElementById('fullName').value = '';
    const sendBtn = document.getElementById('sendOtpBtn');
    if (sendBtn) { sendBtn.innerHTML = 'Send OTP'; sendBtn.disabled = false; }

    // Admin form reset
    document.getElementById('adminPhoneStep').classList.remove('hidden');
    document.getElementById('adminOtpStep').classList.add('hidden');
    document.getElementById('adminPhone').value = '';
    document.getElementById('adminOtpInput').value = '';

    // Timers band karo
    if (otpTimer) clearInterval(otpTimer);
    if (adminOtpTimer) clearInterval(adminOtpTimer);
}
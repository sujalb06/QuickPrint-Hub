// ============================================================
// QUICKPRINT - LOGIN PAGE SCRIPT
// OTP system hataya gaya — ab Campus User Code se login hoga
// Student aur Admin dono ke liye alag-alag secret codes hain
// ============================================================


// --- GLOBAL VARIABLE ---

let currentRole = 'user'; // Default role: Student


// --- SECRET CODES (Inhe apne hisaab se change karo) ---
// Ye codes poore campus ke liye same rahenge
// Server pe validate karna zyada secure hoga future me

const CAMPUS_CODES = {
    user:  "STUDENT2025",   // Saare students ke liye ek code
    admin: "ADMIN2025"      // Shopkeeper ke liye alag code
};


// ============================================================
// 1. ROLE SWITCH — Student ya Shopkeeper tab click karna
// ============================================================

function switchRole(role) {
    currentRole = role;

    // Dono tabs se active class hatao
    document.getElementById('userTab').classList.remove('active');
    document.getElementById('adminTab').classList.remove('active');

    // Jo tab chuna usse active karo
    if (role === 'user') {
        document.getElementById('userTab').classList.add('active');
        document.getElementById('userCodeLabel').innerText = 'Student Code'; // Label badlo
    } else {
        document.getElementById('adminTab').classList.add('active');
        document.getElementById('userCodeLabel').innerText = 'Admin Code';   // Label badlo
    }

    // Tab switch hone pe form reset karo
    resetForm();
}


// ============================================================
// 2. LOGIN — Code verify karo aur server se connect karo
// ============================================================

async function handleLogin(event) {
    event.preventDefault(); // Page reload rokna

    const name     = document.getElementById('fullName').value.trim();
    const phone    = document.getElementById('phone').value.trim();
    const userCode = document.getElementById('userCode').value.trim();
    const loginBtn = document.getElementById('loginBtn');

    // Validation: Phone 10 digits ka hona chahiye
    if (phone.length !== 10 || isNaN(phone)) {
        alert("Please enter a valid 10-digit phone number.");
        return;
    }

    // Campus code verify karo (role ke hisaab se)
    if (userCode !== CAMPUS_CODES[currentRole]) {
        alert(`Invalid ${currentRole === 'user' ? 'Student' : 'Admin'} Code! Please check and try again.`);
        document.getElementById('userCode').value = ''; // Wrong code clear karo
        document.getElementById('userCode').focus();
        return;
    }

    // Code sahi hai — button loading mode me karo
    const originalBtnText = loginBtn.innerHTML;
    loginBtn.innerHTML = "Verifying & Connecting... ⏳";
    loginBtn.disabled = true;

    try {
        // Server ko login request bhejo
        const response = await fetch('https://quickprint-hub.onrender.com/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fullName: name,
                phone: phone,
                role: currentRole
            })
        });

        const data = await response.json();

        if (data.success) {
            // Token aur user data save karo
            localStorage.setItem('quickprint_token', data.token);
            localStorage.setItem('quickprint_user', JSON.stringify(data.user));

            // Role ke hisaab se page pe bhejo
            if (currentRole === 'user') {
                window.location.href = "user.html";
            } else {
                window.location.href = "admin.html";
            }

        } else {
            alert("Login failed: " + data.error);
            loginBtn.innerHTML = originalBtnText;
            loginBtn.disabled = false;
        }

    } catch (error) {
        console.error("Server connection error:", error);
        alert("Server se connect nahi ho paya. Please check if backend is running.");
        loginBtn.innerHTML = originalBtnText;
        loginBtn.disabled = false;
    }
}


// ============================================================
// 3. FORM RESET — Tab switch pe form saaf karo
// ============================================================

function resetForm() {
    document.getElementById('loginForm').reset();
}


// ============================================================
// 4. PAGE LOAD PE AUTO-CHECK — Kya user pehle se logged in hai?
// ============================================================

window.onload = function() {
    const savedUser = localStorage.getItem('quickprint_user');

    if (savedUser) {
        // Pehle se login hai toh seedha redirect karo (optional)
        // const user = JSON.parse(savedUser);
        // window.location.href = user.role === 'admin' ? 'admin.html' : 'user.html';
    }
}
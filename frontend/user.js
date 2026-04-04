// ============================================================
// QUICKPRINT - STUDENT CART & ORDER SCRIPT
// Ye file student ke side ka pura kaam karti hai:
// File upload, cart settings, payment, aur live queue
// ============================================================


// --- GLOBAL VARIABLES ---

let cartItems = [];  // Cart me jo files hain unka list

// Printing ka rate card (per page, Rupees me)
const PRICES = { bw: 2, color: 10 };


// ============================================================
// 1. PAGE LOAD HONE PE — Login check aur queue fetch
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

    // Check karo koi login hai ya nahi
    const savedUser = localStorage.getItem('quickprint_user');
    if (!savedUser) {
        alert("Please login first!");
        window.location.href = "login.html";
        return;
    }

    // User ka naam upar dikhao
    const user = JSON.parse(savedUser);
    document.getElementById('userNameDisplay').innerText = `Welcome, ${user.fullName}`;

    // Page khulte hi queue ka data fetch karo
    fetchLiveQueue();

    // Har 10 second me queue automatically update hoti rahe (bina page refresh ke)
    setInterval(fetchLiveQueue, 10000);
});


// ============================================================
// 2. FILE UPLOAD — Jab student koi file choose kare
// ============================================================

document.getElementById('fileInput').addEventListener('change', async function(e) {
    const files = e.target.files;
    if (files.length === 0) return; // Koi file nahi chuni toh kuch mat karo

    // Cart ka "khali hai" wala message hatao
    const container = document.getElementById('cartItemsContainer');
    const emptyMsg = container.querySelector('.empty-cart-msg');
    if (emptyMsg) emptyMsg.remove();

    // Har ek file ke liye kaam karo
    for (let file of files) {
        let pages = 1; // Default 1 page maano

        // Agar PDF hai toh automatically pages count karo
        if (file.type === 'application/pdf') {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const typedarray = new Uint8Array(arrayBuffer);
                const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
                pages = pdf.numPages; // PDF library se total pages nikalo
            } catch (error) {
                // PDF read nahi hui toh user se manually puchho
                console.error("PDF Read Error:", error);
                let manualPages = prompt(`Could not read ${file.name} automatically.\nPlease enter total pages manually:`, "1");
                pages = parseInt(manualPages) || 1;
            }
        }

        // Har file ko ek unique ID do (time + random number se)
        const fileId = 'file_' + Date.now() + Math.floor(Math.random() * 1000);

        // File ko cart me add karo default settings ke saath
        cartItems.push({
            id: fileId,
            name: file.name,
            pages: pages,
            copies: 1,           // Default: 1 copy
            colorType: 'bw',     // Default: Black & White
            printSide: 'single', // Default: Single side
            price: 0,            // Price baad me calculate hogi
            fileObject: file     // Actual file object (upload ke liye zaroori)
        });

        renderCartUI(); // Cart screen pe dikhao
    }

    e.target.value = ''; // File input reset karo (taki same file dobara bhi select ho sake)
});


// ============================================================
// 3. CART UI BANANA — Har file ka card screen pe dikhao
// ============================================================

function renderCartUI() {
    const container = document.getElementById('cartItemsContainer');
    container.innerHTML = ''; // Pehle ke cards saaf karo
    let totalAmount = 0;

    // Cart khali hai toh default message dikhao
    if (cartItems.length === 0) {
        container.innerHTML = '<div class="empty-cart-msg">Upload files to see settings and live price here.</div>';
        document.getElementById('totalPrice').innerText = '₹0.00';
        document.getElementById('payNowBtn').disabled = true;
        return;
    }

    // Cart me kuch hai toh Pay button ON karo
    document.getElementById('payNowBtn').disabled = false;

    // Har file ke liye ek settings card banao
    cartItems.forEach(item => {

        // Double side me pages aadhe lagte hain (front+back), isliye Math.ceil use kiya
        let sheetsUsed = item.printSide === 'double' ? Math.ceil(item.pages / 2) : item.pages;

        // Price calculate karo: sheets * rate * copies
        item.price = sheetsUsed * PRICES[item.colorType] * item.copies;
        totalAmount += item.price;

        const fileHtml = `
            <div class="file-settings-card" id="${item.id}">

                <!-- File ka naam aur page count -->
                <div class="file-header">
                    <span class="file-name" title="${item.name}">📄 ${item.name}</span>
                    <span class="page-badge">${item.pages} Pages</span>
                </div>

                <!-- BW ya Color choose karo -->
                <div class="options-row">
                    <div class="option-block ${item.colorType === 'bw' ? 'active' : ''}" 
                         onclick="updateSetting('${item.id}', 'colorType', 'bw')">B/W (₹2)</div>
                    <div class="option-block ${item.colorType === 'color' ? 'active' : ''}" 
                         onclick="updateSetting('${item.id}', 'colorType', 'color')">Color (₹10)</div>
                </div>

                <!-- Single ya Double side choose karo -->
                <div class="options-row">
                    <div class="option-block ${item.printSide === 'single' ? 'active' : ''}" 
                         onclick="updateSetting('${item.id}', 'printSide', 'single')">Single Side</div>
                    <div class="option-block ${item.printSide === 'double' ? 'active' : ''}" 
                         onclick="updateSetting('${item.id}', 'printSide', 'double')">Double Side</div>
                </div>

                <!-- Copies ki tadad aur us file ka price -->
                <div class="copies-wrapper">
                    <div>
                        <label style="font-size:0.8rem; font-weight:600;">Copies:</label>
                        <input type="number" class="copies-input" value="${item.copies}" min="1" max="50" 
                               onchange="updateCopies('${item.id}', this.value)">
                    </div>
                    <div class="file-price">₹${item.price.toFixed(2)}</div>
                </div>

                <!-- File hatane ka button -->
                <button class="btn-outline" style="width:100%; margin-top:10px; padding:4px;" 
                        onclick="removeItem('${item.id}')">Remove File</button>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', fileHtml);
    });

    // Neeche total amount dikhao
    document.getElementById('totalPrice').innerText = `₹${totalAmount.toFixed(2)}`;
}


// ============================================================
// 4. SETTINGS CHANGE KARNA — BW/Color, Single/Double
// ============================================================

// Jab koi option click kare (jaise BW se Color)
function updateSetting(id, settingType, value) {
    const itemIndex = cartItems.findIndex(i => i.id === id);
    if (itemIndex > -1) {
        cartItems[itemIndex][settingType] = value; // Setting update karo
        renderCartUI(); // Screen refresh karo
    }
}

// Jab copies ka number change ho
function updateCopies(id, value) {
    let copies = parseInt(value);
    if (copies < 1 || isNaN(copies)) copies = 1; // Minimum 1 copy honi chahiye

    const itemIndex = cartItems.findIndex(i => i.id === id);
    if (itemIndex > -1) {
        cartItems[itemIndex].copies = copies;
        renderCartUI();
    }
}

// Jab student koi file cart se hataye
function removeItem(id) {
    cartItems = cartItems.filter(i => i.id !== id); // Sirf wahi file hatao
    renderCartUI();
}


// ============================================================
// 5. PAYMENT & ORDER PLACE KARNA (JWT Token se Secure)
// ============================================================

async function processPayment() {

    // Login user aur uska token lo localStorage se
    const user = JSON.parse(localStorage.getItem('quickprint_user'));
    const token = localStorage.getItem('quickprint_token'); // JWT token verify ke liye

    const payBtn = document.getElementById('payNowBtn');

    // Cart ka total amount calculate karo
    let finalAmount = cartItems.reduce((sum, item) => sum + item.price, 0);

    // FormData banao — files aur order ka data ek saath server ko bhejna hai
    const formData = new FormData();

    // Order ki details JSON me banao
    const orderDetails = {
        userId: user._id,
        totalAmount: finalAmount,
        filesConfig: cartItems.map(item => ({
            fileName: item.name,
            totalPages: item.pages,
            copies: item.copies,
            colorType: item.colorType,
            printSide: item.printSide,
            priceForThisFile: item.price
        }))
    };

    // JSON data aur actual files dono FormData me daalo
    formData.append('orderData', JSON.stringify(orderDetails));
    cartItems.forEach(item => {
        formData.append('actualFiles', item.fileObject);
    });

    // Button ko "loading" mode me karo
    payBtn.innerHTML = "Uploading Files & Processing... ⏳";
    payBtn.disabled = true;

    try {
        // Server ko POST request bhejo — JWT token header me bhejo verification ke liye
        const response = await fetch('https://quickprint-hub.onrender.com/api/orders', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}` // Token se prove karo ki tum valid user ho
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {

            // Success modal me order number dikhao
            document.getElementById('displayOrderNumber').innerText = `#${data.orderSerial}`;

            // --- Apna order kitne time me ready hoga, calculate karo ---
            let myOrderSeconds = 60; // Har order ka base handling time
            cartItems.forEach(item => {
                myOrderSeconds += 30;                       // File setup time
                myOrderSeconds += (item.pages * item.copies * 2); // Print time (2 sec per page)
            });
            let myOrderMinutes = Math.ceil(myOrderSeconds / 60);

            // Queue me pehle se kitna wait hai woh UI se utha lo
            let queueText = document.getElementById('waitTime').innerText.replace(' Mins', '');
            let queueMinutes = parseInt(queueText) || 0;

            // Total wait = queue me pehle se ka time + mera order ka time
            let totalWait = queueMinutes + myOrderMinutes;

            // Ready time = Abhi ka time + total wait
            const now = new Date();
            now.setMinutes(now.getMinutes() + totalWait);

            document.getElementById('displayReadyTime').innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Success popup dikhao
            document.getElementById('successModal').classList.remove('hidden');

        } else {
            alert("Error placing order: " + data.error);
        }

    } catch (error) {
        console.error("Order error:", error);
        alert("Server connection failed. Is Node.js running?");
    } finally {
        // Chahe success ho ya fail, button wapas normal karo
        payBtn.innerHTML = "Pay Securely & Confirm 💳";
        payBtn.disabled = false;
    }
}


// ============================================================
// 6. SUCCESS MODAL BAND KARNA — Order place hone ke baad
// ============================================================

function closeModal() {
    document.getElementById('successModal').classList.add('hidden'); // Modal chhupao
    cartItems = [];   // Cart khali karo
    renderCartUI();   // Screen reset karo
}


// ============================================================
// 7. LOGOUT — Session khatam karo
// ============================================================

function logout() {
    localStorage.removeItem('quickprint_token'); // JWT token hatao
    localStorage.removeItem('quickprint_user');  // User data hatao
    window.location.href = "login.html";         // Login page pe bhejo
}


// ============================================================
// 8. LIVE QUEUE — Kitne orders pending hain aur kitna wait?
// ============================================================

async function fetchLiveQueue() {
    try {
        // Server se queue ka data maango
        const response = await fetch('https://quickprint-hub.onrender.com/api/orders/queue');
        const data = await response.json();

        if (data.success) {
            const pendingOrders = data.count;         // Kitne orders pending hain
            const activeOrdersList = data.data;       // Har order ki detail

            let totalSeconds = 0;

            // Har pending order ka estimated time calculate karo
            activeOrdersList.forEach(order => {
                totalSeconds += 60; // Har order ka 1 minute base time

                order.files.forEach(file => {
                    totalSeconds += 30;                              // File setup: 30 sec
                    totalSeconds += (file.totalPages * file.copies * 2); // Print: 2 sec per page
                });
            });

            // Seconds ko minutes me badlo (upar se round karo)
            let estimatedWaitMinutes = Math.ceil(totalSeconds / 60);

            // UI me update karo
            const queueElement = document.getElementById('queueCount');
            const waitElement = document.getElementById('waitTime');

            if (queueElement) queueElement.innerText = pendingOrders;

            // Queue 0 hai toh "0 Mins", warna calculated time dikhao
            if (waitElement) {
                waitElement.innerText = pendingOrders === 0 ? "0 Mins" : `${estimatedWaitMinutes} Mins`;
            }
        }

    } catch (error) {
        console.error("Queue fetch error:", error);
    }
}
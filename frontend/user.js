// ============================================================
// QUICKPRINT - STUDENT CART & ORDER SCRIPT (user.js)
// Kya karta hai:
//   - Files upload karne pe cart mein add karo
//   - Har file ke settings (B/W, color, copies, side) dikhao
//   - Live price calculate karo
//   - Order submit karo (server pe bhejo)
//   - Live queue status fetch karo
// ============================================================

let cartItems = []; // Cart mein saari files ka array

// Print prices (per sheet)
const PRICES = {
    bw:    2,  // Black & White: ₹2
    color: 10  // Color: ₹10
};

const BASE_URL = 'https://quickprint-hub.onrender.com';

// ============================================================
// PAGE LOAD — Login check karo, phir queue fetch karo
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('quickprint_user');
    const token     = localStorage.getItem('quickprint_token');

    // Token ya user nahi → login pe bhejo
    if (!savedUser || !token) {
        window.location.href = 'index.html';
        return;
    }

    const user = JSON.parse(savedUser);

    // Admin yahan aa gaya galti se → admin page pe bhejo
    if (user.role === 'admin') {
        window.location.href = 'admin.html';
        return;
    }

    document.getElementById('userNameDisplay').innerText = `Welcome, ${user.fullName}`;

    fetchLiveQueue();                          // Pehli baar queue load karo
    setInterval(fetchLiveQueue, 10000);        // Har 10 second mein update karo
});

// ============================================================
// FILE UPLOAD — Jab user files select kare
// ============================================================
document.getElementById('fileInput').addEventListener('change', async function (e) {
    const files = e.target.files;
    if (files.length === 0) return;

    // "Upload files to see..." wala empty message hatao
    const container = document.getElementById('cartItemsContainer');
    const emptyMsg  = container.querySelector('.empty-cart-msg');
    if (emptyMsg) emptyMsg.remove();

    // Har file process karo
    for (let file of files) {
        let pages = 1;

        // PDF hai toh PDF.js se pages count karo
        if (file.type === 'application/pdf') {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
                pages = pdf.numPages;
            } catch (error) {
                // PDF count fail hua → manually daalne do
                const manual = prompt(`${file.name} ke pages count nahi ho paye.\nManually daalo:`, '1');
                pages = parseInt(manual) || 1;
            }
        }

        // Cart mein add karo
        cartItems.push({
            id:         'file_' + Date.now() + Math.floor(Math.random() * 1000),
            name:       file.name,
            pages,
            copies:     1,
            colorType:  'bw',
            printSide:  'single',
            price:      0,
            fileObject: file // Actual file object (server pe upload hoga)
        });

        renderCartUI();
    }

    e.target.value = ''; // Input reset karo taaki same file dobara select ho sake
});

// ============================================================
// CART UI — Screen pe cart dikhao
// Har item ke liye price calculate karo aur card banao
// ============================================================
function renderCartUI() {
    const container = document.getElementById('cartItemsContainer');
    container.innerHTML = '';
    let totalAmount = 0;

    // Cart khali hai
    if (cartItems.length === 0) {
        container.innerHTML = '<div class="empty-cart-msg">Upload files to see settings and live price here.</div>';
        document.getElementById('totalPrice').innerText      = '₹0.00';
        document.getElementById('payNowBtn').disabled = true;
        return;
    }

    document.getElementById('payNowBtn').disabled = false;

    // Har cart item ke liye card banao
    cartItems.forEach(item => {
        // Double side print ho toh pages aadhe sheets mein fit honge
        const sheets = item.printSide === 'double'
            ? Math.ceil(item.pages / 2)
            : item.pages;

        item.price   = sheets * PRICES[item.colorType] * item.copies;
        totalAmount += item.price;

        container.insertAdjacentHTML('beforeend', `
            <div class="file-settings-card" id="${item.id}">

                <div class="file-header">
                    <span class="file-name" title="${item.name}">📄 ${item.name}</span>
                    <span class="page-badge">${item.pages} Pages</span>
                </div>

                <!-- B/W ya Color choose karo -->
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

                <!-- Copies input aur price -->
                <div class="copies-wrapper">
                    <div>
                        <label style="font-size:0.8rem;font-weight:600;">Copies:</label>
                        <input type="number" class="copies-input" value="${item.copies}" min="1" max="50"
                               onchange="updateCopies('${item.id}', this.value)">
                    </div>
                    <div class="file-price">₹${item.price.toFixed(2)}</div>
                </div>

                <button class="btn-outline" style="width:100%;margin-top:10px;padding:4px;"
                        onclick="removeItem('${item.id}')">Remove File</button>
            </div>
        `);
    });

    document.getElementById('totalPrice').innerText = `₹${totalAmount.toFixed(2)}`;
}

// Setting update karo (colorType ya printSide)
function updateSetting(id, settingName, value) {
    const index = cartItems.findIndex(x => x.id === id);
    if (index > -1) {
        cartItems[index][settingName] = value;
        renderCartUI();
    }
}

// Copies update karo
function updateCopies(id, value) {
    let copies = parseInt(value);
    if (copies < 1 || isNaN(copies)) copies = 1;

    const index = cartItems.findIndex(x => x.id === id);
    if (index > -1) {
        cartItems[index].copies = copies;
        renderCartUI();
    }
}

// Item cart se hatao
function removeItem(id) {
    cartItems = cartItems.filter(x => x.id !== id);
    renderCartUI();
}

// ============================================================
// PAYMENT — "Pay & Confirm" button click
// Files + order data server pe bhejo
// ============================================================
async function processPayment() {
    // Pehle payment modal dikhao
    const total = cartItems.reduce((sum, item) => sum + item.price, 0);
    document.getElementById('paymentAmountDisplay').innerText = `₹${total.toFixed(2)}`;
    document.getElementById('paymentModal').classList.remove('hidden');
    return; // Yahaan rok do — payVia() se aage chalega

}    

// Success modal band karo aur cart reset karo
function closeModal() {
    document.getElementById('successModal').classList.add('hidden');
    cartItems = [];
    renderCartUI();
}

// Logout — sab clear karo aur login pe bhejo
function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// ============================================================
// LIVE QUEUE — Kitne orders queue mein hain
// Har 10 second mein call hota hai (DOMContentLoaded se)
// ============================================================
async function fetchLiveQueue() {
    const token = localStorage.getItem('quickprint_token');

    try {
        const res = await fetch(`${BASE_URL}/api/orders/queue-count`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // Token expire ho gaya → login pe bhejo
        if (res.status === 401 || res.status === 403) {
            localStorage.clear();
            window.location.href = 'index.html';
            return;
        }

        const data = await res.json();

        if (data.success) {
            // Queue ki estimated wait time calculate karo
            let totalSeconds = 0;
            data.waitData.forEach(order => {
                totalSeconds += 60; // Base time per order
                order.files.forEach(file => {
                    totalSeconds += 30 + (file.totalPages * file.copies * 2);
                });
            });

            document.getElementById('queueCount').innerText = data.count;
            document.getElementById('waitTime').innerText   =
                data.count === 0 ? '0 Mins' : `${Math.ceil(totalSeconds / 60)} Mins`;
        }

    } catch (err) {
        console.error('Queue fetch error:', err);
    }
}






// Payment app kholo
function payVia(method) {
    const total = cartItems.reduce((sum, item) => sum + item.price, 0);
    
    if (method === 'phonepe') {
        // PhonePe UPI deep link
        window.open(`phonepe://pay?pa=YOUR_UPI_ID&pn=QuickPrint&am=${total}&cu=INR`, '_blank');
    } else {
        // Google Pay UPI deep link  
        window.open(`tez://upi/pay?pa=YOUR_UPI_ID&pn=QuickPrint&am=${total}&cu=INR`, '_blank');
    }

    // 2 second baad automatically order submit karo
    document.getElementById('paymentModal').classList.add('hidden');
    setTimeout(() => submitOrder(), 2000);
}

function closePaymentModal() {
    document.getElementById('paymentModal').classList.add('hidden');
}


async function submitOrder() {
    const token  = localStorage.getItem('quickprint_token');
    const payBtn = document.getElementById('payNowBtn');
    const total  = cartItems.reduce((sum, item) => sum + item.price, 0);

    const formData = new FormData();
    formData.append('orderData', JSON.stringify({
        totalAmount: total,
        filesConfig: cartItems.map(item => ({
            fileName:         item.name,
            totalPages:       item.pages,
            copies:           item.copies,
            colorType:        item.colorType,
            printSide:        item.printSide,
            priceForThisFile: item.price
        }))
    }));
    cartItems.forEach(item => formData.append('actualFiles', item.fileObject));

    payBtn.innerHTML = 'Uploading & Processing... ⏳';
    payBtn.disabled  = true;

    try {
        const res = await fetch(`${BASE_URL}/api/orders`, {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body:    formData
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('displayOrderNumber').innerText = `#${data.orderSerial}`;

            let waitSeconds = 60;
            cartItems.forEach(item => {
                waitSeconds += 30 + (item.pages * item.copies * 2);
            });
            const queueMins = parseInt(document.getElementById('waitTime').innerText) || 0;
            const readyTime = new Date();
            readyTime.setMinutes(readyTime.getMinutes() + queueMins + Math.ceil(waitSeconds / 60));
            document.getElementById('displayReadyTime').innerText =
                readyTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            document.getElementById('successModal').classList.remove('hidden');
        } else {
            alert('Order error: ' + data.error);
        }
    } catch (err) {
        alert('Server connection failed.');
    } finally {
        payBtn.innerHTML = 'Pay Securely & Confirm 💳';
        payBtn.disabled  = false;
    }
}
// ============================================================
// QUICKPRINT - STUDENT CART & ORDER SCRIPT
// Changes:
// - naam localStorage se aata hai (user.name)
// - queue fetch: /api/orders/queue-count use karta hai
// - order mein userId nahi — naam/phone JWT se aata hai
// ============================================================

let cartItems = [];
const PRICES  = { bw: 2, color: 10 };


// ============================================================
// PAGE LOAD
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('quickprint_user');
    if (!savedUser) {
        alert('Please login first!');
        window.location.href = 'index.html';
        return;
    }

    const user = JSON.parse(savedUser);
    // naam localStorage se — Jo login ke waqt save hua tha
    document.getElementById('userNameDisplay').innerText = `Welcome, ${user.name || user.fullName}`;

    fetchLiveQueue();
    setInterval(fetchLiveQueue, 10000);
});


// ============================================================
// FILE UPLOAD
// ============================================================
document.getElementById('fileInput').addEventListener('change', async function (e) {
    const files = e.target.files;
    if (files.length === 0) return;

    const container = document.getElementById('cartItemsContainer');
    const emptyMsg  = container.querySelector('.empty-cart-msg');
    if (emptyMsg) emptyMsg.remove();

    for (let file of files) {
        let pages = 1;

        if (file.type === 'application/pdf') {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf         = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
                pages = pdf.numPages;
            } catch (error) {
                const manual = prompt(`${file.name} ka pages count nahi ho paya.\nManually pages count daalo:`, '1');
                pages = parseInt(manual) || 1;
            }
        }

        cartItems.push({
            id:         'file_' + Date.now() + Math.floor(Math.random() * 1000),
            name:       file.name,
            pages,
            copies:     1,
            colorType:  'bw',
            printSide:  'single',
            price:      0,
            fileObject: file
        });

        renderCartUI();
    }

    e.target.value = '';
});


// ============================================================
// CART UI
// ============================================================
function renderCartUI() {
    const container = document.getElementById('cartItemsContainer');
    container.innerHTML = '';
    let totalAmount = 0;

    if (cartItems.length === 0) {
        container.innerHTML = '<div class="empty-cart-msg">Upload files to see settings and live price here.</div>';
        document.getElementById('totalPrice').innerText   = '₹0.00';
        document.getElementById('payNowBtn').disabled = true;
        return;
    }

    document.getElementById('payNowBtn').disabled = false;

    cartItems.forEach(item => {
        const sheets  = item.printSide === 'double' ? Math.ceil(item.pages / 2) : item.pages;
        item.price    = sheets * PRICES[item.colorType] * item.copies;
        totalAmount  += item.price;

        container.insertAdjacentHTML('beforeend', `
            <div class="file-settings-card" id="${item.id}">
                <div class="file-header">
                    <span class="file-name" title="${item.name}">📄 ${item.name}</span>
                    <span class="page-badge">${item.pages} Pages</span>
                </div>
                <div class="options-row">
                    <div class="option-block ${item.colorType === 'bw' ? 'active' : ''}"
                         onclick="updateSetting('${item.id}', 'colorType', 'bw')">B/W (₹2)</div>
                    <div class="option-block ${item.colorType === 'color' ? 'active' : ''}"
                         onclick="updateSetting('${item.id}', 'colorType', 'color')">Color (₹10)</div>
                </div>
                <div class="options-row">
                    <div class="option-block ${item.printSide === 'single' ? 'active' : ''}"
                         onclick="updateSetting('${item.id}', 'printSide', 'single')">Single Side</div>
                    <div class="option-block ${item.printSide === 'double' ? 'active' : ''}"
                         onclick="updateSetting('${item.id}', 'printSide', 'double')">Double Side</div>
                </div>
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


// ============================================================
// SETTINGS
// ============================================================
function updateSetting(id, type, value) {
    const i = cartItems.findIndex(x => x.id === id);
    if (i > -1) { cartItems[i][type] = value; renderCartUI(); }
}

function updateCopies(id, value) {
    let copies = parseInt(value);
    if (copies < 1 || isNaN(copies)) copies = 1;
    const i = cartItems.findIndex(x => x.id === id);
    if (i > -1) { cartItems[i].copies = copies; renderCartUI(); }
}

function removeItem(id) {
    cartItems = cartItems.filter(x => x.id !== id);
    renderCartUI();
}


// ============================================================
// PAYMENT
// ============================================================
async function processPayment() {
    const token   = localStorage.getItem('quickprint_token');
    const payBtn  = document.getElementById('payNowBtn');
    const total   = cartItems.reduce((s, i) => s + i.price, 0);

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
        const res  = await fetch('https://quickprint-hub.onrender.com/api/orders', {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body:    formData
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('displayOrderNumber').innerText = `#${data.orderSerial}`;

            // Ready time calculate
            let secs = 60;
            cartItems.forEach(i => { secs += 30 + (i.pages * i.copies * 2); });
            const queueMins = parseInt(document.getElementById('waitTime').innerText) || 0;
            const readyTime = new Date();
            readyTime.setMinutes(readyTime.getMinutes() + queueMins + Math.ceil(secs / 60));
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


// ============================================================
// MODAL CLOSE
// ============================================================
function closeModal() {
    document.getElementById('successModal').classList.add('hidden');
    cartItems = [];
    renderCartUI();
}


// ============================================================
// LOGOUT
// ============================================================
function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}


// ============================================================
// LIVE QUEUE — Sirf count + wait time (naam/files nahi)
// ============================================================
async function fetchLiveQueue() {
    const token = localStorage.getItem('quickprint_token');

    try {
        const res  = await fetch('https://quickprint-hub.onrender.com/api/orders/queue-count', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            let secs = 0;
            data.waitData.forEach(o => {
                secs += 60;
                o.files.forEach(f => { secs += 30 + (f.totalPages * f.copies * 2); });
            });

            document.getElementById('queueCount').innerText =
                data.count;
            document.getElementById('waitTime').innerText   =
                data.count === 0 ? '0 Mins' : `${Math.ceil(secs / 60)} Mins`;
        }
    } catch (err) {
        console.error('Queue error:', err);
    }
}
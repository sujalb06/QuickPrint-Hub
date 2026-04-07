// ============================================================
// QUICKPRINT - STUDENT CART & ORDER SCRIPT
// Change: fetchLiveQueue mein token add kiya (queue protected)
// ============================================================


// --- GLOBAL VARIABLES ---
let cartItems = [];
const PRICES = { bw: 2, color: 10 };


// ============================================================
// 1. PAGE LOAD — Login check
// ============================================================
document.addEventListener('DOMContentLoaded', () => {

    const savedUser = localStorage.getItem('quickprint_user');
    if (!savedUser) {
        alert("Please login first!");
        window.location.href = "index.html";
        return;
    }

    const user = JSON.parse(savedUser);
    document.getElementById('userNameDisplay').innerText = `Welcome, ${user.fullName}`;

    fetchLiveQueue();
    setInterval(fetchLiveQueue, 10000);
});


// ============================================================
// 2. FILE UPLOAD
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
                const typedarray  = new Uint8Array(arrayBuffer);
                const pdf         = await pdfjsLib.getDocument({ data: typedarray }).promise;
                pages = pdf.numPages;
            } catch (error) {
                console.error("PDF Read Error:", error);
                let manualPages = prompt(`Could not read ${file.name} automatically.\nPlease enter total pages manually:`, "1");
                pages = parseInt(manualPages) || 1;
            }
        }

        const fileId = 'file_' + Date.now() + Math.floor(Math.random() * 1000);

        cartItems.push({
            id:         fileId,
            name:       file.name,
            pages:      pages,
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
// 3. CART UI BANANA
// ============================================================
function renderCartUI() {
    const container = document.getElementById('cartItemsContainer');
    container.innerHTML = '';
    let totalAmount = 0;

    if (cartItems.length === 0) {
        container.innerHTML = '<div class="empty-cart-msg">Upload files to see settings and live price here.</div>';
        document.getElementById('totalPrice').innerText = '₹0.00';
        document.getElementById('payNowBtn').disabled = true;
        return;
    }

    document.getElementById('payNowBtn').disabled = false;

    cartItems.forEach(item => {
        let sheetsUsed = item.printSide === 'double' ? Math.ceil(item.pages / 2) : item.pages;
        item.price     = sheetsUsed * PRICES[item.colorType] * item.copies;
        totalAmount   += item.price;

        const fileHtml = `
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
                        <label style="font-size:0.8rem; font-weight:600;">Copies:</label>
                        <input type="number" class="copies-input" value="${item.copies}" min="1" max="50"
                               onchange="updateCopies('${item.id}', this.value)">
                    </div>
                    <div class="file-price">₹${item.price.toFixed(2)}</div>
                </div>
                <button class="btn-outline" style="width:100%; margin-top:10px; padding:4px;"
                        onclick="removeItem('${item.id}')">Remove File</button>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', fileHtml);
    });

    document.getElementById('totalPrice').innerText = `₹${totalAmount.toFixed(2)}`;
}


// ============================================================
// 4. SETTINGS CHANGE KARNA
// ============================================================
function updateSetting(id, settingType, value) {
    const itemIndex = cartItems.findIndex(i => i.id === id);
    if (itemIndex > -1) {
        cartItems[itemIndex][settingType] = value;
        renderCartUI();
    }
}

function updateCopies(id, value) {
    let copies = parseInt(value);
    if (copies < 1 || isNaN(copies)) copies = 1;

    const itemIndex = cartItems.findIndex(i => i.id === id);
    if (itemIndex > -1) {
        cartItems[itemIndex].copies = copies;
        renderCartUI();
    }
}

function removeItem(id) {
    cartItems = cartItems.filter(i => i.id !== id);
    renderCartUI();
}


// ============================================================
// 5. PAYMENT & ORDER PLACE KARNA
// ============================================================
async function processPayment() {
    const user     = JSON.parse(localStorage.getItem('quickprint_user'));
    const token    = localStorage.getItem('quickprint_token');
    const payBtn   = document.getElementById('payNowBtn');
    let finalAmount = cartItems.reduce((sum, item) => sum + item.price, 0);

    const formData     = new FormData();
    const orderDetails = {
        userId:      user._id,
        totalAmount: finalAmount,
        filesConfig: cartItems.map(item => ({
            fileName:         item.name,
            totalPages:       item.pages,
            copies:           item.copies,
            colorType:        item.colorType,
            printSide:        item.printSide,
            priceForThisFile: item.price
        }))
    };

    formData.append('orderData', JSON.stringify(orderDetails));
    cartItems.forEach(item => {
        formData.append('actualFiles', item.fileObject);
    });

    payBtn.innerHTML = "Uploading Files & Processing... ⏳";
    payBtn.disabled  = true;

    try {
        const response = await fetch('https://quickprint-hub.onrender.com/api/orders', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('displayOrderNumber').innerText = `#${data.orderSerial}`;

            let myOrderSeconds = 60;
            cartItems.forEach(item => {
                myOrderSeconds += 30;
                myOrderSeconds += (item.pages * item.copies * 2);
            });
            let myOrderMinutes = Math.ceil(myOrderSeconds / 60);

            let queueText    = document.getElementById('waitTime').innerText.replace(' Mins', '');
            let queueMinutes = parseInt(queueText) || 0;
            let totalWait    = queueMinutes + myOrderMinutes;

            const now = new Date();
            now.setMinutes(now.getMinutes() + totalWait);
            document.getElementById('displayReadyTime').innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            document.getElementById('successModal').classList.remove('hidden');

        } else {
            alert("Error placing order: " + data.error);
        }

    } catch (error) {
        console.error("Order error:", error);
        alert("Server connection failed.");
    } finally {
        payBtn.innerHTML = "Pay Securely & Confirm 💳";
        payBtn.disabled  = false;
    }
}


// ============================================================
// 6. SUCCESS MODAL BAND KARNA
// ============================================================
function closeModal() {
    document.getElementById('successModal').classList.add('hidden');
    cartItems = [];
    renderCartUI();
}


// ============================================================
// 7. LOGOUT
// ============================================================
function logout() {
    localStorage.removeItem('quickprint_token');
    localStorage.removeItem('quickprint_user');
    window.location.href = "index.html";
}


// ============================================================
// 8. LIVE QUEUE — Student ke liye queue count
// Note: Sirf count aur wait time dikhana hai — full data nahi
// ============================================================
async function fetchLiveQueue() {
    const token = localStorage.getItem('quickprint_token');

    try {
        const response = await fetch('https://quickprint-hub.onrender.com/api/orders/queue-count', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();

        if (data.success) {
            const pendingOrders = data.count;

            let totalSeconds = 0;
            data.waitData.forEach(order => {
                totalSeconds += 60;
                order.files.forEach(file => {
                    totalSeconds += 30;
                    totalSeconds += (file.totalPages * file.copies * 2);
                });
            });

            let estimatedWaitMinutes = Math.ceil(totalSeconds / 60);

            const queueElement = document.getElementById('queueCount');
            const waitElement  = document.getElementById('waitTime');

            if (queueElement) queueElement.innerText = pendingOrders;
            if (waitElement)  waitElement.innerText  = pendingOrders === 0 ? "0 Mins" : `${estimatedWaitMinutes} Mins`;
        }

    } catch (error) {
        console.error("Queue fetch error:", error);
    }
}
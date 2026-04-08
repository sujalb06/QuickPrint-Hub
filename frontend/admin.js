// ============================================================
// QUICKPRINT - ADMIN DASHBOARD SCRIPT (admin.js)
// Kya karta hai:
//   - Admin ka login verify karo (localStorage + backend)
//   - Queue ke orders dikhao (har 8 second mein auto-refresh)
//   - File download/view karo (fetch + Blob se, token ke saath)
//   - Order complete karo ya history clear karo
// ============================================================

let activeOrders         = [];  // Abhi queue mein jo orders hain
let completedOrdersCount = 0;   // Aaj kitne complete hue
let totalOrdersEver      = 0;   // Total count (active + completed)
let todayRevenue         = 0;   // Aaj ki kamaai
let autoRefreshInterval  = null; // setInterval ka reference (clear karne ke liye)

const BASE_URL = 'https://quickprint-hub.onrender.com';

// ============================================================
// PAGE LOAD — Login check karo, phir queue load karo
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const savedUser = localStorage.getItem('quickprint_user');
    const token     = localStorage.getItem('quickprint_token');

    // LocalStorage mein nahi hai → login pe bhejo
    if (!savedUser || !token) {
        window.location.href = 'index.html';
        return;
    }

    const user = JSON.parse(savedUser);

    // Role check (fast check — localStorage se)
    if (user.role !== 'admin') {
        alert('Access Denied! Only Admins have access to view the page.');
        window.location.href = 'index.html';
        return;
    }

    // Backend se bhi verify karo — token actually valid hai ya nahi
    // (LocalStorage mein role change karke bypass rokne ke liye)
    const isValid = await verifyTokenWithBackend(token);
    if (!isValid) {
        localStorage.clear();
        window.location.href = 'index.html';
        return;
    }

    await fetchLiveQueue();  // Pehli baar orders load karo
    startAutoRefresh();      // Auto-refresh shuru karo
});

// ============================================================
// BACKEND TOKEN VERIFY — Ek API call se token check karo
// Agar server down hai toh allow karo (offline case)
// ============================================================
async function verifyTokenWithBackend(token) {
    try {
        const res = await fetch(`${BASE_URL}/api/orders/queue`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        // 401 = token invalid, 403 = admin nahi
        return res.status !== 401 && res.status !== 403;
    } catch (e) {
        return true; // Server down → allow karo
    }
}

// ============================================================
// AUTO-REFRESH — Har 8 second mein silently queue update
// ============================================================
function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval); // Pehle se chal raha tha toh band karo

    autoRefreshInterval = setInterval(async () => {
        await fetchLiveQueue(true); // true = silent mode (error pe alert nahi)
    }, 8000);
}

// ============================================================
// QUEUE FETCH — Server se active orders lo
// silent = true hoga toh error pe alert nahi aayega
// ============================================================
async function fetchLiveQueue(silent = false) {
    const token = localStorage.getItem('quickprint_token');

    try {
        const res = await fetch(`${BASE_URL}/api/orders/queue`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // Token expire → logout karo
        if (res.status === 401 || res.status === 403) {
            clearInterval(autoRefreshInterval);
            localStorage.clear();
            window.location.href = 'index.html';
            return;
        }

        const data = await res.json();

        if (data.success) {
            // Server ka data → apne format mein convert karo
            activeOrders = data.data.map(dbOrder => ({
                _id:         dbOrder._id,          // MongoDB ID (complete/delete ke liye)
                id:          dbOrder.orderSerial,   // Dikhne wala number (0001)
                time:        new Date(dbOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                studentName: dbOrder.studentName,
                phone:       dbOrder.studentPhone,
                files:       dbOrder.files.map(f => ({
                    name:     f.fileName,
                    pages:    f.totalPages,
                    color:    f.colorType,
                    side:     f.printSide,
                    copies:   f.copies,
                    filename: f.fileUrl  // Sirf filename — fetch ke liye kaam aayega
                })),
                total: dbOrder.totalAmount
            }));

            totalOrdersEver = activeOrders.length + completedOrdersCount;

            // Search filter maintain karo — apne aap clear na ho
            renderOrders(document.getElementById('searchOrder').value);
            updateStats();
        }

    } catch (error) {
        if (!silent) alert('Server se orders load nahi ho paye!');
        console.error('Queue fetch error:', error);
    }
}

// ============================================================
// ORDERS RENDER — Screen pe order cards dikhao
// Smart update: Sirf naye orders add karo, poora re-render nahi
// (Flickering rokne ke liye — auto-refresh pe kaam aata hai)
// ============================================================
function renderOrders(filterText = '') {
    const container = document.getElementById('ordersContainer');

    // Search filter apply karo
    const filtered = activeOrders.filter(order =>
        order.id.includes(filterText) ||
        order.studentName.toLowerCase().includes(filterText.toLowerCase())
    );

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color:#64748b;text-align:center;width:100%;grid-column:1/-1;padding:40px 0;">No active orders right now. Time to relax! ☕</p>';
        return;
    }

    // Screen pe abhi kaunse cards hain
    const existingIds = new Set([...container.querySelectorAll('.order-card')].map(c => c.id));
    // Naye data mein kaunse hone chahiye
    const newIds      = new Set(filtered.map(o => `order-${o.id}`));

    // Jo orders complete ho gaye unke cards hatao
    existingIds.forEach(cardId => {
        if (!newIds.has(cardId)) {
            const el = document.getElementById(cardId);
            if (el) el.remove();
        }
    });

    // Naye orders ke cards add karo (jo pehle se hain unhe skip karo)
    filtered.forEach(order => {
        if (existingIds.has(`order-${order.id}`)) return; // Pehle se screen pe hai

        // Is order ki files ka HTML banao
        const filesHtml = order.files.map(file => `
            <div class="file-item-stacked">
                <div class="file-line-1">
                    📄 <strong>${file.name}</strong>
                    <span style="color:#64748b;font-size:0.85rem;">(${file.pages} Pgs)</span>
                </div>
                <div class="file-line-2">
                    <span class="badge badge-${file.color === 'bw' ? 'bw' : 'color'}">${file.color.toUpperCase()}</span>
                    <span class="badge badge-${file.side === 'single' ? 'single' : 'double'}">${file.side === 'single' ? 'Single' : 'Double'}</span>
                    <span class="badge-qty">Qty: ${file.copies || 1}</span>
                </div>
                <div class="file-line-3">
                    <!-- Button use kiya hai <a href> ki jagah -->
                    <!-- Kyunki <a href> se Authorization header nahi jaata -->
                    <!-- openFile() function fetch() se token bhejta hai -->
                    <button class="btn-download-small" onclick="openFile('${file.filename}')">
                        ⬇️ Download / View
                    </button>
                </div>
            </div>
        `).join('');

        // Order card HTML
        container.insertAdjacentHTML('beforeend', `
            <div class="order-card" id="order-${order.id}">
                <div class="order-header">
                    <span class="order-number">#${order.id}</span>
                    <span class="order-time">${order.time}</span>
                </div>
                <div class="student-info">
                    <strong>Student:</strong> ${order.studentName}<br>
                    <strong>Phone:</strong> ${order.phone}
                </div>
                <div class="file-details">${filesHtml}</div>
                <div class="order-footer">
                    <span class="total-bill">₹${order.total.toFixed(2)}</span>
                    <button class="btn-success" onclick="markComplete('${order._id}', '${order.id}')">
                        Print & Complete ✅
                    </button>
                </div>
            </div>
        `);
    });
}

// ============================================================
// FILE OPEN — Token ke saath file fetch karo, new tab mein kholo
// Kyunki <a href="..."> se Authorization header nahi jaata
// Isliye fetch() se file lo → Blob banao → Object URL → new tab
// ============================================================
async function openFile(filename) {
    const token = localStorage.getItem('quickprint_token');
    const btn   = event.target;

    btn.innerHTML = '⏳ Loading...';
    btn.disabled  = true;

    try {
        const res = await fetch(`${BASE_URL}/api/files/${filename}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.error || 'Unable to open the file.');
            return;
        }

        // Response ko binary data (Blob) mein convert karo
        const blob = await res.blob();
        // Blob ka temporary browser URL banao
        const objectUrl = URL.createObjectURL(blob);

        window.open(objectUrl, '_blank'); // New tab mein kholo

        // 1 minute baad ye temporary URL free karo (memory bachao)
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

    } catch (error) {
        alert('Error opening the file.');
        console.error('File open error:', error);
    } finally {
        btn.innerHTML = '⬇️ Download / View';
        btn.disabled  = false;
    }
}

// ============================================================
// STATS UPDATE — Top cards update karo
// ============================================================
function updateStats() {
    document.getElementById('totalOrdersCount').innerText  = totalOrdersEver;
    document.getElementById('pendingQueueCount').innerText = activeOrders.length;
    document.getElementById('completedCount').innerText    = completedOrdersCount;

    const revenueEl = document.getElementById('revenueCount');
    if (revenueEl) revenueEl.innerText = `₹${todayRevenue.toFixed(2)}`;
}

// ============================================================
// ORDER COMPLETE — "Print & Complete" button click
// ============================================================
async function markComplete(dbId, serialNum) {
    const token = localStorage.getItem('quickprint_token');

    try {
        const res = await fetch(`${BASE_URL}/api/orders/${dbId}/complete`, {
            method:  'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            // Revenue mein add karo
            const completedOrder = activeOrders.find(o => o._id === dbId);
            if (completedOrder) todayRevenue += completedOrder.total;

            completedOrdersCount++;
            alert(`Order #${serialNum} Completed! ✅`);
            await fetchLiveQueue(); // Queue refresh karo
        }
    } catch (error) {
        console.error('Complete error:', error);
    }
}

// ============================================================
// CLEAR HISTORY — Saara data delete karo (naye din ke liye reset)
// ============================================================
async function clearOrderHistory() {
    const token = localStorage.getItem('quickprint_token');
    if (!confirm('⚠️ All orders will be cleared. Are you sure?')) return;

    try {
        const res = await fetch(`${BASE_URL}/api/orders/clear`, {
            method:  'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            // Local counts reset karo
            completedOrdersCount = 0;
            totalOrdersEver      = 0;
            todayRevenue         = 0;
            document.getElementById('searchOrder').value = '';
            await fetchLiveQueue();
            alert('System reset! Ready for new day');
        }
    } catch (error) {
        console.error('Clear error:', error);
    }
}

// ============================================================
// SEARCH — Type karo toh filter ho
// ============================================================
document.getElementById('searchOrder').addEventListener('input', e => {
    renderOrders(e.target.value);
});

// ============================================================
// LOGOUT — Auto-refresh band karo, localStorage clear karo
// ============================================================
function logoutAdmin() {
    clearInterval(autoRefreshInterval);
    localStorage.clear();
    window.location.href = 'index.html';
}
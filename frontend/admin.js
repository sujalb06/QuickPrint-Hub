// ============================================================
// QUICKPRINT - ADMIN DASHBOARD SCRIPT
// Fixes:
// 1. Bina login ke access ho raha tha — backend verify lagaya
// 2. File download — fetch + Blob se khulegi (token ke saath)
// 3. Auto-refresh — setInterval se har 8 second mein silently
// ============================================================

let activeOrders         = [];
let completedOrdersCount = 0;
let totalOrdersEver      = 0;
let todayRevenue         = 0;
let autoRefreshInterval  = null;

const BASE_URL = 'https://quickprint-hub.onrender.com';

// ============================================================
// PAGE LOAD — Strict login check
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const savedUser = localStorage.getItem('quickprint_user');
    const token     = localStorage.getItem('quickprint_token');

    // LocalStorage mein nahi — seedha login pe
    if (!savedUser || !token) {
        window.location.href = 'index.html';
        return;
    }

    const user = JSON.parse(savedUser);

    // LocalStorage role check (fast check)
    if (user.role !== 'admin') {
        alert('Access Denied! Sirf shopkeeper yeh page dekh sakta hai.');
        window.location.href = 'index.html';
        return;
    }

    // Backend se bhi verify karo — token sahi hai ya nahi
    // Ye FIX hai: pehle sirf localStorage check tha jo hack ho sakta tha
    const valid = await verifyTokenWithBackend(token);
    if (!valid) {
        localStorage.clear();
        window.location.href = 'index.html';
        return;
    }

    // Sab theek — queue load karo aur auto-refresh shuru karo
    await fetchLiveQueue();
    startAutoRefresh();
});

// ============================================================
// BACKEND TOKEN VERIFY — Ek simple API call se check
// ============================================================
async function verifyTokenWithBackend(token) {
    try {
        const res = await fetch(`${BASE_URL}/api/orders/queue`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        // 401/403 = token invalid ya admin nahi
        return res.status !== 401 && res.status !== 403;
    } catch (e) {
        // Server down hai — allow karo (offline case)
        return true;
    }
}

// ============================================================
// AUTO-REFRESH — Har 8 second mein silently queue update
// Bina page refresh ke — sirf naye orders aane pe UI update hoga
// ============================================================
function startAutoRefresh() {
    // Pehle clear karo agar pehle se chal raha tha
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);

    autoRefreshInterval = setInterval(async () => {
        await fetchLiveQueue(true); // true = silent (no alert on error)
    }, 8000); // 8 second
}

// ============================================================
// QUEUE FETCH
// silent = true hoga toh error pe alert nahi aayega
// ============================================================
async function fetchLiveQueue(silent = false) {
    const token = localStorage.getItem('quickprint_token');

    try {
        const response = await fetch(`${BASE_URL}/api/orders/queue`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401 || response.status === 403) {
            clearInterval(autoRefreshInterval);
            localStorage.clear();
            window.location.href = 'index.html';
            return;
        }

        const data = await response.json();

        if (data.success) {
            activeOrders = data.data.map(dbOrder => ({
                _id:         dbOrder._id,
                id:          dbOrder.orderSerial,
                time:        new Date(dbOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                studentName: dbOrder.studentName,
                phone:       dbOrder.studentPhone,
                files:       dbOrder.files.map(f => ({
                    name:     f.fileName,
                    pages:    f.totalPages,
                    color:    f.colorType,
                    side:     f.printSide,
                    copies:   f.copies,
                    filename: f.fileUrl  // Sirf filename — URL fetch() se banega
                })),
                total: dbOrder.totalAmount
            }));

            totalOrdersEver = activeOrders.length + completedOrdersCount;
            renderOrders(document.getElementById('searchOrder').value); // Search filter maintain karo
            updateStats();
        }

    } catch (error) {
        if (!silent) alert('Server se orders load nahi ho paye!');
        console.error('Queue fetch error:', error);
    }
}

// ============================================================
// ORDERS RENDER
// ============================================================
function renderOrders(filterText = '') {
    const container = document.getElementById('ordersContainer');

    const filtered = activeOrders.filter(order =>
        order.id.includes(filterText) ||
        order.studentName.toLowerCase().includes(filterText.toLowerCase())
    );

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color:#64748b;text-align:center;width:100%;grid-column:1/-1;padding:40px 0;">No active orders right now. Time to relax! ☕</p>';
        return;
    }

    // Sirf naye/changed cards update karo — poora innerHTML replace nahi
    // Ye flickering rokta hai auto-refresh pe
    const existingIds = new Set([...container.querySelectorAll('.order-card')].map(c => c.id));
    const newIds      = new Set(filtered.map(o => `order-${o.id}`));

    // Hata diye gaye orders remove karo
    existingIds.forEach(id => {
        if (!newIds.has(id)) {
            const el = document.getElementById(id);
            if (el) el.remove();
        }
    });

    // Naye orders add karo
    filtered.forEach(order => {
        if (existingIds.has(`order-${order.id}`)) return; // Pehle se hai — skip

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
                    <!-- 
                        FIX: <a href="..."> ki jagah button use kiya
                        Kyunki browser Authorization header nahi bhej sakta <a> tag se
                        openFile() function fetch() se Blob banata hai aur new tab mein kholta hai
                    -->
                    <button class="btn-download-small" onclick="openFile('${file.filename}')">
                        ⬇️ Download / View
                    </button>
                </div>
            </div>
        `).join('');

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
// FILE OPEN — fetch() + Blob = new tab mein khulegi
// Ye FIX hai: <a href="url"> se token nahi jaata
// Yahan hum fetch() se token bhejte hain, response ko Blob banate hain
// Blob ka Object URL new tab mein khol dete hain
// ============================================================
async function openFile(filename) {
    const token = localStorage.getItem('quickprint_token');
    const btn   = event.target; // Kaunsa button click hua

    btn.innerHTML = '⏳ Loading...';
    btn.disabled  = true;

    try {
        const response = await fetch(`${BASE_URL}/api/files/${filename}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            alert(err.error || 'File open nahi ho payi.');
            return;
        }

        // Response ko Blob (binary data) mein convert karo
        const blob      = await response.blob();
        // Blob ka temporary URL banao
        const objectUrl = URL.createObjectURL(blob);

        // New tab mein kholo
        window.open(objectUrl, '_blank');

        // 1 minute baad temporary URL free karo
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

    } catch (error) {
        alert('File open karne mein error aaya.');
        console.error('File open error:', error);
    } finally {
        btn.innerHTML = '⬇️ Download / View';
        btn.disabled  = false;
    }
}

// ============================================================
// STATS UPDATE
// ============================================================
function updateStats() {
    document.getElementById('totalOrdersCount').innerText  = totalOrdersEver;
    document.getElementById('pendingQueueCount').innerText = activeOrders.length;
    document.getElementById('completedCount').innerText    = completedOrdersCount;
    const rev = document.getElementById('revenueCount');
    if (rev) rev.innerText = `₹${todayRevenue.toFixed(2)}`;
}

// ============================================================
// ORDER COMPLETE
// ============================================================
async function markComplete(dbId, serialNum) {
    const token = localStorage.getItem('quickprint_token');

    try {
        const response = await fetch(`${BASE_URL}/api/orders/${dbId}/complete`, {
            method:  'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            const done = activeOrders.find(o => o._id === dbId);
            if (done) todayRevenue += done.total;
            completedOrdersCount++;
            alert(`Order #${serialNum} Completed! ✅`);
            await fetchLiveQueue();
        }
    } catch (error) {
        console.error('Complete error:', error);
    }
}

// ============================================================
// CLEAR HISTORY
// ============================================================
async function clearOrderHistory() {
    const token = localStorage.getItem('quickprint_token');
    if (!confirm('⚠️ Saare orders clear ho jaayenge. Sure ho?')) return;

    try {
        const response = await fetch(`${BASE_URL}/api/orders/clear`, {
            method:  'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            completedOrdersCount = 0;
            totalOrdersEver      = 0;
            todayRevenue         = 0;
            document.getElementById('searchOrder').value = '';
            await fetchLiveQueue();
            alert('System reset! Ready for new day 🌅');
        }
    } catch (error) {
        console.error('Clear error:', error);
    }
}

// ============================================================
// SEARCH
// ============================================================
document.getElementById('searchOrder').addEventListener('input', e => {
    renderOrders(e.target.value);
});

// ============================================================
// LOGOUT
// ============================================================
function logoutAdmin() {
    clearInterval(autoRefreshInterval);
    localStorage.clear();
    window.location.href = 'index.html';
}
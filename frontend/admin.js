// ============================================================
// QUICKPRINT - ADMIN DASHBOARD SCRIPT
// Change: studentName/studentPhone ab order mein directly hai
// (pehle userId.fullName tha — ab nahi)
// ============================================================

let activeOrders       = [];
let completedOrdersCount = 0;
let totalOrdersEver    = 0;
let todayRevenue       = 0;


// ============================================================
// PAGE LOAD
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('quickprint_user');
    const token     = localStorage.getItem('quickprint_token');

    if (!savedUser || !token) {
        window.location.href = 'index.html';
        return;
    }

    const user = JSON.parse(savedUser);
    if (user.role !== 'admin') {
        alert('Access Denied!');
        window.location.href = 'index.html';
        return;
    }

    fetchLiveQueue();
});


// ============================================================
// QUEUE FETCH — Token ke saath
// ============================================================
async function fetchLiveQueue() {
    const token = localStorage.getItem('quickprint_token');

    try {
        const response = await fetch('https://quickprint-hub.onrender.com/api/orders/queue', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // Token expire — login pe bhejo
        if (response.status === 401 || response.status === 403) {
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
                studentName: dbOrder.studentName,   // Direct field — no populate
                phone:       dbOrder.studentPhone,  // Direct field
                files:       dbOrder.files.map(f => ({
                    name:    f.fileName,
                    pages:   f.totalPages,
                    color:   f.colorType,
                    side:    f.printSide,
                    copies:  f.copies,
                    fileUrl: `https://quickprint-hub.onrender.com/api/files/${f.fileUrl}`
                    // Protected URL — token ke bina open nahi hogi
                })),
                total: dbOrder.totalAmount
            }));

            totalOrdersEver = activeOrders.length + completedOrdersCount;
            renderOrders();
            updateStats();
        }

    } catch (error) {
        console.error('Queue fetch error:', error);
        alert('Server se orders load nahi ho paye!');
    }
}


// ============================================================
// ORDERS RENDER
// ============================================================
function renderOrders(filterText = '') {
    const container = document.getElementById('ordersContainer');
    container.innerHTML = '';

    const filtered = activeOrders.filter(order =>
        order.id.includes(filterText) ||
        order.studentName.toLowerCase().includes(filterText.toLowerCase())
    );

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color:#64748b;text-align:center;width:100%;grid-column:1/-1;padding:40px 0;">No active orders right now. Time to relax! ☕</p>';
        return;
    }

    filtered.forEach(order => {
        let filesHtml = order.files.map(file => `
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
                    <a href="${file.fileUrl}" target="_blank" class="btn-download-small">⬇️ Download</a>
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
                    <button class="btn-success" onclick="markComplete('${order._id}', '${order.id}')">Print & Complete ✅</button>
                </div>
            </div>
        `);
    });
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
        const response = await fetch(`https://quickprint-hub.onrender.com/api/orders/${dbId}/complete`, {
            method:  'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            const done = activeOrders.find(o => o._id === dbId);
            if (done) todayRevenue += done.total;
            completedOrdersCount++;
            alert(`Order #${serialNum} Completed! ✅`);
            fetchLiveQueue();
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
        const response = await fetch('https://quickprint-hub.onrender.com/api/orders/clear', {
            method:  'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            completedOrdersCount = 0;
            totalOrdersEver      = 0;
            todayRevenue         = 0;
            document.getElementById('searchOrder').value = '';
            fetchLiveQueue();
            alert('System reset! Ready for new day 🌅');
        }
    } catch (error) {
        console.error('Clear error:', error);
    }
}


// ============================================================
// SEARCH
// ============================================================
document.getElementById('searchOrder').addEventListener('input', e => renderOrders(e.target.value));


// ============================================================
// LOGOUT
// ============================================================
function logoutAdmin() {
    localStorage.clear();
    window.location.href = 'index.html';
}
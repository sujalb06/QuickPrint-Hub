// ============================================================
// QUICKPRINT - ADMIN DASHBOARD SCRIPT
// Changes: Token har fetch mein, auto-login (30 din), isAdmin check
// ============================================================


// --- GLOBAL VARIABLES ---
let activeOrders = [];
let completedOrdersCount = 0;
let totalOrdersEver = 0;
let todayRevenue = 0;


// ============================================================
// 1. PAGE LOAD — Login check aur token verify
// ============================================================
document.addEventListener('DOMContentLoaded', () => {

    const savedUser = localStorage.getItem('quickprint_user');
    const token     = localStorage.getItem('quickprint_token');

    // Token ya user nahi — login pe bhejo
    if (!savedUser || !token) {
        window.location.href = "index.html";
        return;
    }

    const user = JSON.parse(savedUser);

    // Role check — admin nahi hai toh access band
    if (user.role !== 'admin') {
        alert("Access Denied! Only Shopkeepers can view this page.");
        window.location.href = "index.html";
        return;
    }

    // Sab theek — orders load karo
    // Token 30 din ka hai, toh baar baar login nahi karna padega
    fetchLiveQueue();
});


// ============================================================
// 2. SERVER SE LIVE ORDERS LAO — Token ke saath
// ============================================================
async function fetchLiveQueue() {
    const token = localStorage.getItem('quickprint_token');

    try {
        const response = await fetch('https://quickprint-hub.onrender.com/api/orders/queue', {
            headers: {
                'Authorization': `Bearer ${token}`  // Token bhejo — backend verify karega
            }
        });

        // Token expire ho gaya — login pe bhejo
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('quickprint_token');
            localStorage.removeItem('quickprint_user');
            window.location.href = "index.html";
            return;
        }

        const data = await response.json();

        if (data.success) {
            activeOrders = data.data.map(dbOrder => ({
                _id:         dbOrder._id,
                id:          dbOrder.orderSerial,
                time:        new Date(dbOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                studentName: dbOrder.userId.fullName,
                phone:       dbOrder.userId.phone,
                files:       dbOrder.files.map(f => ({
                    name:    f.fileName,
                    pages:   f.totalPages,
                    color:   f.colorType,
                    side:    f.printSide,
                    copies:  f.copies,
                    fileUrl: f.fileUrl
                })),
                total: dbOrder.totalAmount
            }));

            totalOrdersEver = activeOrders.length + completedOrdersCount;
            renderOrders();
            updateStats();
        }

    } catch (error) {
        console.error("Error fetching queue:", error);
        alert("Server se orders load nahi ho paye!");
    }
}


// ============================================================
// 3. ORDERS KO SCREEN PE DIKHAO
// ============================================================
function renderOrders(filterText = '') {
    const container = document.getElementById('ordersContainer');
    container.innerHTML = '';

    const filteredOrders = activeOrders.filter(order =>
        order.id.includes(filterText) ||
        order.studentName.toLowerCase().includes(filterText.toLowerCase())
    );

    if (filteredOrders.length === 0) {
        container.innerHTML = '<p style="color: #64748b; text-align: center; width: 100%; grid-column: 1 / -1; padding: 40px 0;">No active orders right now. Time to relax! ☕</p>';
        return;
    }

    filteredOrders.forEach(order => {

        let filesHtml = order.files.map(file => `
            <div class="file-item-stacked">
                <div class="file-line-1">
                    📄 <strong>${file.name}</strong> <span style="color: #64748b; font-size: 0.85rem;">(${file.pages} Pgs)</span>
                </div>
                <div class="file-line-2">
                    <span class="badge badge-${file.color === 'bw' ? 'bw' : 'color'}">${file.color.toUpperCase()}</span>
                    <span class="badge badge-${file.side === 'single' ? 'single' : 'double'}">${file.side === 'single' ? 'Single' : 'Double'}</span>
                    <span class="badge-qty">Qty: ${file.copies || 1}</span>
                </div>
                <div class="file-line-3">
                    <a href="${file.fileUrl}" target="_blank" class="btn-download-small">
                        ⬇️ Download
                    </a>
                </div>
            </div>
        `).join('');

        const orderCard = `
            <div class="order-card" id="order-${order.id}">
                <div class="order-header">
                    <span class="order-number">#${order.id}</span>
                    <span class="order-time">${order.time}</span>
                </div>
                <div class="student-info">
                    <strong>Student:</strong> ${order.studentName} <br>
                    <strong>Phone:</strong> ${order.phone}
                </div>
                <div class="file-details">
                    ${filesHtml}
                </div>
                <div class="order-footer">
                    <span class="total-bill">₹${order.total.toFixed(2)}</span>
                    <button class="btn-success" onclick="markComplete('${order._id}', '${order.id}')">Print & Complete ✅</button>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', orderCard);
    });
}


// ============================================================
// 4. STATS CARDS UPDATE KARO
// ============================================================
function updateStats() {
    document.getElementById('totalOrdersCount').innerText  = totalOrdersEver;
    document.getElementById('pendingQueueCount').innerText = activeOrders.length;
    document.getElementById('completedCount').innerText    = completedOrdersCount;

    const revenueEl = document.getElementById('revenueCount');
    if (revenueEl) revenueEl.innerText = `₹${todayRevenue.toFixed(2)}`;
}


// ============================================================
// 5. ORDER COMPLETE KARO — Token ke saath
// ============================================================
async function markComplete(dbId, serialNum) {
    const token = localStorage.getItem('quickprint_token');

    try {
        const response = await fetch(`https://quickprint-hub.onrender.com/api/orders/${dbId}/complete`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`  // Token zaroori
            }
        });
        const data = await response.json();

        if (data.success) {
            const completedOrder = activeOrders.find(order => order._id === dbId);
            if (completedOrder) todayRevenue += completedOrder.total;

            completedOrdersCount++;
            alert(`Order #${serialNum} Completed! ✅`);
            fetchLiveQueue();
        }

    } catch (error) {
        console.error("Error completing order:", error);
    }
}


// ============================================================
// 6. CLEAR HISTORY — Token ke saath
// ============================================================
async function clearOrderHistory() {
    const token = localStorage.getItem('quickprint_token');

    const confirmClear = confirm("⚠️ WARNING: This will clear all orders. Are you sure?");

    if (confirmClear) {
        try {
            const response = await fetch('https://quickprint-hub.onrender.com/api/orders/clear', {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`  // Token zaroori
                }
            });
            const data = await response.json();

            if (data.success) {
                completedOrdersCount = 0;
                totalOrdersEver      = 0;
                todayRevenue         = 0;

                document.getElementById('searchOrder').value = '';
                fetchLiveQueue();
                alert("System Reset Successful. Ready for a new day! 🌅");
            }

        } catch (error) {
            console.error("Error clearing history:", error);
        }
    }
}


// ============================================================
// 7. SEARCH BOX
// ============================================================
document.getElementById('searchOrder').addEventListener('input', (e) => {
    renderOrders(e.target.value);
});


// ============================================================
// 8. LOGOUT — localStorage saaf karo
// ============================================================
function logoutAdmin() {
    localStorage.removeItem('quickprint_user');
    localStorage.removeItem('quickprint_token');
    window.location.href = "index.html";
}
// ============================================================
// QUICKPRINT - ADMIN DASHBOARD SCRIPT
// Ye file shopkeeper ke dashboard ka pura kaam karti hai
// ============================================================


// --- GLOBAL VARIABLES (Poore page me kaam aane wale counters) ---

let activeOrders = [];         // Abhi ke pending orders ka list
let completedOrdersCount = 0;  // Aaj kitne orders complete hue
let totalOrdersEver = 0;       // Total orders (pending + complete)
let todayRevenue = 0;          // Aaj ki total kamai (₹)


// ============================================================
// 1. PAGE LOAD HONE PE SABSE PEHLE YE CHALTA HAI
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

    // Check karo: kya koi login hai?
    const savedUser = localStorage.getItem('quickprint_user');
    if (!savedUser) {
        window.location.href = "login.html"; // Login nahi hai toh wapas bhejo
        return;
    }

    // Check karo: jo login hai, woh admin hai ya nahi?
    const user = JSON.parse(savedUser);
    if (user.role !== 'admin') {
        alert("Access Denied! Only Shopkeepers can view this page.");
        window.location.href = "login.html"; // Admin nahi hai toh wapas bhejo
        return;
    }

    // Sab sahi hai, toh clock aur orders load karo
    // startClock();
    fetchLiveQueue();
});


// ============================================================
// 2. LIVE CLOCK - Upar corner me time dikhata hai
// ============================================================

// function startClock() {
//     // Har 1 second (1000ms) pe time update karo
//     setInterval(() => {
//         const now = new Date();
//         document.getElementById('liveClock').innerText = now.toLocaleTimeString();
//     }, 1000);
// }


// ============================================================
// 3. SERVER SE LIVE ORDERS LAO (MongoDB se data fetch)
// ============================================================

async function fetchLiveQueue() {
    try {
        // Server se orders ki list maango
        const response = await fetch('https://quickprint-hub.onrender.com/api/orders/queue');
        const data = await response.json();

        if (data.success) {

            // Server se aaye raw data ko apne kaam ke format me convert karo
            activeOrders = data.data.map(dbOrder => ({
                _id: dbOrder._id,                    // MongoDB ka unique ID
                id: dbOrder.orderSerial,             // Dikhane wala Order Number (jaise #0012)
                time: new Date(dbOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), // Order ka time
                studentName: dbOrder.userId.fullName, // Student ka naam
                phone: dbOrder.userId.phone,          // Student ka phone

                // Files ki list banao
                files: dbOrder.files.map(f => ({
                    name: f.fileName,       // File ka naam
                    pages: f.totalPages,    // Kitne pages hain
                    color: f.colorType,     // BW hai ya Color
                    side: f.printSide,      // Single sided ya Double sided
                    copies: f.copies,       // Kitni copies chahiye
                    fileUrl: f.fileUrl      // Download link
                })),

                total: dbOrder.totalAmount  // Total bill amount
            }));

            // Stats update karo
            totalOrdersEver = activeOrders.length + completedOrdersCount;

            // Screen pe cards dikhao
            renderOrders();
            updateStats();
        }

    } catch (error) {
        // Kuch galat hua toh console aur alert me batao
        console.error("Error fetching queue:", error);
        alert("Server se orders load nahi ho paye!");
    }
}


// ============================================================
// 4. ORDERS KO SCREEN PE DIKHAO (Cards banana)
// ============================================================

function renderOrders(filterText = '') {
    const container = document.getElementById('ordersContainer');
    container.innerHTML = ''; // Pehle ke purane cards saaf karo

    // Search filter lagao - jo text match kare woh dikhao
    const filteredOrders = activeOrders.filter(order =>
        order.id.includes(filterText) ||
        order.studentName.toLowerCase().includes(filterText.toLowerCase())
    );

    // Agar koi order nahi mila toh khali message dikhao
    if (filteredOrders.length === 0) {
        container.innerHTML = '<p style="color: #64748b; text-align: center; width: 100%; grid-column: 1 / -1; padding: 40px 0;">No active orders right now. Time to relax! ☕</p>';
        return;
    }

    // Har order ke liye ek card banao
    filteredOrders.forEach(order => {

        // Pehle us order ki saari files ka HTML banao
        let filesHtml = order.files.map(file => `
            <div class="file-item-stacked">
                
                <!-- File ka naam aur pages -->
                <div class="file-line-1">
                    📄 <strong>${file.name}</strong> <span style="color: #64748b; font-size: 0.85rem;">(${file.pages} Pgs)</span>
                </div>
                
                <!-- Color type, side type, aur copies badges -->
                <div class="file-line-2">
                    <span class="badge badge-${file.color === 'bw' ? 'bw' : 'color'}">${file.color.toUpperCase()}</span>
                    <span class="badge badge-${file.side === 'single' ? 'single' : 'double'}">${file.side === 'single' ? 'Single' : 'Double'}</span>
                    <span class="badge-qty">Qty: ${file.copies || 1}</span>
                </div>

                <!-- Download button -->
                <div class="file-line-3">
                    <a href="${file.fileUrl}" target="_blank" class="btn-download-small">
                        ⬇️ Download
                    </a>
                </div>

            </div>
        `).join('');

        // Ab pura order card banao
        const orderCard = `
            <div class="order-card" id="order-${order.id}">

                <!-- Order number aur time -->
                <div class="order-header">
                    <span class="order-number">#${order.id}</span>
                    <span class="order-time">${order.time}</span>
                </div>

                <!-- Student ki info -->
                <div class="student-info">
                    <strong>Student:</strong> ${order.studentName} <br>
                    <strong>Phone:</strong> ${order.phone}
                </div>

                <!-- Files ki list -->
                <div class="file-details">
                    ${filesHtml}
                </div>

                <!-- Total bill aur Complete button -->
                <div class="order-footer">
                    <span class="total-bill">₹${order.total.toFixed(2)}</span>
                    <button class="btn-success" onclick="markComplete('${order._id}', '${order.id}')">Print & Complete ✅</button>
                </div>

            </div>
        `;

        // Card ko page pe add karo
        container.insertAdjacentHTML('beforeend', orderCard);
    });
}


// ============================================================
// 5. STATS CARDS UPDATE KARO (Top me jo numbers dikhte hain)
// ============================================================

function updateStats() {
    document.getElementById('totalOrdersCount').innerText = totalOrdersEver;
    document.getElementById('pendingQueueCount').innerText = activeOrders.length;
    document.getElementById('completedCount').innerText = completedOrdersCount;

    // Revenue box hai toh usmein paisa dikhao
    const revenueEl = document.getElementById('revenueCount');
    if (revenueEl) {
        revenueEl.innerText = `₹${todayRevenue.toFixed(2)}`;
    }
}


// ============================================================
// 6. ORDER COMPLETE KARO (Server ko update bhejo)
// ============================================================

async function markComplete(dbId, serialNum) {
    try {
        // Server ko batao ki ye order complete ho gaya
        const response = await fetch(`https://quickprint-hub.onrender.com/api/orders/${dbId}/complete`, {
            method: 'PUT'
        });
        const data = await response.json();

        if (data.success) {

            // Is complete hue order ki kamai galle me jodo
            const completedOrder = activeOrders.find(order => order._id === dbId);
            if (completedOrder) {
                todayRevenue += completedOrder.total;
            }

            // Completed counter badhao aur page refresh karo
            completedOrdersCount++;
            alert(`Order #${serialNum} Completed! ✅`);
            fetchLiveQueue(); // Fresh list lo server se
        }

    } catch (error) {
        console.error("Error completing order:", error);
    }
}


// ============================================================
// 7. CLEAR HISTORY - Aaj ke saare orders reset karo
// ============================================================

async function clearOrderHistory() {

    // Pehle confirm karo, galti se na ho jaaye
    const confirmClear = confirm("⚠️ WARNING: This will clear all pending orders for today. The order counter will reset to #0001 tomorrow. Are you sure?");

    if (confirmClear) {
        try {
            // Server ko DELETE request bhejo
            const response = await fetch('https://quickprint-hub.onrender.com/api/orders/clear', {
                method: 'DELETE'
            });
            const data = await response.json();

            if (data.success) {
                // Saare counters zero karo
                completedOrdersCount = 0;
                totalOrdersEver = 0;
                todayRevenue = 0; // Galla bhi saaf

                // Search box khali karo aur fresh data lo
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
// 8. SEARCH BOX - Type karo toh orders filter ho jaate hain
// ============================================================

document.getElementById('searchOrder').addEventListener('input', (e) => {
    renderOrders(e.target.value); // Jo likha woh pass karo filter me
});


// ============================================================
// 9. LOGOUT - Admin ka session khatam karo
// ============================================================

function logoutAdmin() {
    localStorage.removeItem('quickprint_user'); // Login data delete karo
    window.location.href = "login.html";         // Login page pe bhejo
}




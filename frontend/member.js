const API_BASE = 'https://codeforbettertomorrow.onrender.com';

// Global variable to keep track of Chart instance
let metricsChartInstance = null;

// ==================== AUTH STATE ====================
function getToken()       { return sessionStorage.getItem('titukulane_token'); }
function getMemberId()   { return parseInt(sessionStorage.getItem('titukulane_member_id')) || null; }
function getGroupId()    { return parseInt(sessionStorage.getItem('titukulane_group_id')) || null; }
function getGroupName()  { return sessionStorage.getItem('titukulane_group_name') || ''; }
function getFullName()   { return sessionStorage.getItem('titukulane_full_name') || ''; }
function getRole()       { return sessionStorage.getItem('titukulane_role') || ''; }

function isLoggedIn() {
    return !!(getToken() && getMemberId());
}

function requireAuth() {
    if (!isLoggedIn()) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
}

function logout() {
    sessionStorage.clear();
    window.location.href = 'index.html';
}

// ==================== TOASTS ====================
function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        .toast-notification { position: fixed; top: 20px; right: 20px; z-index: 9999; padding: 14px 20px; border-radius: 10px; font-size: 14px; font-weight: 500; color: white; animation: slideIn 0.3s ease, fadeOut 0.3s ease 2.7s forwards; box-shadow: 0 4px 12px rgba(0,0,0,0.15); max-width: 320px; }
        .toast-success { background: #27ae60; }
        .toast-error { background: #c0392b; }
        .toast-info { background: #2980b9; }
        .toast-warning { background: #e67e22; }
        .toast-content { display: flex; align-items: center; gap: 10px; }
        .toast-content i { font-size: 18px; }
        @keyframes slideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
    `;
    document.head.appendChild(style);
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ==================== PAGE NAVIGATION ====================
function switchPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-item-btm').forEach(n => n.classList.remove('active'));
    const btn = document.querySelector('.nav-item-btm[data-page="' + page + '"]');
    if (btn) btn.classList.add('active');

    window.scrollTo(0, 0);

    const loaders = {
        home: loadDashboard,
        history: loadTransactionHistory,
        loans: loadLoanHistory,
        notes: loadAllNotes,
        chat: loadChatMessages,
        profile: loadProfile
    };
    if (loaders[page]) loaders[page]();
}

// ==================== MODALS ====================
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
        if (e.target === this) closeModal(this.id);
    });
});

// ==================== LOADING STATES ====================
function setLoading(button, loading = true, text = 'Loading...') {
    if (!button) return;
    if (loading) {
        button.dataset.originalText = button.innerHTML;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text}`;
        button.disabled = true;
    } else {
        button.innerHTML = button.dataset.originalText || button.innerText;
        button.disabled = false;
    }
}

// ==================== HELPER FORMATTERS ====================
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatType(type) {
    if (!type) return 'Transaction';
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateLong(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
    if (!requireAuth()) return;
    try {
        const res = await fetch(`${API_BASE}/api/members/${getMemberId()}`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to load dashboard');
        const data = await res.json();
        renderDashboard(data);
    } catch (err) {
        showToast(err.message, 'error');
        console.error('Dashboard error:', err);
    }
}

function renderDashboard(data) {
    // Balance
    const balanceEl = document.querySelector('.balance-amount');
    if (balanceEl) {
        balanceEl.textContent = `MWK ${data.member.savings_balance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }

    // Interest rate
    const interestEl = document.querySelector('.balance-row .balance-item:nth-child(2)');
    if (interestEl) {
        interestEl.innerHTML = `<i class="fas fa-percentage" style="color:var(--accent);"></i> ${data.group.interest_rate}% interest`;
    }

    // Profile name
    const displayName = document.getElementById('displayName');
    if (displayName) displayName.textContent = data.member.full_name;

    // Profile stats
    const profileStats = document.querySelectorAll('.profile-stat .num');
    if (profileStats[0]) profileStats[0].textContent = `MWK ${data.member.savings_balance.toLocaleString()}`;
    if (profileStats[1]) profileStats[1].textContent = data.member.credit_score;
    if (profileStats[2]) profileStats[2].textContent = data.group.total_members;

    // Member ID line
    const profileId = document.querySelector('.profile-id');
    if (profileId) {
        const joined = new Date(data.member.joined_at).toLocaleDateString('en-US', {month: 'short', year: 'numeric'});
        profileId.textContent = `Member ID: ${data.member.member_id} | Since ${joined}`;
    }

    // Savings goal
    if (data.savings_goal) renderSavingsGoal(data.savings_goal);

    // Transactions
    renderTransactions(data.recent_transactions);

    // Loans
    renderLoans(data.active_loans);

    // Notes
    renderNotes(data.recent_notes);

    // Notification dot
    const notifDot = document.querySelector('.header-btn .dot');
    if (notifDot) {
        notifDot.style.display = data.unread_notifications > 0 ? 'block' : 'none';
    }

    // Chart
    updateMetricsChart(data.member.savings_balance);
}

function renderSavingsGoal(goal) {
    const goalName = document.querySelector('.goal-name');
    const goalTarget = document.querySelector('.goal-target');
    const goalFill = document.querySelector('.goal-progress-fill');
    const currentSaved = document.querySelector('.goal-stats .current');
    const targetLeft = document.querySelector('.goal-stats .target');

    if (goalName) goalName.textContent = goal.name;
    if (goalTarget) goalTarget.textContent = `Target: MWK ${goal.target_amount.toLocaleString()}`;

    const pct = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
    if (goalFill) goalFill.style.width = `${Math.min(pct, 100)}%`;
    if (currentSaved) currentSaved.textContent = `MWK ${goal.current_amount.toLocaleString()} saved`;
    if (targetLeft) targetLeft.textContent = `MWK ${Math.max(0, goal.target_amount - goal.current_amount).toLocaleString()} to go`;
}

function renderTransactions(transactions) {
    const txList = document.querySelector('.tx-list');
    if (!txList || !transactions) return;

    txList.innerHTML = transactions.map(tx => {
        const isPositive = ['deposit', 'interest', 'loan_disbursement'].includes(tx.type);
        const iconClass = tx.type === 'deposit' ? 'deposit' :
                          tx.type === 'interest' ? 'interest' :
                          tx.type === 'withdrawal' ? 'withdraw' :
                          tx.type === 'loan_repayment' ? 'repay' : 'deposit';
        const icon = tx.type === 'deposit' ? 'fa-arrow-down' :
                     tx.type === 'interest' ? 'fa-coins' :
                     tx.type === 'withdrawal' ? 'fa-arrow-up' :
                     tx.type === 'loan_repayment' ? 'fa-hand-holding-dollar' : 'fa-arrow-down';
        const dateStr = new Date(tx.created_at).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
        const todayStr = new Date().toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
        const displayDate = dateStr === todayStr ? 'Today' : dateStr;

        return `
        <div class="tx-item">
            <div class="tx-icon ${iconClass}"><i class="fas ${icon}"></i></div>
            <div class="tx-info">
                <div class="tx-title">${formatType(tx.type)}</div>
                <div class="tx-sub">${escapeHtml(tx.description || tx.method || 'Transaction')}</div>
            </div>
            <div class="tx-amount">
                <div class="num ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : '-'}MWK ${tx.amount.toFixed(2)}</div>
                <div class="date">${displayDate}</div>
            </div>
        </div>`;
    }).join('');
}

function renderLoans(loans) {
    const noLoanSection = document.querySelector('.no-loan');
    if (!loans || loans.length === 0) {
        if (noLoanSection) noLoanSection.style.display = 'block';
        return;
    }
    if (noLoanSection) noLoanSection.style.display = 'none';
}

function renderNotes(notes) {
    const notesList = document.getElementById('notesList');
    if (!notesList || !notes) return;

    notesList.innerHTML = notes.map(note => `
        <div class="note-item">
            <div class="note-date">${formatDateLong(note.note_date)}</div>
            <div class="note-text">${escapeHtml(note.text)}</div>
            <div class="note-mood">${escapeHtml(note.mood)}</div>
        </div>
    `).join('');
}

function updateMetricsChart(currentBalance) {
    const canvas = document.getElementById('metricsChart');
    if (!canvas || typeof Chart === 'undefined') return;

    // Safely destroy previous instance to prevent canvas rendering errors
    if (metricsChartInstance !== null) {
        metricsChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    metricsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Savings Balance',
                data: [
                    currentBalance * 0.5,
                    currentBalance * 0.55,
                    currentBalance * 0.65,
                    currentBalance * 0.75,
                    currentBalance * 0.9,
                    currentBalance
                ],
                borderColor: '#1a5f3c',
                backgroundColor: 'rgba(26, 95, 60, 0.05)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointBackgroundColor: '#1a5f3c',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointHoverRadius: 7,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        font: { family: 'Inter', size: 12, weight: '500' },
                        color: '#1a1a2e',
                        padding: 16,
                        usePointStyle: true,
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0, 0, 0, 0.05)', drawBorder: false },
                    ticks: {
                        font: { family: 'Inter', size: 11 },
                        color: '#6b7280',
                        callback: function(value) { return 'MWK ' + value.toLocaleString(); }
                    }
                },
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { font: { family: 'Inter', size: 11 }, color: '#6b7280' }
                }
            }
        }
    });
}

// ==================== DEPOSIT ====================
let selectedDepositMethod = null;

function selectDepositPayment(element, method) {
    document.querySelectorAll('.payment-method').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    selectedDepositMethod = method;

    const passwordField = document.getElementById('passwordField');
    const phoneField = document.getElementById('phoneField');
    const bankField = document.getElementById('bankField');

    const requiresPassword = ['airtel', 'tnm', 'bank'];
    if (requiresPassword.includes(method)) {
        passwordField?.classList.remove('hidden');
    } else {
        passwordField?.classList.add('hidden');
    }

    if (method === 'airtel' || method === 'tnm') {
        phoneField?.classList.remove('hidden');
        bankField?.classList.add('hidden');
    } else if (method === 'bank') {
        bankField?.classList.remove('hidden');
        phoneField?.classList.add('hidden');
    } else {
        phoneField?.classList.remove('hidden');
        bankField?.classList.add('hidden');
    }
}

async function confirmDeposit() {
    if (!requireAuth()) return;

    const amountInput = document.getElementById('depositAmount');
    const passwordInput = document.getElementById('depositPassword');
    const amount = parseFloat(amountInput?.value);

    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }

    if (!selectedDepositMethod) {
        showToast('Please select a payment method', 'error');
        return;
    }

    const passwordField = document.getElementById('passwordField');
    if (passwordField && !passwordField.classList.contains('hidden')) {
        if (!passwordInput?.value) {
            showToast('Please enter your PIN', 'error');
            return;
        }
        if (!/^\d{4}$/.test(passwordInput.value)) {
            showToast('Please enter a valid 4-digit PIN', 'error');
            return;
        }
    }

    const btn = document.querySelector('#depositModal .modal-submit');
    setLoading(btn, true, 'Processing...');

    try {
        const res = await fetch(`${API_BASE}/members/${getMemberId()}/deposit`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                amount: amount,
                method: selectedDepositMethod,
                phone: document.querySelector('#phoneField input')?.value,
                pin: passwordInput?.value
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Deposit failed');

        showToast(`Deposit successful! New balance: MWK ${data.new_balance.toFixed(2)}`, 'success');

        if (passwordInput) passwordInput.value = '';
        closeModal('depositModal');
        loadDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        setLoading(btn, false);
    }
}

// ==================== WITHDRAWAL ====================
async function confirmWithdrawal() {
    if (!requireAuth()) return;

    const amountInput = document.querySelector('#withdrawModal input[type="number"]');
    const amount = parseFloat(amountInput?.value);

    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }

    const btn = document.querySelector('#withdrawModal .modal-submit');
    setLoading(btn, true, 'Processing...');

    try {
        const res = await fetch(`${API_BASE}/members/${getMemberId()}/withdraw`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ amount: amount, method: 'cash' })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Withdrawal failed');

        showToast(`Withdrawal successful! New balance: MWK ${data.new_balance.toFixed(2)}`, 'success');
        closeModal('withdrawModal');
        loadDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        setLoading(btn, false);
    }
}

// ==================== LOANS ====================
async function requestLoan() {
    if (!requireAuth()) return;

    const amountInput = document.querySelector('#loanModal input[type="number"]');
    const purposeSelect = document.querySelector('#loanModal select');
    const durationSelect = document.querySelectorAll('#loanModal select')[1];

    const amount = parseFloat(amountInput?.value);
    if (!amount || amount <= 0) {
        showToast('Please enter a valid loan amount', 'error');
        return;
    }

    const purposeMap = {
        'Farm Equipment': 'farm_equipment',
        'Business': 'business',
        'School Fees': 'school_fees',
        'Medical': 'medical',
        'Home Improvement': 'home_improvement',
        'Other': 'other'
    };

    const durationMap = { '3 months': 3, '6 months': 6, '12 months': 12 };

    const btn = document.querySelector('#loanModal .modal-submit');
    setLoading(btn, true, 'Submitting...');

    try {
        const res = await fetch(`${API_BASE}/members/${getMemberId()}/loans`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                title: `${purposeSelect?.value || 'Personal'} Loan`,
                purpose: purposeMap[purposeSelect?.value] || 'other',
                principal: amount,
                interest_rate: 8.0,
                duration_months: durationMap[durationSelect?.value] || 12
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Loan request failed');

        showToast(`Loan submitted! ${data.loan_number}. Monthly: MWK ${data.monthly_payment.toFixed(2)}`, 'success');
        closeModal('loanModal');
        loadDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function loadLoanHistory() {
    if (!requireAuth()) return;
    try {
        const res = await fetch(`${API_BASE}/members/${getMemberId()}/loans`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to load loans');
        const loans = await res.json();
        renderLoanHistory(loans);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderLoanHistory(loans) {
    const container = document.querySelector('#page-loans .section > div:last-child');
    if (!container) return;

    const header = container.querySelector('.section-header');
    container.innerHTML = '';
    if (header) container.appendChild(header);

    if (!loans || loans.length === 0) {
        container.innerHTML += `
            <div class="no-loan">
                <div class="no-loan-icon">🎉</div>
                <div class="no-loan-title">No active loans</div>
                <div class="no-loan-desc">You have paid off all your loans. Great job!</div>
                <button class="loan-btn primary" style="max-width:240px;margin:0 auto;" onclick="openModal('loanModal')">
                    <i class="fas fa-plus"></i> Request a Loan
                </button>
            </div>`;
        return;
    }

    loans.forEach(loan => {
        const statusClass = loan.status === 'paid_off' ? 'loan-status-paid' :
                            loan.status === 'active' ? 'loan-status-active' : 'loan-status-pending';
        const statusText = loan.status === 'paid_off' ? 'Paid Off' :
                           loan.status === 'active' ? 'Active' : 'Pending';

        container.innerHTML += `
            <div class="loan-card">
                <div class="loan-card-header">
                    <div class="loan-card-title">${escapeHtml(loan.title)}</div>
                    <div class="loan-card-status ${statusClass}">${statusText}</div>
                </div>
                <div class="loan-amount-row">
                    <div class="loan-amount-item">
                        <div class="num">MWK ${loan.principal.toLocaleString()}</div>
                        <div class="label">Principal</div>
                    </div>
                    <div class="loan-amount-item">
                        <div class="num">${loan.interest_rate}%</div>
                        <div class="label">Interest</div>
                    </div>
                    <div class="loan-amount-item">
                        <div class="num">MWK ${loan.total_paid.toLocaleString()}</div>
                        <div class="label">Total Paid</div>
                    </div>
                </div>
                <div class="loan-due">${loan.status === 'paid_off' ? 'Paid off on' : 'Due'} <span>${loan.due_date ? formatDateLong(loan.due_date) : 'N/A'}</span></div>
            </div>`;
    });
}

// ==================== TRANSACTION HISTORY ====================
async function loadTransactionHistory() {
    if (!requireAuth()) return;
    try {
        const res = await fetch(`${API_BASE}/members/${getMemberId()}/transactions`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to load transactions');
        const transactions = await res.json();
        renderTransactionHistory(transactions);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderTransactionHistory(transactions) {
    const container = document.querySelector('#page-history .section');
    if (!container) return;

    const grouped = {};
    transactions.forEach(tx => {
        const date = new Date(tx.created_at);
        const monthKey = date.toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
        if (!grouped[monthKey]) grouped[monthKey] = [];
        grouped[monthKey].push(tx);
    });

    let html = `
        <div class="section-header">
            <div class="section-title">All Transactions</div>
            <button class="print-report-btn" onclick="downloadReport()">
                <i class="fas fa-file-pdf"></i> Download Report
            </button>
        </div>`;

    for (const [month, txs] of Object.entries(grouped)) {
        html += `<div style="font-size:13px;font-weight:700;color:var(--primary);padding:12px 4px 8px;text-transform:uppercase;letter-spacing:0.5px;">${month}</div>`;
        html += txs.map(tx => {
            const isPositive = ['deposit', 'interest', 'loan_disbursement'].includes(tx.type);
            const iconClass = tx.type === 'deposit' ? 'deposit' :
                              tx.type === 'interest' ? 'interest' :
                              tx.type === 'withdrawal' ? 'withdraw' : 'repay';
            const icon = tx.type === 'deposit' ? 'fa-arrow-down' :
                         tx.type === 'interest' ? 'fa-coins' :
                         tx.type === 'withdrawal' ? 'fa-arrow-up' : 'fa-hand-holding-dollar';
            return `
            <div class="tx-item">
                <div class="tx-icon ${iconClass}"><i class="fas ${icon}"></i></div>
                <div class="tx-info">
                    <div class="tx-title">${formatType(tx.type)}</div>
                    <div class="tx-sub">${escapeHtml(tx.description || 'Transaction')}</div>
                </div>
                <div class="tx-amount">
                    <div class="num ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : '-'}MWK ${tx.amount.toFixed(2)}</div>
                    <div class="date">${formatDateShort(tx.created_at)}</div>
                </div>
            </div>`;
        }).join('');
    }

    container.innerHTML = html;
}

// ==================== NOTES ====================
async function addNote() {
    if (!requireAuth()) return;

    const input = document.querySelector('.notes-input');
    const text = input?.value.trim();

    if (!text) {
        showToast('Please write something before saving', 'error');
        return;
    }

    const btn = document.querySelector('#page-notes .loan-btn.primary');
    setLoading(btn, true, 'Saving...');

    try {
        const res = await fetch(`${API_BASE}/members/${getMemberId()}/notes`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ text: text, mood: '😊 Good' })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to save note');

        input.value = '';
        showToast('Note saved!', 'success');
        loadAllNotes();
        loadDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function loadAllNotes() {
    if (!requireAuth()) return;
    try {
        const res = await fetch(`${API_BASE}/members/${getMemberId()}/notes`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to load notes');
        const notes = await res.json();
        renderNotes(notes);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==================== CHAT ====================
async function loadChatMessages() {
    if (!requireAuth()) return;
    try {
        const res = await fetch(`${API_BASE}/members/${getMemberId()}/messages`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to load messages');
        const messages = await res.json();
        renderChatMessages(messages);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderChatMessages(messages) {
    const container = document.querySelector('.chat-messages');
    if (!container) return;

    container.innerHTML = '<div class="chat-date-divider">Today</div>';

    messages.forEach(msg => {
        const bubbleClass = msg.sender === 'member' ? 'sent' : 'received';
        const timeStr = new Date(msg.created_at).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'});
        container.innerHTML += `
            <div class="chat-bubble ${bubbleClass}">
                <div class="chat-bubble-text">${escapeHtml(msg.text)}</div>
                <div class="chat-bubble-time">${timeStr}</div>
            </div>`;
    });

    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    if (!requireAuth()) return;

    const input = document.getElementById('chatInput');
    const text = input?.value.trim();
    if (!text) return;

    try {
        const res = await fetch(`${API_BASE}/members/${getMemberId()}/messages`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ sender: 'member', text: text })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to send');

        input.value = '';
        loadChatMessages();

        // Simulate admin reply
        setTimeout(async () => {
            await fetch(`${API_BASE}/members/${getMemberId()}/messages`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    sender: 'admin',
                    text: "Thank you for your message. We'll get back to you shortly!"
                })
            });
            loadChatMessages();
        }, 1000);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==================== PROFILE ====================
async function loadProfile() {
    if (!requireAuth()) return;
    try {
        const res = await fetch(`${API_BASE}/members/${getMemberId()}`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to load profile');
        const member = await res.json();

        const displayName = document.getElementById('displayName');
        if (displayName) displayName.textContent = member.full_name;

        const profileId = document.querySelector('.profile-id');
        if (profileId) {
            const joined = new Date(member.joined_at).toLocaleDateString('en-US', {month: 'short', year: 'numeric'});
            profileId.textContent = `Member ID: ${member.member_id} | Since ${joined}`;
        }

        const stats = document.querySelectorAll('.profile-stat .num');
        if (stats[0]) stats[0].textContent = `MWK ${member.savings_balance.toLocaleString()}`;
        if (stats[1]) stats[1].textContent = member.credit_score;
        if (stats[2]) stats[2].textContent = member.total_shares;
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function saveName() {
    if (!requireAuth()) return;

    const nameInput = document.getElementById('editNameInput');
    const newName = nameInput?.value.trim();

    if (!newName || newName.length < 3) {
        showToast('Name must be at least 3 characters', 'error');
        return;
    }

    const btn = document.querySelector('#editNameModal .modal-submit');
    setLoading(btn, true, 'Saving...');

    try {
        const res = await fetch(`${API_BASE}/members/${getMemberId()}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({full_name: newName})
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Update failed');

        sessionStorage.setItem('titukulane_full_name', newName);
        const displayName = document.getElementById('displayName');
        if (displayName) displayName.textContent = newName;

        showToast(`Name updated to "${newName}"`, 'success');
        closeModal('editNameModal');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function changePassword() {
    if (!requireAuth()) return;

    const currentPassword = document.getElementById('currentPassword')?.value;
    const newPassword = document.getElementById('newPassword')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    if (newPassword.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
    }

    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        showToast('Password must contain letters and numbers', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }

    if (currentPassword === newPassword) {
        showToast('New password must be different', 'error');
        return;
    }

    const btn = document.querySelector('#changePasswordModal .modal-submit');
    setLoading(btn, true, 'Updating...');

    try {
        const res = await fetch(`${API_BASE}/members/${getMemberId()}/password`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to change password');

        showToast('Password updated successfully', 'success');
        closeModal('changePasswordModal');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        setLoading(btn, false);
    }
}

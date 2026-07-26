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
// HTML calls handleLogout() on the profile page — keep both names working
function handleLogout() {
    logout();
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
    if (id === 'notifModal') loadNotifications();
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

function money(amount) {
    const n = Number(amount) || 0;
    return `MWK ${n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

// Frontend uses short payment-method codes; the API expects its enum values.
const METHOD_MAP = {
    tnm: 'tnm_mpamba',
    airtel: 'airtel_money',
    bank: 'national_bank',
    mtn: 'airtel_money',
    cash: 'cash'
};

// ==================== DASHBOARD ====================
async function loadDashboard() {
    if (!requireAuth()) return;
    try {
        const res = await fetch(`${API_BASE}/api/members/${getMemberId()}`, {
            headers: getAuthHeaders()
        });
        const data = await res.json();

        // Log raw response for debugging
        console.log('Dashboard raw response:', data);

        if (!res.ok) {
            throw new Error(data.detail || 'Failed to load dashboard');
        }

        // Defensive: backend might return member directly instead of DashboardResponse wrapper
        if (!data.member && data.id && data.full_name) {
            // Looks like a plain member object — wrap it minimally
            data = { member: data, group: {}, recent_transactions: [], active_loans: [], savings_goal: null, recent_notes: [], unread_notifications: 0, group_members: [] };
        }

        if (!data.member) {
            console.error('Unexpected dashboard structure:', JSON.stringify(data));
            throw new Error('Server returned unexpected data. Check console for details.');
        }

        renderDashboard(data);
    } catch (err) {
        showToast(err.message, 'error');
        console.error('Dashboard error:', err);
    }
}

function renderDashboard(data) {
    const member = data.member || {};
    const group = data.group || {};
    const transactions = transactions || [];
    const loans = loans || [];
    const notes = notes || [];
    const goal = goal || null;

    // Balance
    const balanceEl = document.getElementById('balanceAmount') || document.querySelector('.balance-amount');
    if (balanceEl) {
        balanceEl.textContent = money(member.savings_balance);
    }

    // Interest rate
    const interestRateEl = document.getElementById('interestRate');
    if (interestRateEl) {
        interestRateEl.textContent = group.interest_rate;
    } else {
        const interestEl = document.querySelector('.balance-row .balance-item:nth-child(2)');
        if (interestEl) {
            interestEl.innerHTML = `<i class="fas fa-percentage" style="color:var(--accent);"></i> ${group.interest_rate}% interest`;
        }
    }

    // Profile name / avatar
    const displayName = document.getElementById('displayName');
    if (displayName) displayName.textContent = member.full_name;
    const profileAvatar = document.getElementById('profileAvatar');
    if (profileAvatar && member.full_name) {
        profileAvatar.textContent = member.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    }

    // Profile stats
    const profileSavings = document.getElementById('profileSavings');
    if (profileSavings) profileSavings.textContent = money(member.savings_balance);
    const profileCreditScore = document.getElementById('profileCreditScore');
    if (profileCreditScore) profileCreditScore.textContent = member.credit_score;
    const profileLoanCount = document.getElementById('profileLoanCount');
    if (profileLoanCount) profileLoanCount.textContent = loans ? loans.length : 0;

    // Member ID / joined line
    const profileId = document.getElementById('profileId') || document.querySelector('.profile-id');
    if (profileId) {
        const joined = new Date(member.joined_at).toLocaleDateString('en-US', {month: 'short', year: 'numeric'});
        profileId.textContent = `Member ID: ${member.member_id} | Since ${joined}`;
    }

    // Savings goal
    const goalSection = document.getElementById('savingsGoalSection');
    if (goal) {
        if (goalSection) goalSection.style.display = 'block';
        renderSavingsGoal(goal);
    } else if (goalSection) {
        goalSection.style.display = 'none';
    }

    // Transactions
    renderTransactions(transactions);

    // Loans
    renderLoans(loans);

    // Notes
    renderNotes(notes);

    // Notification dot
    const notifDot = document.getElementById('notifDot') || document.querySelector('.header-btn .dot');
    if (notifDot) {
        notifDot.style.display = (data.unread_notifications || 0) > 0 ? 'block' : 'none';
    }

    // Chart — uses real transaction data, no fake history
    updateMetricsChart(member.savings_balance, transactions);
}

function renderSavingsGoal(goal) {
    const goalIcon = document.getElementById('goalIcon');
    const goalName = document.getElementById('goalName') || document.querySelector('.goal-name');
    const goalTarget = document.getElementById('goalTarget') || document.querySelector('.goal-target');
    const goalFill = document.getElementById('goalProgressFill') || document.querySelector('.goal-progress-fill');
    const currentSaved = document.getElementById('goalCurrent') || document.querySelector('.goal-stats .current');
    const targetLeft = document.getElementById('goalRemaining') || document.querySelector('.goal-stats .target');

    if (goalIcon && goal.icon) goalIcon.textContent = goal.icon;
    if (goalName) goalName.textContent = goal.name;
    if (goalTarget) goalTarget.textContent = `Target: ${money(goal.target_amount)}`;

    const pct = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
    if (goalFill) goalFill.style.width = `${Math.min(pct, 100)}%`;
    if (currentSaved) currentSaved.textContent = `${money(goal.current_amount)} saved`;
    if (targetLeft) targetLeft.textContent = `${money(Math.max(0, goal.target_amount - goal.current_amount))} to go`;
}

function renderTransactions(transactions) {
    const txList = document.getElementById('homeTxList') || document.querySelector('.tx-list');
    if (!txList) return;

    if (!transactions || transactions.length === 0) {
        txList.innerHTML = `<div class="tx-item"><div class="tx-info"><div class="tx-sub">No transactions yet</div></div></div>`;
        return;
    }

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

function loanCardHtml(loan) {
    const statusClass = loan.status === 'paid_off' ? 'loan-status-paid' :
                        loan.status === 'active' ? 'loan-status-active' : 'loan-status-pending';
    const statusText = loan.status === 'paid_off' ? 'Paid Off' :
                       loan.status === 'active' ? 'Active' :
                       loan.status === 'pending' ? 'Pending' : 'Defaulted';

    return `
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
}

function renderLoans(loans) {
    // Home page teaser
    const teaser = document.getElementById('homeLoansTeaser');
    if (teaser) {
        if (!loans || loans.length === 0) {
            teaser.innerHTML = `
                <div class="no-loan">
                    <div class="no-loan-icon">🎉</div>
                    <div class="no-loan-title">No active loans</div>
                    <div class="no-loan-desc">You have no loans right now. Great job!</div>
                    <button class="loan-btn primary" style="max-width:240px;margin:0 auto;" onclick="openModal('loanModal')">
                        <i class="fas fa-plus"></i> Request New Loan
                    </button>
                </div>`;
        } else {
            teaser.innerHTML = loans.map(loanCardHtml).join('');
        }
    }

    // Loans page "active loans" section
    const activeContainer = document.getElementById('activeLoansContainer');
    if (activeContainer) {
        if (!loans || loans.length === 0) {
            activeContainer.innerHTML = `
                <div class="no-loan">
                    <div class="no-loan-icon">🎉</div>
                    <div class="no-loan-title">No active loans</div>
                    <div class="no-loan-desc">You have no active loans right now.</div>
                    <button class="loan-btn primary" style="max-width:240px;margin:0 auto;" onclick="openModal('loanModal')">
                        <i class="fas fa-plus"></i> Request a Loan
                    </button>
                </div>`;
        } else {
            activeContainer.innerHTML = loans.map(loanCardHtml).join('');
        }
    }
}

function renderNotes(notes) {
    const notesList = document.getElementById('notesList');
    if (!notesList) return;

    if (!notes || notes.length === 0) {
        notesList.innerHTML = `<div class="note-item"><div class="note-text">No notes yet. Add your first one above.</div></div>`;
    } else {
        notesList.innerHTML = notes.map(note => `
            <div class="note-item">
                <div class="note-date">${formatDateLong(note.note_date)}</div>
                <div class="note-text">${escapeHtml(note.text)}</div>
                <div class="note-mood">${escapeHtml(note.mood)}</div>
            </div>
        `).join('');
    }

    const notesCount = document.getElementById('notesCount');
    if (notesCount) notesCount.textContent = `${notes ? notes.length : 0} notes`;

    const noteTodayDate = document.getElementById('noteTodayDate');
    if (noteTodayDate) {
        noteTodayDate.textContent = new Date().toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'});
    }
}

function updateMetricsChart(currentBalance, transactions) {
    const canvas = document.getElementById('metricsChart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (metricsChartInstance !== null) {
        metricsChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    const chartBalance = Number(currentBalance) || 0;
    const safeTx = Array.isArray(transactions) ? transactions : [];

    // Build real chart data from transactions — no fake history
    let labels = [];
    let dataPoints = [];

    if (safeTx && safeTx.length > 0) {
        // Group by month and sum amounts (deposits positive, withdrawals negative)
        const monthly = {};
        safeTx.slice().reverse().forEach(tx => {
            const d = new Date(tx.created_at);
            const key = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            if (!monthly[key]) monthly[key] = 0;
            const isPositive = ['deposit', 'interest', 'loan_disbursement'].includes(tx.type);
            monthly[key] += isPositive ? tx.amount : -tx.amount;
        });
        labels = Object.keys(monthly);
        dataPoints = Object.values(monthly);
    }

    // If no transaction history, show a single "Current Balance" point
    if (labels.length === 0) {
        labels = ['Current'];
        dataPoints = [chartBalance];
    }

    metricsChartInstance = new Chart(ctx, {
        type: labels.length > 1 ? 'line' : 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: labels.length > 1 ? 'Monthly Net Savings' : 'Savings Balance',
                data: dataPoints,
                borderColor: '#1a5f3c',
                backgroundColor: 'rgba(26, 95, 60, 0.15)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
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
                    beginAtZero: false,
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
    document.querySelectorAll('#depositModal .payment-method').forEach(el => el.classList.remove('active'));
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

    // Validate amount is provided by user
    if (!amountInput || !amountInput.value.trim()) {
        showToast('Please enter the amount you want to deposit', 'error');
        amountInput?.focus();
        return;
    }

    if (isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid amount greater than 0', 'error');
        amountInput?.focus();
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
        const res = await fetch(`${API_BASE}/api/members/${getMemberId()}/deposit`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                amount: amount,
                method: METHOD_MAP[selectedDepositMethod] || selectedDepositMethod,
                phone: document.querySelector('#phoneField input')?.value || null,
                pin: passwordInput?.value || null
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Deposit failed');

        showToast(`Deposit successful! New balance: ${money(data.new_balance)}`, 'success');

        if (passwordInput) passwordInput.value = '';
        if (amountInput) amountInput.value = '';
        closeModal('depositModal');
        loadDashboard();
    } catch (err) {
        showToast(err.message, 'error');
        console.error('Deposit error:', err);
    } finally {
        setLoading(btn, false);
    }
}

// ==================== WITHDRAWAL ====================
let selectedWithdrawMethod = 'bank';

function selectPayment(element, method) {
    document.querySelectorAll('#withdrawModal .payment-method').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    selectedWithdrawMethod = method;

    const phoneField = document.getElementById('withdrawPhoneField');
    const bankField = document.getElementById('withdrawBankField');

    if (method === 'bank') {
        bankField?.classList.remove('hidden');
        phoneField?.classList.add('hidden');
    } else {
        phoneField?.classList.remove('hidden');
        bankField?.classList.add('hidden');
    }
}

async function confirmWithdraw() {
    if (!requireAuth()) return;

    const amountInput = document.getElementById('withdrawAmount') || document.querySelector('#withdrawModal input[type="number"]');
    const amount = parseFloat(amountInput?.value);
    const errorBox = document.getElementById('withdrawError');
    if (errorBox) errorBox.style.display = 'none';

    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }

    const btn = document.getElementById('withdrawSubmitBtn') || document.querySelector('#withdrawModal .modal-submit');
    setLoading(btn, true, 'Processing...');

    try {
        const res = await fetch(`${API_BASE}/api/members/${getMemberId()}/withdraw`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                amount: amount,
                method: METHOD_MAP[selectedWithdrawMethod] || 'cash',
                phone: document.getElementById('withdrawPhone')?.value || null
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Withdrawal failed');

        showToast(`Withdrawal successful! New balance: ${money(data.new_balance)}`, 'success');
        closeModal('withdrawModal');
        loadDashboard();
    } catch (err) {
        if (errorBox) {
            errorBox.textContent = err.message;
            errorBox.style.display = 'block';
        } else {
            showToast(err.message, 'error');
        }
    } finally {
        setLoading(btn, false);
    }
}
// Backward-compatible alias
async function confirmWithdrawal() { return confirmWithdraw(); }

// ==================== LOANS ====================
async function submitLoanRequest() {
    if (!requireAuth()) return;

    const amountInput = document.getElementById('loanAmount') || document.querySelector('#loanModal input[type="number"]');
    const purposeSelect = document.getElementById('loanPurpose') || document.querySelector('#loanModal select');
    const durationSelect = document.getElementById('loanDuration') || document.querySelectorAll('#loanModal select')[1];

    const amount = parseFloat(amountInput?.value);
    const errorBox = document.getElementById('loanError');
    if (errorBox) errorBox.style.display = 'none';

    if (!amount || amount <= 0) {
        showToast('Please enter a valid loan amount', 'error');
        return;
    }

    const purposeValue = purposeSelect?.value || 'other';
    const purposeTitle = purposeValue.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    const durationMonths = parseInt(durationSelect?.value) || 12;

    const btn = document.getElementById('loanSubmitBtn') || document.querySelector('#loanModal .modal-submit');
    setLoading(btn, true, 'Submitting...');

    try {
        const res = await fetch(`${API_BASE}/api/members/${getMemberId()}/loans`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                title: `${purposeTitle} Loan`,
                purpose: purposeValue,
                principal: amount,
                duration_months: durationMonths
                // interest_rate intentionally omitted — backend uses group's configured rate
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Loan request failed');

        showToast(`Loan submitted! ${data.loan_number}. Monthly: ${money(data.monthly_payment)}`, 'success');
        closeModal('loanModal');
        loadDashboard();
        loadLoanHistory();
    } catch (err) {
        if (errorBox) {
            errorBox.textContent = err.message;
            errorBox.style.display = 'block';
        } else {
            showToast(err.message, 'error');
        }
    } finally {
        setLoading(btn, false);
    }
}
// Backward-compatible alias
async function requestLoan() { return submitLoanRequest(); }

async function loadLoanHistory() {
    if (!requireAuth()) return;
    try {
        const res = await fetch(`${API_BASE}/api/members/${getMemberId()}/loans`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to load loans');
        const loans = await res.json();
        renderLoanHistory(loans);

        const activeLoans = loans.filter(l => l.status === 'active');
        renderLoans(activeLoans);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderLoanHistory(loans) {
    const container = document.getElementById('loanHistoryContainer');
    if (!container) return;

    if (!loans || loans.length === 0) {
        container.innerHTML = `<div class="loan-card"><div class="loan-card-header"><div class="loan-card-title">No loan history yet</div></div></div>`;
        return;
    }

    container.innerHTML = loans.map(loanCardHtml).join('');
}

// ==================== TRANSACTION HISTORY ====================
async function loadTransactionHistory() {
    if (!requireAuth()) return;
    try {
        const res = await fetch(`${API_BASE}/api/members/${getMemberId()}/transactions`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to load transactions');
        const transactions = await res.json();
        window._lastTransactionHistory = transactions;
        renderTransactionHistory(transactions);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderTransactionHistory(transactions) {
    const container = document.getElementById('historyTxList');
    if (!container) return;

    if (!transactions || transactions.length === 0) {
        container.innerHTML = `<div class="tx-item"><div class="tx-info"><div class="tx-sub">No transactions yet</div></div></div>`;
        return;
    }

    const grouped = {};
    safeTx.forEach(tx => {
        const date = new Date(tx.created_at);
        const monthKey = date.toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
        if (!grouped[monthKey]) grouped[monthKey] = [];
        grouped[monthKey].push(tx);
    });

    let html = '';
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

function downloadReport() {
    const transactions = window._lastTransactionHistory;
    if (!transactions || transactions.length === 0) {
        showToast('No transactions to export yet', 'info');
        return;
    }

    const rows = [['Date', 'Type', 'Description', 'Amount (MWK)']];
    safeTx.forEach(tx => {
        rows.push([
            new Date(tx.created_at).toISOString().slice(0, 10),
            formatType(tx.type),
            (tx.description || '').replace(/,/g, ';'),
            tx.amount.toFixed(2)
        ]);
    });

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `titukulane-transactions-${getMemberId()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// ==================== NOTES ====================
async function addNote() {
    if (!requireAuth()) return;

    const input = document.getElementById('noteText') || document.querySelector('.notes-input');
    const text = input?.value.trim();

    if (!text) {
        showToast('Please write something before saving', 'error');
        return;
    }

    const btn = document.getElementById('saveNoteBtn') || document.querySelector('#page-notes .loan-btn.primary');
    setLoading(btn, true, 'Saving...');

    try {
        const res = await fetch(`${API_BASE}/api/members/${getMemberId()}/notes`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ text: text })
            // mood intentionally omitted — backend uses its own default
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
        const res = await fetch(`${API_BASE}/api/members/${getMemberId()}/notes`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to load notes');
        const notes = await res.json();
        renderNotes(notes);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==================== NOTIFICATIONS ====================
async function loadNotifications() {
    if (!requireAuth()) return;
    const listEl = document.getElementById('notifList');
    const subEl = document.getElementById('notifSub');
    try {
        const res = await fetch(`${API_BASE}/api/members/${getMemberId()}/notifications`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to load notifications');
        const notifications = await res.json();

        if (subEl) {
            const unread = notifications.filter(n => !n.is_read).length;
            subEl.textContent = unread > 0 ? `${unread} unread` : 'All caught up';
        }

        if (listEl) {
            if (notifications.length === 0) {
                listEl.innerHTML = `<div class="notif-item"><div class="notif-content"><div class="notif-desc">No notifications yet</div></div></div>`;
            } else {
                listEl.innerHTML = notifications.map(n => `
                    <div class="notif-item">
                        <div class="notif-content">
                            <div class="notif-title" style="font-weight:600;font-size:13px;">${escapeHtml(n.title)}</div>
                            <div class="notif-desc" style="font-size:12px;color:var(--text-dim);">${escapeHtml(n.description)}</div>
                            <div class="notif-date" style="font-size:11px;color:var(--text-dim);margin-top:4px;">${formatDateShort(n.created_at)}</div>
                        </div>
                    </div>
                `).join('');
            }
        }

        const notifDot = document.getElementById('notifDot') || document.querySelector('.header-btn .dot');
        if (notifDot) {
            notifDot.style.display = notifications.some(n => !n.is_read) ? 'block' : 'none';
        }

        if (notifications.some(n => !n.is_read)) {
            fetch(`${API_BASE}/api/members/${getMemberId()}/notifications/read`, {
                method: 'PUT',
                headers: getAuthHeaders()
            }).catch(() => {});
        }
    } catch (err) {
        if (subEl) subEl.textContent = 'Could not load notifications';
        console.error('Notifications error:', err);
    }
}

// ==================== CHAT ====================
async function loadChatMessages() {
    if (!requireAuth()) return;
    try {
        const res = await fetch(`${API_BASE}/api/members/${getMemberId()}/messages`, {
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
    const container = document.getElementById('chatMessagesList') || document.querySelector('.chat-messages');
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
        const res = await fetch(`${API_BASE}/api/members/${getMemberId()}/messages`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ sender: 'member', text: text })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to send');

        input.value = '';
        loadChatMessages();
        // No fake admin reply — only real messages from the API are displayed
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==================== PROFILE ====================
async function loadProfile() {
    if (!requireAuth()) return;
    try {
        const res = await fetch(`${API_BASE}/api/members/${getMemberId()}`, {
            headers: getAuthHeaders()
        });
        const data = await res.json();
        console.log('Profile raw response:', data);
        if (!res.ok) throw new Error(data.detail || 'Failed to load profile');
        const member = data.member || data;

        const displayName = document.getElementById('displayName');
        if (displayName) displayName.textContent = member.full_name;
        const profileAvatar = document.getElementById('profileAvatar');
        if (profileAvatar && member.full_name) {
            profileAvatar.textContent = member.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
        }

        const profileId = document.getElementById('profileId') || document.querySelector('.profile-id');
        if (profileId) {
            const joined = new Date(member.joined_at).toLocaleDateString('en-US', {month: 'short', year: 'numeric'});
            profileId.textContent = `Member ID: ${member.member_id} | Since ${joined}`;
        }

        const profileSavings = document.getElementById('profileSavings');
        if (profileSavings) profileSavings.textContent = money(member.savings_balance);
        const profileCreditScore = document.getElementById('profileCreditScore');
        if (profileCreditScore) profileCreditScore.textContent = member.credit_score;
        const profileLoanCount = document.getElementById('profileLoanCount');
        if (profileLoanCount) profileLoanCount.textContent = loans ? loans.length : member.total_shares;

        updateMetricsChart(member.savings_balance, transactions);
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
        const res = await fetch(`${API_BASE}/api/members/${getMemberId()}`, {
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
        const res = await fetch(`${API_BASE}/api/members/${getMemberId()}/password`, {
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

// ==================== INITIAL LOAD ====================
document.addEventListener('DOMContentLoaded', () => {
    if (!isLoggedIn()) return;
    loadDashboard();
});

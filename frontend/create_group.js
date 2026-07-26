// create_group.js — registers a new group against the Titukulane+ FastAPI backend

// Change this if your API runs somewhere other than localhost:8000
const API_BASE = "https://codeforbettertomorrow.onrender.com";

// Toggle Password Visibility
document.getElementById('toggle-pw').addEventListener('click', function () {
    const pwInput = document.getElementById('password');
    const icon = this.querySelector('i');

    if (pwInput.type === 'password') {
        pwInput.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        pwInput.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
});

// Primary Validation — client-side checks before showing the confirm modal.
// The server still re-validates everything (including duplicate group names
// and duplicate identifiers) when the form is actually submitted.
function createGroup(event) {
    event.preventDefault();

    const name = document.getElementById('group_name').value.trim();
    const admin = document.getElementById('admin_name').value.trim();
    const identifier = document.getElementById('identifier').value.trim();
    const rate = document.getElementById('number').value.trim();
    const password = document.getElementById('password').value;

    document.getElementById('form-error').style.display = 'none';
    document.getElementById('form-success').style.display = 'none';

    if (!name || !admin || !identifier || !rate || !password) {
        showError('Please fill in all required fields.');
        return;
    }

    if (isNaN(rate) || Number(rate) <= 0) {
        showError('Please enter a valid interest rate greater than 0%.');
        return;
    }

    if (password.length < 8) {
        showError('Password must be at least 8 characters long.');
        return;
    }

    // Populate modal summary text
    document.getElementById('summary-group').innerText = name;
    document.getElementById('summary-admin').innerText = admin;
    document.getElementById('summary-contact').innerText = identifier;
    document.getElementById('summary-rate').innerText = rate;

    // Open Modal
    document.getElementById('confirmModal').style.display = 'flex';
}

function showError(message) {
    document.getElementById('form-success').style.display = 'none';
    const errorBox = document.getElementById('form-error');
    errorBox.innerText = message;
    errorBox.style.display = 'block';
}

function showSuccess(message) {
    document.getElementById('form-error').style.display = 'none';
    const successBox = document.getElementById('form-success');
    successBox.innerText = message;
    successBox.style.display = 'block';
}

function closeModal() {
    document.getElementById('confirmModal').style.display = 'none';
}

// SUBMIT TO API & REDIRECT
async function submitFinalData() {
    const groupData = {
        group_name: document.getElementById('group_name').value.trim(),
        admin_name: document.getElementById('admin_name').value.trim(),
        identifier: document.getElementById('identifier').value.trim().toLowerCase(),
        interest_rate: Number(document.getElementById('number').value.trim()),
        password: document.getElementById('password').value
    };

    const confirmBtn = document.querySelector('#confirmModal .btn-primary');
    const originalBtnText = confirmBtn.innerText;
    confirmBtn.innerText = 'Creating…';
    confirmBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/auth/register-group`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(groupData)
        });

        const data = await response.json();

        if (!response.ok) {
            closeModal();
            showError(data.detail || 'Could not create the group. Please try again.');
            return;
        }

        closeModal();
        showSuccess(`Group "${data.name}" was created successfully! Redirecting to sign in…`);
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1800);
    } catch (err) {
        closeModal();
        showError('Could not reach the server. Check your connection and try again.');
    } finally {
        confirmBtn.innerText = originalBtnText;
        confirmBtn.disabled = false;
    }
}

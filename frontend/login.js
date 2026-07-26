
const API_BASE = "https://codeforbettertomorrow.onrender.com";

// Toggle Password Visibility
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('toggle-pw');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
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
    }
});

// Authentication Handler
async function loginUser(event) {
    event.preventDefault();

    const fullName = document.getElementById('full_name').value.trim();
    const groupName = document.getElementById('group_name').value.trim();
    const password = document.getElementById('password').value;
    const errorBox = document.getElementById('form-error');
    const loginBtn = document.getElementById('login-btn');

    // Clear previous error messages
    errorBox.style.display = 'none';
    errorBox.innerText = '';

    // Field level validation
    if (!fullName) {
        showError('Please enter your full name.');
        return;
    }
    if (!groupName) {
        showError('Please enter your group name.');
        return;
    }
    if (!password) {
        showError('Please enter your password.');
        return;
    }

    const originalBtnHtml = loginBtn.innerHTML;
    loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in…';
    loginBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                full_name: fullName,
                group_name: groupName,
                password: password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            showError(data.detail || 'Invalid group name, full name, or password.');
            return;
        }

        // Store the active session for the dashboard pages to read
        sessionStorage.setItem('titukulane_token', data.token);
        sessionStorage.setItem('titukulane_member_id', data.member_id);
        sessionStorage.setItem('titukulane_group_id', data.group_id);
        sessionStorage.setItem('titukulane_group_name', data.group_name);
        sessionStorage.setItem('titukulane_full_name', data.full_name);
        sessionStorage.setItem('titukulane_role', data.role);

        // Admins/treasurers land on the admin dashboard, everyone else on the member portal
        if (data.role === 'admin' || data.role === 'treasurer') {
            window.location.href = 'admin.html';
        } else {
            window.location.href = 'member.html';
        }
    } catch (err) {
        showError('Could not reach the server. Check your connection and try again.');
    } finally {
        loginBtn.innerHTML = originalBtnHtml;
        loginBtn.disabled = false;
    }
}

// Helper function to display form errors
function showError(message) {
    const errorBox = document.getElementById('form-error');
    errorBox.innerText = message;
    errorBox.style.display = 'block';
}
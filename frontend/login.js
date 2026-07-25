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
function loginUser(event) {
    event.preventDefault();

    const identifier = document.getElementById('identifier').value.trim().toLowerCase();
    const groupName = document.getElementById('group_name').value.trim();
    const password = document.getElementById('password').value;
    const errorBox = document.getElementById('form-error');

    // Clear previous error messages
    errorBox.style.display = 'none';
    errorBox.innerText = '';

    // Field level validation
    if (!identifier) {
        showError('Please enter your email or phone number.');
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

    // Retrieve saved groups list from LocalStorage
    const registeredGroups = JSON.parse(localStorage.getItem('titukulane_groups')) || [];

    if (registeredGroups.length === 0) {
        showError('No registered groups found. Please create a group first.');
        return;
    }

    // Match credentials against stored records
    const matchedGroup = registeredGroups.find(g => 
        g.groupName.toLowerCase() === groupName.toLowerCase() &&
        g.identifier === identifier &&
        g.password === password
    );

    if (matchedGroup) {
        // Store current active session
        sessionStorage.setItem('current_user_group', JSON.stringify(matchedGroup));
        
        alert(`Welcome back, ${matchedGroup.adminName}! Opening group ${matchedGroup.groupName}...`);
        
        // Redirect to your dashboard page
        window.location.href = 'dashboard.html'; 
    } else {
        showError('Invalid group name, email/phone, or password.');
    }
}

// Helper function to display form errors
function showError(message) {
    const errorBox = document.getElementById('form-error');
    errorBox.innerText = message;
    errorBox.style.display = 'block';
}
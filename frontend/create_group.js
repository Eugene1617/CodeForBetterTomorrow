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

// Primary Validation
function createGroup(event) {
    event.preventDefault();

    const name = document.getElementById('group_name').value.trim();
    const admin = document.getElementById('admin_name').value.trim();
    const identifier = document.getElementById('identifier').value.trim();
    const rate = document.getElementById('number').value.trim();
    const password = document.getElementById('password').value;
    const errorBox = document.getElementById('form-error');

    errorBox.style.display = 'none';
    errorBox.innerText = '';

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
    const errorBox = document.getElementById('form-error');
    errorBox.innerText = message;
    errorBox.style.display = 'block';
}

function closeModal() {
    document.getElementById('confirmModal').style.display = 'none';
}

// SAVE TO LOCAL STORAGE & REDIRECT
function submitFinalData() {
    const groupData = {
        groupName: document.getElementById('group_name').value.trim(),
        adminName: document.getElementById('admin_name').value.trim(),
        identifier: document.getElementById('identifier').value.trim().toLowerCase(),
        interestRate: document.getElementById('number').value.trim(),
        password: document.getElementById('password').value // Note: Plaintext for demo purposes
    };

    // Retrieve existing groups array or start a new one
    let registeredGroups = JSON.parse(localStorage.getItem('titukulane_groups')) || [];


    const groupExists = registeredGroups.some(
        g => g.groupName.toLowerCase() === groupData.groupName.toLowerCase()
    );

    if (groupExists) {
        closeModal();
        showError('A group with this name is already registered.');
        return;
    }

    // Save new group
    registeredGroups.push(groupData);
    localStorage.setItem('titukulane_groups', JSON.stringify(registeredGroups));

    closeModal();
    alert('Group registered successfully! Redirecting to login page...');
    
    // Redirect to login page
    window.location.href = 'index.html';
}
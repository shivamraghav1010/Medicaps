

// send OTP for email signup
async function sendSignupOTP() {
  const name = document.getElementById('first-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  if (!name || !email) return alert('Provide name and email');
  const res = await fetch('/api/signup/send-otp', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ name, email })
  });
  const data = await res.json();
  if (data.success) {
    document.getElementById('otp-section').classList.remove('hidden');
    alert(data.message);
  } else alert(data.message || 'Error');
}

// verify OTP and create account
async function completeSignup() {
  const email = document.getElementById('signup-email').value.trim();
  const otp = document.getElementById('signup-otp').value.trim();
  const password = document.getElementById('signup-pass').value;
  if (!otp || !password) return alert('Enter OTP and password');

  const res = await fetch('/api/signup/verify-otp', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ email, otp, password })
  });
  const data = await res.json();
  if (data.success) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    location.href = '/dashboard.html';
  } else alert(data.message || 'Signup failed');
}

// login
async function login() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.success) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    location.href = '/dashboard.html';
  } else alert(data.message || 'Login failed');
}

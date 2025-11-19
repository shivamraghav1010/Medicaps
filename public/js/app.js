

// ========== GLOBAL VARIABLES ========== //
let currentUser = JSON.parse(localStorage.getItem('user')) || null;
let recorder = null, recordedBlob = null, stream = null;
let allVideos = []; // FIXED: videos variable added to prevent reference error

// Redirect if not logged in
if (document.getElementById('welcome')) {
  if (!currentUser) location.href = 'index.html';
  else document.getElementById('welcome').innerHTML = `Welcome, ${currentUser.name}!`;
}

// ========== CAMERA SETUP ========== //
async function initCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const preview = document.getElementById('preview');
    if (preview) preview.srcObject = stream;

    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => recordedBlob = new Blob([e.data], { type: 'video/webm' });

    recorder.onstop = () => {
      const uploadBtn = document.getElementById('upload-btn');
      if (uploadBtn) uploadBtn.classList.remove('hidden');
    };

  } catch (err) {
    alert("Camera permission needed to record videos.");
  }
}

if (document.getElementById("preview")) initCamera();

// ========== RECORDING CONTROLS ========== //
document.getElementById('start-rec')?.addEventListener('click', () => {
  if (!recorder) return alert("Camera not ready.");
  
  recorder.start();
  document.getElementById('start-rec').classList.add('hidden');
  document.getElementById('stop-rec').classList.remove('hidden');
});

document.getElementById('stop-rec')?.addEventListener('click', () => {
  recorder.stop();
  document.getElementById('stop-rec').classList.add('hidden');
  document.getElementById('start-rec').classList.remove('hidden');
});

// ========== UPLOAD VIDEO ========== //
document.getElementById('upload-btn')?.addEventListener('click', async () => {
  if (!recordedBlob) return alert("No video recorded!");

  const formData = new FormData();
  formData.append("video", recordedBlob, "reel.webm");
  formData.append("name", currentUser.name);
  formData.append("mobile", currentUser.mobile);
  formData.append("sport", document.getElementById('sport')?.value || 'General');
  formData.append("age", document.getElementById('age')?.value || 'N/A');

  const btn = document.getElementById("upload-btn");
  btn.textContent = "Uploading...";
  btn.disabled = true;

  try {
    const res = await fetch('/api/upload', { method: "POST", body: formData });
    const data = await res.json();

    if (data.url) {
      alert("Upload successful!");
      loadVideos();
      btn.textContent = "Upload Again";
    }
  } catch (err) {
    alert("Upload failed. Try again.");
  } finally {
    btn.disabled = false;
  }
});

// ========== LOAD VIDEOS ========== //
async function loadVideos(filter = "") {
  try {
    let url = "/api/videos";
    if (filter) url += `?q=${encodeURIComponent(filter)}`;

    const res = await fetch(url);
    const data = await res.json();

    allVideos = data; // FIXED

    const container =
      document.getElementById('feed') ||
      document.getElementById('profile-videos');

    if (container) {
      container.innerHTML = data.map(v => createVideoCard(v)).join('');
    }
  } catch (err) {
    console.error("Error loading videos:", err);
  }
}

// ========== VIDEO CARD UI ========== //
function createVideoCard(v) {
  const commentsHtml = v.comments
    ? v.comments.map(c => `<p class="text-sm text-gray-500">${c.mobile}: ${c.comment}</p>`).join('')
    : '';

  return `
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
      <video src="${v.url}" controls class="w-full h-64 object-cover"></video>

      <div class="p-4">
        <h3 class="font-bold">${v.name} (${v.age}, ${v.sport})</h3>
        <p class="text-sm text-gray-600">${v.mobile}</p>

        <div class="flex gap-4 mt-3">
          <button onclick="likeVideo('${v.id}')" class="text-red-500">❤️ ${v.likes}</button>
          <button onclick="addComment('${v.id}')" class="text-blue-500">💬</button>
          <button onclick="shareVideo('${v.url}')" class="text-green-500">📤 Share</button>
        </div>

        <div class="mt-2">${commentsHtml}</div>
      </div>
    </div>
  `;
}

// ========== LIKE VIDEO ========== //
async function likeVideo(id) {
  await fetch(`/api/like/${id}`, { method: "POST" });
  loadVideos(document.getElementById('search')?.value || "");
}

// ========== COMMENT VIDEO ========== //
async function addComment(id) {
  const comment = prompt("Your comment:");
  if (!comment) return;

  await fetch(`/api/comment/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile: currentUser.mobile, comment })
  });

  loadVideos();
}

// ========== SHARE VIDEO (WhatsApp) ========== //
function shareVideo(url) {
  const text = `Check out this sports reel! ${url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

// ========== LAST VIDEO SHARE FIX ========== //
function shareLastVideo() {
  if (allVideos.length === 0) return alert("No videos available.");
  shareVideo(allVideos[0].url);
}

// ========== SEARCH ========== //
document.getElementById('search')?.addEventListener('input', (e) => loadVideos(e.target.value));

// ========== SPORT FILTER ========== //
document.getElementById('sport-filter')?.addEventListener('change', (e) => loadVideos(e.target.value));

// ========== UPDATE PROFILE ========== //
async function updateProfile() {
  const age = prompt("Enter age:", currentUser.age);
  const sport = prompt("Enter sport:", currentUser.sport);

  await fetch("/api/update-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile: currentUser.mobile, age, sport })
  });

  currentUser.age = age;
  currentUser.sport = sport;
  localStorage.setItem("user", JSON.stringify(currentUser));

  alert("Profile updated.");
}

// ========== LOAD PROFILE PAGE ========== //
async function loadProfile(mobile) {
  const res = await fetch(`/api/profile/${mobile}`);
  const data = await res.json();

  document.getElementById("profile-name").textContent = data.name;
  document.getElementById("profile-mobile").textContent = data.mobile;
  document.getElementById("profile-sport-age").textContent = `${data.sport}, Age ${data.age}`;

  document.getElementById("profile-videos").innerHTML =
    data.videos.map(createVideoCard).join('');

  document.getElementById("follow-btn").onclick = async () => {
    await fetch(`/api/follow/${mobile}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: currentUser.mobile })
    });
    alert("Followed!");
  };
}

// ========== LOGOUT ========== //
function logout() {
  localStorage.removeItem("user");
  location.href = "index.html";
}

// ========== DARK MODE ========== //
function toggleDarkMode() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem("darkMode", document.documentElement.classList.contains('dark'));
}

// Restore dark mode
if (localStorage.getItem("darkMode") === "true") {
  document.documentElement.classList.add("dark");
}

// Load feed on dashboard
if (document.getElementById("feed")) {
  loadVideos();
}


// const token = localStorage.getItem('token');
// const res = await fetch('/api/upload', {
//   method: 'POST',
//   headers: { 'Authorization': `Bearer ${token}` },
//   body: formData
// });

// ===============================
// LOGOUT FUNCTION
// ===============================
window.logout = async function () {
    try {
        console.log("Logging out...");

        // Delete token from local storage
        localStorage.removeItem("token");

        // Redirect user to login page
        window.location.href = "index.html";  // change to your login file name
    } catch (error) {
        console.error("Logout error:", error);
    }
};


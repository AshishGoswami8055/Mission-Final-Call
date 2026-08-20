const AUTH_KEY = "cdsAuth";

const $ = (id) => document.getElementById(id);

async function loadAuth() {
  const { [AUTH_KEY]: auth } = await chrome.storage.local.get(AUTH_KEY);
  return auth || null;
}

function show(auth) {
  $("logged-out").hidden = Boolean(auth?.token);
  $("logged-in").hidden = !auth?.token;
  if (auth?.token) $("who").textContent = auth.email || "Logged in";
}

$("login").addEventListener("click", async () => {
  const apiBase = $("api").value.trim().replace(/\/$/, "");
  const email = $("email").value.trim();
  const password = $("password").value;
  const msg = $("msg");
  msg.textContent = "";
  msg.className = "";

  if (!apiBase || !email || !password) {
    msg.textContent = "Fill all fields.";
    msg.className = "err";
    return;
  }

  try {
    const res = await fetch(`${apiBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Login failed");

    const auth = { apiBase, email, token: data.token };
    await chrome.storage.local.set({ [AUTH_KEY]: auth });
    show(auth);
  } catch (error) {
    msg.textContent = error.message || "Could not log in";
    msg.className = "err";
  }
});

$("logout").addEventListener("click", async () => {
  await chrome.storage.local.remove([AUTH_KEY, "cdsTrackSession"]);
  show(null);
});

loadAuth().then(show);

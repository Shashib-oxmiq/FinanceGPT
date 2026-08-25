const $ = (id) => document.getElementById(id);
const status = (msg) => { $("status").textContent = msg || ""; };

async function getConfig() {
  return new Promise((r) => chrome.storage.local.get(["backend", "token", "who"], r));
}

async function render() {
  const cfg = await getConfig();
  if (cfg.backend && cfg.token) {
    $("setup").style.display = "none";
    $("connected").style.display = "block";
    $("who").textContent = cfg.who || "your account";
  } else {
    $("setup").style.display = "block";
    $("connected").style.display = "none";
  }
}

$("save").addEventListener("click", async () => {
  const backend = $("backend").value.trim().replace(/\/$/, "");
  const token = $("token").value.trim();
  if (!backend || !token) return status("Enter backend URL and token");
  status("Verifying…");
  try {
    const res = await fetch(`${backend}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error();
    const user = await res.json();
    await chrome.storage.local.set({ backend, token, who: user.email });
    status("Connected");
    render();
  } catch {
    status("Could not verify. Check URL and token.");
  }
});

$("disconnect").addEventListener("click", async () => {
  await chrome.storage.local.remove(["backend", "token", "who"]);
  render();
});

$("fill").addEventListener("click", async () => {
  const cfg = await getConfig();
  status("Fetching profile…");
  try {
    const res = await fetch(`${cfg.backend}/api/profile`, { headers: { Authorization: `Bearer ${cfg.token}` } });
    const data = await res.json();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { type: "VAULTKIN_FILL", profile: data.profile }, (resp) => {
      if (chrome.runtime.lastError) { status("Reload the page and try again."); return; }
      status(`Filled ${resp?.filled ?? 0} field(s).`);
    });
  } catch {
    status("Failed to fetch profile.");
  }
});

render();

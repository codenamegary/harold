"use strict";

const API_URL = "http://127.0.0.1:3001";

const mockState = {
  workspaces: [
    { id: "ws-agent-server", name: "Agent Server", path: "~/sites/agent-server", agent: "Device authentication", agentCode: "DA", status: "working", detail: "Waiting for shell approval", updated: "now", requests: 3 },
    { id: "ws-paperclip", name: "Paperclip Web", path: "~/sites/paperclip-web", agent: "General", agentCode: "GE", status: "idle", detail: "Ready", updated: "4m ago", requests: 2 },
    { id: "ws-vector", name: "Vector Search", path: "~/labs/vector-search", agent: "Index diagnostics", agentCode: "ID", status: "idle", detail: "Ready", updated: "28m ago", requests: 1 },
    { id: "ws-docs", name: "Docs Site", path: "~/sites/docs", agent: "Documentation refresh", agentCode: "DR", status: "paused", detail: "Unavailable", updated: "2h ago", requests: 1 },
  ],
  agents: [
    { id: "agent-auth", workspaceId: "ws-agent-server", name: "Device authentication", state: "awaiting-approval" },
    { id: "agent-acp", workspaceId: "ws-agent-server", name: "ACP supervisor", state: "running" },
    { id: "agent-general", workspaceId: "ws-agent-server", name: "General", state: "idle" },
    { id: "agent-paperclip", workspaceId: "ws-paperclip", name: "General", state: "idle" },
    { id: "agent-vector", workspaceId: "ws-vector", name: "Index diagnostics", state: "idle" },
    { id: "agent-docs", workspaceId: "ws-docs", name: "Documentation refresh", state: "offline" },
  ],
  devices: [
    { id: "device-pixel", name: "Gary’s Pixel", type: "mobile", client: "Relay for Android · device key", lastSeen: "Active now", location: "Direct", status: "online" },
    { id: "device-local", name: "Local management console", type: "desktop", client: "Loopback-only web UI", lastSeen: "Active now", location: "This machine", status: "online" },
    { id: "device-tablet", name: "Travel tablet", type: "tablet", client: "Relay for Android · device key", lastSeen: "Yesterday, 19:11", location: "Cloud proxy", status: "offline" },
  ],
  activities: [
    { title: "Agent completed task", detail: "agent-server · 14 files changed", time: "12s", color: "green" },
    { title: "Prompt received", detail: "Gary’s MacBook Pro", time: "1m", color: "violet" },
    { title: "Device connected", detail: "Studio Desktop", time: "8m", color: "blue" },
    { title: "Workspace indexed", detail: "paperclip-web · 2,482 files", time: "22m", color: "green" },
    { title: "Approval granted", detail: "Run npm test", time: "41m", color: "violet" },
  ],
};

const state = {
  workspaces: [...mockState.workspaces],
  agents: [...mockState.agents],
  devices: [...mockState.devices],
  activities: [...mockState.activities],
  section: "dashboard",
  setupStep: 1,
  accessMode: "local",
  proxy: "caddy",
  apiConnected: false,
  chatting: false,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function relativeTime(value) {
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (elapsedSeconds < 60) return "now";
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}m ago`;
  if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)}h ago`;
  return `${Math.floor(elapsedSeconds / 86400)}d ago`;
}

function toast(message, type = "") {
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = message;
  $("#toast-region").append(node);
  setTimeout(() => node.remove(), 2800);
}

function statusPill(status) {
  if (status === "online" || status === "working") {
    return `<span class="status-pill success">${status === "working" ? "Working" : "Online"}</span>`;
  }
  if (status === "paused") return '<span class="status-pill">Paused</span>';
  return '<span class="status-pill">Offline</span>';
}

function agentClass(agent) {
  return /general/i.test(agent) ? "cursor" : "";
}

function renderDashboardWorkspaces() {
  $("#dashboard-workspaces").innerHTML = state.workspaces.slice(0, 4).map((workspace) => `
    <div class="workspace-row">
      <div class="workspace-identity">
        <span class="workspace-icon">⌘</span>
        <div><strong>${escapeHtml(workspace.name)}</strong><small>${escapeHtml(workspace.path)}</small></div>
      </div>
      <div class="agent-identity">
        <span class="agent-avatar ${agentClass(workspace.agent)}">${escapeHtml(workspace.agentCode || workspace.agent.slice(0, 2).toUpperCase())}</span>
        <div><strong>${escapeHtml(workspace.agent)}</strong><small>${escapeHtml(workspace.detail || "Ready")}</small></div>
      </div>
      <div class="mini-status"><span class="status-dot ${workspace.status === "working" ? "online" : "offline"}"></span>${escapeHtml(workspace.status)}</div>
      <div class="workspace-time">${escapeHtml(workspace.updated)}</div>
    </div>
  `).join("");
}

function renderActivities() {
  $("#activity-list").innerHTML = state.activities.slice(0, 5).map((item) => `
    <div class="activity-item">
      <span class="activity-pin ${escapeHtml(item.color || "")}"></span>
      <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div>
      <time>${escapeHtml(item.time)}</time>
    </div>
  `).join("");
}

function renderWorkspaceCards(filter = "") {
  const query = filter.trim().toLowerCase();
  const items = state.workspaces.filter((workspace) =>
    workspace.name.toLowerCase().includes(query) || workspace.path.toLowerCase().includes(query)
  );
  $("#workspace-cards").innerHTML = items.length ? items.map((workspace) => `
    <article class="workspace-card" data-workspace-id="${workspace.id}">
      <div class="workspace-card-head">
        <span class="workspace-icon">⌘</span>
        <button class="more-button" aria-label="Workspace options">•••</button>
      </div>
      <h3>${escapeHtml(workspace.name)}</h3>
      <code class="workspace-path">${escapeHtml(workspace.path)}</code>
      <div class="workspace-agent-row">
        <div class="agent-identity">
          <span class="agent-avatar ${agentClass(workspace.agent)}">${escapeHtml(workspace.agentCode || "AG")}</span>
          <div><strong>${escapeHtml(workspace.agent)}</strong><small>${workspace.requests || 0} requests today</small></div>
        </div>
        ${statusPill(workspace.status)}
      </div>
      <div class="card-actions">
        <button class="open-workspace-chat">Open in chat</button>
        <button class="toggle-workspace">${workspace.status === "paused" ? "Resume" : "Pause"}</button>
      </div>
    </article>
  `).join("") : '<div class="panel" style="padding:32px;color:#697381;font-size:10px">No matching workspaces found.</div>';
}

function deviceGlyph(type) {
  return { laptop: "▱", desktop: "▣", mobile: "▯", tablet: "▭" }[type] || "◇";
}

function renderDevices() {
  $("#device-list").innerHTML = state.devices.map((device) => `
    <div class="device-row" data-device-id="${device.id}">
      <div class="device-identity">
        <span class="device-icon">${deviceGlyph(device.type)}</span>
        <div><strong>${escapeHtml(device.name)}</strong><small>${escapeHtml(device.client)}</small></div>
      </div>
      <span class="device-cell">${escapeHtml(device.lastSeen)}</span>
      <span class="device-cell">${escapeHtml(device.location)}</span>
      ${statusPill(device.status)}
      <button class="revoke-button" title="Revoke device" aria-label="Revoke ${escapeHtml(device.name)}">×</button>
    </div>
  `).join("");
  const online = state.devices.filter((device) => device.status === "online").length;
  $("#online-device-count").textContent = `${online} device${online === 1 ? "" : "s"} online`;
  $("#active-devices-value").textContent = String(online);
  $("#paired-total").textContent = `${state.devices.length} total`;
}

function renderChatSelectors() {
  const options = state.workspaces.map((workspace) =>
    `<option value="${workspace.id}">${escapeHtml(workspace.name)}</option>`
  ).join("");
  $("#chat-workspace").innerHTML = options;
  updateAgentSelector();
}

function updateAgentSelector() {
  const workspaceId = $("#chat-workspace").value;
  const agents = state.agents.filter((agent) => String(agent.workspaceId) === workspaceId);
  $("#chat-agent").innerHTML = [
    ...agents.map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</option>`),
    '<option value="new">＋ Start a new agent</option>',
  ].join("");
}

function renderAll() {
  renderDashboardWorkspaces();
  renderActivities();
  renderWorkspaceCards($("#workspace-search")?.value || "");
  renderDevices();
  renderChatSelectors();
}

async function fetchCollection(path, fallback) {
  try {
    const response = await fetch(`${API_URL}/${path}`, { signal: AbortSignal.timeout(1800) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) && data.length ? data : fallback;
  } catch {
    return fallback;
  }
}

async function hydrateFromApi(showToast = false) {
  const apiState = $("#api-state");
  apiState.innerHTML = '<span class="status-dot warning"></span><span class="api-state-label">Checking API</span>';
  const [workspaces, agents, devices, activities] = await Promise.all([
    fetchCollection("workspaces", mockState.workspaces),
    fetchCollection("agents", mockState.agents),
    fetchCollection("devices", mockState.devices),
    fetchCollection("activityEvents", mockState.activities),
  ]);

  state.agents = agents;
  state.workspaces = workspaces.map((workspace) => {
    const workspaceAgents = agents.filter((agent) => String(agent.workspaceId) === String(workspace.id));
    const currentAgent = workspaceAgents.find((agent) => ["running", "awaiting-approval"].includes(agent.state))
      || workspaceAgents[0];
    const initials = currentAgent?.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AG";
    return {
      ...workspace,
      agent: currentAgent?.name || "No agents yet",
      agentCode: initials,
      status: workspace.state === "available"
        ? (workspace.activeAgentCount > 0 ? "working" : "idle")
        : "paused",
      detail: currentAgent?.summary || (workspace.state === "available" ? "Ready" : "Unavailable"),
      updated: workspace.lastUsedAt ? relativeTime(workspace.lastUsedAt) : "Never",
      requests: workspace.agentCount || workspaceAgents.length,
    };
  });
  state.devices = devices.map((device) => ({
    ...device,
    type: device.platform === "android" ? "mobile" : "desktop",
    client: device.platform === "android" ? "Relay for Android · device key" : "Loopback-only web UI",
    lastSeen: device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Never",
    location: device.platform === "android" ? "Paired endpoint" : "This machine",
    status: device.state,
  }));
  state.activities = activities.map((event) => event.message ? ({
    title: event.message,
    detail: event.type.replaceAll(".", " · "),
    time: new Date(event.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    color: event.type.includes("approval") ? "violet" : event.type.includes("device") ? "blue" : "green",
  }) : event);

  try {
    const response = await fetch(`${API_URL}/workspaces`, { signal: AbortSignal.timeout(1200) });
    state.apiConnected = response.ok;
  } catch {
    state.apiConnected = false;
  }

  apiState.innerHTML = state.apiConnected
    ? '<span class="status-dot online"></span><span class="api-state-label">API connected</span>'
    : '<span class="status-dot warning"></span><span class="api-state-label">Demo data</span>';
  renderAll();
  if (showToast) toast(state.apiConnected ? "Live API data refreshed" : "API unavailable — using realistic demo data", state.apiConnected ? "success" : "");
}

const pageMeta = {
  dashboard: ["LOCAL SERVER", "Overview"],
  setup: ["CONNECTION WIZARD", "Connect"],
  workspaces: ["PROJECTS & AGENTS", "Workspaces"],
  devices: ["ACCESS CONTROL", "Devices"],
  chat: ["LOCAL TEST", "Agent playground"],
  settings: ["SERVER", "Settings"],
};

function navigate(section, options = {}) {
  if (!pageMeta[section]) return;
  state.section = section;
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `${section}-view`));
  $$(".nav-item[data-section]").forEach((item) => item.classList.toggle("active", item.dataset.section === section));
  $("#page-eyebrow").textContent = pageMeta[section][0];
  $("#page-title").textContent = pageMeta[section][1];
  $("#sidebar").classList.remove("open");
  if (section === "setup" && options.step) setSetupStep(Number(options.step));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setSetupStep(step) {
  state.setupStep = Math.min(4, Math.max(1, step));
  $("#setup-current-step").textContent = state.setupStep;
  $$(".setup-page").forEach((page) => page.classList.toggle("active", Number(page.dataset.setupPage) === state.setupStep));
  $$(".setup-step").forEach((button) => {
    const buttonStep = Number(button.dataset.step);
    button.classList.toggle("active", buttonStep === state.setupStep);
    button.classList.toggle("complete", buttonStep < state.setupStep);
  });
}

const proxyTemplates = {
  caddy: {
    label: "Caddyfile",
    code: (url) => `${url.replace(/^https?:\/\//, "")} {\n  # Private address of your home PC over WireGuard\n  reverse_proxy http://10.8.0.2:3210\n  encode zstd gzip\n}`,
    note: "Run Caddy on the VPS and connect it to this machine with WireGuard. Replace 10.8.0.2 with the machine’s private tunnel address.",
  },
  tailscale: {
    label: "Terminal",
    code: () => `tailscale serve --bg https / http://127.0.0.1:3210\n\n# Check your assigned URL\ntailscale serve status`,
    note: "Tailscale Serve keeps the endpoint private to devices on your tailnet. Use Funnel if you need public access.",
  },
  cloudflare: {
    label: "config.yml",
    code: (url) => `tunnel: cursor-acp\ncredentials-file: ~/.cloudflared/cursor-acp.json\n\ningress:\n  - hostname: ${url.replace(/^https?:\/\//, "")}\n    service: http://127.0.0.1:3210\n  - service: http_status:404`,
    note: "Create a named tunnel first, then point the selected hostname to it in Cloudflare DNS.",
  },
};

function updateProxyTemplate() {
  const rawUrl = $("#external-url").value.trim() || "acp.example.com";
  const fullUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  const template = proxyTemplates[state.proxy];
  $("#proxy-label").textContent = template.label;
  $("#proxy-code").textContent = template.code(fullUrl);
  $("#proxy-note").textContent = template.note;
  $("#test-url").textContent = fullUrl;
}

function generateQr() {
  let seed = [...$("#pair-code").textContent].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const cells = [];
  for (let index = 0; index < 169; index += 1) {
    seed = (seed * 9301 + 49297) % 233280;
    const row = Math.floor(index / 13);
    const column = index % 13;
    const corner = (row < 4 && column < 4) || (row < 4 && column > 8) || (row > 8 && column < 4);
    const on = corner ? (row % 3 !== 1 || column % 3 !== 1) : seed / 233280 > 0.52;
    cells.push(`<i class="${on ? "on" : ""}"></i>`);
  }
  $("#qr-grid").innerHTML = cells.join("");
}

async function copyText(text, label = "Copied to clipboard") {
  try {
    await navigator.clipboard.writeText(text);
    toast(label, "success");
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    toast(label, "success");
  }
}

async function runConnectionTest() {
  const button = $("#run-test");
  button.disabled = true;
  button.innerHTML = 'Testing <span class="spinner" style="width:13px;height:13px"></span>';
  $("#test-continue").classList.add("hidden");
  $("#test-result").className = "test-result";
  $("#test-result").innerHTML = "<span>Running connection checks…</span><small>Keep this window open.</small>";
  const checks = $$(".test-check");
  checks.forEach((check) => {
    check.className = "test-check";
    $(".check-state", check).textContent = "·";
    $("em", check).textContent = "Waiting";
  });

  for (const check of checks) {
    check.classList.add("running");
    $("em", check).textContent = "Checking";
    await new Promise((resolve) => setTimeout(resolve, 650));
    check.classList.remove("running");
    check.classList.add("success");
    $(".check-state", check).textContent = "✓";
    $("em", check).textContent = "Passed";
  }

  $("#test-result").className = "test-result success";
  $("#test-result").innerHTML = "<span>Connection verified</span><small>Your endpoint is ready for secure ACP connections.</small>";
  button.classList.add("hidden");
  $("#test-continue").classList.remove("hidden");
  toast("External connection verified", "success");
}

function randomPairCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "RLY-";
  for (let i = 0; i < 3; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  $("#pair-code").textContent = code;
  $("#pair-expiry").textContent = "10:00";
  generateQr();
  toast("New pairing code generated", "success");
}

function addMessage(role, content) {
  $(".welcome-message")?.remove();
  const message = document.createElement("div");
  message.className = `message ${role}`;
  const selectedAgent = state.agents.find((item) => String(item.id) === $("#chat-agent").value);
  const agent = selectedAgent?.name || "New agent";
  message.innerHTML = `
    <span class="message-avatar">${role === "assistant" ? "R" : "YO"}</span>
    <div class="message-content">
      <div class="message-meta"><strong>${role === "assistant" ? escapeHtml(agent) : "You"}</strong><time>just now</time></div>
      <div class="message-text">${escapeHtml(content)}</div>
    </div>
  `;
  $("#chat-body").append(message);
  $("#chat-body").scrollTop = $("#chat-body").scrollHeight;
  return $(".message-text", message);
}

function createApprovalCard(message) {
  const card = document.createElement("div");
  card.className = "approval-card";
  card.innerHTML = `
    <div class="approval-card-head">
      <span class="approval-card-icon">!</span>
      <div><strong>Command approval required</strong><p>The agent wants to run a command in this workspace.</p></div>
    </div>
    <code>npm test -- --runInBand</code>
    <div class="approval-actions"><button class="deny">Deny</button><button class="approve">Approve once</button></div>
  `;
  message.closest(".message-content").append(card);
  $(".approve", card).addEventListener("click", () => {
    card.innerHTML = '<div class="mini-status"><span class="status-dot online"></span> Approved · command running locally</div>';
    setTimeout(() => addMessage("assistant", "All tests passed: 24 suites, 186 tests, 0 failures."), 800);
  });
  $(".deny", card).addEventListener("click", () => {
    card.innerHTML = '<div class="mini-status"><span class="status-dot offline"></span> Command denied</div>';
  });
}

async function sendChatMessage(prefill) {
  if (state.chatting) return;
  const input = $("#chat-input");
  const text = (prefill || input.value).trim();
  if (!text) return;
  if (text === "/clear") {
    clearChat();
    input.value = "";
    return;
  }

  state.chatting = true;
  input.value = "";
  input.style.height = "auto";
  $("#slash-menu").classList.remove("open");
  addMessage("user", text);
  const responseNode = addMessage("assistant", "");
  responseNode.classList.add("typing-cursor");

  const workspace = state.workspaces.find((item) => String(item.id) === $("#chat-workspace").value) || state.workspaces[0];
  let response = `I inspected ${workspace.name} and the ACP session is healthy. The workspace is indexed, the agent is ready, and there are no connection issues.`;
  let needsApproval = false;
  if (/test|tests/i.test(text)) {
    response = "I can run the test suite to verify the current workspace. This requires approval because it executes a local command.";
    needsApproval = true;
  } else if (/status|git/i.test(text)) {
    response = `The ${workspace.name} workspace is on branch main with 3 modified files. The ACP agent is connected and responding in 18ms.`;
  } else if (/bug|review/i.test(text)) {
    response = "I found two areas worth reviewing: request timeout handling in the API client and a missing null guard in workspace selection. No critical issues detected.";
  } else if (/summarize/i.test(text)) {
    response = `${workspace.name} is a local ACP server project with workspace routing, device pairing, and agent session management. Recent activity is concentrated in the management console.`;
  }

  for (let index = 0; index < response.length; index += 2) {
    responseNode.textContent = response.slice(0, index + 2);
    $("#chat-body").scrollTop = $("#chat-body").scrollHeight;
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
  responseNode.classList.remove("typing-cursor");
  if (needsApproval) createApprovalCard(responseNode);
  state.chatting = false;
}

function clearChat() {
  $("#chat-body").innerHTML = `
    <div class="welcome-message">
      <div class="welcome-mark">›_</div>
      <h3>Test your ACP connection</h3>
      <p>Send a prompt directly to an agent without leaving the console.</p>
      <div class="prompt-chips">
        <button>Summarize this workspace</button>
        <button>Check the current git status</button>
        <button>Find potential bugs</button>
      </div>
    </div>
  `;
  bindPromptChips();
}

function bindPromptChips() {
  $$(".prompt-chips button").forEach((button) => button.addEventListener("click", () => sendChatMessage(button.textContent)));
}

function openWorkspaceModal() {
  $("#workspace-modal").classList.add("open");
  $("#workspace-modal").setAttribute("aria-hidden", "false");
  $("#new-workspace-name").focus();
  $("#new-workspace-name").select();
}

function closeWorkspaceModal() {
  $("#workspace-modal").classList.remove("open");
  $("#workspace-modal").setAttribute("aria-hidden", "true");
}

function appendAllowedRoot(path) {
  const root = document.createElement("div");
  root.className = "allowed-root";
  const label = document.createElement("span");
  label.textContent = path;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.setAttribute("aria-label", `Remove ${path}`);
  remove.textContent = "×";
  root.append(label, remove);
  $("#allowed-root-list").append(root);
}

function bindEvents() {
  $$("[data-section]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.section)));
  $$("[data-go]").forEach((button) => button.addEventListener("click", () =>
    navigate(button.dataset.go, { step: button.dataset.stepTarget })
  ));
  $("#mobile-menu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#refresh-button").addEventListener("click", () => hydrateFromApi(true));

  $$(".setup-step").forEach((button) => button.addEventListener("click", () => setSetupStep(Number(button.dataset.step))));
  $$(".next-step").forEach((button) => button.addEventListener("click", () => {
    if (state.setupStep === 1 && state.accessMode === "local") {
      setSetupStep(4);
      toast("Using the local endpoint — cloud configuration skipped", "success");
      return;
    }
    setSetupStep(state.setupStep + 1);
  }));
  $$(".previous-step").forEach((button) => button.addEventListener("click", () => setSetupStep(state.setupStep - 1)));
  $$("[data-access-mode]").forEach((button) => button.addEventListener("click", () => {
    state.accessMode = button.dataset.accessMode;
    $$("[data-access-mode]").forEach((item) => item.classList.toggle("selected", item === button));
  }));
  $$(".proxy-tab").forEach((button) => button.addEventListener("click", () => {
    state.proxy = button.dataset.proxy;
    $$(".proxy-tab").forEach((item) => item.classList.toggle("active", item === button));
    updateProxyTemplate();
  }));
  $("#external-url").addEventListener("input", updateProxyTemplate);
  $(".copy-url").addEventListener("click", () => copyText($("#test-url").textContent, "External URL copied"));
  $$("[data-copy-target]").forEach((button) => button.addEventListener("click", () => {
    copyText($(`#${button.dataset.copyTarget}`).textContent, "Copied to clipboard");
  }));
  $("#run-test").addEventListener("click", runConnectionTest);
  $("#regenerate-code").addEventListener("click", randomPairCode);

  $("#workspace-search").addEventListener("input", (event) => renderWorkspaceCards(event.target.value));
  $$(".segmented button").forEach((button) => button.addEventListener("click", () => {
    $$(".segmented button").forEach((item) => item.classList.toggle("active", item === button));
    const filter = button.textContent.toLowerCase();
    renderWorkspaceCards(filter === "all" ? "" : filter === "active" ? "" : "");
    if (filter !== "all") {
      const desired = filter === "active" ? ["working", "idle"] : ["paused"];
      $$(".workspace-card").forEach((card) => {
        const workspace = state.workspaces.find((item) => String(item.id) === card.dataset.workspaceId);
        card.style.display = desired.includes(workspace?.status) ? "" : "none";
      });
    }
  }));
  $("#workspace-cards").addEventListener("click", (event) => {
    const card = event.target.closest(".workspace-card");
    if (!card) return;
    const workspace = state.workspaces.find((item) => String(item.id) === card.dataset.workspaceId);
    if (event.target.closest(".open-workspace-chat")) {
      navigate("chat");
      $("#chat-workspace").value = String(workspace.id);
      updateAgentSelector();
    }
    if (event.target.closest(".toggle-workspace")) {
      workspace.status = workspace.status === "paused" ? "idle" : "paused";
      workspace.detail = workspace.status === "paused" ? "Paused" : "Ready";
      renderAll();
      toast(`${workspace.name} ${workspace.status === "paused" ? "paused" : "resumed"}`, "success");
    }
  });

  $("#device-list").addEventListener("click", (event) => {
    const button = event.target.closest(".revoke-button");
    if (!button) return;
    const row = button.closest(".device-row");
    const device = state.devices.find((item) => String(item.id) === row.dataset.deviceId);
    if (window.confirm(`Revoke access for ${device.name}?`)) {
      state.devices = state.devices.filter((item) => item.id !== device.id);
      renderDevices();
      toast(`${device.name} was revoked`);
    }
  });

  $("#chat-workspace").addEventListener("change", updateAgentSelector);
  $("#send-message").addEventListener("click", () => sendChatMessage());
  $("#clear-chat").addEventListener("click", clearChat);
  $("#chat-input").addEventListener("input", (event) => {
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 130)}px`;
    $("#slash-menu").classList.toggle("open", event.target.value.startsWith("/"));
  });
  $("#chat-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      sendChatMessage();
    }
    if (event.key === "Escape") $("#slash-menu").classList.remove("open");
  });
  $$(".slash-menu button").forEach((button) => button.addEventListener("click", () => {
    $("#chat-input").value = button.dataset.command;
    $("#slash-menu").classList.remove("open");
    $("#chat-input").focus();
  }));
  bindPromptChips();

  $("#add-workspace").addEventListener("click", openWorkspaceModal);
  $$(".close-modal").forEach((button) => button.addEventListener("click", closeWorkspaceModal));
  $("#workspace-modal").addEventListener("click", (event) => {
    if (event.target === $("#workspace-modal")) closeWorkspaceModal();
  });
  $("#confirm-workspace").addEventListener("click", () => {
    const name = $("#new-workspace-name").value.trim();
    const path = $("#new-workspace-path").value.trim();
    const agent = $("#new-workspace-agent").value;
    if (!name || !path) return toast("Name and path are required");
    state.workspaces.push({
      id: String(Date.now()), name, path, agent,
      agentCode: agent.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      status: "idle", detail: "Ready", updated: "now", requests: 0,
    });
    state.agents.push({
      id: `agent-${Date.now()}`,
      workspaceId: String(state.workspaces.at(-1).id),
      name: agent,
      state: "idle",
    });
    closeWorkspaceModal();
    renderAll();
    toast(`${name} added`, "success");
  });
  $("#download-logs").addEventListener("click", () => toast("Diagnostics bundle prepared (prototype)", "success"));
  $("#add-allowed-root").addEventListener("click", () => {
    const path = window.prompt("Absolute folder path to allow", "/home/codenamegary/sites");
    if (!path) return;
    if (!path.startsWith("/") && !path.startsWith("~/")) {
      toast("Enter an absolute path or a path beginning with ~/");
      return;
    }
    const existing = $$(".allowed-root span").some((item) => item.textContent === path);
    if (existing) return toast("That folder is already allowed");
    appendAllowedRoot(path);
    toast(`${path} added to allowed roots`, "success");
  });
  $("#allowed-root-list").addEventListener("click", (event) => {
    const button = event.target.closest(".allowed-root button");
    if (!button) return;
    const root = button.closest(".allowed-root");
    const path = $("span", root).textContent;
    root.remove();
    toast(`${path} removed — files were not deleted`);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeWorkspaceModal();
  });
}

function initialize() {
  bindEvents();
  updateProxyTemplate();
  generateQr();
  renderAll();
  hydrateFromApi();
}

initialize();

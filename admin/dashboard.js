const API = "/api/admin";
const NEW_STATUS = "\u062c\u062f\u064a\u062f";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

async function api(type, method = "GET", body = null, id = null) {
  const options = {
    method,
    credentials: "same-origin",
    headers: {}
  };
  if (body !== null) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetch(
    `${API}/${type}${id ? "/" + id : ""}`, options
  );
  const result = await response.json().catch(() => ({}));

  if (response.status === 401) {
    location.href = "/admin/login";
    throw new Error("Please log in again.");
  }
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

function showMessage(message) {
  alert(message);
}

function showPanel(id, btn) {
  document.querySelectorAll(".panel").forEach(x => x.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelectorAll(".menu button").forEach(x => x.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("pageTitle").textContent = {
    dashboard: "\u0644\u0648\u062d\u0629 \u0627\u0644\u0642\u064a\u0627\u062f\u0629",
    clients: "\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0639\u0645\u0644\u0627\u0621",
    requests: "\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0637\u0644\u0628\u0627\u062a",
    projects: "\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0645\u0634\u0627\u0631\u064a\u0639"
  }[id];
}

async function removeItem(type, id) {
  if (!confirm("Confirm deletion?")) return;
  try {
    await api(type, "DELETE", null, id);
    await render();
    showMessage("Deleted successfully.");
  } catch (error) {
    showMessage(error.message);
  }
}

async function render() {
  try {
    const results = await Promise.all([
      api("clients"), api("requests"), api("projects")
    ]);

    const c = results[0].data;
    const r = results[1].data;
    const p = results[2].data;

    clientCount.textContent = c.length;
    requestCount.textContent = r.length;
    projectCount.textContent = p.length;
    newCount.textContent = r.filter(x => x.status === NEW_STATUS).length;

    clientsTable.innerHTML = c.map(x =>
      `<tr><td>${esc(x.name)}</td><td>${esc(x.phone)}</td><td>${esc(x.business)}</td><td><button class="btn secondary" onclick="removeItem('clients',${Number(x.id)})">حذف</button></td></tr>`
    ).join("");

    requestsTable.innerHTML = r.map(x =>
      `<tr><td>${esc(x.client)}</td><td>${esc(x.service)}</td><td>${esc(x.status)}</td><td>${esc(x.date)}</td><td><button class="btn secondary" onclick="removeItem('requests',${Number(x.id)})">حذف</button></td></tr>`
    ).join("");

    projectsTable.innerHTML = p.map(x =>
      `<tr><td>${esc(x.name)}</td><td>${esc(x.client)}</td><td>${esc(x.status)}</td><td>${esc(x.date)}</td><td><button class="btn secondary" onclick="removeItem('projects',${Number(x.id)})">حذف</button></td></tr>`
    ).join("");

    recentRequests.innerHTML = r.length
      ? r.slice(0, 5).map(x => `<p>${esc(x.client)} — ${esc(x.service)} — ${esc(x.status)}</p>`).join("")
      : "\u0644\u0627 \u062a\u0648\u062c\u062f \u0637\u0644\u0628\u0627\u062a \u0628\u0639\u062f.";

    document.querySelectorAll("tbody").forEach(t => {
      if (!t.innerHTML.trim()) {
        t.innerHTML = '<tr><td colspan="5" class="empty">\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a \u0628\u0639\u062f.</td></tr>';
      }
    });
  } catch (error) {
    showMessage(error.message);
  }
}

clientForm.addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await api("clients", "POST", {
      name: clientName.value,
      phone: clientPhone.value,
      business: clientBusiness.value,
      email: clientEmail.value
    });
    clientForm.reset();
    await render();
    showMessage("Client saved.");
  } catch (error) { showMessage(error.message); }
});

requestForm.addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await api("requests", "POST", {
      client: requestClient.value,
      service: requestService.value,
      status: requestStatus.value,
      details: requestDetails.value
    });
    requestForm.reset();
    await render();
    showMessage("Request saved.");
  } catch (error) { showMessage(error.message); }
});

projectForm.addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await api("projects", "POST", {
      name: projectName.value,
      client: projectClient.value,
      status: projectStatus.value,
      date: projectDate.value
    });
    projectForm.reset();
    await render();
    showMessage("Project saved.");
  } catch (error) { showMessage(error.message); }
});

render();

(() => {
  const form = document.getElementById("agentForm");
  const promptInput = document.getElementById("agentPrompt");
  const runButton = document.getElementById("agentRun");
  const status = document.getElementById("agentStatus");
  const output = document.getElementById("agentOutput");
  const history = document.getElementById("agentHistory");

  if (!form || !promptInput || !runButton || !status || !output || !history) return;

  const STATUS_LABELS = {
    running: "جارٍ التشغيل...",
    succeeded: "اكتمل",
    failed: "فشل",
    timeout: "انتهت المهلة"
  };

  let timer = null;
  let pollToken = 0;

  function setStatus(text, online) {
    status.textContent = text;
    status.classList.toggle("online", Boolean(online));
    status.classList.toggle("offline", !online);
  }

  async function request(url, options = {}) {
    const body = options.body && typeof options.body !== "string"
      ? JSON.stringify(options.body)
      : options.body;

    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      body,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      location.href = "/admin/login";
      throw new Error("يرجى تسجيل الدخول مجدداً.");
    }

    if (!response.ok) {
      throw new Error(data.error || "حدث خطأ في الطلب.");
    }

    return data;
  }

  function showAgentPanel(button) {
    document.querySelectorAll(".panel").forEach(panel => panel.classList.remove("active"));
    document.getElementById("agent").classList.add("active");
    document.querySelectorAll(".menu button").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    document.getElementById("pageTitle").textContent = "وكيل pi";
    loadRuns();
  }

  window.showAgentPanel = showAgentPanel;

  function displayRun(run) {
    output.textContent = run.output || run.error || "لا توجد نتيجة.";
    setStatus(STATUS_LABELS[run.status] || run.status, run.status === "succeeded");
  }

  async function loadRuns() {
    try {
      const data = await request("/api/agent/runs");
      history.replaceChildren();

      if (!data.runs || !data.runs.length) {
        history.textContent = "لا توجد عمليات محفوظة بعد.";
        return;
      }

      for (const run of data.runs) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn secondary";
        button.textContent = `#${run.id} — ${STATUS_LABELS[run.status] || run.status} — ${run.createdAt}`;
        button.addEventListener("click", async () => {
          try {
            const detail = await request(`/api/agent/runs/${run.id}`);
            displayRun(detail.run);
          } catch (error) {
            output.textContent = error.message;
          }
        });
        history.appendChild(button);
        history.appendChild(document.createElement("br"));
      }
    } catch (error) {
      history.textContent = error.message;
    }
  }

  function stopPolling() {
    pollToken += 1;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  async function poll(id, token) {
    if (token !== pollToken) return;

    try {
      const data = await request(`/api/agent/runs/${id}`);
      const run = data.run;
      displayRun(run);

      if (run.status === "running") {
        timer = setTimeout(() => poll(id, token), 2000);
        return;
      }

      runButton.disabled = false;
      loadRuns();
    } catch (error) {
      output.textContent = error.message;
      setStatus("فشل", false);
      runButton.disabled = false;
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const prompt = promptInput.value.trim();
    if (!prompt) return;

    stopPolling();
    const token = pollToken;
    runButton.disabled = true;
    output.textContent = "جارٍ التحليل محلياً...";
    setStatus(STATUS_LABELS.running, true);

    try {
      const data = await request("/api/agent/runs", {
        method: "POST",
        body: { prompt }
      });
      poll(data.run.id, token);
    } catch (error) {
      output.textContent = error.message;
      setStatus(STATUS_LABELS.failed, false);
      runButton.disabled = false;
    }
  });
})();

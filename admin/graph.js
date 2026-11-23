(() => {
  const buildButton = document.getElementById("graphBuild");
  const status = document.getElementById("graphStatus");
  const meta = document.getElementById("graphMeta");
  const report = document.getElementById("graphReport");
  const viewLink = document.getElementById("graphView");

  if (!buildButton || !status || !meta || !report || !viewLink) return;

  const LABELS = {
    running: "جارٍ البناء...",
    succeeded: "اكتمل",
    rejected: "مرفوض",
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
      const error = new Error(data.error || "حدث خطأ في الطلب.");
      error.status = response.status;
      throw error;
    }

    return data;
  }

  function render(build) {
    if (!build) {
      setStatus("جاهز", false);
      meta.textContent = "لا يوجد بناء بعد.";
      report.textContent = "لا يوجد تقرير بعد.";
      viewLink.hidden = true;
      return;
    }

    setStatus(LABELS[build.status] || build.status, build.status === "succeeded");

    const parts = [`#${build.id}`, build.createdAt];
    if (build.durationMs != null) {
      parts.push(`${(build.durationMs / 1000).toFixed(1)} ث`);
    }
    if (build.error) parts.push(build.error);
    meta.textContent = parts.join(" — ");

    report.textContent = build.report || "لا يوجد تقرير بعد.";
    viewLink.hidden = !(build.status === "succeeded" && build.htmlPath);
  }

  async function loadLatest() {
    try {
      const data = await request("/api/agent/graph/latest");
      render(data.build);
      return data.build;
    } catch (error) {
      if (error.status === 404) {
        render(null);
        return null;
      }
      throw error;
    }
  }

  function showGraphPanel(button) {
    document.querySelectorAll(".panel").forEach(panel => panel.classList.remove("active"));
    document.getElementById("graph").classList.add("active");
    document.querySelectorAll(".menu button").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    document.getElementById("pageTitle").textContent = "خريطة الكود";
    loadLatest().catch(error => {
      meta.textContent = error.message;
    });
  }

  window.showGraphPanel = showGraphPanel;

  function stopPolling() {
    pollToken += 1;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  async function poll(token) {
    if (token !== pollToken) return;

    try {
      const data = await request("/api/agent/graph/latest");
      render(data.build);

      if (data.build.status === "running") {
        timer = setTimeout(() => poll(token), 2000);
        return;
      }

      buildButton.disabled = false;
    } catch (error) {
      meta.textContent = error.message;
      setStatus("فشل", false);
      buildButton.disabled = false;
    }
  }

  buildButton.addEventListener("click", async () => {
    stopPolling();
    const token = pollToken;
    buildButton.disabled = true;
    setStatus(LABELS.running, true);
    meta.textContent = "جارٍ بناء الخريطة محلياً...";

    try {
      const data = await request("/api/agent/graph/build", { method: "POST", body: {} });
      render(data.build);
      poll(token);
    } catch (error) {
      meta.textContent = error.message;
      setStatus(LABELS.failed, false);
      buildButton.disabled = false;
    }
  });
})();

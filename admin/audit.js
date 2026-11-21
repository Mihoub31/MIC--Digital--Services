(() => {
  const runButton = document.getElementById("runAudit");
  const status = document.getElementById("auditStatus");
  const summary = document.getElementById("auditSummary");
  const report = document.getElementById("auditReport");
  const history = document.getElementById("auditHistory");

  if (!runButton || !status || !summary || !report || !history) return;

  function showAuditPanel(btn) {
    document.querySelectorAll(".panel").forEach(x => x.classList.remove("active"));
    document.getElementById("audit").classList.add("active");
    document.querySelectorAll(".menu button").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("pageTitle").textContent = "تدقيق المشروع";
    loadHistory();
  }

  window.showAuditPanel = showAuditPanel;

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
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

  function normalizeAnalysis(data) {
    const analysis = data.analysis;

    if (typeof analysis === "string") {
      return { model: data.model || "غير محدد", answer: analysis };
    }

    if (analysis && typeof analysis === "object") {
      return {
        model: analysis.model || data.model || "غير محدد",
        answer: typeof analysis.answer === "string" ? analysis.answer : ""
      };
    }

    return { model: data.model || "غير محدد", answer: "" };
  }

  function displayResult(data) {
    const { model, answer } = normalizeAnalysis(data);
    const auditSummary = data.summary || {};
    const severity = auditSummary.bySeverity || {};

    summary.textContent =
      `النموذج: ${model} | الملفات المفحوصة: ${data.filesAnalyzed ?? 0} | الأحرف: ${data.charactersReviewed ?? 0} | الملفات المتجاوزة: ${(data.skippedFiles || []).length}` +
      (data.findings
        ? ` | مؤكدة: ${auditSummary.confirmed ?? 0} | تحتاج تحققاً: ${auditSummary.needsReview ?? 0} | عالية: ${severity.high ?? 0}`
        : "");

    report.textContent = answer || "لم يصل تقرير من الخادم.";
  }

  async function loadHistory() {
    try {
      const data = await request("/api/agent/audit/history");
      history.replaceChildren();

      if (!data.history || !data.history.length) {
        history.textContent = "لا توجد تقارير محفوظة بعد.";
        return;
      }

      data.history.forEach(item => {
        const row = document.createElement("div");
        row.className = "audit-history-item";

        const info = document.createElement("p");
        info.textContent =
          `#${item.id} — ${item.createdAt} — ${item.model || "نموذج غير محدد"} — ${item.filesAnalyzed} ملفات`;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn secondary";
        button.textContent = "عرض التقرير";

        button.addEventListener("click", () => {
          summary.textContent =
            `النموذج: ${item.model || "غير محدد"} | الملفات المفحوصة: ${item.filesAnalyzed} | الأحرف: ${item.charactersReviewed} | الملفات المتجاوزة: ${(item.skippedFiles || []).length}`;

          report.textContent = item.report || "التقرير فارغ.";
        });

        row.append(info, button);
        history.appendChild(row);
      });
    } catch (error) {
      history.textContent = error.message;
    }
  }

  runButton.addEventListener("click", async () => {
    runButton.disabled = true;
    status.textContent = "جارٍ تحليل الملفات...";
    status.className = "ai-status offline";
    summary.textContent = "التدقيق قيد التنفيذ...";
    report.textContent = "يرجى الانتظار حتى ينتهي النموذج المحلي.";

    try {
      const data = await request("/api/agent/audit", {
        method: "POST",
        body: "{}"
      });

      displayResult(data);

      status.textContent = "اكتمل التدقيق وحُفظ التقرير";
      status.className = "ai-status online";

      await loadHistory();
    } catch (error) {
      status.textContent = "تعذر إكمال التدقيق";
      report.textContent = error.message;
    } finally {
      runButton.disabled = false;
    }
  });

  loadHistory();
})();

// MIC REPORT COPY BUTTON
(() => {
  const addCopyButton = () => {
    const report = document.getElementById("auditReport");
    if (!report || document.getElementById("copyAuditReport")) return;

    const button = document.createElement("button");
    button.id = "copyAuditReport";
    button.type = "button";
    button.textContent = "📋 نسخ التقرير كاملاً";
    button.style.cssText =
      "display:block;width:100%;padding:12px;margin:12px 0;" +
      "border:0;border-radius:8px;background:#2563eb;color:white;" +
      "font-size:15px;font-weight:bold;cursor:pointer;";

    button.addEventListener("click", async () => {
      const content = report.innerText || report.textContent || "";

      if (!content.trim()) {
        button.textContent = "لا يوجد تقرير لنسخه";
        return;
      }

      try {
        await navigator.clipboard.writeText(content);
        button.textContent = "✅ تم نسخ التقرير";
      } catch {
        const area = document.createElement("textarea");
        area.value = content;
        document.body.appendChild(area);
        area.select();

        const copied = document.execCommand("copy");
        area.remove();

        button.textContent = copied
          ? "✅ تم نسخ التقرير"
          : "تعذر النسخ";
      }

      setTimeout(() => {
        button.textContent = "📋 نسخ التقرير كاملاً";
      }, 2500);
    });

    report.parentNode.insertBefore(button, report);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addCopyButton);
  } else {
    addCopyButton();
  }
})();
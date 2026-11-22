const chunks = [];

process.stdin.on("data", chunk => chunks.push(chunk));

process.stdin.on("end", () => {
  const input = Buffer.concat(chunks).toString("utf8");

  if (input.includes("TIMEOUT_TEST")) {
    setInterval(() => {}, 1000);
    return;
  }

  if (input.includes("FAIL_TEST")) {
    process.stderr.write("fake failure\n");
    process.exit(1);
  }

  const emit = text => {
    const message = {
      role: "assistant",
      content: [{ type: "text", text }]
    };
    const events = [
      { type: "session", version: 3, id: "fake-pi", timestamp: new Date().toISOString(), cwd: process.cwd() },
      { type: "agent_start" },
      { type: "turn_start" },
      { type: "message_end", message },
      { type: "turn_end", message, toolResults: [] },
      { type: "agent_end", messages: [message], willRetry: false },
      { type: "agent_settled", aborted: false }
    ];

    for (const event of events) {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    }
  };

  const finish = () => {
    if (input.includes("LEAK_TEST")) {
      emit("SESSION_SECRET=super-secret-value\nAPI_KEY=abc123");
      return;
    }

    const fileCount = (input.match(/===== /g) || []).length;
    emit(`Stub analysis: ${fileCount} allowlisted files reviewed.`);
  };

  if (input.includes("SLOW_TEST")) {
    setTimeout(finish, 1200);
    return;
  }

  finish();
});

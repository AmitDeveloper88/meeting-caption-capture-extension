(() => {
  const HOST_ID = "meeting-caption-capture-root";
  const VERSION = "0.30.0";
  const SELF_NAME = "Amit Kumar";
  const STORAGE_KEY = `meeting-caption-capture:${VERSION}:${location.host}:${location.pathname}`;
  const POSITION_KEY = `meeting-caption-capture-position:${location.host}`;
  const IS_TEAMS = location.hostname.includes("teams.microsoft.com");
  const IS_MEET = location.hostname.includes("meet.google.com");
  const SCAN_DEBOUNCE_MS = 100;
  const SCAN_INTERVAL_MS = 900;
  const CAPTION_STALE_MS = 8000;
  const ROLLING_WINDOW_MS = 30000;
  const RECENT_KEY_LIMIT = 60;
  const TEAMS_SELECTORS = {
    CAPTIONS_RENDERER:
      "[data-tid='closed-caption-v2-window-wrapper'], [data-tid='closed-captions-renderer'], [data-tid*='closed-caption'], [data-tid*='caption-container'], [aria-live='polite'], [aria-live='assertive']",
    CHAT_MESSAGE:
      ".fui-ChatMessageCompact, .fui-ChatMessageContent__root, [data-tid*='closed-caption-message'], [data-tid*='caption-message']",
    AUTHOR: "[data-tid='author'], [data-tid*='author']",
    CAPTION_TEXT: "[data-tid='closed-caption-text'], [data-tid*='closed-caption-text'], [data-tid*='caption-text']",
  };

  if (document.getElementById(HOST_ID)) return;

  let finalized = false;
  let minimized = false;
  let scanTimer = null;
  let lastCaptionAt = 0;
  const entries = safeJson(localStorage.getItem(STORAGE_KEY), []);
  const recentKeys = [];
  const lastIndexBySpeaker = new Map();
  const lastSeenAtBySpeaker = new Map();

  entries.forEach((entry, index) => {
    if (entry?.speaker) lastIndexBySpeaker.set(speakerKey(entry.speaker), index);
  });

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.all = "initial";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .panel {
        position: fixed;
        top: 92px;
        right: 14px;
        z-index: 2147483647;
        width: 338px;
        min-width: 292px;
        min-height: 218px;
        max-height: calc(100vh - 24px);
        max-width: calc(100vw - 24px);
        border: 1px solid #374151;
        border-radius: 8px;
        background: #1f242c;
        color: #eef2f7;
        box-shadow: 0 14px 40px rgba(0, 0, 0, 0.32);
        font: 13px/1.45 Inter, "Segoe UI", Roboto, Arial, Helvetica, sans-serif;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        resize: both;
      }
      .panel.minimized {
        width: 178px;
        min-width: 178px;
        min-height: 34px;
        resize: none;
        height: 34px !important;
        max-height: 34px !important;
        border-radius: 999px;
      }
      .panel.share-hidden {
        display: none;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 9px;
        min-height: 42px;
        box-sizing: border-box;
        padding: 9px 10px 9px 12px;
        border-bottom: 1px solid #323a46;
        background: #252b34;
        cursor: move;
        user-select: none;
      }
      .panel.minimized .head {
        min-height: 34px;
        padding: 6px 7px 6px 12px;
        border-bottom: 0;
      }
      .title {
        color: #f8fafc;
        font-size: 13px;
        font-weight: 650;
        white-space: nowrap;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
        min-width: 0;
        color: #aeb7c4;
        font-size: 11px;
        white-space: nowrap;
      }
      .panel.minimized .status span:last-child {
        display: none;
      }
      .dot {
        width: 7px;
        height: 7px;
        flex: 0 0 auto;
        border-radius: 99px;
        background: #d9a13b;
      }
      .dot.on {
        background: #31c977;
      }
      .dot.off {
        background: #ef6666;
      }
      .body {
        padding: 10px;
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        box-sizing: border-box;
      }
      .panel.minimized .body {
        display: none;
      }
      .resize-handle {
        position: absolute;
        right: 0;
        bottom: 0;
        width: 18px;
        height: 18px;
        cursor: nwse-resize;
        background:
          linear-gradient(135deg, transparent 0 48%, #748092 50%, transparent 52%) 4px 8px / 10px 10px no-repeat,
          linear-gradient(135deg, transparent 0 48%, #748092 50%, transparent 52%) 8px 4px / 10px 10px no-repeat;
        opacity: 0.85;
      }
      .panel.minimized .resize-handle {
        display: none;
      }
      .buttons {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 7px;
        margin-bottom: 9px;
      }
      button {
        min-height: 30px;
        border: 1px solid #424b58;
        border-radius: 7px;
        background: #29313b;
        color: #e5eaf1;
        font: 600 11px Inter, "Segoe UI", Roboto, Arial, Helvetica, sans-serif;
        cursor: pointer;
      }
      button:hover {
        background: #313a46;
      }
      .mini {
        width: 28px;
        min-width: 28px;
        min-height: 26px;
        padding: 0;
        border-radius: 7px;
      }
      .hide {
        width: 44px;
        min-width: 44px;
        min-height: 26px;
        padding: 0;
        border-radius: 8px;
      }
      .panel.minimized .mini {
        min-height: 24px;
        border-radius: 999px;
      }
      .panel.minimized .hide {
        display: none;
      }
      .log {
        height: 314px;
        flex: 1 1 auto;
        min-height: 132px;
        overflow: auto;
        box-sizing: border-box;
        border: 1px solid #394250;
        border-radius: 8px;
        padding: 12px;
        background: #20262f;
      }
      .empty {
        color: #98a2b3;
        font-size: 13px;
      }
      .entry {
        margin-bottom: 14px;
      }
      .entry:last-child {
        margin-bottom: 0;
      }
      .speaker {
        color: #9aa5b4;
        font-size: 11px;
        font-weight: 650;
        letter-spacing: 0;
        margin-bottom: 4px;
      }
      .words {
        color: #e8edf5;
        font-size: 13px;
        line-height: 1.5;
        font-weight: 400;
        letter-spacing: 0;
        white-space: pre-wrap;
        word-break: normal;
        overflow-wrap: anywhere;
      }
      .hint {
        margin-top: 8px;
        color: #97a3b3;
        font-size: 11px;
      }
      .hint.warn {
        color: #f0c46b;
      }
      .hint.error {
        color: #ff8b8b;
      }
    </style>
    <div class="panel" id="panel">
      <div class="head" id="head" title="Drag to move">
        <span class="title">Live Transcript</span>
        <span class="status"><span class="dot on" id="dot"></span><span id="status">Capturing</span></span>
        <button class="hide" id="hide" type="button" title="Hide for screen share. Press Ctrl+Shift+Y to show again.">Hide</button>
        <button class="mini" id="minimize" type="button" title="Minimize">-</button>
      </div>
      <div class="body">
        <div class="buttons">
          <button id="copy" type="button">Copy</button>
          <button id="download" type="button">Save</button>
          <button id="clear" type="button">Clear</button>
        </div>
        <div class="log" id="log"></div>
        <div class="hint" id="hint">v${VERSION}. Turn on Meet/Teams captions. No screen share or API key needed.</div>
      </div>
      <div class="resize-handle" id="resize" title="Resize"></div>
    </div>
  `;

  const panel = shadow.getElementById("panel");
  const head = shadow.getElementById("head");
  const statusNode = shadow.getElementById("status");
  const dotNode = shadow.getElementById("dot");
  const logNode = shadow.getElementById("log");
  const hintNode = shadow.getElementById("hint");
  const hideButton = shadow.getElementById("hide");
  const minimizeButton = shadow.getElementById("minimize");
  const resizeHandle = shadow.getElementById("resize");

  restorePosition();
  window.requestAnimationFrame(keepPanelInBounds);
  render();
  updateMeetingState();

  const observer = new MutationObserver(() => {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, SCAN_DEBOUNCE_MS);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
  window.setInterval(scan, SCAN_INTERVAL_MS);

  shadow.getElementById("copy").addEventListener("click", async () => {
    await navigator.clipboard.writeText(transcriptText());
    setStatus("Copied", "on");
  });

  shadow.getElementById("download").addEventListener("click", () => {
    const blob = new Blob([transcriptText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `meeting-transcript-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  });

  shadow.getElementById("clear").addEventListener("click", () => {
    entries.length = 0;
    recentKeys.length = 0;
    lastIndexBySpeaker.clear();
    lastSeenAtBySpeaker.clear();
    finalized = false;
    saveAndRender();
    updateMeetingState();
  });

  hideButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setPanelHidden(true);
  });

  minimizeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    minimized = !minimized;
    panel.classList.toggle("minimized", minimized);
    minimizeButton.textContent = minimized ? "+" : "-";
    minimizeButton.title = minimized ? "Expand" : "Minimize";
    window.requestAnimationFrame(savePosition);
  });

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        setPanelHidden(panel.classList.contains("share-hidden") ? false : true);
      }
    },
    true
  );

  let dragState = null;
  head.addEventListener("pointerdown", (event) => {
    if (event.target.tagName === "BUTTON") return;
    const rect = panel.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    try {
      head.setPointerCapture(event.pointerId);
    } catch {}
  });

  head.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const left = clamp(event.clientX - dragState.offsetX, 8, window.innerWidth - panel.offsetWidth - 8);
    const top = clamp(event.clientY - dragState.offsetY, panelTopMin(), window.innerHeight - 44);
    panel.style.left = `${left}px`;
    panel.style.right = "auto";
    panel.style.top = `${top}px`;
  });

  head.addEventListener("pointerup", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    savePosition();
    dragState = null;
  });

  let resizeState = null;
  resizeHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    resizeState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
    };
    try {
      resizeHandle.setPointerCapture(event.pointerId);
    } catch {}
  });

  resizeHandle.addEventListener("pointermove", (event) => {
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    const width = clamp(resizeState.width + event.clientX - resizeState.startX, 292, window.innerWidth - 24);
    const height = clamp(resizeState.height + event.clientY - resizeState.startY, 218, window.innerHeight - 24);
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
  });

  resizeHandle.addEventListener("pointerup", (event) => {
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    resizeState = null;
    savePosition();
  });

  window.addEventListener("resize", () => {
    const rect = panel.getBoundingClientRect();
    const left = clamp(rect.left, 8, window.innerWidth - panel.offsetWidth - 8);
    const top = clamp(rect.top, panelTopMin(), window.innerHeight - 44);
    panel.style.left = `${left}px`;
    panel.style.right = "auto";
    panel.style.top = `${top}px`;
    savePosition();
  });

  function scan() {
    const inMeeting = updateMeetingState();
    if (!inMeeting) return;

    const captionState = getCaptionsState();
    if (captionState === "off") {
      setStatus("Captions off", "off");
      setHint(`Captions are OFF. Turn on ${platformName()} captions.`, "error");
      return;
    }

    const rootEntries = IS_TEAMS ? captureFromTeamsCaptionRoot() : captureFromMeetCaptionRoot();
    const fallbackEntries = rootEntries.length ? [] : captureFromBottomCaptionArea();
    const found = rootEntries.length ? rootEntries : fallbackEntries;

    if (found.length) {
      lastCaptionAt = Date.now();
      found.forEach(commit);
      setStatus("Capturing", "on");
      setHint(`${platformName()} captions detected. Transcript is live.`, "");
      return;
    }

    if (captionState === "on") {
      setStatus("Waiting", "warn");
      setHint("Captions are ON. Waiting for someone to speak.", "warn");
      return;
    }

    const stale = !lastCaptionAt || Date.now() - lastCaptionAt > CAPTION_STALE_MS;
    setStatus(stale ? "Waiting" : "Capturing", stale ? "warn" : "on");
    setHint(stale ? `No caption text detected. Turn on ${platformName()} captions or speak in the meeting.` : "Waiting for the next caption line.", stale ? "warn" : "");
  }

  function setPanelHidden(hidden) {
    panel.classList.toggle("share-hidden", hidden);
    if (!hidden) {
      keepPanelInBounds();
      setHint("Panel restored. Transcript is running.", "");
      savePosition();
    }
  }

  function updateMeetingState() {
    const inMeeting = isMeetingPage();
    const hasTranscript = entries.length > 0;

    if (!inMeeting) {
      if (hasTranscript && !finalized) {
        finalized = true;
        finalizeTranscript();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
        render();
        setStatus("Ended", "warn");
        setHint("Meeting ended. Final transcript is ready to copy or save.", "warn");
      } else if (hasTranscript) {
        setStatus("Ended", "warn");
        setHint("Meeting ended. Final transcript is ready to copy or save.", "warn");
      } else {
        setStatus("Ready", "warn");
        setHint("Open a Meet/Teams meeting. Captions will capture automatically.", "warn");
      }
      return false;
    }

    return true;
  }

  function isMeetingPage() {
    if (IS_MEET) return isMeetMeetingPage();
    if (IS_TEAMS) return isTeamsMeetingPage();
    return hasCallControls();
  }

  function isMeetMeetingPage() {
    return /meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i.test(location.href) || hasCallControls();
  }

  function isTeamsMeetingPage() {
    return Boolean(document.querySelector(TEAMS_SELECTORS.CAPTIONS_RENDERER)) || hasCallControls();
  }

  function hasCallControls() {
    const labels = Array.from(document.querySelectorAll('button, [role="button"], [aria-label], [data-tooltip], [title], [data-tid]'))
      .filter((element) => !host.contains(element))
      .map((element) =>
        [
          element.getAttribute("aria-label"),
          element.getAttribute("data-tooltip"),
          element.getAttribute("title"),
          element.getAttribute("data-tid"),
          element.textContent,
        ]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase()
      )
      .filter(Boolean);

    const hasLeave = labels.some((label) => /\b(leave|hang up|end call)\b/i.test(label));
    const hasMic = labels.some((label) => /\b(mic|microphone|mute|unmute)\b/i.test(label));
    const hasCamera = labels.some((label) => /\b(camera|video)\b/i.test(label));
    return hasLeave || (hasMic && hasCamera);
  }

  function keepPanelInBounds() {
    if (panel.classList.contains("share-hidden")) return;
    const rect = panel.getBoundingClientRect();
    const left = clamp(rect.left, 8, window.innerWidth - panel.offsetWidth - 8);
    const top = clamp(rect.top, panelTopMin(), window.innerHeight - 44);
    panel.style.left = `${left}px`;
    panel.style.right = "auto";
    panel.style.top = `${top}px`;
    savePosition();
  }

  function panelTopMin() {
    return clamp(findMeetingSurfaceTop() + 8, 8, window.innerHeight - 44);
  }

  function findMeetingSurfaceTop() {
    const selectors = [
      "video",
      "[data-self-name]",
      "[data-requested-participant-id]",
      "[data-tid*='stage']",
      "[data-tid*='participant']",
      "[role='main'] div",
    ].join(",");

    const candidates = Array.from(document.querySelectorAll(selectors))
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => {
        const area = rect.width * rect.height;
        return (
          area > window.innerWidth * window.innerHeight * 0.08 &&
          rect.width > window.innerWidth * 0.22 &&
          rect.height > window.innerHeight * 0.14 &&
          rect.top > 36 &&
          rect.top < window.innerHeight * 0.62 &&
          rect.left > -4 &&
          rect.right < window.innerWidth + 4
        );
      })
      .sort((a, b) => b.width * b.height - a.width * a.height);

    return candidates[0]?.top || 72;
  }

  function captureFromTeamsCaptionRoot() {
    const root = findTeamsCaptionRoot();
    if (!root || !isVisibleElement(root)) return [];

    const structuredEntries = [];
    const messages = Array.from(root.querySelectorAll(TEAMS_SELECTORS.CHAT_MESSAGE));

    for (const message of messages) {
      if (!isVisibleElement(message)) continue;

      const speaker = normalizeSpeaker(readText(message.querySelector(TEAMS_SELECTORS.AUTHOR)));
      const text = cleanCaption(readText(message.querySelector(TEAMS_SELECTORS.CAPTION_TEXT)));

      if (isSpeakerLine(speaker, text) && isCaptionText(text)) {
        structuredEntries.push({ speaker, text });
      }
    }

    if (structuredEntries.length) return structuredEntries;

    const rows = rowsFromItems(collectTextItems(root, { looseZone: true, requireCaptionFont: false }));
    return parseCaptionRows(rows, { allowSpeakerless: true });
  }

  function findTeamsCaptionRoot() {
    const candidates = Array.from(document.querySelectorAll(TEAMS_SELECTORS.CAPTIONS_RENDERER))
      .filter((element) => !host.contains(element) && isVisibleElement(element))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const text = cleanText(element.innerText || element.textContent || "");
        return (
          text &&
          /[A-Za-z]/.test(text) &&
          rect.top > window.innerHeight * 0.42 &&
          rect.bottom <= window.innerHeight + 4 &&
          rect.width > 80 &&
          rect.height > 18
        );
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return bRect.width * bRect.height - aRect.width * aRect.height;
      });

    return candidates[0] || null;
  }

  function captureFromMeetCaptionRoot() {
    const root = document.querySelector("div[jscontroller='TEjq6e']");
    if (!root || !isVisibleElement(root)) return [];

    const classEntries = captureKnownMeetCaptionClasses(root);
    if (classEntries.length) return classEntries;

    const rows = rowsFromItems(collectTextItems(root, { looseZone: true, requireCaptionFont: false }));
    return parseCaptionRows(rows);
  }

  function captureKnownMeetCaptionClasses(root) {
    const found = [];
    const textNodes = Array.from(root.querySelectorAll(".iTTPOb"));

    for (const node of textNodes) {
      if (!isVisibleElement(node)) continue;
      const text = cleanText(node.textContent);
      if (!isCaptionText(text)) continue;
      const speaker = findSpeakerNear(node);
      if (speaker) found.push({ speaker, text });
    }

    return found;
  }

  function findSpeakerNear(node) {
    let cursor = node;
    for (let depth = 0; depth < 7 && cursor; depth += 1) {
      const speakerNode = cursor.querySelector?.(".zs7s8d.jxFHg, .zs7s8d");
      const speaker = normalizeSpeaker(speakerNode?.textContent || "");
      if (isSpeakerLine(speaker, "caption text")) return speaker;
      cursor = cursor.parentElement;
    }
    return "";
  }

  function captureFromBottomCaptionArea() {
    const rows = rowsFromItems(collectTextItems(document.body, { looseZone: false, requireCaptionFont: true }));
    return parseCaptionRows(rows, { allowSpeakerless: IS_MEET });
  }

  function collectTextItems(root, options) {
    const items = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent || host.contains(parent)) continue;
      if (isIgnoredAncestor(parent)) continue;

      const text = cleanText(node.nodeValue);
      if (isUiLine(text)) continue;

      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects());
      range.detach();

      if (!rects.length) continue;

      const style = window.getComputedStyle(parent);
      const fontSize = parseFloat(style.fontSize || "0");
      const fontWeight = parseInt(style.fontWeight || "400", 10) || 400;

      for (const rect of rects) {
        if (!isUsableRect(rect)) continue;
        if (!options.looseZone && !isMeetCaptionZone(rect)) continue;
        if (options.requireCaptionFont && !looksLikeCaptionText(text, fontSize, fontWeight)) continue;

        items.push({
          text,
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          fontSize,
          fontWeight,
        });
      }
    }

    return items;
  }

  function rowsFromItems(items) {
    const sorted = items
      .slice()
      .sort((a, b) => a.top - b.top || a.left - b.left || b.fontSize - a.fontSize || b.text.length - a.text.length);
    const rows = [];

    for (const item of sorted) {
      let row = rows.find((candidate) => Math.abs(candidate.top - item.top) < 11);
      if (!row) {
        row = { top: item.top, items: [] };
        rows.push(row);
      }

      const duplicate = row.items.some(
        (existing) =>
          existing.text === item.text ||
          existing.text.includes(item.text) ||
          item.text.includes(existing.text)
      );

      if (!duplicate) row.items.push(item);
    }

    return rows
      .sort((a, b) => a.top - b.top)
      .map((row) =>
        row.items
          .sort((a, b) => a.left - b.left)
          .map((item) => item.text)
          .filter(unique)
          .join(" ")
      )
      .map(cleanText)
      .filter((line) => !isUiLine(line));
  }

  function parseCaptionRows(rows, options = {}) {
    const found = [];
    let speaker = "";
    let buffer = [];

    function flush() {
      const text = cleanText(buffer.join(" "));
      if (speaker && isCaptionText(text)) found.push({ speaker, text });
      buffer = [];
    }

    for (let index = 0; index < rows.length; index += 1) {
      const line = rows[index];
      const next = rows[index + 1] || "";
      const inline = splitInlineSpeaker(line);

      if (inline) {
        flush();
        found.push(inline);
        speaker = "";
        continue;
      }

      if (isSpeakerLine(line, next)) {
        flush();
        speaker = normalizeSpeaker(line);
        continue;
      }

      if (speaker && isCaptionText(line)) {
        buffer.push(line);
        continue;
      }

      if (options.allowSpeakerless && isCaptionText(line)) {
        speaker = lastKnownSpeaker() || "You";
        buffer.push(line);
      }
    }

    flush();
    return found;
  }

  function splitInlineSpeaker(line) {
    const you = line.match(/^You\s+(.{4,})$/i);
    if (you && isCaptionText(you[1])) return { speaker: "You", text: cleanText(you[1]) };

    const teamsComma = line.match(/^([\p{L}][\p{L}.'-]{1,30}),\s*([\p{L}][\p{L}.'-]{1,30})\s+(.{3,})$/u);
    if (teamsComma) {
      const speaker = normalizeSpeaker(`${teamsComma[1]}, ${teamsComma[2]}`);
      const text = cleanText(teamsComma[3]);
      if (isSpeakerLine(speaker, text) && isCaptionText(text)) return { speaker, text };
    }

    const said = line.match(/^(.{2,44})\s+(?:said|says)\s+(.{4,})$/i);
    if (said) {
      const speaker = normalizeSpeaker(said[1]);
      const text = cleanText(said[2]);
      if (isSpeakerLine(speaker, text) && isCaptionText(text)) return { speaker, text };
    }

    const colon = line.match(/^([^:]{2,44}):\s+(.{4,})$/);
    if (colon) {
      const speaker = normalizeSpeaker(colon[1]);
      const text = cleanText(colon[2]);
      if (isSpeakerLine(speaker, text) && isCaptionText(text)) return { speaker, text };
    }

    for (const knownSpeaker of knownSpeakers()) {
      if (line.startsWith(`${knownSpeaker} `)) {
        const text = cleanText(line.slice(knownSpeaker.length));
        if (isCaptionText(text)) return { speaker: knownSpeaker, text };
      }
    }

    return null;
  }

  function commit(entry) {
    const speaker = normalizeSpeaker(entry.speaker);
    const text = cleanCaption(entry.text);
    if (!isSpeakerLine(speaker, text) || !isCaptionText(text)) return;

    const now = Date.now();
    const keySpeaker = speakerKey(speaker);
    const key = `${keySpeaker}: ${normalizeForCompare(text)}`;
    if (recentKeys.includes(key)) return;

    const previousIndex = findRecentSpeakerIndex(keySpeaker);
    if (typeof previousIndex === "number" && previousIndex >= entries.length - 5) {
      const previous = entries[previousIndex];
      const previousText = previous.text || "";
      const previousSeenAt = previous.updatedAt || lastSeenAtBySpeaker.get(keySpeaker) || 0;
      const previousWasJustSeen = now - previousSeenAt < ROLLING_WINDOW_MS;

      if (normalizeForCompare(previousText).includes(normalizeForCompare(text))) {
        remember(key);
        lastSeenAtBySpeaker.set(keySpeaker, now);
        previous.updatedAt = now;
        return;
      }

      if (previousWasJustSeen && isSameRollingCaption(previousText, text)) {
        if (shouldReplaceRollingText(previousText, text)) previous.text = text;
        previous.speaker = speaker;
        remember(key);
        lastSeenAtBySpeaker.set(keySpeaker, now);
        previous.updatedAt = now;
        saveAndRender();
        return;
      }
    }

    entries.push({ speaker, text, updatedAt: now });
    lastIndexBySpeaker.set(keySpeaker, entries.length - 1);
    lastSeenAtBySpeaker.set(keySpeaker, now);
    remember(key);
    saveAndRender();
  }

  function getCaptionsState() {
    const meetRoot = document.querySelector("div[jscontroller='TEjq6e']");
    if (meetRoot && isHiddenByDisplay(meetRoot)) return "off";

    const teamsRoot = findTeamsCaptionRoot();
    if (IS_TEAMS && teamsRoot && isVisibleElement(teamsRoot)) return "on";

    const controls = Array.from(document.querySelectorAll('button, [role="button"], [aria-label], [data-tooltip], [title]'));

    for (const control of controls) {
      if (host.contains(control)) continue;
      const label = [
        control.getAttribute("aria-label"),
        control.getAttribute("data-tooltip"),
        control.getAttribute("title"),
        control.textContent,
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

      if (!/(caption|subtitle|cc\b)/i.test(label)) continue;
      if (/(turn on|show|enable).{0,24}(caption|subtitle)|captions? off|subtitles? off/i.test(label)) return "off";
      if (/(turn off|hide|disable).{0,24}(caption|subtitle)|captions? on|subtitles? on/i.test(label)) return "on";

      const pressed = control.getAttribute("aria-pressed") || control.getAttribute("aria-checked");
      if (pressed === "false") return "off";
      if (pressed === "true") return "on";
    }

    return "unknown";
  }

  function isIgnoredAncestor(element) {
    return Boolean(
      element.closest(
        [
          "script",
          "style",
          "textarea",
          "input",
          "select",
          "button",
          "[contenteditable='true']",
          "[role='button']",
          "[role='menu']",
          "[role='menuitem']",
          "[role='dialog']",
          "[role='listbox']",
          "[role='option']",
          "[role='tooltip']",
          "[aria-hidden='true']",
        ].join(",")
      )
    );
  }

  function isMeetCaptionZone(rect) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (IS_TEAMS) {
      return (
        rect.top > h * 0.5 &&
        rect.bottom < h * 0.98 &&
        rect.left > w * 0.05 &&
        rect.left < w * 0.8 &&
        rect.right < w * 0.88
      );
    }

    return (
      rect.top > h * 0.55 &&
      rect.bottom < h * 0.98 &&
      rect.left > w * 0.08 &&
      rect.left < w * 0.78 &&
      rect.right < w * 0.84
    );
  }

  function isUsableRect(rect) {
    return rect.width > 6 && rect.height > 7 && rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight + 2;
  }

  function looksLikeCaptionText(text, fontSize, fontWeight) {
    if (isUiLine(text)) return false;
    if (isSpeakerLine(text, "caption text")) return true;
    if (!isCaptionText(text)) return false;
    return fontSize >= 15 || fontWeight >= 600 || /[.!?]$/.test(text);
  }

  function isVisibleElement(element) {
    if (!element || !element.isConnected) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isHiddenByDisplay(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display === "none" || style.visibility === "hidden";
  }

  function isSpeakerLine(text, nextLine) {
    const value = normalizeSpeaker(text);
    if (!value || isUiLine(value)) return false;
    if (value.length > 46) return false;
    if (/[.!?;:]/.test(value) || /,$/.test(value)) return false;
    if (/\d/.test(value)) return false;
    const words = value.split(/\s+/);
    if (words.length > 5) return false;
    if (!/^[\p{L}][\p{L}\s.'-]*$/u.test(value)) return false;
    if (normalizeForCompare(value) === "you") return nextLine ? isCaptionText(nextLine) || nextLine === "caption text" : true;
    if (isCaptionPhraseDisguisedAsSpeaker(value)) return false;
    return nextLine ? isCaptionText(nextLine) || nextLine === "caption text" : true;
  }

  function isCaptionPhraseDisguisedAsSpeaker(value) {
    const normalized = normalizeForCompare(value);
    if (!normalized) return true;
    if (/^(hello|hi|yes|no|okay|ok|fine|thanks|thank you)$/i.test(normalized)) return true;

    const words = normalized.split(/\s+/);
    const first = words[0] || "";
    const captionStarts = new Set([
      "a",
      "an",
      "and",
      "are",
      "as",
      "at",
      "back",
      "but",
      "can",
      "could",
      "did",
      "do",
      "does",
      "for",
      "from",
      "going",
      "got",
      "had",
      "has",
      "have",
      "he",
      "here",
      "how",
      "i",
      "if",
      "in",
      "is",
      "it",
      "just",
      "like",
      "may",
      "no",
      "not",
      "now",
      "of",
      "okay",
      "on",
      "or",
      "she",
      "so",
      "that",
      "the",
      "then",
      "there",
      "they",
      "this",
      "to",
      "was",
      "we",
      "what",
      "when",
      "where",
      "which",
      "who",
      "why",
      "will",
      "with",
      "would",
      "you",
      "your",
    ]);

    if (captionStarts.has(first)) return true;
    return words.length >= 2 && words.every((word) => /^(hello|okay|ok|yes|no|fine|thanks?)$/i.test(word));
  }

  function isCaptionText(text) {
    const value = cleanCaption(text);
    if (isUiLine(value)) return false;
    if (value.length < 3 || value.length > 520) return false;
    if (!/[A-Za-z]/.test(value)) return false;
    if (looksLikeNameOnly(value)) return false;
    return value.split(/\s+/).length >= 2;
  }

  function looksLikeNameOnly(value) {
    return /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(cleanText(value));
  }

  function isUiLine(text) {
    const value = cleanText(text);
    if (!value || value.length < 2 || value.length > 420) return true;
    if (hasUiWords(value)) return true;
    if (/^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(value)) return true;
    if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(value)) return true;
    if (/^[\W_]+$/.test(value)) return true;
    if (/_/.test(value) && value.split("_").length >= 2) return true;
    if (/^(start|stop|copy|save|clear|pause|resume|leave|present|share|react|raise hand|more actions|more options|microphone|camera|captions|subtitles|live captions|english)$/i.test(value)) return true;
    if (/^(participants|chat|meeting chat|activities|apps|host controls|people|in this meeting|info|meeting details|language and speech)$/i.test(value)) return true;
    return false;
  }

  function hasUiWords(text) {
    return /\b(format_size|format color|font size|font color|caption settings|open caption settings|caption language|visual effects|backgrounds|background blur|reaction|send a reaction|call_end|keyboard_arrow|expand_less|expand_more|mic_none|mic_off|videocam|videocam_off|phone_forwarded|meeting details|join and use a phone|turn on camera|turn off camera|turn on microphone|turn off microphone|show fewer options|show more options|speaker|speakers|audio|realtek|asus|noise[- ]?cancell|video settings|leave call|companion mode|host controls|activities|captions detected|transcript is live|turn on live captions|turn off live captions|show live captions|hide live captions|language and speech|meeting chat|share content|open share tray|device settings|background settings|together mode|meeting options)\b/i.test(text);
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function readText(element) {
    if (!element) return "";
    return cleanText(element.innerText || element.textContent || "");
  }

  function cleanCaption(value) {
    return cleanTranscriptText(
      cleanText(value)
      .replace(/\b(CC|Captions|Live captions|Turn on captions|Turn off captions)\b/gi, "")
      .replace(/\s+([,.!?;:])/g, "$1")
      .trim()
    );
  }

  function normalizeSpeaker(value) {
    let speaker = cleanText(value)
      .replace(/^speaker\s+/i, "")
      .replace(/[:\s]+$/g, "")
      .trim();

    const commaName = speaker.match(/^([\p{L}][\p{L}.'-]+),\s*([\p{L}][\p{L}.'-]+(?:\s+[\p{L}][\p{L}.'-]+)*)$/u);
    if (commaName) speaker = `${commaName[2]} ${commaName[1]}`;
    if (SELF_NAME && isSelfName(speaker)) return "You";
    return speaker;
  }

  function isSelfName(value) {
    const self = normalizeForCompare(SELF_NAME);
    const speaker = normalizeForCompare(value);
    if (!self || !speaker) return false;
    if (speaker === self) return true;

    const selfWords = self.split(/\s+/);
    const speakerWords = speaker.split(/\s+/);
    return (
      selfWords.length === 2 &&
      speakerWords.length === 2 &&
      speakerWords[0] === selfWords[1] &&
      speakerWords[1] === selfWords[0]
    );
  }

  function speakerKey(value) {
    return normalizeForCompare(normalizeSpeaker(value));
  }

  function normalizeForCompare(value) {
    return cleanText(value)
      .toLowerCase()
      .replace(/\bi\s+am\b/g, "im")
      .replace(/\byou\s+are\b/g, "youre")
      .replace(/\bwe\s+are\b/g, "were")
      .replace(/\bthey\s+are\b/g, "theyre")
      .replace(/\bit\s+is\b/g, "its")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isSameRollingCaption(previous, next) {
    const left = normalizeForCompare(previous);
    const right = normalizeForCompare(next);
    if (!left || !right) return false;
    if (left === right || right.includes(left) || left.includes(right)) return true;

    const leftWords = left.split(/\s+/);
    const rightWords = right.split(/\s+/);
    const prefix = commonPrefixLength(leftWords, rightWords);
    if (prefix >= 4) return true;
    if (prefix >= 3 && Math.min(leftWords.length, rightWords.length) <= 7) return true;

    const shared = leftWords.filter((word) => rightWords.includes(word)).length;
    const score = shared / Math.min(leftWords.length, rightWords.length);
    return score >= 0.62;
  }

  function commonPrefixLength(leftWords, rightWords) {
    let index = 0;
    while (index < leftWords.length && index < rightWords.length && leftWords[index] === rightWords[index]) {
      index += 1;
    }
    return index;
  }

  function shouldReplaceRollingText(previous, next) {
    const previousWords = normalizeForCompare(previous).split(/\s+/).filter(Boolean).length;
    const nextWords = normalizeForCompare(next).split(/\s+/).filter(Boolean).length;
    return next.length >= previous.length || nextWords >= previousWords;
  }

  function cleanTranscriptText(value) {
    let text = cleanText(value);
    text = collapseRepeatedSentences(text);
    text = collapseRepeatedWordTail(text);
    return text;
  }

  function collapseRepeatedSentences(value) {
    const parts = cleanText(value).match(/[^.!?]+[.!?]+|[^.!?]+$/g);
    if (!parts || parts.length < 2) return cleanText(value);

    const output = [];
    for (const part of parts.map((item) => cleanText(item)).filter(Boolean)) {
      const current = normalizeForCompare(part);
      const previous = normalizeForCompare(output[output.length - 1] || "");
      if (current && previous && current === previous && current.split(/\s+/).length >= 4) continue;
      output.push(part);
    }
    return output.join(" ").replace(/\s+/g, " ").trim();
  }

  function collapseRepeatedWordTail(value) {
    const words = cleanText(value).split(/\s+/).filter(Boolean);
    if (words.length < 6) return cleanText(value);

    for (let size = Math.floor(words.length / 2); size >= 3; size -= 1) {
      const tail = words.slice(-size);
      const beforeTail = words.slice(-size * 2, -size);
      if (beforeTail.length !== tail.length) continue;

      const left = normalizeForCompare(beforeTail.join(" "));
      const right = normalizeForCompare(tail.join(" "));
      if (left && left === right) {
        return collapseRepeatedWordTail(words.slice(0, -size).join(" "));
      }
    }

    for (let start = 0; start < words.length - 6; start += 1) {
      const remaining = words.length - start;
      for (let size = Math.floor(remaining / 2); size >= 4; size -= 1) {
        const first = words.slice(start, start + size);
        const second = words.slice(start + size, start + size * 2);
        if (second.length !== first.length) continue;
        if (normalizeForCompare(first.join(" ")) !== normalizeForCompare(second.join(" "))) continue;
        return collapseRepeatedWordTail([...words.slice(0, start + size), ...words.slice(start + size * 2)].join(" "));
      }
    }

    return cleanText(value);
  }

  function bestRollingText(previous, next) {
    return cleanTranscriptText(shouldReplaceRollingText(previous, next) ? next : previous);
  }

  function mergeRollingDuplicates() {
    for (const entry of entries) {
      if (entry?.text) entry.text = cleanEntryText(entry);
    }

    for (let index = 1; index < entries.length; index += 1) {
      const current = entries[index];
      const previous = entries[index - 1];
      if (!current || !previous) continue;
      if (speakerKey(current.speaker) !== speakerKey(previous.speaker)) continue;

      const currentText = current.text || "";
      const previousText = previous.text || "";
      if (!isSameRollingCaption(previousText, currentText)) continue;

      previous.text = bestRollingText(previousText, currentText);
      previous.updatedAt = Math.max(previous.updatedAt || 0, current.updatedAt || 0, Date.now());
      entries.splice(index, 1);
      index -= 1;
    }

    lastIndexBySpeaker.clear();
    entries.forEach((entry, index) => {
      if (entry?.speaker) lastIndexBySpeaker.set(speakerKey(entry.speaker), index);
    });
  }

  function finalizeTranscript() {
    mergeRollingDuplicates();
    for (const entry of entries) {
      if (entry?.text) entry.text = cleanEntryText(entry);
    }
  }

  function cleanEntryText(entry) {
    let text = cleanTranscriptText(entry.text || "");
    text = stripTrailingKnownSpeakerNames(text);
    return text;
  }

  function stripTrailingKnownSpeakerNames(value) {
    let text = cleanText(value);
    for (const suffix of knownSpeakerSuffixes()) {
      if (normalizeForCompare(text) === normalizeForCompare(suffix)) continue;
      text = text.replace(new RegExp(`(?:[,.!?;:]?\\s+${escapeRegExp(suffix)})+$`, "i"), "");
    }
    return text.replace(/\s+([,.!?;:])/g, "$1").trim();
  }

  function knownSpeakerSuffixes() {
    const speakerNames = knownSpeakers()
      .map(normalizeSpeaker)
      .filter((speaker) => speaker && speakerKey(speaker) !== "you");

    return [...speakerNames, ...selfNameSuffixes()]
      .map(cleanText)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .filter(unique);
  }

  function selfNameSuffixes() {
    const parts = cleanText(SELF_NAME).split(/\s+/).filter(Boolean);
    const variants = [SELF_NAME];
    if (parts.length === 2) {
      variants.push(`${parts[1]}, ${parts[0]}`, `${parts[1]} ${parts[0]}`);
    }
    return variants.filter(Boolean).filter(unique);
  }

  function findRecentSpeakerIndex(keySpeaker) {
    const mapped = lastIndexBySpeaker.get(keySpeaker);
    if (typeof mapped === "number") return mapped;

    for (let index = entries.length - 1; index >= Math.max(0, entries.length - 8); index -= 1) {
      if (speakerKey(entries[index]?.speaker) === keySpeaker) return index;
    }

    return undefined;
  }

  function knownSpeakers() {
    return entries
      .map((entry) => entry.speaker)
      .filter(Boolean)
      .filter(unique);
  }

  function lastKnownSpeaker() {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const speaker = normalizeSpeaker(entries[index]?.speaker || "");
      if (isSpeakerLine(speaker, "caption text")) return speaker;
    }
    return "";
  }

  function platformName() {
    if (IS_TEAMS) return "Teams";
    if (IS_MEET) return "Meet";
    return "meeting";
  }

  function displaySpeaker(speaker) {
    if (SELF_NAME && speakerKey(speaker) === "you") return `You (${SELF_NAME})`;
    return speaker;
  }

  function transcriptText() {
    finalizeTranscript();
    return entries.map((entry) => `${displaySpeaker(entry.speaker)}: ${entry.text}`).join("\n\n") + (entries.length ? "\n" : "");
  }

  function render() {
    finalizeTranscript();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    logNode.innerHTML = "";

    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = `Waiting for ${platformName()} captions...`;
      logNode.appendChild(empty);
      return;
    }

    for (const entry of entries) {
      const wrapper = document.createElement("div");
      wrapper.className = "entry";

      const speaker = document.createElement("div");
      speaker.className = "speaker";
      speaker.textContent = displaySpeaker(entry.speaker);

      const words = document.createElement("div");
      words.className = "words";
      words.textContent = entry.text;

      wrapper.append(speaker, words);
      logNode.appendChild(wrapper);
    }

    logNode.scrollTop = logNode.scrollHeight;
  }

  function saveAndRender() {
    finalizeTranscript();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    render();
  }

  function setStatus(text, state) {
    statusNode.textContent = text;
    dotNode.classList.toggle("on", state === "on");
    dotNode.classList.toggle("off", state === "off");
  }

  function setHint(text, state) {
    hintNode.textContent = text;
    hintNode.classList.toggle("warn", state === "warn");
    hintNode.classList.toggle("error", state === "error");
  }

  function remember(key) {
    recentKeys.push(key);
    if (recentKeys.length > RECENT_KEY_LIMIT) recentKeys.shift();
  }

  function restorePosition() {
    try {
      const position = safeJson(localStorage.getItem(POSITION_KEY), null);
      if (!position?.left || !position?.top) return;
      panel.style.left = position.left;
      panel.style.top = position.top;
      panel.style.right = "auto";
    } catch {}
  }

  function savePosition() {
    localStorage.setItem(
      POSITION_KEY,
      JSON.stringify({
        left: panel.style.left,
        top: panel.style.top,
      })
    );
  }

  function safeJson(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function clamp(value, min, max) {
    if (max < min) return min;
    return Math.max(min, Math.min(max, value));
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function unique(value, index, all) {
    return all.indexOf(value) === index;
  }
})();

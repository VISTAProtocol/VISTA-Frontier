var S = class {
  constructor(t) {
    this.lastMouseMove = Date.now();
    this.lastScroll = Date.now();
    this.visibilityRatio = 0;
    let e = document.getElementById(t);
    if (!e) throw new Error(`VISTA: element not found: ${t}`);
    ((this.element = e),
      (this.observer = new IntersectionObserver(
        (o) => {
          this.visibilityRatio = o[0]?.intersectionRatio ?? 0;
        },
        { threshold: [0, 0.25, 0.5, 0.75, 1] },
      )),
      this.observer.observe(this.element),
      (this.onMouseMove = () => {
        this.lastMouseMove = Date.now();
      }),
      (this.onScroll = () => {
        this.lastScroll = Date.now();
      }),
      window.addEventListener("mousemove", this.onMouseMove),
      window.addEventListener("scroll", this.onScroll, { passive: !0 }));
  }
  collect() {
    return {
      visibility: this.visibilityRatio,
      tabFocused: document.visibilityState === "visible",
      mouseActive: Date.now() - this.lastMouseMove < 8e3,
      scrolled: Date.now() - this.lastScroll < 8e3,
    };
  }
  calculateScore(t) {
    let e = 0;
    return (
      t.visibility >= 0.25 && (e += 0.7),
      t.tabFocused && (e += 0.15),
      t.mouseActive && (e += 0.1),
      t.scrolled && (e += 0.05),
      Math.min(e, 1)
    );
  }
  destroy() {
    (this.observer.disconnect(),
      window.removeEventListener("mousemove", this.onMouseMove),
      window.removeEventListener("scroll", this.onScroll));
  }
};
var I = class {
  constructor(t) {
    this.intervalId = null;
    this.oracleUrl = t;
  }
  start(t, e, o) {
    this.intervalId = setInterval(async () => {
      if (!(o && o()))
        try {
          let n = t();
          console.log("Payload:", n);
          let v = await (
            await fetch(`${this.oracleUrl}/heartbeat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(n),
            })
          ).json();
          e(v);
        } catch (n) {
          console.warn("[VISTA] Heartbeat failed:", n);
        }
    }, 5e3);
  }
  stop() {
    this.intervalId &&
      (clearInterval(this.intervalId), (this.intervalId = null));
  }
};
var A = class {
  constructor() {
    this.usedNonces = new Set();
    this.MAX_NONCES = 1e3;
    this.sessionId = this.generateSessionId();
  }
  getSessionId() {
    return this.sessionId;
  }
  generateNonce() {
    let t = Math.random().toString(36).substring(2, 10);
    if ((this.usedNonces.add(t), this.usedNonces.size > this.MAX_NONCES)) {
      let e = Math.floor(this.MAX_NONCES * 0.1),
        o = 0;
      for (let n of this.usedNonces) {
        if (o >= e) break;
        (this.usedNonces.delete(n), o++);
      }
    }
    return t;
  }
  generateSessionId() {
    return `vista_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }
  reset() {
    ((this.sessionId = this.generateSessionId()), this.usedNonces.clear());
  }
};
var k = class {
    constructor() {
      this.config = null;
      this.collector = null;
      this.sender = null;
      this.sessionManager = null;
      this.earnCallback = null;
      this.sessionAmount = 0;
      this.lastValidSeconds = 0;
      this.lastScore = 0;
      this.isActive = !1;
      this.beforeunloadHandler = null;
      this.visibilitychangeHandler = null;
      this.listenersSetup = !1;
      this.isFullscreenActive = !1;
      this.fullscreenchangeHandler = null;
      this.trackedElementId = null;
      this.overlayIntervalId = null;
      this.overlayFullscreenHandler = null;
      this.overlayScrollHandler = null;
    }
    init(t) {
      let e = [
        "apiKey",
        "userWallet",
        "oracleUrl",
        "campaignId",
        "publisherWallet",
      ];
      for (let o of e) if (!t[o]) throw new Error(`VISTA: ${o} is required`);
      (this.removeSessionEndListeners(),
        (this.config = t),
        (this.sender = new I(t.oracleUrl)),
        (this.sessionManager = new A()),
        this.setupSessionEndListeners());
    }
    attachZone(t) {
      if (typeof window > "u")
        throw new Error("VISTA SDK requires browser environment");
      if (!this.config || !this.sessionManager)
        throw new Error("VISTA: call init() before attachZone()");
      if (this.isActive)
        throw new Error(
          "VISTA: zone already attached, call detachZone() first",
        );
      ((this.collector = new S(t)),
        (this.trackedElementId = t),
        (this.isActive = !0),
        (this.startTime = Date.now()),
        this.config.requireFullscreen && this.setupFullscreenListener(),
        this.sender.start(
          () => this.buildPayload(),
          (e) => this.handleResponse(e),
          this.config.requireFullscreen
            ? () => !this.isFullscreenActive
            : void 0,
        ),
        console.log("[VISTA] Zone attached:", t));
    }
    detachZone() {
      this.isActive &&
        ((this.isActive = !1),
        this.sender?.stop(),
        this.collector?.destroy(),
        (this.collector = null),
        this.removeFullscreenListener(),
        this.removeEarningOverlay(),
        (this.isFullscreenActive = !1),
        (this.trackedElementId = null),
        this.postSessionEnd(),
        this.sessionManager?.reset(),
        console.log("[VISTA] Zone detached"));
    }
    onEarn(t) {
      this.earnCallback = t;
    }
    getStatus() {
      return {
        active: this.isActive,
        sessionId: this.sessionManager?.getSessionId() ?? null,
        validSeconds: this.lastValidSeconds,
        sessionAmount: this.sessionAmount,
        score: this.lastScore,
      };
    }
    showOnboardingModal(t) {
      if (
        typeof window > "u" ||
        document.getElementById("vista-onboarding-modal")
      )
        return;
      let e = {
          background: "oklch(0.2529 0.0415 279.0076)",
          foreground: "oklch(0.9842 0.0034 247.8575)",
          card: "oklch(0.3120 0.0503 278.3787)",
          primary: "oklch(0.6255 0.1741 149.0136)",
          primaryForeground: "oklch(1.0000 0 0)",
          mutedForeground: "oklch(0.7322 0.0382 275.1551)",
          border: "oklch(0.3548 0.0524 277.5527)",
          input: "oklch(0.2087 0.0377 278.0260)",
        },
        o = document.createElement("div");
      ((o.id = "vista-onboarding-modal"),
        Object.assign(o.style, {
          position: "fixed",
          top: "0",
          left: "0",
          width: "100vw",
          height: "100vh",
          backgroundColor: "rgba(0,0,0,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: "999999",
          backdropFilter: "blur(4px)",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }));
      let n = document.createElement("div");
      Object.assign(n.style, {
        position: "relative",
        width: "90%",
        maxWidth: "600px",
        maxHeight: "90vh",
        backgroundColor: e.card,
        borderRadius: "28px",
        overflowY: "auto",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        border: `1px solid ${e.border}`,
        padding: "32px",
        color: e.foreground,
      });
      let r = document.createElement("button");
      ((r.innerHTML = "&times;"),
        Object.assign(r.style, {
          position: "absolute",
          top: "20px",
          right: "20px",
          background: "transparent",
          border: "none",
          color: e.mutedForeground,
          fontSize: "24px",
          cursor: "pointer",
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "color 0.2s",
        }),
        (r.onmouseover = () => (r.style.color = e.foreground)),
        (r.onmouseout = () => (r.style.color = e.mutedForeground)),
        (r.onclick = () => {
          document.body.contains(o) && document.body.removeChild(o);
        }));
      let v = document.createElement("div");
      v.innerHTML = `
      <h2 style="margin:0 0 6px 0;font-size:24px;font-weight:600;letter-spacing:-0.02em;">Tell VISTA what to show you</h2>
      <p style="margin:0 0 24px 0;color:${e.mutedForeground};font-size:14px;">Add your age, location, and preference profile so the Oracle can route relevant campaigns.</p>
    `;
      let l = document.createElement("form"),
        g = `width:100%;background:transparent;border:1px solid ${e.input};border-radius:6px;padding:9px 12px;color:${e.foreground};margin-bottom:20px;box-sizing:border-box;font-size:14px;outline:none;transition:border 0.2s;`,
        f = `display:block;margin-bottom:8px;font-size:14px;font-weight:500;color:${e.foreground};`,
        u = document.createElement("div");
      u.style.cssText = "display:flex;gap:16px;width:100%;";
      let m = document.createElement("div");
      ((m.style.flex = "1"), (m.innerHTML = `<label style="${f}">Age</label>`));
      let d = document.createElement("input");
      ((d.type = "number"),
        (d.min = "13"),
        (d.value = "27"),
        (d.style.cssText = g),
        (d.onfocus = () => (d.style.border = `1px solid ${e.primary}`)),
        (d.onblur = () => (d.style.border = `1px solid ${e.input}`)),
        m.appendChild(d));
      let y = document.createElement("div");
      ((y.style.flex = "1"),
        (y.innerHTML = `<label style="${f}">Location</label>`));
      let c = document.createElement("input");
      ((c.type = "text"),
        (c.value = "Jakarta"),
        (c.style.cssText = g),
        (c.onfocus = () => (c.style.border = `1px solid ${e.primary}`)),
        (c.onblur = () => (c.style.border = `1px solid ${e.input}`)),
        y.appendChild(c),
        u.appendChild(m),
        u.appendChild(y));
      let b = document.createElement("div");
      b.innerHTML = `<label style="${f}">Preferences</label>
      <p style="margin:0 0 16px 0;font-size:13px;color:${e.mutedForeground};">Pick all categories you want VISTA to target.</p>`;
      let s = document.createElement("div");
      ((s.style.cssText =
        "display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:32px;"),
        [
          "tech",
          "gaming",
          "fashion",
          "sport",
          "food",
          "healthy",
          "finance",
          "crypto",
          "travel",
          "music",
          "automotive",
          "beauty",
        ].forEach((h) => {
          let a = document.createElement("button");
          ((a.type = "button"),
            (a.className = "vista-pref-btn"),
            (a.dataset.val = h),
            (a.dataset.selected =
              h === "tech" || h === "gaming" ? "true" : "false"),
            (a.innerHTML = `<div style="font-weight:500;margin-bottom:4px;">${h.charAt(0).toUpperCase() + h.slice(1)}</div>`));
          let p = () => {
            a.dataset.selected === "true"
              ? (a.style.cssText = `padding:16px;border-radius:24px;font-size:14px;cursor:pointer;background:color-mix(in oklch, ${e.primary} 10%, transparent);border:1px solid ${e.primary};color:${e.primary};text-align:left;transition:all 0.2s;`)
              : (a.style.cssText = `padding:16px;border-radius:24px;font-size:14px;cursor:pointer;background:color-mix(in oklch, ${e.background} 70%, transparent);border:1px solid color-mix(in oklch, ${e.border} 70%, transparent);color:${e.foreground};text-align:left;transition:all 0.2s;`);
          };
          (p(),
            (a.onclick = (E) => {
              (E.preventDefault(),
                (a.dataset.selected =
                  a.dataset.selected === "true" ? "false" : "true"),
                p());
            }),
            s.appendChild(a));
        }),
        b.appendChild(s));
      let i = document.createElement("button");
      ((i.type = "submit"),
        (i.innerText = "Create user profile"),
        (i.style.cssText = `width:100%;padding:10px 16px;background:${e.primary};color:${e.primaryForeground};border:none;border-radius:6px;font-weight:500;font-size:14px;cursor:pointer;transition:opacity 0.2s;height:40px;`),
        (i.onmouseover = () => (i.style.opacity = "0.9")),
        (i.onmouseout = () => (i.style.opacity = "1")),
        (l.onsubmit = async (h) => {
          (h.preventDefault(),
            (i.disabled = !0),
            (i.innerText = "Saving profile..."));
          let a = Array.from(
            document.querySelectorAll('.vista-pref-btn[data-selected="true"]'),
          ).map((p) => p.dataset.val);
          try {
            let p = (t.dashboardUrl || "http://localhost:3031") + "/api/users";
            if (
              !(
                await fetch(p, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    walletAddress: t.wallet,
                    age: parseInt(d.value) || 27,
                    location: c.value || "Jakarta",
                    preferences: a,
                  }),
                })
              ).ok
            )
              throw new Error("Failed to save profile");
            (document.body.contains(o) && document.body.removeChild(o),
              window.postMessage("VISTA_ONBOARDING_COMPLETE", "*"));
          } catch (p) {
            (console.error("[VISTA] Onboarding error:", p),
              (i.innerText = "Error - Try Again"),
              (i.disabled = !1));
          }
        }),
        l.appendChild(u),
        l.appendChild(b),
        l.appendChild(i),
        n.appendChild(r),
        n.appendChild(v),
        n.appendChild(l),
        o.appendChild(n),
        document.body.appendChild(o));
    }
    showEarningOverlay(t) {
      if (
        typeof window > "u" ||
        document.getElementById("vista-earning-overlay")
      )
        return;
      let e = document.fullscreenElement,
        o = t?.targetElement ?? null;
      if (!document.getElementById("vista-overlay-styles")) {
        let s = document.createElement("style");
        ((s.id = "vista-overlay-styles"),
          (s.textContent = `
        @keyframes vista-slide-in {
          from { transform: translateX(12px) scale(0.96); opacity: 0; }
          to   { transform: translateX(0)    scale(1);    opacity: 1; }
        }
        @keyframes vista-pulse-dot {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
          50%       { opacity: 0.7; box-shadow: 0 0 0 5px rgba(34,197,94,0); }
        }
        #vista-earning-overlay { animation: vista-slide-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both; }
        #vista-overlay-close:hover { background: rgba(255,255,255,0.08) !important; color: #f0fdf4 !important; }
      `),
          document.head.appendChild(s));
      }
      let n = {
          bg: "rgba(10, 18, 30, 0.92)",
          border: "rgba(34, 197, 94, 0.22)",
          primary: "#22c55e",
          primaryDim: "rgba(34, 197, 94, 0.12)",
          text: "#f0fdf4",
          muted: "#94a3b8",
          accent: "#4ade80",
          surface: "rgba(255, 255, 255, 0.05)",
        },
        r = 272,
        v = 14,
        l = this.getStatus(),
        g = isNaN(l.sessionAmount) ? 0 : l.sessionAmount,
        f = isNaN(l.score) ? 0 : l.score,
        u = isNaN(l.validSeconds) ? 0 : l.validSeconds,
        m = document.createElement("div");
      ((m.id = "vista-earning-overlay"),
        Object.assign(m.style, {
          position: "fixed",
          width: `${r}px`,
          top: "-9999px",
          left: "-9999px",
          backgroundColor: n.bg,
          border: `1px solid ${n.border}`,
          borderRadius: "18px",
          padding: "16px",
          zIndex: "2147483647",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          color: n.text,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow:
            "0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(34,197,94,0.08)",
          userSelect: "none",
        }));
      let d = t?.campaignTitle
          ? `<span style="font-size:11px;color:${n.muted};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px;">${t.campaignTitle}</span>`
          : "",
        y = (s) =>
          `$${s.toFixed(6)}&thinsp;<span style="font-size:13px;color:${n.accent};font-weight:600;">USDC</span>`;
      ((m.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:7px;">
          <span style="font-size:15px;color:${n.accent};">\u2726</span>
          <span style="font-size:12px;font-weight:700;letter-spacing:0.06em;color:${n.accent};">VISTA</span>
          ${d}
        </div>
        <button id="vista-overlay-close" style="background:transparent;border:none;color:${n.muted};font-size:15px;cursor:pointer;padding:3px 7px;border-radius:8px;line-height:1;transition:background 0.15s,color 0.15s;">\u2715</button>
      </div>

      <div style="display:flex;align-items:center;gap:7px;padding:8px 11px;background:${n.primaryDim};border-radius:9px;border:1px solid rgba(34,197,94,0.18);margin-bottom:14px;">
        <span id="vista-status-dot" style="width:8px;height:8px;border-radius:50%;background:${n.primary};flex-shrink:0;display:inline-block;animation:vista-pulse-dot 1.8s ease-in-out infinite;"></span>
        <span id="vista-status-text" style="font-size:11px;font-weight:700;letter-spacing:0.07em;color:${n.primary};">MONETIZING ACTIVE</span>
      </div>

      <div style="margin-bottom:13px;">
        <div style="font-size:10px;color:${n.muted};letter-spacing:0.09em;font-weight:600;text-transform:uppercase;margin-bottom:5px;">Session \u2192 Escrow</div>
        <div id="vista-overlay-amount" style="font-size:24px;font-weight:700;color:${n.text};letter-spacing:-0.02em;line-height:1.1;">
          ${y(g)}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:13px;">
        <div style="background:${n.surface};border-radius:10px;padding:9px 11px;">
          <div style="font-size:10px;color:${n.muted};text-transform:uppercase;letter-spacing:0.07em;margin-bottom:4px;">Attention</div>
          <div id="vista-overlay-score" style="font-size:16px;font-weight:700;">${Math.round(f * 100)}%</div>
        </div>
        <div style="background:${n.surface};border-radius:10px;padding:9px 11px;">
          <div style="font-size:10px;color:${n.muted};text-transform:uppercase;letter-spacing:0.07em;margin-bottom:4px;">Duration</div>
          <div id="vista-overlay-seconds" style="font-size:16px;font-weight:700;">${Math.floor(u / 60)}:${String(u % 60).padStart(2, "0")}</div>
        </div>
      </div>

      <div style="font-size:10px;color:${n.muted};padding-top:10px;border-top:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;gap:5px;">
        <span style="font-size:12px;">\u26D3</span>
        <span>Earnings settle to on-chain escrow every 10 seconds</span>
      </div>
    `),
        document.body.appendChild(m));
      let c = () => {
        let s = document.getElementById("vista-earning-overlay");
        if (!s) return;
        if (e && !o) {
          ((s.style.position = "absolute"),
            (s.style.bottom = "12px"),
            (s.style.right = "12px"),
            (s.style.top = "auto"),
            (s.style.left = "auto"));
          return;
        }
        let x = o ?? e;
        if (!x) {
          ((s.style.bottom = "20px"),
            (s.style.right = "20px"),
            (s.style.top = "auto"),
            (s.style.left = "auto"));
          return;
        }
        let i = x.getBoundingClientRect(),
          h = v,
          a = window.innerWidth - i.right - h,
          p;
        a >= r ? (p = i.right + h) : (p = Math.max(4, i.left - r - h));
        let E = Math.max(4, i.top + 4);
        ((s.style.top = `${E}px`),
          (s.style.left = `${p}px`),
          (s.style.bottom = "auto"),
          (s.style.right = "auto"));
      };
      (e &&
        !o &&
        ((e.style.position = e.style.position || "relative"),
        e.appendChild(m),
        (m.style.position = "absolute")),
        c(),
        document
          .getElementById("vista-overlay-close")
          ?.addEventListener("click", () => {
            this.removeEarningOverlay();
          }),
        (this.overlayScrollHandler = c),
        window.addEventListener("scroll", c, { passive: !0 }),
        window.addEventListener("resize", c, { passive: !0 }));
      let b = g;
      ((this.overlayIntervalId = window.setInterval(() => {
        let s = this.getStatus(),
          x = isNaN(s.sessionAmount) ? 0 : s.sessionAmount,
          i = isNaN(s.score) ? 0 : s.score,
          h = isNaN(s.validSeconds) ? 0 : s.validSeconds,
          a = document.getElementById("vista-overlay-amount"),
          p = document.getElementById("vista-overlay-score"),
          E = document.getElementById("vista-overlay-seconds"),
          M = document.getElementById("vista-status-dot"),
          C = document.getElementById("vista-status-text");
        if (a && x !== b) {
          let $ = b;
          ((b = x), this.animateValue(a, $, x, 700, y));
        }
        p && (p.textContent = `${Math.round(i * 100)}%`);
        if (E) {
          let dur = Math.floor((Date.now() - this.startTime) / 1e3);
          E.textContent = `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, "0")}`;
        }
        (M && (M.style.background = s.active ? n.primary : n.muted),
          C &&
            ((C.textContent = s.active
              ? "MONETIZING ACTIVE"
              : "TRACKING PAUSED"),
            (C.style.color = s.active ? n.primary : n.muted)));
      }, 1e3)),
        e &&
          !o &&
          ((this.overlayFullscreenHandler = () => {
            document.fullscreenElement || this.removeEarningOverlay();
          }),
          document.addEventListener(
            "fullscreenchange",
            this.overlayFullscreenHandler,
          )));
    }
    removeEarningOverlay() {
      let t = document.getElementById("vista-earning-overlay");
      (t?.parentElement && t.parentElement.removeChild(t),
        this.overlayIntervalId !== null &&
          (clearInterval(this.overlayIntervalId),
          (this.overlayIntervalId = null)),
        this.overlayFullscreenHandler &&
          (document.removeEventListener(
            "fullscreenchange",
            this.overlayFullscreenHandler,
          ),
          (this.overlayFullscreenHandler = null)),
        this.overlayScrollHandler &&
          (window.removeEventListener("scroll", this.overlayScrollHandler),
          window.removeEventListener("resize", this.overlayScrollHandler),
          (this.overlayScrollHandler = null)));
    }
    animateValue(t, e, o, n, r) {
      let v = performance.now(),
        l = (g) => {
          let f = Math.min((g - v) / n, 1),
            u = 1 - Math.pow(1 - f, 3);
          ((t.innerHTML = r(e + (o - e) * u)),
            f < 1 && requestAnimationFrame(l));
        };
      requestAnimationFrame(l);
    }
    buildPayload() {
      let t = this.collector.collect(),
        e = this.collector.calculateScore(t);
      return {
        sessionId: this.sessionManager.getSessionId(),
        apiKey: this.config.apiKey,
        userWallet: this.config.userWallet,
        campaignId: this.config.campaignId,
        publisherWallet: this.config.publisherWallet,
        timestamp: Date.now(),
        nonce: this.sessionManager.generateNonce(),
        score: e,
        signals: t,
      };
    }
    handleResponse(t) {
      if (((this.lastScore = t.score), !t.valid)) return;
      let e = t.validSeconds - this.lastValidSeconds;
      if (
        ((this.lastValidSeconds = t.validSeconds), e > 0 && this.earnCallback)
      ) {
        let o = e * 333e-6;
        ((this.sessionAmount += o),
          this.earnCallback({
            sessionAmount: this.sessionAmount,
            tickAmount: o,
            validSeconds: t.validSeconds,
            score: t.score,
            flagged: t.flagged,
          }));
      }
    }
    async postSessionEnd() {
      if (!(!this.config || !this.sessionManager))
        try {
          await fetch(`${this.config.oracleUrl}/session/end`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: this.sessionManager.getSessionId(),
              apiKey: this.config.apiKey,
            }),
          });
        } catch (t) {
          console.warn("[VISTA] Session end failed:", t);
        }
    }
    setupFullscreenListener() {
      ((this.isFullscreenActive = this.checkIsFullscreen()),
        (this.fullscreenchangeHandler = () => {
          ((this.isFullscreenActive = this.checkIsFullscreen()),
            console.log("[VISTA] Fullscreen:", this.isFullscreenActive));
        }),
        document.addEventListener(
          "fullscreenchange",
          this.fullscreenchangeHandler,
        ));
    }
    removeFullscreenListener() {
      this.fullscreenchangeHandler &&
        (document.removeEventListener(
          "fullscreenchange",
          this.fullscreenchangeHandler,
        ),
        (this.fullscreenchangeHandler = null));
    }
    checkIsFullscreen() {
      if (!this.trackedElementId) return !1;
      let t = document.fullscreenElement;
      if (!t) return !1;
      let e = document.getElementById(this.trackedElementId);
      return e ? t === e || t.contains(e) || e.contains(t) : !1;
    }
    setupSessionEndListeners() {
      typeof window > "u" ||
        this.listenersSetup ||
        ((this.beforeunloadHandler = () => {
          this.detachZone();
        }),
        (this.visibilitychangeHandler = () => {
          document.visibilityState === "hidden" &&
            setTimeout(() => {
              document.visibilityState === "hidden" &&
                !document.fullscreenElement &&
                this.detachZone();
            }, 200);
        }),
        window.addEventListener("beforeunload", this.beforeunloadHandler),
        document.addEventListener(
          "visibilitychange",
          this.visibilitychangeHandler,
        ),
        (this.listenersSetup = !0));
    }
    removeSessionEndListeners() {
      typeof window > "u" ||
        (this.listenersSetup &&
          (this.beforeunloadHandler &&
            (window.removeEventListener(
              "beforeunload",
              this.beforeunloadHandler,
            ),
            (this.beforeunloadHandler = null)),
          this.visibilitychangeHandler &&
            (document.removeEventListener(
              "visibilitychange",
              this.visibilitychangeHandler,
            ),
            (this.visibilitychangeHandler = null)),
          (this.listenersSetup = !1)));
    }
  },
  H = new k();
var L = 84532,
  O = "https://sepolia.base.org",
  N = "https://sepolia.basescan.org";
function T(w) {
  let { domain: t, uri: e, address: o, nonce: n, chainId: r, issuedAt: v } = w;
  return [
    "Sign in to Farcaster Base Sepolia App",
    `Domain: ${t}`,
    `URI: ${e}`,
    `Address: ${o}`,
    `Chain ID: ${r}`,
    `Nonce: ${n}`,
    `Issued At: ${v}`,
    "Statement: This signature proves wallet ownership.",
  ].join(`
`);
}
async function F(w) {
  let {
      address: t,
      chainId: e,
      targetChainId: o = 84532,
      domain: n,
      uri: r,
      nonceEndpoint: v,
      verifyEndpoint: l,
      switchChain: g,
      signMessage: f,
    } = w,
    u = e;
  if ((u !== o && g && (u = (await g(o)).id), u !== o))
    throw new Error("Wrong chain");
  let m = await fetch(v, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: t }),
    }),
    d = await m.json();
  if (!m.ok || !d?.nonce) throw new Error(d?.error ?? "Failed nonce");
  let y = new Date().toISOString(),
    c = T({
      domain: n,
      uri: r,
      address: t,
      nonce: d.nonce,
      chainId: u,
      issuedAt: y,
    }),
    b = await f(c),
    s = await fetch(l, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: t,
        nonce: d.nonce,
        chainId: u,
        message: c,
        signature: b,
      }),
    }),
    x = await s.json();
  if (!s.ok) throw new Error(x?.error ?? "Verify failed");
}
export {
  L as BASE_CHAIN_ID,
  N as BASE_EXPLORER_URL,
  O as BASE_RPC_URL,
  H as Vista,
  T as buildWalletAuthMessage,
  F as performWalletSignIn,
};
//# sourceMappingURL=index.mjs.map

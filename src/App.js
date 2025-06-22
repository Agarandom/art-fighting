import React, { useRef, useState, useEffect } from "react";
import getStroke from "perfect-freehand";
import { io } from "socket.io-client";

// Responsive canvas (fills half screen, no scroll)
const CANVAS_RATIO = 0.83;
const MMR_DELTA = 25, DRAW_TIME = 60;
const socket = io("https://arts-fighting-server.onrender.com");

// Font
const FONT_URL = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap";
const injectFont = () => {
  if (!document.getElementById("artFont")) {
    const link = document.createElement("link");
    link.id = "artFont";
    link.rel = "stylesheet";
    link.href = FONT_URL;
    document.head.appendChild(link);
  }
};

function useWindowSize() {
  const [size, setSize] = useState([window.innerWidth, window.innerHeight]);
  useEffect(() => {
    const handler = () => setSize([window.innerWidth, window.innerHeight]);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return size;
}

function getSvgPath(stroke) {
  if (!stroke.length) return "";
  const pts = getStroke(stroke, { size: 5, thinning: 0.7, smoothing: 0.75 });
  return pts.length
    ? "M " + pts.map(([x, y], i) => (i === 0 ? `${x} ${y}` : `L ${x} ${y}`)).join(" ")
    : "";
}

function MMRDelta({ delta }) {
  if (!delta) return null;
  return (
    <div style={{
      fontSize: 30,
      fontWeight: 500,
      color: delta > 0 ? "#5ac28e" : "#e86e6e",
      margin: "18px 0 0 0",
      opacity: 0.88,
      letterSpacing: 1.2,
      background: "rgba(255,255,255,0.4)",
      borderRadius: 12,
      padding: "4px 16px",
      display: "inline-block",
      boxShadow: "0 2px 16px #e8e2ff0d",
      animation: "mmrFade 1.2s"
    }}>
      {delta > 0 ? `+${delta}` : `${delta}`}
      <style>{`
        @keyframes mmrFade {
          0% { transform: translateY(12px) scale(0.97); opacity: 0; }
          50% { transform: translateY(-3px) scale(1.04); opacity: 1; }
          100% { transform: translateY(0px) scale(1); opacity: 0.92; }
        }
      `}</style>
    </div>
  );
}

function DrawingCanvas({ enabled, strokes, setStrokes, onSendStroke, onUndo, width, height }) {
  const [currStroke, setCurrStroke] = useState([]);
  const svgRef = useRef();

  function pointerPos(e) {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const touch = e.touches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return [
      ((clientX - rect.left) / rect.width) * width,
      ((clientY - rect.top) / rect.height) * height,
    ];
  }

  function onPointerDown(e) {
    if (!enabled) return;
    setCurrStroke([pointerPos(e)]);
  }
  function onPointerMove(e) {
    if (!enabled || !currStroke.length) return;
    setCurrStroke((pts) => [...pts, pointerPos(e)]);
  }
  function onPointerUp() {
    if (!enabled || currStroke.length < 2) return;
    setStrokes((old) => [...old, currStroke]);
    onSendStroke(currStroke);
    setCurrStroke([]);
  }
  function handleUndo() {
    if (!enabled) return;
    if (typeof onUndo === "function") onUndo();
  }

  return (
    <div style={{
      width: width + 12, height: height + 48,
      background: enabled ? "rgba(255,255,255,0.65)" : "rgba(242,243,246,0.84)",
      borderRadius: 24,
      boxShadow: enabled
        ? "0 8px 32px #b0d0ff44, 0 2px 8px #e8e2ff33"
        : "0 2px 8px #e0e7ff22",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
      padding: 16, position: "relative",
      border: enabled ? "2.5px solid #a3bfee" : "1.5px solid #d7dbec",
      margin: "0 auto",
      transition: "border 0.3s"
    }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{
          border: "none",
          borderRadius: 17,
          background: "#fff",
          touchAction: "none",
          marginBottom: 8,
          cursor: enabled ? "crosshair" : "not-allowed",
          boxShadow: "0 1px 7px #e0e0f733"
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
      >
        {strokes.map((stroke, i) =>
          <path
            key={i}
            d={getSvgPath(stroke)}
            fill="black"
            stroke="black"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.85}
          />
        )}
        {currStroke.length > 1 &&
          <path
            d={getSvgPath(currStroke)}
            fill="black"
            stroke="black"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.4}
          />
        }
      </svg>
      <button
        onClick={handleUndo}
        style={{
          marginTop: 3,
          background: enabled
            ? "linear-gradient(90deg,#f5f5fa 20%,#cbe2fc 80%)"
            : "#e9e9ed",
          color: "#576184",
          border: "1.5px solid #b8c5de",
          borderRadius: 9,
          fontWeight: 500,
          fontSize: 18,
          padding: "6px 28px",
          cursor: enabled ? "pointer" : "not-allowed",
          boxShadow: enabled ? "0 2px 8px #cadfff22" : undefined,
          transition: "background 0.2s, color 0.2s, border 0.3s"
        }}>
        Undo
      </button>
    </div>
  );
}

export default function App() {
  injectFont();
  const [w, h] = useWindowSize();
  const SIDE_W = Math.floor((w * 0.5) * CANVAS_RATIO);
  const SIDE_H = Math.min(h * 0.83, SIDE_W * 1.11);

  const [username, setUsername] = useState(localStorage.getItem("username") || "");
  const [inputName, setInputName] = useState("");
  const [mmr, setMMR] = useState(Number(localStorage.getItem("mmr")) || 1000);
  const [userId] = useState(() => {
    let id = localStorage.getItem("userId");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("userId", id);
    }
    return id;
  });

  const [prompt, setPrompt] = useState("");
  const [timer, setTimer] = useState(DRAW_TIME);
  const [myStrokes, setMyStrokes] = useState([]);
  const [opponentStrokes, setOpponentStrokes] = useState([]);
  const [phase, setPhase] = useState("queue");
  const [winner, setWinner] = useState(null);
  const [players, setPlayers] = useState(["You", "Opponent"]);
  const [youAre, setYouAre] = useState(0);
  const [roundActive, setRoundActive] = useState(false);
  const [mmrDelta, setMmrDelta] = useState(0);

  // Join and queue after login
  useEffect(() => {
    if (!username) return;
    if (!socket.connected) socket.connect();
    socket.emit("join", { username, userId });
    socket.emit("play-again");
  }, [username, userId]);

  // Socket events
  useEffect(() => {
    if (!username) return;

    socket.on("round-start", (data) => {
      setPrompt(data.prompt);
      setPlayers(data.players);
      setYouAre(data.youAre);
      setWinner(null);
      setMyStrokes([]);
      setOpponentStrokes([]);
      setTimer(data.timer);
      setPhase("draw");
      setRoundActive(true);
      setMmrDelta(0);
    });

    socket.on("round-ended", ({ winner }) => {
      setWinner(winner);
      setPhase("result");
      setRoundActive(false);
      setMMR((mmr) => {
        const delta = winner === username ? MMR_DELTA : -MMR_DELTA;
        setMmrDelta(delta);
        const newMMR = mmr + delta;
        localStorage.setItem("mmr", newMMR);
        return newMMR;
      });
    });

    socket.on("receive-stroke", (stroke) => {
      setOpponentStrokes((old) => [...old, stroke]);
    });

    socket.on("undo-confirm", () => {
      setMyStrokes((old) => old.slice(0, -1));
    });
    socket.on("opponent-undo", () => {
      setOpponentStrokes((old) => old.slice(0, -1));
    });

    socket.on("opponent-clear", () => setOpponentStrokes([]));
    socket.on("opponent-leave", () => {
      setPlayers(["You", "Opponent"]);
      setOpponentStrokes([]);
      setPhase("queue");
      setRoundActive(false);
      setMmrDelta(0);
    });

    return () => {
      socket.off("round-start");
      socket.off("round-ended");
      socket.off("receive-stroke");
      socket.off("undo-confirm");
      socket.off("opponent-undo");
      socket.off("opponent-clear");
      socket.off("opponent-leave");
    };
  }, [username]);

  // Bulletproof timer
  useEffect(() => {
    if (!roundActive || phase !== "draw") return;
    if (timer <= 0) {
      setRoundActive(false);
      setPhase("result");
      socket.emit("end-round");
      return;
    }
    const t = setTimeout(() => setTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [roundActive, timer, phase]);

  function sendStroke(stroke) {
    socket.emit("send-stroke", stroke);
  }
  function handleUndo() {
    socket.emit("undo");
  }
  function resetRound() {
    setMyStrokes([]);
    setOpponentStrokes([]);
    setWinner(null);
    setPhase("queue");
    setRoundActive(false);
    setMmrDelta(0);
    socket.emit("play-again");
  }

  // === Abstract Blobs for BG ===
  const Blobs = () => (
    <>
      {/* top left */}
      <div style={{
        position: "fixed", top: -130, left: -160, zIndex: 0,
        width: 430, height: 350, borderRadius: "38% 62% 44% 56%",
        background: "radial-gradient(ellipse at 60% 30%, #e9ecff 68%, #dee6ff00 100%)",
        filter: "blur(8px)", opacity: 0.85,
        pointerEvents: "none"
      }} />
      {/* right, behind canvas */}
      <div style={{
        position: "fixed", top: "44%", right: -200, zIndex: 0,
        width: 500, height: 370, borderRadius: "50% 50% 70% 30%",
        background: "radial-gradient(ellipse at 60% 50%, #ffe3e3 66%, #f3e7fa00 100%)",
        filter: "blur(14px)", opacity: 0.7,
        pointerEvents: "none"
      }} />
      {/* lower center */}
      <div style={{
        position: "fixed", bottom: -160, left: "35vw", zIndex: 0,
        width: 400, height: 340, borderRadius: "58% 42% 65% 35%",
        background: "radial-gradient(ellipse at 40% 70%, #bdf2e3 64%, #f1f7f700 100%)",
        filter: "blur(18px)", opacity: 0.6,
        pointerEvents: "none"
      }} />
    </>
  );

  // Auth flow
  if (!username) {
    return (
      <div style={{
        minHeight: "100vh", background: "#f5f6fa", display: "flex",
        alignItems: "center", justifyContent: "center", position: "relative"
      }}>
        <Blobs />
        <div style={{
          padding: 38, minWidth: 340,
          borderRadius: 26, background: "rgba(255,255,255,0.88)",
          boxShadow: "0 2px 32px #e0e6ff40, 0 1px 8px #e9e2ff44",
          zIndex: 1
        }}>
          <h1 style={{
            fontWeight: 600, fontSize: 34, color: "#6477b8",
            letterSpacing: 1.1, marginBottom: 16, fontFamily: "Inter,sans-serif"
          }}>Art Fighting</h1>
          <input
            placeholder="Enter your username..."
            value={inputName}
            onChange={e => setInputName(e.target.value)}
            style={{
              fontSize: 20, padding: 13, marginBottom: 18, width: "100%", borderRadius: 11,
              border: "1.7px solid #c8d4fa", outline: "none", fontFamily: "Inter,sans-serif"
            }}
          /><br />
          <button
            style={{
              fontSize: 20, padding: "10px 30px", borderRadius: 10,
              background: "linear-gradient(90deg,#e8f1ff 10%,#cbe2fc 100%)",
              color: "#6077a0", fontWeight: 500, border: "none", boxShadow: "0 2px 8px #dde6ff44", cursor: "pointer",
              letterSpacing: 1
            }}
            onClick={() => {
              if (inputName.trim().length < 2) return;
              setUsername(inputName);
              localStorage.setItem("username", inputName);
              localStorage.setItem("mmr", mmr);
            }}>
            Login
          </button>
        </div>
      </div>
    );
  }

  // Waiting/queue state
  if (phase === "queue") {
    return (
      <div style={{
        minHeight: "100vh", background: "#f5f6fa",
        display: "flex", alignItems: "center", justifyContent: "center", position: "relative"
      }}>
        <Blobs />
        <div style={{
          borderRadius: 23, background: "rgba(255,255,255,0.87)",
          boxShadow: "0 2px 28px #e0e6ff30, 0 1px 8px #e9e2ff33",
          padding: "40px 55px", minWidth: 390, zIndex: 1
        }}>
          <h1 style={{
            fontWeight: 500, fontSize: 29, color: "#6477b8", letterSpacing: 0.9, marginBottom: 13
          }}>Waiting for opponent…</h1>
          <div style={{
            fontSize: 17, color: "#627097", marginBottom: 18, fontWeight: 400,
            letterSpacing: 0.2, fontFamily: "Inter,sans-serif"
          }}>
            Share this link with a friend to play together!
          </div>
          <div style={{
            display: "flex", gap: 20, marginTop: 16
          }}>
            <div style={{
              fontSize: 19, fontWeight: 500, color: "#74cbbf",
              background: "#edf9f4", padding: "9px 24px", borderRadius: 12, fontFamily: "Inter,sans-serif"
            }}>
              You: {username}
            </div>
            <div style={{
              fontSize: 18, color: "#b4bed5", fontWeight: 500, fontFamily: "Inter,sans-serif",
              background: "#fff", padding: "9px 17px", borderRadius: 12,
              border: "1.2px dashed #d7dbec"
            }}>
              Opponent: {players[1] || "Opponent"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Game UI
  return (
    <div style={{
      minHeight: "100vh", width: "100vw", overflow: "hidden", background: "#f5f6fa",
      fontFamily: "Inter,sans-serif", padding: 0, margin: 0, boxSizing: "border-box", position: "relative"
    }}>
      <Blobs />
      <div style={{
        width: "100%", padding: "18px 0 13px 0", marginBottom: 0, textAlign: "center",
        fontWeight: 500, fontSize: 36, color: "#6477b8", letterSpacing: 1.1,
        textShadow: "0 2px 12px #e8e2ff22"
      }}>
        Art Fighting
      </div>
      <div style={{
        textAlign: "center", marginBottom: 17, fontSize: 22, color: "#6077a0",
        fontWeight: 500, letterSpacing: 0.6, padding: "4px 0"
      }}>
        <span>
          <b>Prompt:</b> {prompt}
        </span>
        <span style={{ marginLeft: 28, color: "#8bb7e1" }}>
          <b>Time left:</b> {phase === "draw" ? timer : 0}s
        </span>
      </div>
      <div style={{
        display: "flex", flexDirection: "row", justifyContent: "center",
        alignItems: "flex-start", width: "100vw", gap: 18, margin: 0, zIndex: 1
      }}>
        {/* Player 1 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            textAlign: "center", marginBottom: 12, fontWeight: 500, color: "#4fa3b1", fontSize: 21, letterSpacing: 0.9
          }}>
            {username} <span style={{ color: "#9ab1d1", fontSize: 16 }}>({mmr} MMR)</span>
          </div>
          <DrawingCanvas
            enabled={phase === "draw"}
            strokes={myStrokes}
            setStrokes={setMyStrokes}
            onSendStroke={sendStroke}
            onUndo={handleUndo}
            width={SIDE_W}
            height={SIDE_H}
          />
        </div>
        {/* Divider */}
        <div style={{
          width: 11, background: "linear-gradient(#e8eaff 60%, #e1fff3 100%)",
          height: SIDE_H + 76, alignSelf: "center", borderRadius: 8, margin: "0 7px"
        }} />
        {/* Player 2 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            textAlign: "center", marginBottom: 12, fontWeight: 500, color: "#ab7fd7", fontSize: 21, letterSpacing: 0.9
          }}>
            {players[1] || "Opponent"} <span style={{ color: "#b4bed5", fontSize: 16 }}>(??? MMR)</span>
          </div>
          <DrawingCanvas
            enabled={false}
            strokes={opponentStrokes}
            setStrokes={() => { }}
            onSendStroke={() => { }}
            width={SIDE_W}
            height={SIDE_H}
          />
        </div>
      </div>

      {/* Results */}
      {phase === "result" && (
        <div style={{
          textAlign: "center",
          marginTop: 40,
          background: "rgba(255,255,255,0.92)",
          border: "2.5px solid #e1fff3",
          borderRadius: 17,
          maxWidth: 900,
          marginLeft: "auto",
          marginRight: "auto",
          padding: 30,
          boxShadow: "0 2px 18px #e1fff355"
        }}>
          <h2 style={{ fontWeight: 500, fontSize: 25, color: "#4fa3b1" }}>Results</h2>
          <div style={{ fontSize: 20, margin: 12, color: "#7a8ab1" }}>
            <b>Prompt:</b> {prompt}
          </div>
          <div style={{ fontSize: 22, margin: 12 }}>
            <b>Winner:</b>{" "}
            <span style={{
              color: winner === username ? "#5ac28e" : "#e86e6e",
              fontWeight: 600
            }}>{winner}</span>
          </div>
          <MMRDelta delta={mmrDelta} />
          <div style={{
            display: "flex", flexDirection: "row", justifyContent: "center",
            gap: 26, marginTop: 15
          }}>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 7, color: "#4fa3b1", fontSize: 19 }}>{username}</div>
              <DrawingCanvas enabled={false} strokes={myStrokes} setStrokes={() => { }} onSendStroke={() => { }} width={SIDE_W / 1.45} height={SIDE_H / 1.45} />
            </div>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 7, color: "#ab7fd7", fontSize: 19 }}>{players[1] || "Opponent"}</div>
              <DrawingCanvas enabled={false} strokes={opponentStrokes} setStrokes={() => { }} onSendStroke={() => { }} width={SIDE_W / 1.45} height={SIDE_H / 1.45} />
            </div>
          </div>
          <button style={{
            marginTop: 29, fontSize: 18, padding: "12px 37px", borderRadius: 11,
            background: "linear-gradient(90deg,#e8f1ff 10%,#cbe2fc 100%)",
            color: "#6077a0", fontWeight: 600, border: "none", boxShadow: "0 2px 8px #dde6ff44", cursor: "pointer",
            letterSpacing: 1
          }} onClick={resetRound}>
            Queue for Next Match
          </button>
        </div>
      )}
    </div>
  );
}

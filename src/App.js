import React, { useRef, useState, useEffect } from "react";
import getStroke from "perfect-freehand";
import { io } from "socket.io-client";

// === Minimalist palette ===
const BG = "#f3f4f6";
const ACCENT = "#bfc8db";
const CANVAS_BG = "#f9fafb";
const CANVAS_BORDER = "#cbd3e1";
const BTN = "#eceef2";
const BTN_TEXT = "#46546c";
const TEXT1 = "#374151";
const TEXT2 = "#7b8799";
const WIN = "#529b6b";
const LOSE = "#c37d7d";

const MMR_DELTA = 25, DRAW_TIME = 60;
const socket = io("https://arts-fighting-server.onrender.com");

// Font: Inter minimalist
const FONT_URL = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap";
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
  const pts = getStroke(stroke, { size: 4, thinning: 0.6, smoothing: 0.8 });
  return pts.length
    ? "M " + pts.map(([x, y], i) => (i === 0 ? `${x} ${y}` : `L ${x} ${y}`)).join(" ")
    : "";
}

function MMRDelta({ delta }) {
  if (!delta) return null;
  return (
    <div style={{
      fontSize: 22,
      fontWeight: 500,
      color: delta > 0 ? WIN : LOSE,
      margin: "12px 0 0 0",
      letterSpacing: 1.2,
      background: "#fff",
      borderRadius: 8,
      padding: "2px 11px",
      border: `1.2px solid ${delta > 0 ? WIN : LOSE}`,
      display: "inline-block",
      boxShadow: "0 1px 7px #dde1ee08"
    }}>
      {delta > 0 ? `+${delta}` : `${delta}`}
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
      width: width + 6, height: height + 44,
      background: CANVAS_BG,
      borderRadius: 15,
      boxShadow: "0 1px 6px #dde1ee12",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
      padding: 8, position: "relative",
      border: `1.2px solid ${CANVAS_BORDER}`,
      margin: "0 auto"
    }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{
          border: "none",
          borderRadius: 11,
          background: "#fff",
          touchAction: "none",
          marginBottom: 5,
          cursor: enabled ? "crosshair" : "not-allowed",
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
            opacity={0.8}
          />
        )}
        {currStroke.length > 1 &&
          <path
            d={getSvgPath(currStroke)}
            fill="black"
            stroke="black"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.34}
          />
        }
      </svg>
      <button
        onClick={handleUndo}
        style={{
          marginTop: 1,
          background: BTN,
          color: BTN_TEXT,
          border: `1px solid ${CANVAS_BORDER}`,
          borderRadius: 8,
          fontWeight: 500,
          fontSize: 16,
          padding: "5px 19px",
          cursor: enabled ? "pointer" : "not-allowed",
        }}>
        Undo
      </button>
    </div>
  );
}

export default function App() {
  injectFont();
  const [w, h] = useWindowSize();
  // Compact: max 430x530, always fits
  const SIDE_W = Math.min(430, Math.max(300, (w * 0.37)));
  const SIDE_H = Math.min(530, Math.max(250, (h * 0.56)));

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

  // Auth flow
  if (!username) {
    return (
      <div style={{
        minHeight: "100vh", background: BG, display: "flex",
        alignItems: "center", justifyContent: "center"
      }}>
        <div style={{
          padding: 34, minWidth: 312,
          borderRadius: 14, background: "#fff",
          boxShadow: "0 1px 8px #dde1ee22"
        }}>
          <h1 style={{
            fontWeight: 500, fontSize: 27, color: TEXT1,
            letterSpacing: 0.7, marginBottom: 14, fontFamily: "Inter,sans-serif"
          }}>Art Fighting</h1>
          <input
            placeholder="Enter your username…"
            value={inputName}
            onChange={e => setInputName(e.target.value)}
            style={{
              fontSize: 18, padding: 10, marginBottom: 16, width: "100%", borderRadius: 8,
              border: `1px solid ${ACCENT}`, outline: "none", fontFamily: "Inter,sans-serif"
            }}
          /><br />
          <button
            style={{
              fontSize: 17, padding: "8px 22px", borderRadius: 8,
              background: BTN, color: BTN_TEXT, fontWeight: 500, border: `1px solid ${CANVAS_BORDER}`, cursor: "pointer"
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
        minHeight: "100vh", background: BG,
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        <div style={{
          borderRadius: 14, background: "#fff",
          boxShadow: "0 1px 8px #dde1ee11",
          padding: "32px 40px", minWidth: 320
        }}>
          <h1 style={{
            fontWeight: 500, fontSize: 22, color: TEXT1, letterSpacing: 0.5, marginBottom: 7
          }}>Waiting for opponent…</h1>
          <div style={{
            fontSize: 15, color: TEXT2, marginBottom: 13, fontWeight: 400,
            letterSpacing: 0.1, fontFamily: "Inter,sans-serif"
          }}>
            Share this link with a friend to play together!
          </div>
          <div style={{
            display: "flex", gap: 14, marginTop: 10
          }}>
            <div style={{
              fontSize: 15, fontWeight: 500, color: TEXT1,
              background: BG, padding: "7px 14px", borderRadius: 9, fontFamily: "Inter,sans-serif"
            }}>
              You: {username}
            </div>
            <div style={{
              fontSize: 15, color: ACCENT, fontWeight: 500, fontFamily: "Inter,sans-serif",
              background: "#fff", padding: "7px 10px", borderRadius: 9,
              border: `1px dashed ${CANVAS_BORDER}`
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
      minHeight: "100vh", width: "100vw", overflow: "hidden", background: BG,
      fontFamily: "Inter,sans-serif", padding: 0, margin: 0, boxSizing: "border-box"
    }}>
      <div style={{
        width: "100%", padding: "12px 0 8px 0", marginBottom: 0, textAlign: "center",
        fontWeight: 500, fontSize: 21, color: TEXT1, letterSpacing: 0.7
      }}>
        Art Fighting
      </div>
      <div style={{
        textAlign: "center", marginBottom: 8, fontSize: 16, color: TEXT2,
        fontWeight: 400, letterSpacing: 0.3, padding: "2px 0"
      }}>
        <span>
          <b>Prompt:</b> {prompt}
        </span>
        <span style={{ marginLeft: 16, color: ACCENT }}>
          <b>Time left:</b> {phase === "draw" ? timer : 0}s
        </span>
      </div>
      <div style={{
        display: "flex", flexDirection: "row", justifyContent: "center",
        alignItems: "flex-start", width: "100vw", gap: 12, margin: 0
      }}>
        {/* Player 1 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            textAlign: "center", marginBottom: 8, fontWeight: 500, color: TEXT1, fontSize: 16
          }}>
            {username} <span style={{ color: ACCENT, fontSize: 14 }}>({mmr} MMR)</span>
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
          width: 6, background: CANVAS_BORDER,
          height: SIDE_H + 38, alignSelf: "center", borderRadius: 6, margin: "0 4px"
        }} />
        {/* Player 2 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            textAlign: "center", marginBottom: 8, fontWeight: 500, color: ACCENT, fontSize: 16
          }}>
            {players[1] || "Opponent"} <span style={{ color: "#bfc8db", fontSize: 14 }}>(??? MMR)</span>
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
          marginTop: 22,
          background: "#fff",
          border: `1.5px solid ${CANVAS_BORDER}`,
          borderRadius: 11,
          maxWidth: 650,
          marginLeft: "auto",
          marginRight: "auto",
          padding: 26,
          boxShadow: "0 2px 10px #dde1ee11"
        }}>
          <h2 style={{ fontWeight: 500, fontSize: 20, color: TEXT1, marginBottom: 7 }}>Results</h2>
          <div style={{ fontSize: 15, margin: 8, color: TEXT2 }}>
            <b>Prompt:</b> {prompt}
          </div>
          <div style={{ fontSize: 17, margin: 9 }}>
            <b>Winner:</b>{" "}
            <span style={{
              color: winner === username ? WIN : LOSE,
              fontWeight: 600
            }}>{winner}</span>
          </div>
          <MMRDelta delta={mmrDelta} />
          <div style={{
            display: "flex", flexDirection: "row", justifyContent: "center",
            gap: 16, marginTop: 8
          }}>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 5, color: TEXT1, fontSize: 15 }}>{username}</div>
              <DrawingCanvas enabled={false} strokes={myStrokes} setStrokes={() => { }} onSendStroke={() => { }} width={SIDE_W / 1.25} height={SIDE_H / 1.25} />
            </div>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 5, color: ACCENT, fontSize: 15 }}>{players[1] || "Opponent"}</div>
              <DrawingCanvas enabled={false} strokes={opponentStrokes} setStrokes={() => { }} onSendStroke={() => { }} width={SIDE_W / 1.25} height={SIDE_H / 1.25} />
            </div>
          </div>
          <button style={{
            marginTop: 19, fontSize: 15, padding: "8px 28px", borderRadius: 9,
            background: BTN, color: BTN_TEXT, fontWeight: 500, border: `1px solid ${CANVAS_BORDER}`, cursor: "pointer"
          }} onClick={resetRound}>
            Queue for Next Match
          </button>
        </div>
      )}
    </div>
  );
}
    
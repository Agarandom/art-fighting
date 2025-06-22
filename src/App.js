import React, { useRef, useState, useEffect } from "react";
import getStroke from "perfect-freehand";
import { io } from "socket.io-client";

// Bigger canvas size
const CANVAS_W = 800, CANVAS_H = 1000, DRAW_TIME = 60, MMR_DELTA = 25;
const socket = io("https://arts-fighting-server.onrender.com");

// For MMR delta pop
function MMRDelta({ delta }) {
  if (!delta) return null;
  return (
    <div style={{
      fontSize: 36,
      fontWeight: 900,
      color: delta > 0 ? "#39d353" : "#f23d3d",
      margin: "16px 0",
      transition: "opacity 0.5s",
      textShadow: "0 2px 12px rgba(0,0,0,0.1)",
      letterSpacing: 2,
      animation: "mmrPop 1s"
    }}>
      {delta > 0 ? `+${delta}` : `${delta}`}
      <style>{`
        @keyframes mmrPop {
          0% { transform: scale(0.6); opacity: 0; }
          50% { transform: scale(1.25); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function getSvgPath(stroke) {
  if (!stroke.length) return "";
  const pts = getStroke(stroke, { size: 5, thinning: 0.7, smoothing: 0.75 });
  return pts.length
    ? "M " + pts.map(([x, y], i) => (i === 0 ? `${x} ${y}` : `L ${x} ${y}`)).join(" ")
    : "";
}

function DrawingCanvas({ enabled, strokes, setStrokes, onSendStroke, onUndo }) {
  const [currStroke, setCurrStroke] = useState([]);
  const svgRef = useRef();

  function pointerPos(e) {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const touch = e.touches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return [
      ((clientX - rect.left) / rect.width) * CANVAS_W,
      ((clientY - rect.top) / rect.height) * CANVAS_H,
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
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      background: enabled ? "linear-gradient(120deg,#ffeaa7 0,#a0c4ff 100%)" : "#fafbfc",
      borderRadius: 24,
      boxShadow: "0 4px 20px 0 rgba(130,140,200,0.09)",
      padding: 16,
      minWidth: CANVAS_W + 32,
      transition: "background 0.3s"
    }}>
      <svg
        ref={svgRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          border: enabled ? "3px solid #00b894" : "2px solid #bbb",
          borderRadius: 18,
          background: "#fff",
          touchAction: "none",
          marginBottom: 8,
          cursor: enabled ? "crosshair" : "not-allowed",
          boxShadow: "0 1px 8px rgba(0,0,0,0.06)"
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
            opacity={0.9}
          />
        )}
        {currStroke.length > 1 &&
          <path
            d={getSvgPath(currStroke)}
            fill="black"
            stroke="black"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.5}
          />
        }
      </svg>
      <button
        onClick={handleUndo}
        style={{
          marginTop: 4,
          background: "#fff",
          color: "#555",
          border: "2px solid #00b894",
          borderRadius: 12,
          fontWeight: 600,
          fontSize: 18,
          padding: "6px 22px",
          cursor: enabled ? "pointer" : "not-allowed",
          boxShadow: enabled ? "0 2px 8px #a0c4ff55" : undefined,
          transition: "background 0.2s, color 0.2s"
        }}>
        Undo
      </button>
    </div>
  );
}

export default function App() {
  const [username, setUsername] = useState(localStorage.getItem("username") || "");
  const [inputName, setInputName] = useState("");
  const [mmr, setMMR] = useState(Number(localStorage.getItem("mmr")) || 1000);

  // --- NEW: UserId persistent across sessions ---
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
        padding: 40, maxWidth: 400, margin: "80px auto", fontFamily: "Montserrat,sans-serif",
        textAlign: "center", borderRadius: 24, background: "linear-gradient(110deg,#f1f0ff 0,#c5dafe 100%)"
      }}>
        <h1 style={{ fontWeight: 900, fontSize: 40, color: "#4939c3" }}>Art Fighting</h1>
        <input
          placeholder="Enter your username..."
          value={inputName}
          onChange={e => setInputName(e.target.value)}
          style={{
            fontSize: 20, padding: 12, marginBottom: 18, width: "80%", borderRadius: 10,
            border: "2px solid #3a82ee", outline: "none"
          }}
        /><br />
        <button
          style={{
            fontSize: 20, padding: "10px 38px", borderRadius: 12,
            background: "linear-gradient(90deg,#4fd1c5 0,#7f78d2 100%)",
            color: "#fff", fontWeight: 700, border: "none", boxShadow: "0 2px 8px #a0c4ff55", cursor: "pointer"
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
    );
  }

  // Waiting/queue state
  if (phase === "queue") {
    return (
      <div style={{
        padding: 40, textAlign: "center", fontFamily: "Montserrat,sans-serif",
        minHeight: "100vh", background: "linear-gradient(120deg,#f7fdff 0,#a0c4ff 100%)"
      }}>
        <h1 style={{ fontWeight: 800, fontSize: 34, color: "#2666cf" }}>Waiting for opponent...</h1>
        <div style={{ fontSize: 18, color: "#555", marginBottom: 12 }}>
          Share this link with a friend to play together!
        </div>
        <div style={{
          marginTop: 24, fontSize: 21, fontWeight: 700, color: "#0c1856",
          background: "#e3e8ff", padding: "12px 34px", borderRadius: 16, display: "inline-block"
        }}>
          <b>You:</b> {username}
        </div>
        <div style={{
          marginTop: 16, color: "#999", fontSize: 20, background: "#fff6",
          padding: "8px 18px", borderRadius: 14, display: "inline-block"
        }}>
          Opponent: {players[1] || "Opponent"}
        </div>
      </div>
    );
  }

  // Main Game UI
  return (
    <div style={{
      fontFamily: "Montserrat,sans-serif", padding: 32, minHeight: "100vh",
      background: "linear-gradient(110deg,#f1f0ff 0,#a0c4ff 100%)"
    }}>
      <h1 style={{
        textAlign: "center", fontWeight: 900, fontSize: 44, letterSpacing: 1, color: "#4939c3",
        marginBottom: 20, textShadow: "0 2px 12px #adbbff77"
      }}>Art Fighting</h1>
      <div style={{
        textAlign: "center", marginBottom: 28, fontSize: 28, background: "#e5f1ff",
        borderRadius: 18, padding: "10px 0", fontWeight: 600, boxShadow: "0 1px 10px #a0c4ff55"
      }}>
        <span style={{ color: "#2666cf" }}>
          <b>Prompt:</b> {prompt}
        </span>
        <span style={{ marginLeft: 38, color: "#ff5252" }}>
          <b>Time left:</b> {phase === "draw" ? timer : 0}s
        </span>
      </div>
      <div style={{
        display: "flex", flexDirection: "row", gap: 38, justifyContent: "center",
        alignItems: "flex-start", width: "100%", maxWidth: 1800, margin: "0 auto"
      }}>
        {/* Player 1 */}
        <div>
          <div style={{
            textAlign: "center", marginBottom: 12,
            fontWeight: 800, color: "#24b47e", fontSize: 24
          }}>
            {username} <span style={{ color: "#222", fontSize: 18 }}>({mmr} MMR)</span>
          </div>
          <DrawingCanvas
            enabled={phase === "draw"}
            strokes={myStrokes}
            setStrokes={setMyStrokes}
            onSendStroke={sendStroke}
            onUndo={handleUndo}
          />
        </div>
        <div style={{
          width: 8, background: "linear-gradient(#a0c4ff, #b7f3d4)",
          height: CANVAS_H + 40, alignSelf: "center", borderRadius: 8, boxShadow: "0 2px 12px #8cbeff55"
        }} />
        {/* Player 2 */}
        <div>
          <div style={{
            textAlign: "center", marginBottom: 12,
            fontWeight: 800, color: "#7f7fc6", fontSize: 24
          }}>
            {players[1] || "Opponent"} <span style={{ color: "#555", fontSize: 18 }}>(??? MMR)</span>
          </div>
          <DrawingCanvas
            enabled={false}
            strokes={opponentStrokes}
            setStrokes={() => { }}
            onSendStroke={() => { }}
          />
        </div>
      </div>

      {/* Results */}
      {phase === "result" && (
        <div style={{
          textAlign: "center",
          marginTop: 50,
          background: "#f6fafd",
          border: "2.5px solid #a0c4ff",
          borderRadius: 18,
          maxWidth: 900,
          marginLeft: "auto",
          marginRight: "auto",
          padding: 32,
          boxShadow: "0 2px 18px #a0c4ff55"
        }}>
          <h2 style={{ fontWeight: 800, fontSize: 30, color: "#4939c3" }}>Results</h2>
          <div style={{ fontSize: 22, margin: 12 }}>
            <b>Prompt:</b> {prompt}
          </div>
          <div style={{ fontSize: 26, margin: 14 }}>
            <b>Winner:</b>{" "}
            <span style={{
              color: winner === username ? "#24b47e" : "#f23d3d",
              fontWeight: 900
            }}>{winner}</span>
          </div>
          <MMRDelta delta={mmrDelta} />
          <div style={{
            display: "flex", flexDirection: "row", justifyContent: "center",
            gap: 32, marginTop: 18
          }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, color: "#24b47e", fontSize: 20 }}>{username}</div>
              <DrawingCanvas enabled={false} strokes={myStrokes} setStrokes={() => { }} onSendStroke={() => { }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, color: "#7f7fc6", fontSize: 20 }}>{players[1] || "Opponent"}</div>
              <DrawingCanvas enabled={false} strokes={opponentStrokes} setStrokes={() => { }} onSendStroke={() => { }} />
            </div>
          </div>
          <button style={{
            marginTop: 32, fontSize: 20, padding: "14px 44px", borderRadius: 13,
            background: "linear-gradient(90deg,#7f78d2 0,#43e8d8 100%)",
            color: "#fff", fontWeight: 900, border: "none", boxShadow: "0 2px 8px #a0c4ff55", cursor: "pointer"
          }} onClick={resetRound}>
            Queue for Next Match
          </button>
        </div>
      )}
    </div>
  );
}

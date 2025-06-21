import React, { useRef, useState, useEffect } from "react";
import getStroke from "perfect-freehand";
import { io } from "socket.io-client";

const CANVAS_W = 540, CANVAS_H = 680, DRAW_TIME = 60, MMR_DELTA = 25;
const socket = io("https://arts-fighting-server.onrender.com");

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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg
        ref={svgRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          border: "1px solid #bbb",
          borderRadius: 10,
          background: "#fff",
          touchAction: "none",
          marginBottom: 8,
          cursor: enabled ? "crosshair" : "not-allowed"
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
      <button onClick={handleUndo} style={{ marginTop: 4 }}>Undo</button>
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

  // Join and queue after login
  useEffect(() => {
    if (!username) return;

    if (!socket.connected) socket.connect();

    // --- Send userId with join! ---
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
    });

    socket.on("round-ended", ({ winner }) => {
      setWinner(winner);
      setPhase("result");
      setRoundActive(false);
      setMMR((mmr) => {
        const newMMR = winner === username ? mmr + MMR_DELTA : mmr - MMR_DELTA;
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
    socket.emit("play-again");
  }

  // Auth flow
  if (!username) {
    return (
      <div style={{ padding: 40, maxWidth: 400, margin: "80px auto", fontFamily: "sans-serif", textAlign: "center" }}>
        <h1>Art Fighting</h1>
        <input
          placeholder="Enter your username..."
          value={inputName}
          onChange={e => setInputName(e.target.value)}
          style={{ fontSize: 20, padding: 8, marginBottom: 18, width: "80%" }}
        /><br />
        <button
          style={{ fontSize: 18, padding: "8px 30px" }}
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
      <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
        <h1>Waiting for opponent...</h1>
        <div>Share this link with a friend to play together!</div>
        <div style={{ marginTop: 24, fontSize: 18 }}>
          <b>You:</b> {username}
        </div>
        <div style={{ marginTop: 6, color: "#999" }}>
          Opponent: {players[1] || "Opponent"}
        </div>
      </div>
    );
  }

  // Main Game UI
  return (
    <div style={{ fontFamily: "sans-serif", padding: 32 }}>
      <h1 style={{ textAlign: "center" }}>Art Fighting (MVP)</h1>
      <div style={{ textAlign: "center", marginBottom: 18, fontSize: 22 }}>
        <span>
          <b>Prompt:</b> {prompt}
        </span>
        <span style={{ marginLeft: 32 }}>
          <b>Time left:</b> {phase === "draw" ? timer : 0}s
        </span>
      </div>
      <div style={{
        display: "flex", flexDirection: "row", gap: 32, justifyContent: "center",
        alignItems: "flex-start", width: "100%", maxWidth: 1200, margin: "0 auto"
      }}>
        {/* Player 1 */}
        <div style={{ flex: 1, minWidth: CANVAS_W }}>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <b>{username}</b> (<span style={{ color: "#222" }}>{mmr} MMR</span>)
          </div>
          <DrawingCanvas
            enabled={phase === "draw"}
            strokes={myStrokes}
            setStrokes={setMyStrokes}
            onSendStroke={sendStroke}
            onUndo={handleUndo}
          />
        </div>
        <div style={{ width: 2, background: "#bbb", height: CANVAS_H, alignSelf: "center" }} />
        {/* Player 2 */}
        <div style={{ flex: 1, minWidth: CANVAS_W }}>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <b>{players[1] || "Opponent"}</b> (<span style={{ color: "#555" }}>??? MMR</span>)
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
          marginTop: 40,
          background: "#fafbfc",
          border: "1px solid #ddd",
          borderRadius: 10,
          maxWidth: 800,
          marginLeft: "auto",
          marginRight: "auto",
          padding: 28
        }}>
          <h2>Results</h2>
          <div style={{ fontSize: 20, margin: 10 }}>
            <b>Prompt:</b> {prompt}
          </div>
          <div style={{ fontSize: 22, margin: 10 }}>
            <b>Winner:</b> <span style={{ color: "#059", fontWeight: 700 }}>{winner}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", gap: 32, marginTop: 18 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{username}</div>
              <DrawingCanvas enabled={false} strokes={myStrokes} setStrokes={() => { }} onSendStroke={() => { }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{players[1] || "Opponent"}</div>
              <DrawingCanvas enabled={false} strokes={opponentStrokes} setStrokes={() => { }} onSendStroke={() => { }} />
            </div>
          </div>
          <button style={{ marginTop: 22, fontSize: 18, padding: "10px 36px" }} onClick={resetRound}>
            Queue for Next Match
          </button>
        </div>
      )}
    </div>
  );
}

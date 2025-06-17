import React, { useRef, useState, useEffect } from "react";
import getStroke from "perfect-freehand";
import { io } from "socket.io-client"; // fixed import

// --- Constants ---
const CANVAS_W = 540, CANVAS_H = 680, DRAW_TIME = 60, MMR_DELTA = 25;
const PROMPTS = [
  "Draw a mountain", "Draw a cat", "Draw a castle", "Draw a robot", "Draw a fish"
];

// --- Single global socket ---
const socket = io("https://arts-fighting-server.onrender.com");



// --- Helper: SVG path from points ---
function getSvgPath(stroke) {
  if (!stroke.length) return "";
  const pts = getStroke(stroke, { size: 5, thinning: 0.7, smoothing: 0.75 });
  return pts.length
    ? "M " + pts.map(([x, y], i) => (i === 0 ? `${x} ${y}` : `L ${x} ${y}`)).join(" ")
    : "";
}

// --- Drawing Canvas ---
function DrawingCanvas({ enabled, strokes, setStrokes, onSendStroke }) {
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
    setStrokes((old) => old.slice(0, -1));
    // Optionally emit undo event
  }

  // Mouse & touch handlers
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

// --- Random Prompt ---
function getRandomPrompt() {
  return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
}

export default function App() {
  // --- Auth ---
  const [username, setUsername] = useState(localStorage.getItem("username") || "");
  const [inputName, setInputName] = useState("");
  const [mmr, setMMR] = useState(Number(localStorage.getItem("mmr")) || 1000);

  // --- Game State ---
  const [prompt, setPrompt] = useState(getRandomPrompt());
  const [timer, setTimer] = useState(DRAW_TIME);
  const [myStrokes, setMyStrokes] = useState([]);
  const [opponentStrokes, setOpponentStrokes] = useState([]);
  const [phase, setPhase] = useState("draw"); // "draw" | "result"
  const [winner, setWinner] = useState(null);
  const [opponentName, setOpponentName] = useState("Opponent");

  // --- Socket events (Connect only after login) ---
  useEffect(() => {
    if (!username) return;

    // Connect the socket if not already
    if (!socket.connected) socket.connect();

    socket.emit("join", { username });

    // Listen for opponent strokes
    socket.on("receive-stroke", (stroke) => {
      setOpponentStrokes((old) => [...old, stroke]);
    });
    socket.on("opponent-join", (data) => {
      setOpponentName(data.username || "Opponent");
    });
    socket.on("opponent-clear", () => setOpponentStrokes([]));
    socket.on("opponent-leave", () => {
      setOpponentName("Opponent");
      setOpponentStrokes([]);
    });

    // Clean up listeners on unmount
    return () => {
      socket.off("receive-stroke");
      socket.off("opponent-join");
      socket.off("opponent-clear");
      socket.off("opponent-leave");
    };
  }, [username]);

  // --- Send stroke to opponent ---
  function sendStroke(stroke) {
    socket.emit("send-stroke", stroke);
  }

  // --- Timer logic ---
  useEffect(() => {
    if (phase !== "draw") return;
    if (timer <= 0) {
      setPhase("result");
      handleRoundEnd();
      return;
    }
    const t = setTimeout(() => setTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [timer, phase]);

  // --- Determine winner (random for MVP) ---
  function handleRoundEnd() {
    // MVP: Random winner (replace with AI judge in future)
    const winnerIsMe = Math.random() > 0.5;
    setWinner(winnerIsMe ? username : opponentName);
    setMMR((mmr) => {
      const newMMR = winnerIsMe ? mmr + MMR_DELTA : mmr - MMR_DELTA;
      localStorage.setItem("mmr", newMMR);
      return newMMR;
    });
  }

  // --- Play again ---
  function resetRound() {
    setPrompt(getRandomPrompt());
    setTimer(DRAW_TIME);
    setMyStrokes([]);
    setOpponentStrokes([]);
    setWinner(null);
    setPhase("draw");
    socket.emit("clear");
  }

  // --- Auth flow ---
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

  // --- Main Game UI ---
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
          />
        </div>
        <div style={{ width: 2, background: "#bbb", height: CANVAS_H, alignSelf: "center" }} />
        {/* Player 2 */}
        <div style={{ flex: 1, minWidth: CANVAS_W }}>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <b>{opponentName}</b> (<span style={{ color: "#555" }}>??? MMR</span>)
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
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{opponentName}</div>
              <DrawingCanvas enabled={false} strokes={opponentStrokes} setStrokes={() => { }} onSendStroke={() => { }} />
            </div>
          </div>
          <button style={{ marginTop: 22, fontSize: 18, padding: "10px 36px" }} onClick={resetRound}>Play Again</button>
        </div>
      )}
    </div>
  );
}

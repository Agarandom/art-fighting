import React, { useRef, useState, useEffect } from "react";
import getStroke from "perfect-freehand";
import { io } from "socket.io-client";

// Responsive canvas (fills half screen, no scroll)
const CANVAS_RATIO = 0.88; // 88% of half the screen width
const MMR_DELTA = 25, DRAW_TIME = 60;
const socket = io("https://arts-fighting-server.onrender.com");

// Font
const FONT_URL = "https://fonts.googleapis.com/css2?family=Poppins:wght@700;600;400&display=swap";
const injectFont = () => {
  if (!document.getElementById("gameFont")) {
    const link = document.createElement("link");
    link.id = "gameFont";
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
      fontSize: 38,
      fontWeight: 900,
      color: delta > 0 ? "#24e88b" : "#f23d3d",
      margin: "16px 0",
      transition: "opacity 0.5s",
      letterSpacing: 2,
      animation: "mmrPop 1s"
    }}>
      {delta > 0 ? `+${delta}` : `${delta}`}
      <style>{`
        @keyframes mmrPop {
          0% { transform: scale(0.7); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
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
      width: width + 8, height: height + 64,
      background: enabled ? "#171c27" : "#222635",
      borderRadius: 22,
      boxShadow: enabled ? "0 4px 32px #00ffb988, 0 2px 10px #002b5055" : "0 2px 10px #101e3388",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
      padding: 12, position: "relative",
      border: enabled ? "4px solid #24e88b" : "2.5px solid #373b52",
      margin: "0 auto",
      transition: "border 0.2s"
    }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{
          border: "none",
          borderRadius: 14,
          background: "#fff",
          touchAction: "none",
          marginBottom: 10,
          cursor: enabled ? "crosshair" : "not-allowed",
          boxShadow: "0 1px 8px #191e2a55"
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
          background: enabled ? "linear-gradient(90deg,#43e8d8,#24e88b)" : "#aaa",
          color: "#0d232e",
          border: "none",
          borderRadius: 10,
          fontWeight: 800,
          fontSize: 18,
          padding: "8px 34px",
          marginTop: 4,
          cursor: enabled ? "pointer" : "not-allowed",
          boxShadow: enabled ? "0 2px 8px #24e88b44" : "none",
          letterSpacing: 1.2
        }}>
        Undo
      </button>
    </div>
  );
}

export default function App() {
  injectFont();
  const [w, h] = useWindowSize();
  // Calculate canvas size dynamically
  const SIDE_W = Math.floor((w * 0.5) * CANVAS_RATIO);
  const SIDE_H = Math.min(h * 0.84, SIDE_W * 1.15); // Not too tall

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
        minHeight: "100vh",
        background: "#171c27",
        display: "flex",
        alignItems: "center", justifyContent: "center"
      }}>
        <div style={{
          padding: 40, maxWidth: 430, minWidth: 340,
          borderRadius: 24, background: "#232848",
          boxShadow: "0 2px 22px #23e89b22, 0 1px 8px #171c2755"
        }}>
          <h1 style={{
            fontWeight: 900, fontSize: 42, color: "#24e88b",
            letterSpacing: 1, marginBottom: 18, fontFamily: "Poppins,sans-serif"
          }}>Art Fighting</h1>
          <input
            placeholder="Enter your username..."
            value={inputName}
            onChange={e => setInputName(e.target.value)}
            style={{
              fontSize: 22, padding: 14, marginBottom: 22, width: "100%", borderRadius: 10,
              border: "2px solid #24e88b", outline: "none", fontFamily: "Poppins,sans-serif"
            }}
          /><br />
          <button
            style={{
              fontSize: 22, padding: "12px 38px", borderRadius: 12,
              background: "linear-gradient(90deg,#43e8d8,#24e88b 100%)",
              color: "#171c27", fontWeight: 800, border: "none", boxShadow: "0 2px 8px #24e88b55", cursor: "pointer",
              letterSpacing: 1.2
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
        minHeight: "100vh", background: "#171c27",
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        <div style={{
          borderRadius: 20,
          background: "#232848",
          boxShadow: "0 2px 18px #00ffd044, 0 1px 8px #171c2765",
          padding: "42px 60px", minWidth: 440
        }}>
          <h1 style={{
            fontWeight: 900, fontSize: 36, color: "#24e88b", letterSpacing: 1, marginBottom: 12
          }}>Waiting for opponent...</h1>
          <div style={{
            fontSize: 18, color: "#eee", marginBottom: 20, fontWeight: 400,
            letterSpacing: 0.3, fontFamily: "Poppins,sans-serif"
          }}>
            Share this link with a friend to play together!
          </div>
          <div style={{
            display: "flex", gap: 20, marginTop: 18
          }}>
            <div style={{
              fontSize: 20, fontWeight: 700, color: "#24e88b",
              background: "#151a33", padding: "11px 36px", borderRadius: 14, fontFamily: "Poppins,sans-serif"
            }}>
              <b>You:</b> {username}
            </div>
            <div style={{
              fontSize: 19, color: "#b3b6cd", fontWeight: 500, fontFamily: "Poppins,sans-serif",
              background: "#232848", padding: "11px 22px", borderRadius: 14,
              border: "1.8px dashed #24e88b55"
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
      minHeight: "100vh", width: "100vw", overflow: "hidden", background: "#171c27",
      fontFamily: "Poppins,sans-serif", padding: 0, margin: 0, boxSizing: "border-box"
    }}>
      <div style={{
        width: "100%", padding: "18px 0 16px 0", marginBottom: 0, textAlign: "center",
        fontWeight: 900, fontSize: 40, color: "#24e88b", letterSpacing: 1.5,
        textShadow: "0 2px 12px #24e88b44, 0 2px 20px #191e2a66"
      }}>
        Art Fighting
      </div>
      <div style={{
        textAlign: "center", marginBottom: 18, fontSize: 28, color: "#b3b6cd",
        fontWeight: 600, letterSpacing: 1, padding: "8px 0"
      }}>
        <span>
          <b>Prompt:</b> {prompt}
        </span>
        <span style={{ marginLeft: 38, color: "#24e88b" }}>
          <b>Time left:</b> {phase === "draw" ? timer : 0}s
        </span>
      </div>
      <div style={{
        display: "flex", flexDirection: "row", justifyContent: "center",
        alignItems: "flex-start", width: "100vw", gap: 24, margin: 0
      }}>
        {/* Player 1 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            textAlign: "center", marginBottom: 12, fontWeight: 800, color: "#24e88b", fontSize: 24, letterSpacing: 1.1
          }}>
            {username} <span style={{ color: "#eee", fontSize: 18 }}>({mmr} MMR)</span>
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
          width: 12, background: "linear-gradient(#24e88b88, #232848 50%, #43e8d844)",
          height: SIDE_H + 80, alignSelf: "center", borderRadius: 8, margin: "0 12px"
        }} />
        {/* Player 2 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            textAlign: "center", marginBottom: 12, fontWeight: 800, color: "#9ea9fd", fontSize: 24, letterSpacing: 1.1
          }}>
            {players[1] || "Opponent"} <span style={{ color: "#b3b6cd", fontSize: 18 }}>(??? MMR)</span>
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
          marginTop: 42,
          background: "#232848",
          border: "2.5px solid #24e88b",
          borderRadius: 16,
          maxWidth: 1000,
          marginLeft: "auto",
          marginRight: "auto",
          padding: 38,
          boxShadow: "0 2px 18px #24e88b33"
        }}>
          <h2 style={{ fontWeight: 900, fontSize: 30, color: "#24e88b" }}>Results</h2>
          <div style={{ fontSize: 22, margin: 12, color: "#b3b6cd" }}>
            <b>Prompt:</b> {prompt}
          </div>
          <div style={{ fontSize: 26, margin: 14 }}>
            <b>Winner:</b>{" "}
            <span style={{
              color: winner === username ? "#24e88b" : "#f23d3d",
              fontWeight: 900
            }}>{winner}</span>
          </div>
          <MMRDelta delta={mmrDelta} />
          <div style={{
            display: "flex", flexDirection: "row", justifyContent: "center",
            gap: 36, marginTop: 18
          }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, color: "#24e88b", fontSize: 20 }}>{username}</div>
              <DrawingCanvas enabled={false} strokes={myStrokes} setStrokes={() => { }} onSendStroke={() => { }} width={SIDE_W / 1.4} height={SIDE_H / 1.4} />
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, color: "#9ea9fd", fontSize: 20 }}>{players[1] || "Opponent"}</div>
              <DrawingCanvas enabled={false} strokes={opponentStrokes} setStrokes={() => { }} onSendStroke={() => { }} width={SIDE_W / 1.4} height={SIDE_H / 1.4} />
            </div>
          </div>
          <button style={{
            marginTop: 32, fontSize: 21, padding: "15px 46px", borderRadius: 12,
            background: "linear-gradient(90deg,#43e8d8,#24e88b 100%)",
            color: "#171c27", fontWeight: 900, border: "none", boxShadow: "0 2px 8px #24e88b55", cursor: "pointer",
            letterSpacing: 1.2
          }} onClick={resetRound}>
            Queue for Next Match
          </button>
        </div>
      )}
    </div>
  );
}

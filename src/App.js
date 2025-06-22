import React, { useRef, useState, useEffect } from "react";
import getStroke from "perfect-freehand";
import { io } from "socket.io-client";

// === Black & White minimalist palette ===
const BG = "#f8f9fa";
const CANVAS_BG = "#fff";
const CANVAS_BORDER = "#dedede";
const BTN = "#efefef";
const BTN_TEXT = "#232323";
const TEXT1 = "#232323";
const TEXT2 = "#868686";
const WIN = "#2cbf5c";
const LOSE = "#e14d4d";

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
      fontSize: 26,
      fontWeight: 500,
      color: delta > 0 ? WIN : LOSE,
      margin: "10px 0 0 0",
      letterSpacing: 1.1,
      background: "#fff",
      borderRadius: 9,
      padding: "4px 18px",
      border: `1.2px solid ${delta > 0 ? WIN : LOSE}`,
      display: "inline-block",
      transition: "opacity 0.5s",
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
      width: width + 4, height: height + 42,
      background: CANVAS_BG,
      borderRadius: 13,
      border: `1px solid ${CANVAS_BORDER}`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
      padding: 7, position: "relative",
      margin: "0 auto",
    }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{
          border: "none",
          borderRadius: 8,
          background: "#fff",
          touchAction: "none",
          marginBottom: 7,
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
            opacity={0.32}
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
          borderRadius: 7,
          fontWeight: 500,
          fontSize: 15,
          padding: "5px 17px",
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

  // Make the canvas bigger and wider (max width), not too tall
  const CANVAS_RATIO = 0.48; // up to 48% of window width per player
  const SIDE_W = Math.max(420, Math.min(560, Math.floor(w * CANVAS_RATIO)));
  const SIDE_H = Math.max(260, Math.min(360, Math.floor(h * 0.53)));

  // For result canvas (centered, both drawings, no scroll)
  const RESULT_W = Math.min(420, Math.floor(w * 0.32));
  const RESULT_H = Math.min(300, Math.floor(h * 0.41));

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
          boxShadow: "0 1px 8px #dde1ee10"
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
              border: `1px solid #c4c4c4`, outline: "none", fontFamily: "Inter,sans-serif"
            }}
          /><br />
          <button
            style={{
              fontSize: 17, padding: "8px 22px", borderRadius: 8,
              background: BTN, color: BTN_TEXT, fontWeight: 500, border: `1px solid #d3d3d3`, cursor: "pointer"
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
              fontSize: 15, color: "#bababa", fontWeight: 500, fontFamily: "Inter,sans-serif",
              background: "#fff", padding: "7px 10px", borderRadius: 9,
              border: `1px dashed #d6d6d6`
            }}>
              Opponent: {players[1] || "Opponent"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- GAME UI ---
  if (phase === "draw") {
    return (
      <div style={{
        minHeight: "100vh", width: "100vw", overflow: "hidden", background: BG,
        fontFamily: "Inter,sans-serif", padding: 0, margin: 0, boxSizing: "border-box"
      }}>
        <div style={{
          width: "100%", padding: "12px 0 6px 0", marginBottom: 0, textAlign: "center",
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
          <span style={{ marginLeft: 16, color: "#bebebe" }}>
            <b>Time left:</b> {phase === "draw" ? timer : 0}s
          </span>
        </div>
        <div style={{
          display: "flex", flexDirection: "row", justifyContent: "center",
          alignItems: "flex-start", width: "100vw", gap: 18, margin: 0
        }}>
          {/* Player 1 */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              textAlign: "center", marginBottom: 7, fontWeight: 500, color: TEXT1, fontSize: 16
            }}>
              {username} <span style={{ color: "#adadad", fontSize: 14 }}>({mmr} MMR)</span>
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
            width: 4, background: "#e0e0e0",
            height: SIDE_H + 28, alignSelf: "center", borderRadius: 3, margin: "0 4px"
          }} />
          {/* Player 2 */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              textAlign: "center", marginBottom: 7, fontWeight: 500, color: "#bababa", fontSize: 16
            }}>
              {players[1] || "Opponent"} <span style={{ color: "#bebebe", fontSize: 14 }}>(??? MMR)</span>
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
      </div>
    );
  }

  // --- RESULTS: Only the results box is visible, centered, no other UI ---
  if (phase === "result") {
    return (
      <div style={{
        minHeight: "100vh",
        background: BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter,sans-serif"
      }}>
        <div style={{
          background: "#fff",
          border: `1.2px solid #e6e6e6`,
          borderRadius: 13,
          boxShadow: "0 2px 8px #c9c9c922",
          maxWidth: 950,
          padding: "32px 32px 28px 32px",
          margin: "auto",
          textAlign: "center"
        }}>
          <h2 style={{ fontWeight: 500, fontSize: 22, color: TEXT1, marginBottom: 6 }}>Results</h2>
          <div style={{ fontSize: 15, margin: 7, color: TEXT2 }}>
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
            gap: 22, marginTop: 16
          }}>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 6, color: TEXT1, fontSize: 15 }}>{username}</div>
              <DrawingCanvas enabled={false} strokes={myStrokes} setStrokes={() => { }} onSendStroke={() => { }} width={RESULT_W} height={RESULT_H} />
            </div>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 6, color: "#bababa", fontSize: 15 }}>{players[1] || "Opponent"}</div>
              <DrawingCanvas enabled={false} strokes={opponentStrokes} setStrokes={() => { }} onSendStroke={() => { }} width={RESULT_W} height={RESULT_H} />
            </div>
          </div>
          <button style={{
            marginTop: 25, fontSize: 15, padding: "10px 34px", borderRadius: 9,
            background: BTN, color: BTN_TEXT, fontWeight: 500, border: `1px solid #dfdfdf`, cursor: "pointer"
          }} onClick={resetRound}>
            Queue for Next Match
          </button>
        </div>
      </div>
    );
  }
}

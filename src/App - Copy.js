import React, { useEffect, useRef, useState } from "react";
import { ReactSketchCanvas } from "react-sketch-canvas";

const prompts = [
  "apple",
  "dragon",
  "mountain",
  "robot",
  "carrot",
  "sword",
  "castle",
];

export default function App() {
  const canvasRef = useRef(null);
  const [phase, setPhase] = useState("draw1");      // draw1 → draw2 → results
  const [prompt, setPrompt] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [submitted, setSubmitted] = useState(false);
  const [draw1URL, setDraw1URL] = useState("");
  const [draw2URL, setDraw2URL] = useState("");
  const [winner, setWinner] = useState("");

  // 1) When phase changes:
  //    - On draw1: pick a fresh prompt
  //    - On draw1 or draw2: reset time & submitted
  useEffect(() => {
    if (phase === "draw1") {
      setPrompt(prompts[Math.floor(Math.random() * prompts.length)]);
    }
    if (phase === "draw1" || phase === "draw2") {
      setTimeLeft(60);
      setSubmitted(false);
    }
  }, [phase]);

  // 2) Countdown timer
  useEffect(() => {
    if (phase === "results" || submitted) return;
    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }
    const tid = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(tid);
  }, [timeLeft, submitted, phase]);

  // 3) Submit handler
  const handleSubmit = async () => {
    if (!canvasRef.current || submitted) return;
    setSubmitted(true);

    // export drawing
    const dataURL = await canvasRef.current.exportImage("png");

    if (phase === "draw1") {
      setDraw1URL(dataURL);
      setPhase("draw2");
    } else if (phase === "draw2") {
      setDraw2URL(dataURL);
      setWinner(Math.random() < 0.5 ? "Player 1" : "Player 2");
      setPhase("results");
    }
  };

  // 4) Reset for a new duel
  const resetGame = () => {
    setPhase("draw1");
    setDraw1URL("");
    setDraw2URL("");
    setWinner("");
  };

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Art Fighting (react-sketch-canvas)</h1>

      {/* DRAWING PHASES */}
      {phase !== "results" && (
        <>
          <h2>Prompt: {prompt}</h2>
          <h3>
            {phase === "draw1" ? "Player 1" : "Player 2"} — Time Left:{" "}
            {timeLeft}s
          </h3>

          {/* Key on phase to remount canvas fresh */}
          <ReactSketchCanvas
            key={phase}
            ref={canvasRef}
            width="600px"
            height="400px"
            strokeWidth={4}
            strokeColor="#000000"
            eraserWidth={20}
            canvasColor="#ffffff"
            style={{ border: "1px solid #444", borderRadius: 4 }}
          />

          {!submitted && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => canvasRef.current.undo()}>
                Undo
              </button>
              <button
                onClick={() => canvasRef.current.eraseMode(true)}
                style={{ marginLeft: 8 }}
              >
                Eraser
              </button>
              <button
                onClick={() => canvasRef.current.eraseMode(false)}
                style={{ marginLeft: 8 }}
              >
                Brush
              </button>
              <button
                onClick={handleSubmit}
                style={{ marginLeft: 16 }}
              >
                Submit
              </button>
            </div>
          )}
        </>
      )}

      {/* RESULTS PHASE */}
      {phase === "results" && (
        <div>
          <h2>Results</h2>

          {/* show the prompt too */}
          <h3>Prompt Was: {prompt}</h3>

          <h3>Winner: {winner}</h3>
          <div
            style={{
              display: "flex",
              gap: 20,
              marginTop: 16,
            }}
          >
            <div>
              <h4>Player 1</h4>
              <img src={draw1URL} alt="Player 1 drawing" width={300} />
            </div>
            <div>
              <h4>Player 2</h4>
              <img src={draw2URL} alt="Player 2 drawing" width={300} />
            </div>
          </div>
          <button
            onClick={resetGame}
            style={{ marginTop: 16, padding: "8px 16px" }}
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}

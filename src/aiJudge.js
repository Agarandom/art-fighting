// src/aiJudge.js
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.REACT_APP_OPENAI_API_KEY,
  // ⚠️ ONLY FOR LOCAL MVP TESTING! Exposes your key in the browser.
  dangerouslyAllowBrowser: true,
});

export async function judgeWithEmbeddings(prompt, img1DataURL, img2DataURL) {
  // …same code as before…

  // 1) Get embedding of the prompt text
  const textRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: prompt,
  });
  const textEmb = textRes.data[0].embedding;

  // 2) Get embeddings for each image
  const img1Res = await openai.embeddings.create({
    model: "image-embedding-3-small",
    input: img1DataURL,
  });
  const img2Res = await openai.embeddings.create({
    model: "image-embedding-3-small",
    input: img2DataURL,
  });
  const img1Emb = img1Res.data[0].embedding;
  const img2Emb = img2Res.data[0].embedding;

  // 3) Cosine similarity helper
  function cosine(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  const sim1 = cosine(textEmb, img1Emb);
  const sim2 = cosine(textEmb, img2Emb);

  return sim1 >= sim2 ? "Player 1" : "Player 2";
}

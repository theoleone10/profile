// Voices the edition with Paperboy's own pipeline: generateSectionedAudio from
// paperboyapp, the same call the daily digest worker makes. Writes
// audio/edition.mp3 and audio/chapters.json (exact start time of each section).
//
// Run from paperboyapp/backend so its .env (INWORLD_API_KEY) is loaded:
//   cd ../paperboyapp/backend && npx tsx ../../profile/tools/make-edition.mts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const profile = resolve(here, "..");
const backend = resolve(profile, "../paperboyapp/backend");

// env.ts requires every backend secret at import time; TTS only needs Inworld.
// Load .env first so real values win, then fill the rest with placeholders.
createRequire(resolve(backend, "package.json"))("dotenv").config({ path: resolve(backend, ".env") });
if (!process.env.INWORLD_API_KEY) {
  console.error("INWORLD_API_KEY is not set. Add it to paperboyapp/backend/.env.");
  process.exit(1);
}
for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY", "OPENAI_API_KEY"]) {
  process.env[key] ||= "unused-by-tts";
}

const { generateSectionedAudio } = await import(pathToFileURL(resolve(backend, "src/services/tts/generateAudio.ts")).href);
const { getAudioDurationExact } = await import(pathToFileURL(resolve(backend, "src/utils/audio.ts")).href);

const edition = JSON.parse(await readFile(resolve(here, "edition.json"), "utf8")) as {
  voice: string;
  sections: { id: string; title: string; text: string }[];
};

const { audio, durationSeconds, startSeconds } = await generateSectionedAudio(
  edition.sections.map((s) => s.text),
  edition.voice,
  getAudioDurationExact
);

await mkdir(resolve(profile, "audio"), { recursive: true });
await writeFile(resolve(profile, "audio/edition.mp3"), audio);
const chapters = edition.sections.map((s, i) => ({ id: s.id, title: s.title, start: startSeconds[i] ?? 0, text: s.text }));
await writeFile(resolve(profile, "audio/chapters.json"), JSON.stringify({ voice: edition.voice, durationSeconds, chapters }, null, 2) + "\n");
console.log(`Wrote audio/edition.mp3 (${durationSeconds}s, ${(audio.length / 1024).toFixed(0)} KB)`);
for (const c of chapters) console.log(`  ${c.start.toFixed(1).padStart(5)}s  ${c.title}`);

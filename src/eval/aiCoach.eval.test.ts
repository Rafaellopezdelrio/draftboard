// @vitest-environment node
// AI coach measurement on real games. Off by default; run with:
//   AI_EVAL=<dir with ids.json> npx vitest run src/eval/aiCoach.eval.test.ts
// ids.json = { ids: string[], puuid: string, region: string }. Writes
// results.json next to it: per game, the exact prompt, the coach's rule
// insights and two AI answers (to check numbers and consistency).
import { describe, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getMatchFull, getMatchTimeline, getLeagueEntriesByPuuid, setRiotProxyUrl, type RiotConfig } from "../services/riotApi";
import { WORKER_BASE_URL } from "../config";
import { analyzeMatch } from "../engine/coachEngine";
import { buildProAnalytics } from "../engine/matchAnalytics";
import { professionalCoachSystemPrompt, professionalMatchPrompt } from "../services/aiPromptBuilder";
import { buildMatchBenchmarkLine } from "../services/aiCoach";
import { callAi } from "../services/aiProvider";

const DIR = process.env.AI_EVAL;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!DIR)("AI coach eval (real games)", () => {
  it(
    "collects prompts and two answers per game",
    async () => {
      const { ids, puuid, region } = JSON.parse(fs.readFileSync(path.join(DIR!, "ids.json"), "utf8"));
      setRiotProxyUrl(WORKER_BASE_URL);
      const cfg = { apiKey: "", region, riotIdName: "", riotIdTag: "" } as RiotConfig;
      const champs = (await (await fetch("https://ddragon.leagueoflegends.com/cdn/16.22.1/data/es_ES/champion.json")).json()) as {
        data: Record<string, { key: string; name: string }>;
      };
      const names = new Map(Object.values(champs.data).map((c) => [Number(c.key), c.name]));
      const solo = (await getLeagueEntriesByPuuid(cfg, puuid)).find((e) => e.queueType === "RANKED_SOLO_5x5");
      const rank = solo ? { tier: solo.tier, division: solo.rank, lp: solo.leaguePoints } : null;

      const out: unknown[] = [];
      for (const id of ids as string[]) {
        try {
          const [match, timeline] = await Promise.all([getMatchFull(cfg, id), getMatchTimeline(cfg, id)]);
          const insights = analyzeMatch({ match, timeline, myPuuid: puuid });
          const analytics = buildProAnalytics(match, timeline, puuid, names);
          if (!analytics) continue;
          const system = professionalCoachSystemPrompt({ language: "es", rank, position: analytics.position });
          const bench = buildMatchBenchmarkLine(match, puuid, rank?.tier ?? null);
          const user = professionalMatchPrompt(analytics, insights, "es", rank) + (bench ? `\n\n${bench}` : "");
          const answers: string[] = [];
          for (let k = 0; k < 2; k++) {
            // Groq's free tier: 8000 tokens a minute per model, and one
            // analysis is ~3000. Pace, and wait out a 429.
            for (let attempt = 0; ; attempt++) {
              try {
                answers.push(await callAi({ provider: "groq", apiKey: "", systemPrompt: system, userPrompt: user, maxTokens: 700, temperature: 0.3 }));
                break;
              } catch (e) {
                if (attempt >= 3) throw e;
                await sleep(65_000);
              }
            }
            await sleep(25_000);
          }
          const me = match.participants.find((p) => p.puuid === puuid)!;
          out.push({
            id,
            champion: names.get(me.championId),
            position: me.position,
            win: me.win,
            kda: `${me.kills}/${me.deaths}/${me.assists}`,
            minutes: Math.round(match.durationSec / 60),
            insights: insights.map((i) => ({ category: i.category, severity: i.severity, title: i.title, metric: i.metric })),
            system,
            user,
            answers,
          });
          // eslint-disable-next-line no-console
          console.log(`[eval] ${out.length}/${ids.length} ${id}`);
        } catch (e) {
          out.push({ id, error: String(e).slice(0, 200) });
        }
      }
      fs.writeFileSync(path.join(DIR!, "results.json"), JSON.stringify({ rank, games: out }, null, 1));
    },
    60 * 60 * 1000
  );
});

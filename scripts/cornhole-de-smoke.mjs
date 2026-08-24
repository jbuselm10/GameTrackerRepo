/**
 * Double-elimination smoke: n=2..20, WR-title path and LB-title path.
 * Usage: node scripts/cornhole-de-smoke.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEngine() {
  const sandbox = { console, window: {} };
  sandbox.window.GameTracker = {};
  sandbox.GameTracker = sandbox.window.GameTracker;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  for (const rel of ["js/cornhole-types.js", "js/cornhole-bracket.js"]) {
    const code = fs.readFileSync(path.join(root, rel), "utf8");
    vm.runInContext(code, context, { filename: rel });
  }
  return context.window.GameTracker.Cornhole;
}

const Cornhole = loadEngine();
const TYPES = Cornhole.TOURNAMENT_TYPES;
const SIDES = Cornhole.BRACKET_SIDES;
const STATUSES = Cornhole.MATCH_STATUSES;

function makeTeams(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `cteam_${n}_${i + 1}`,
    name: `Team ${i + 1}`,
    player1Id: `p_${n}_${i + 1}_a`,
    player2Id: `p_${n}_${i + 1}_b`,
  }));
}

function countMatches(matches) {
  const list = matches || [];
  const wr = list.filter((m) => m.bracket === SIDES.WINNERS).length;
  const lb = list.filter((m) => m.bracket === SIDES.LOSERS).length;
  const gf = list.filter(
    (m) =>
      m.bracket === SIDES.GRAND_FINAL || m.bracket === SIDES.GRAND_FINAL_RESET
  ).length;
  return { wr, lb, gf, total: list.length };
}

// A winners round made up only of byes/skips means a winner was never moved
// on to play the next round.
function deadWinnersRounds(matches) {
  const wr = (matches || []).filter((m) => m.bracket === SIDES.WINNERS);
  const rounds = [...new Set(wr.map((m) => m.round))].sort((a, b) => a - b);
  return rounds.filter((r) => !wr.some((m) => m.round === r && !m.losersBye));
}

function readyMatches(matches) {
  return (matches || [])
    .filter(
      (m) =>
        m.active !== false &&
        m.status !== STATUSES.COMPLETED &&
        m.team1Id &&
        m.team2Id &&
        !m.losersBye
    )
    .sort((a, b) => {
      const order = {
        WINNERS: 1,
        LOSERS: 2,
        GRAND_FINAL: 3,
        GRAND_FINAL_RESET: 4,
        THIRD_PLACE: 5,
      };
      return (
        (order[a.bracket] || 9) - (order[b.bracket] || 9) ||
        a.round - b.round ||
        a.matchNumber - b.matchNumber
      );
    });
}

function pickWinner(match, path) {
  if (match.bracket === SIDES.GRAND_FINAL || match.bracket === SIDES.GRAND_FINAL_RESET) {
    if (path === "wr") return match.team1Id;
    return match.team2Id;
  }
  return match.team1Id;
}

function playTournament(n, path) {
  const teams = makeTeams(n);
  let matches = Cornhole.generateBracket(TYPES.DOUBLE_ELIMINATION, teams);
  const counts = countMatches(matches);
  const dead = deadWinnersRounds(matches);
  if (dead.length) {
    throw new Error(`winners round(s) ${dead.join(", ")} have no match`);
  }
  let guard = 0;
  while (!Cornhole.championId(matches)) {
    guard += 1;
    if (guard > 5000) throw new Error(`stuck after ${guard} steps`);
    const ready = readyMatches(matches);
    if (ready.length === 0) {
      throw new Error("no ready matches and no champion");
    }
    const match = ready[0];
    const winnerId = pickWinner(match, path);
    if (!winnerId) throw new Error(`no winner for ${match.id}`);
    matches = Cornhole.applyResult(matches, match.id, winnerId);
  }
  const champion = Cornhole.championId(matches);
  const gf = matches.find((m) => m.bracket === SIDES.GRAND_FINAL);
  if (!gf) throw new Error("missing grand final");
  if (path === "wr") {
    if (champion !== gf.team1Id) {
      throw new Error(`WR path expected ${gf.team1Id}, got ${champion}`);
    }
  } else {
    if (champion !== gf.team2Id) {
      throw new Error(`LB path expected ${gf.team2Id}, got ${champion}`);
    }
    const reset = matches.find((m) => m.bracket === SIDES.GRAND_FINAL_RESET);
    if (!reset || !reset.active || reset.status !== STATUSES.COMPLETED) {
      throw new Error("LB path did not complete Game 2");
    }
  }
  return { counts, champion };
}

function main() {
  const rows = [];
  let failed = 0;
  for (let n = 2; n <= 20; n += 1) {
    const row = {
      teams: n,
      wr: "",
      lb: "",
      gf: "",
      total: "",
      wrPath: "",
      lbPath: "",
      error: "",
    };
    try {
      const a = playTournament(n, "wr");
      row.wr = a.counts.wr;
      row.lb = a.counts.lb;
      row.gf = a.counts.gf;
      row.total = a.counts.total;
      row.wrPath = "PASS";
    } catch (err) {
      failed += 1;
      row.wrPath = "FAIL";
      row.error = String(err.message || err);
      try {
        const matches = Cornhole.generateBracket(
          TYPES.DOUBLE_ELIMINATION,
          makeTeams(n)
        );
        const c = countMatches(matches);
        row.wr = c.wr;
        row.lb = c.lb;
        row.gf = c.gf;
        row.total = c.total;
      } catch (_) {
        /* ignore */
      }
    }
    try {
      playTournament(n, "lb");
      row.lbPath = "PASS";
    } catch (err) {
      failed += 1;
      row.lbPath = "FAIL";
      row.error = row.error
        ? `${row.error} | LB: ${err.message || err}`
        : String(err.message || err);
    }
    rows.push(row);
  }

  console.log(
    "| Teams | WR matches | LB matches | GF(+reset) | Total matches | WR title | LB title |"
  );
  console.log(
    "|------:|-----------:|-----------:|-----------:|--------------:|---------:|---------:|"
  );
  for (const r of rows) {
    console.log(
      `| ${r.teams} | ${r.wr} | ${r.lb} | ${r.gf} | ${r.total} | ${r.wrPath} | ${r.lbPath} |`
    );
  }
  const bad = rows.filter((r) => r.error);
  if (bad.length) {
    console.log("\nFailures:");
    bad.forEach((r) => console.log(`- n=${r.teams}: ${r.error}`));
  }
  console.log(`\n${failed === 0 ? "ALL PASSED" : `${failed} path(s) FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();

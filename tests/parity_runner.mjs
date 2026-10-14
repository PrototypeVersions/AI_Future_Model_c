// Reads cases from argv[2] (JSON), runs the JS model, writes results to argv[3].
import { readFileSync, writeFileSync } from "node:fs";
import { simulate, resolve } from "../docs/js/model.js";

const cases = JSON.parse(readFileSync(process.argv[2], "utf8"));
const results = cases.map(({ raw, structure }) => {
  const out = simulate(resolve(raw, structure), 10);
  return { final: out.final, D: out.D, M: out.M, G: out.G, C: out.C, U: out.U };
});
writeFileSync(process.argv[3], JSON.stringify(results));

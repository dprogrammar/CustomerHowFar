import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const CASES: [string, string[], string[]][] = [
  // [input, must NOT contain, known names]
  [
    "My name is Ada Obi, call me on 0803 123 4567 or ada.obi@example.org",
    ["Ada", "Obi", "0803", "4567", "example.org"],
    [],
  ],
  ["I'm Tunde Bakare and my number is +2348031234567", ["Tunde", "Bakare", "2348031234567"], []],
  ["my name is chinedu please help", ["chinedu"], []],
  ["Mr Okafor said my account 0123456789 was debited", ["Okafor", "0123456789"], []],
  ["Chioma here, why can't Chioma Eze log in", ["Chioma", "Eze"], ["Chioma", "Eze"]],
  ["see https://evil.example/x?id=1 and @tunde_b on instagram", ["evil", "tunde_b"], []],
  ["do you have offices in abuja", [], []],
];
async function main() {
  const { scrubPersonalData, hasContent } = await import(
    require("node:url").pathToFileURL(process.cwd() + "/src/lib/assistant/scrub.ts").href
  );
  let ok = 0;
  for (const [input, banned, names] of CASES) {
    const out = scrubPersonalData(input, names);
    const leaked = banned.filter((b) => out.toLowerCase().includes(b.toLowerCase()));
    const pass = leaked.length === 0;
    if (pass) ok++;
    console.log(
      pass ? "ok  " : "LEAK",
      JSON.stringify(out),
      hasContent(out),
      leaked.length ? `(leaked ${leaked.length})` : "",
    );
  }
  console.log(`${ok}/${CASES.length}`);
}
main();

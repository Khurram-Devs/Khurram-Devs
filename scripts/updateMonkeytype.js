import fs from "fs";

const apiKey = process.env.MONKEYTYPE_API_KEY;

const response = await fetch("https://api.monkeytype.com/results", {
    headers: {
        Authorization: `ApeKey ${apiKey}`
    }
});

if (!response.ok) {
    throw new Error("Unable to fetch Monkeytype results.");
}

const json = await response.json();

const results = json.data;

function getPB(seconds) {
    const tests = results.filter(
        r =>
            r.mode === "time" &&
            Number(r.mode2) === seconds
    );

    if (!tests.length)
        return null;

    return tests.reduce((best, current) =>
        current.wpm > best.wpm ? current : best
    );
}

const pb15 = getPB(15);
const pb30 = getPB(30);
const pb60 = getPB(60);

const markdown = `
## ⌨️ Monkeytype Stats

⚡ 15s PB: **${pb15.wpm} WPM** (${pb15.acc.toFixed(2)}%)

⚡ 30s PB: **${pb30.wpm} WPM** (${pb30.acc.toFixed(2)}%)

⚡ 60s PB: **${pb60.wpm} WPM** (${pb60.acc.toFixed(2)}%)

_Last Updated: ${new Date().toUTCString()}_
`;

const readme = fs.readFileSync("README.md", "utf8");

const updated = readme.replace(
    /<!-- MONKEYTYPE_STATS_START -->[\s\S]*<!-- MONKEYTYPE_STATS_END -->/,
    `<!-- MONKEYTYPE_STATS_START -->
${markdown}
<!-- MONKEYTYPE_STATS_END -->`
);

fs.writeFileSync("README.md", updated);

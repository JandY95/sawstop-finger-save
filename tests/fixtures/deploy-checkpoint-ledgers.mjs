// Synthetic public SHA values only; no credential or real ledger writes.
export const SHA = "abcdef01".repeat(5);
export const OTHER_SHA = "01234567".repeat(5);
export const HISTORICAL_SHA = "37979cee1303e50608d9fc28dd7c9fa988d49fff";
export const KEY = "T55_DEPLOY_AUTHORIZED_CHECKPOINT_SHA";
export const HEADING = "## Current Machine State";
export const BEGIN = "<!-- T55_DEPLOY_AUTHORIZED_CHECKPOINT_CURRENT_BEGIN -->";
export const END = "<!-- T55_DEPLOY_AUTHORIZED_CHECKPOINT_CURRENT_END -->";
export const assignment = (value) => `${KEY}=${value}`;
export const block = (state = assignment(SHA)) => `${BEGIN}\n${state}\n${END}`;
export const ledger = (state = assignment(SHA), history = "") =>
  `# Synthetic ledger\n\n${HEADING}\n\n${block(state)}\n\n## History\n${history}\n`;

export const malformedLedgers = [
  ["missing block", "# Ledger\n", "MISSING"],
  ["flat SHA without block", assignment(SHA), "MISSING"],
  ["historical fenced SHA only", `## History\n\n\x60\x60\x60text\n${assignment(SHA)}\n\x60\x60\x60`, "MISSING"],
  ["duplicate BEGIN", ledger().replace(BEGIN, `${BEGIN}\n${BEGIN}`), "AMBIGUOUS"],
  ["duplicate END", ledger().replace(END, `${END}\n${END}`), "AMBIGUOUS"],
  ["BEGIN without END", ledger().replace(END, ""), "MALFORMED"],
  ["END without BEGIN", ledger().replace(BEGIN, ""), "MALFORMED"],
  ["same SHA twice", ledger(`${assignment(SHA)}\n${assignment(SHA)}`), "MALFORMED"],
  ["different SHA twice", ledger(`${assignment(SHA)}\n${assignment(OTHER_SHA)}`), "MALFORMED"],
  ["SHA plus NONE", ledger(`${assignment(SHA)}\n${assignment("NONE")}`), "MALFORMED"],
  ["SHA plus NOT_APPROVED", ledger(`${assignment(SHA)}\n${assignment("NOT_APPROVED")}`), "MALFORMED"],
  ["SHA plus whitespace NONE", ledger(`${assignment(SHA)}\n${KEY} = NONE`), "MALFORMED"],
  ["leading whitespace", ledger(` ${assignment(SHA)}`), "MALFORMED"],
  ["trailing whitespace", ledger(`${assignment(SHA)} `), "MALFORMED"],
  ["tab around equals", ledger(`${KEY}\t=\t${SHA}`), "MALFORMED"],
  ["uppercase SHA", ledger(assignment(SHA.toUpperCase())), "MALFORMED"],
  ["39-character SHA", ledger(assignment(SHA.slice(1))), "MALFORMED"],
  ["41-character SHA", ledger(assignment(`${SHA}a`)), "MALFORMED"],
  ["nonhex SHA", ledger(assignment(`g${SHA.slice(1)}`)), "MALFORMED"],
  ["empty value", ledger(assignment("")), "MALFORMED"],
  ["inline comment", ledger(`${assignment(SHA)} # approved`), "MALFORMED"],
  ["second block in history", ledger(assignment(SHA), block()), "AMBIGUOUS"],
  ["second block inside historical fence", ledger(assignment(SHA), `\x60\x60\x60\n${block()}\n\x60\x60\x60`), "AMBIGUOUS"],
  ["whole canonical section inside backtick fence", `\x60\x60\x60md\n${ledger()}\x60\x60\x60`, "MALFORMED"],
  ["whole canonical section inside tilde fence", `~~~md\n${ledger()}~~~`, "MALFORMED"],
  ["indented fence before canonical section", `   \x60\x60\x60\n${ledger()}   \x60\x60\x60`, "MALFORMED"],
  ["fenced block under real heading", ledger().replace(block(), `\x60\x60\x60\n${block()}\n\x60\x60\x60`), "MALFORMED"],
  ["END before BEGIN", `# Ledger\n\n${HEADING}\n\n${END}\n${assignment(SHA)}\n${BEGIN}\n`, "MALFORMED"],
  ["nested sentinels", ledger(`${BEGIN}\n${assignment(SHA)}\n${END}`), "AMBIGUOUS"],
  ["arbitrary extra line", ledger(`${assignment(SHA)}\narbitrary`), "MALFORMED"],
  ["NOT_APPROVED state", ledger(assignment("NOT_APPROVED")), "MALFORMED"],
  ["padded NONE state", ledger(assignment(" NONE ")), "MALFORMED"],
  ["spaces around equals", ledger(`${KEY} = NONE`), "MALFORMED"],
  ["PENDING state", ledger(assignment("PENDING")), "MALFORMED"],
  ["UNKNOWN state", ledger(assignment("UNKNOWN")), "MALFORMED"],
  ["state absent", ledger(""), "MALFORMED"],
  ["blank extra state line", ledger(`${assignment(SHA)}\n`), "MALFORMED"],
  ["NONE plus malformed SHA", ledger(`${assignment("NONE")}\n${KEY}=z`), "MALFORMED"],
  ["malformed BEGIN", ledger().replace(BEGIN, BEGIN.replace(" -->", "-->")), "MALFORMED"],
  ["malformed END", ledger().replace(END, `${END} `), "MALFORMED"],
  ["malformed extra delimiter", ledger(assignment(SHA), ` ${END}`), "MALFORMED"],
  ["missing heading", ledger().replace(HEADING, ""), "MALFORMED"],
  ["duplicate heading", ledger(assignment(SHA), HEADING), "AMBIGUOUS"],
  ["wrong heading", ledger().replace(HEADING, "## Previous Machine State"), "MALFORMED"],
  ["heading inside historical appendix", `## Historical appendix\n\n${ledger()}`, "MALFORMED"],
  ["HTML comment wrapper", `<!-- historical\n${ledger()}-->`, "MALFORMED"],
  ["HTML pre wrapper", `<pre>\n${ledger()}</pre>`, "MALFORMED"],
  ["extra machine-section assignment", ledger().replace(`${END}\n`, `${END}\n${assignment("NONE")}\n`), "MALFORMED"],
  ["CRLF canonical block", ledger().replaceAll("\n", "\r\n"), "MALFORMED"],
  ["carriage return in SHA line", ledger(`${assignment(SHA)}\r`), "MALFORMED"],
  ["Unicode line separator", ledger(`${assignment(SHA)}\u2028`), "MALFORMED"],
  ["wrong assignment key", ledger(`OTHER_KEY=${SHA}`), "MALFORMED"]
];

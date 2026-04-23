// Test giải mã URL Google News qua batchexecute API
const ART_ID = "CBMitgFBVV95cUxPZUdyNGxacllJYlFJanlJUkR0UlNhbUtJVzAtRnlfSlNhR1dNUEM5VTRoNlM5WjU2dkhsMlh2RUs3TXg2NWoxVm9JRE1NNmFHZ0I3V2pWSFVSZ056d3RxdFFFUFMxZDNURHYxdEhTdFljemxpZ0Jxd2U5WElyMmVqVTdFbTFqRWx1N1Jqd2pPaXB4MmhFbmlqWHRzZFQ2UW9ramRHUTAtUEJtcjgyUnZySFNnWXJZdw";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Step 1: fetch /articles/ page, extract sig + ts
const artUrl = `https://news.google.com/articles/${ART_ID}`;
const r1 = await fetch(artUrl, { headers: { "User-Agent": UA } });
const html = await r1.text();
const sig = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
console.log("sig:", sig, "ts:", ts);

if (!sig || !ts) {
  console.log("Không tìm được signature/timestamp");
  process.exit(1);
}

// Step 2: build batchexecute payload
const inner = JSON.stringify([
  "garturlreq",
  [["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],
   "X","X",1,[1,1,1],1,1,null,0,0,null,0],
  sig,
  Number(ts),
  ART_ID,
]);
const outer = JSON.stringify([[["Fbv4je", inner, null, "generic"]]]);

const body = new URLSearchParams();
body.set("f.req", outer);

const r2 = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    "User-Agent": UA,
  },
  body: body.toString(),
});

console.log("Status:", r2.status);
const txt = await r2.text();
console.log("Response size:", txt.length);
console.log("First 500 chars:", txt.slice(0, 500));

// Parse response — format: )]}'\n[[...JSON...]]
const cleaned = txt.replace(/^\)\]\}'\s*/, "");
try {
  const parsed = JSON.parse(cleaned);
  // Nested: parsed[0][2] là string JSON chứa URL
  const innerStr = parsed[0]?.[2];
  if (innerStr) {
    const innerParsed = JSON.parse(innerStr);
    console.log("\n==> URL gốc:", innerParsed[1]);
  } else {
    console.log("Không có innerStr, parsed:", JSON.stringify(parsed).slice(0, 300));
  }
} catch (e) {
  console.log("Parse error:", e.message);
}

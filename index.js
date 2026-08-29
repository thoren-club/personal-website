const http = require("http");
const fs = require("fs");
const path = require("path");

const port = process.env.PORT || 3000;
const page = fs.readFileSync(path.join(__dirname, "index.html"));
const favicon = fs.readFileSync(path.join(__dirname, "favicon.jpg"));

http.createServer((request, response) => {
  if (request.url === "/favicon.jpg") {
    response.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400"
    });
    response.end(favicon);
    return;
  }

  if (request.url !== "/" && request.url !== "/index.html") {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache"
  });
  response.end(page);
}).listen(port, "0.0.0.0", () => {
  console.log(`personal-website is listening on ${port}`);
});

// Preload for DB-backed tests (`npm run test:db`): modules like
// lib/forums-server.ts `import "server-only"`, which throws unless bundled by
// Next. Outside Next there's no client/server boundary to protect, so make the
// import a no-op for the test process only.
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};

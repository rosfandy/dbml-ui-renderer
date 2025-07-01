const mode = process.env.NODE_ENV || "development";

if (mode === "development") {
  import("./devServer.js");
} else {
  import("./staticServer.js");
}

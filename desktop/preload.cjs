const { contextBridge } = require("electron");

const PREFIX = "--trustweave-api-base=";
const apiBaseUrl =
  process.argv.find((argument) => argument.startsWith(PREFIX))?.slice(PREFIX.length) ?? "";

contextBridge.exposeInMainWorld("__TRUSTWEAVE_ENV__", {
  apiBaseUrl,
});

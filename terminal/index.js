import express from "express";
import { execSync } from "node:child_process";

const app = express();

app.use(express.json());

app.post("/", (req, res) => {
  const command = req.body.line.join("");

  if (!command) return res.json("");
  let result;

  try {
    result = execSync(command, { encoding: "ascii" });
  } catch (e) {
    result = e.stderr;
  }

  result = result.toString().replaceAll("\n", "\r\n");
  res.json(result);
});

app.listen(process.env.PORT);

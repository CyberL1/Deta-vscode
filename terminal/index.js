import express from "express";
import { execSync } from "node:child_process";

const app = express();

app.use(express.json());

app.post("/", (req, res) => {
  const cwd = req.body.cwd;
  const line = req.body.line.trim();

    const args = line.split(" ");
    const cmd = args.shift();

    process.chdir(cwd)
    const result = { cwd: process.cwd() }
    
    try {
      if (cmd === "cd") {
        try {
          if (!args[0]) args[0] = process.env.HOME || "/";

          process.chdir(args[0]);
          result.cwd = process.cwd();
        } catch {}
      }

    result.stdout = execSync(`${cmd} ${args.join(" ")}`, { encoding: "ascii" }).replaceAll("\n", "\r\n")
} catch(e) {
  result.stderr = e.stderr.replaceAll("\n", "\r\n")
}

  res.send(result);
});

app.listen(process.env.PORT);

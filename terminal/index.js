import express from "express";
import { execSync } from "node:child_process";
import { Deta } from "deta";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const app = express();

app.use(express.json());

app.post("/sync", async (req, res) => {
  const deta = Deta();
  const drive = deta.Drive("files");

  const { names } = await drive.list();

  names.map(async name => {
    if (existsSync(`/tmp/${name}`)) {
      rmSync(`/tmp/${name}`, { recursive: true });
    }

    if (dirname(name) !== ".") {
      mkdirSync(`/tmp/${dirname(name)}`, { recursive: true });
    }

    const content = await drive.get(name);
    const buffer = await content.arrayBuffer();

    writeFileSync(`/tmp/${name}`, new Uint8Array(buffer));
});

  res.send({ synced: true });
});

app.post("/run", (req, res) => {
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

    result.stdout = execSync(`${cmd} ${args.join(" ")}`, { encoding: "ascii", cwd }).replaceAll("\n", "\r\n")
} catch(e) {
  result.stderr = e.stderr.replaceAll("\n", "\r\n")
}

  res.send(result);
});

app.listen(process.env.PORT);

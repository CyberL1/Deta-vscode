import * as vscode from "vscode";

const writeEmitter = new vscode.EventEmitter<string>();

vscode.commands.registerCommand(
  "detafs.createTerminal",
  async () => {
    let line: string = "";
    let cwd: string = "/";
    let cursor: number = 0;

    const prompt = () => writeEmitter.fire(`\x1b[1;34m${cwd}\x1b[0m $ `);

    const pty: vscode.Pseudoterminal = {
      onDidWrite: writeEmitter.event,
      open: async () => {
        await fetch("/terminal/sync", { method: "POST" });
        prompt();
      },
      close: () => {},
      handleInput: async (data: string) => {
        switch (data) {
          case "\u0003": // Ctrl+C
            writeEmitter.fire("^C\r\n");
            prompt();
            line = "";
            cursor = 0;
            break;
          case "\r": // Enter
            if (line.trim().length) {
              const result = await (await fetch("/terminal/run", {
                method: "POST",
                // eslint-disable-next-line @typescript-eslint/naming-convention
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ line, cwd }),
              })).json();

              if (result.cwd !== cwd) {
                cwd = result.cwd;
              }

              writeEmitter.fire(`\r\n${result.stdout ?? result.stderr}`);
              line = "";
              cursor = 0;
            } else {
              writeEmitter.fire("\r\n");
            }
            prompt();
            break;
          case "\x7f": // Backspace
            if (cursor > 0) {
              writeEmitter.fire("\b \b");
              if (line.length > 0) {
                line = line.substring(0, line.length - 1);
              }
              cursor--;
            }
            break;
          default:
            // Check if character is printable
            if (data.charCodeAt(0) >= 32 && data.charCodeAt(0) <= 127) {
              cursor++;
              line += data;
              writeEmitter.fire(data);
            }
        }
      },
    };

    const terminal = vscode.window.createTerminal({ name: "Terminal", pty });
    terminal.show();
  },
);

import * as vscode from "vscode";

const writeEmitter = new vscode.EventEmitter<string>();

vscode.commands.registerCommand(
  "detafs.createTerminal",
  async () => {
    let line: string[] = [];
    let cwd: string = "/";
    let cursor: number = 0;
    let prompt: string = `\x1b[1;34m${cwd}\x1b[0m $ `;

    const pty: vscode.Pseudoterminal = {
      onDidWrite: writeEmitter.event,
      open: () => writeEmitter.fire(prompt),
      close: () => {},
      handleInput: async (data: string) => {
        switch (data) {
          case "\x1b[A": // Up arrow
          case "\x1b[B": // Down arrow
          case "\t": // Tab key
            break;
          case "\x1b[3~": // Delete key
            if (cursor < line.length) {
              writeEmitter.fire("\x1b[P"); // Delete character
              line.splice(cursor, 1);
              break;
            }
          case "\x1b[C": // Right arrow
            if (cursor < line.length) {
              writeEmitter.fire(data);
              cursor++;
            }
            break;
          case "\x1b[D": // Left arrow
            if (cursor > 0) {
              writeEmitter.fire(data);
              cursor--;
            }
            break;
          case "\r": // Enter
            const result = await (await fetch("/terminal", {
              method: "POST",
              // eslint-disable-next-line @typescript-eslint/naming-convention
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ line }),
            })).json();

            writeEmitter.fire(`\r\n${result}`);
            line = [];
            cursor = 0;

            writeEmitter.fire(prompt);
            break;
          case "\x7f": // Backspace
            if (cursor > 0) {
              writeEmitter.fire("\x1b[D"); // Move cursor left
              writeEmitter.fire("\x1b[P"); // Delete charatcher
              cursor--;
              line.splice(cursor, 1);
            }
            break;
          default:
            // TODO: Figure out why vscode replaces characters instead of insterting them
            line.splice(cursor, 0, data);
            writeEmitter.fire(data);
            cursor++;
        }
      },
    };

    const terminal = vscode.window.createTerminal({ name: "Terminal", pty });
    terminal.show();
  },
);

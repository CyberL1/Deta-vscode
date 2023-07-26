import { DetaFS } from "./detafs";
import * as vscode from "vscode";

// Commands
import "./commands/setDetaKey";
import "./commands/createTerminal";

export async function activate(context: vscode.ExtensionContext) {
  const detafs = new DetaFS();

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("detafs", detafs, {
      isCaseSensitive: true,
    }),
  );

  detafs.init();
}

export function deactivate() {}

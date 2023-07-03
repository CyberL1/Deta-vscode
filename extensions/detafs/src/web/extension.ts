import { DetaFS } from "./detafs";
import * as vscode from "vscode";

export async function activate(context: vscode.ExtensionContext) {
  vscode.commands.registerCommand(
    "detafs.setDetaKey",
    () => {
      vscode.window.showInputBox({
        password: true,
        title: "Enter deta key",
      }).then((value) => {
        vscode.workspace.getConfiguration("detafs")
          .update("detaKey", value, true);
      });
    },
  );

  const detafs = new DetaFS();

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("detafs", detafs, {
      isCaseSensitive: true,
    }),
  );

  detafs.init();
}

export function deactivate() {}

import * as vscode from "vscode";

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

import * as vscode from "vscode";
import { ForJobController } from "./controller/forJobController";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const controller = new ForJobController(context);
  await controller.activate();
}

export function deactivate(): void {}

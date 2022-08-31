/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode'

import { ServiceConnection } from '@vscode/sync-api-common/browser';
import { APIRequests, ApiService } from '@vscode/sync-api-service';

export async function activate(context: vscode.ExtensionContext) {
    const worker = new Worker(vscode.Uri.joinPath(context.extensionUri, './dist/worker.js').toString())
    const syncChannel = new MessageChannel()
    worker.postMessage(syncChannel.port2, [syncChannel.port2])
    const connection = new ServiceConnection<APIRequests>(syncChannel.port1)
    new ApiService('TypeScript', connection, _ => worker.terminate())
    connection.signalReady()
    context.subscriptions.push(new vscode.Disposable(() => worker.terminate()))
    // TODO: I need to figure out which commands to register and how to translate them into posts to the worker
    vscode.commands.registerCommand('testbed-typescript.run', arg => {
        const uri = arg instanceof vscode.Uri ? arg : vscode.window.activeTextEditor?.document.uri
        if (uri) {
            worker.postMessage(vscode.workspace.asRelativePath(uri))
        }
    })
}

export function deactivate() {
}

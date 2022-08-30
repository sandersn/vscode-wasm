/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as ts from 'typescript';
import { ApiClient, APIRequests } from '@vscode/sync-api-client';
import { ClientConnection, DTOs } from '@vscode/sync-api-common/browser';
import { Utils } from 'vscode-uri';


let host: ts.ParseConfigFileHost | undefined
let init: Promise<any> | undefined
self.onmessage = async event => {
    const { data } = event;
    // when receiving a message port use it to create the sync-rpc
    // connection. continue to listen to "normal" message events
    // for commands or other things
    if (data instanceof MessagePort) {
        const connection = new ClientConnection<APIRequests>(data);
        init = connection.serviceReady().then(() => _initTsConfigHost(connection))
        return;
    }
    if (!init) {
        console.error('INIT message not yet received');
        return;
    }
    await init
    // every other message is a parse-ts-config-request
    if (!host) {
        console.error('NOT READY', data);
        return
    }
    if (typeof data !== 'string') {
        console.error('UNKNOWN DATA', data);
        return;
    }
    try {
        const parsed = ts.getParsedCommandLineOfConfigFile(data, undefined, host)
        console.log(JSON.stringify(parsed, undefined, 4))
    } catch (error) {
        console.error(error)
    }
}


function _initTsConfigHost(connection: ClientConnection<APIRequests>) {
	const apiClient = new ApiClient(connection);
    type FileSystemEntries = {
        readonly files: readonly string[];
        readonly directories: readonly string[];
    }
    type TSExt = typeof ts & {
        matchFiles(
            path: string,
            extensions: readonly string[] | undefined,
            excludes: readonly string[] | undefined,
            includes: readonly string[] | undefined,
            useCaseSensitiveFileNames: boolean,
            currentDirectory: string, depth: number | undefined,
            getFileSystemEntries: (path: string) => FileSystemEntries,
            realpath: (path: string) => string
        ): string[];
    }
    function getFileSystemEntries(path: string): FileSystemEntries {
            const uri = Utils.joinPath(apiClient.vscode.workspace.workspaceFolders[0].uri, path)
            const entries = apiClient.vscode.workspace.fileSystem.readDirectory(uri);
            const files: string[] = [];
            const directories: string[] = [];
            for (const [name, type] of entries) {
                switch (type) {
                    case DTOs.FileType.Directory:
                        directories.push(name);
                        break;
                    case DTOs.FileType.File:
                        files.push(name);
                        break;
                }
            }
            return { files, directories }
        }
    host = {
        // -- ParseConfigFileHost
        useCaseSensitiveFileNames: true,
        getCurrentDirectory: () => '/',
        readDirectory(rootDir, extensions, excludes, includes, depth?): readonly string[] {
            return (<TSExt>ts).matchFiles(
                rootDir, extensions, excludes, includes, false, this.getCurrentDirectory(), depth,
                getFileSystemEntries,
                path => path
            )
        },
        fileExists(path) {
            try {
                const uri = Utils.joinPath(apiClient.vscode.workspace.workspaceFolders[0].uri, path)
                apiClient.vscode.workspace.fileSystem.stat(uri)
                return true;
            } catch (error) {
                return false;
            }
        },
        readFile(path) {
            const uri = Utils.joinPath(apiClient.vscode.workspace.workspaceFolders[0].uri, path)
            const bytes = apiClient.vscode.workspace.fileSystem.readFile(uri)
            return new TextDecoder().decode(new Uint8Array(bytes).slice())
        },
        // --- ConfigFileDiagnosticsReporter
        onUnRecoverableConfigFileDiagnostic(d) {
            debugger;
            console.error('FATAL', d)
        },
    }
}
